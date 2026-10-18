// useUrlSync.ts — keeps the address bar and the open model, tab and plugin view in step (deep links)
//
// Owns: the models a link asks to tick, until the model tree and the plugin can take them
// Receives: the selected model key, the center tab, the open plugin view and the ticked models,
//   with the setters and loader that change them
// Returns: nothing
//
// Opening a link is handled where state starts up (useFileTree and usePersistedUI read the link
// before localStorage, Simulator opens the plugin view and the tab). This hook writes the path on
// every change, ticks the models a plugin link names, and applies the path on back and forward.

import { useEffect, useRef } from 'react';
import type { ModelFile } from '../../types';
import {
  buildPath, getInitialRoute, parseRoute, routeTabToCenterTab, type CenterTab,
} from '../../core/urlRoute';

interface UseUrlSyncParams {
  selectedKey: string | null;
  setSelectedKey: (key: string | null) => void;
  centerTab: CenterTab;
  setCenterTab: (tab: CenterTab) => void;
  setMode: (mode: 'sim' | 'opt') => void;
  loadFileContent: (filePath: string, opts?: { preserveTab?: boolean }) => Promise<ModelFile | null>;
  pluginViewId: string | null;
  setPluginViewId: (id: string | null) => void;
  // ids of the bundle plugins the backend found, empty until the list has arrived
  knownPluginIds: string[];
  // models ticked in the tree, and a way to tick models by path; ready when the tree is loaded and
  // the open plugin takes several models
  checkedPaths: string[];
  applyCheckedPaths: (paths: string[]) => void;
  canApplyChecked: boolean;
  // the builder covers the model tabs; the address keeps the last model tab meanwhile
  paused: boolean;
}

export function useUrlSync({
  selectedKey, setSelectedKey, centerTab, setCenterTab, setMode, loadFileContent,
  pluginViewId, setPluginViewId, knownPluginIds,
  checkedPaths, applyCheckedPaths, canApplyChecked, paused,
}: UseUrlSyncParams) {
  // A link to the simulation or optimization tab also sets the matching mode.
  useEffect(() => {
    const linked = getInitialRoute();
    if (linked && !linked.plugin && linked.tab === 'sim') setMode('sim');
    if (linked && !linked.plugin && linked.tab === 'opt') setMode('opt');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A link to a plugin that is not installed on this server shows the model tabs instead.
  useEffect(() => {
    if (pluginViewId && knownPluginIds.length > 0 && !knownPluginIds.includes(pluginViewId)) setPluginViewId(null);
  }, [pluginViewId, knownPluginIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Models named by a link wait here until they can be ticked.
  const pendingChecked = useRef<string[] | null>(
    getInitialRoute()?.models.length ? getInitialRoute()!.models : null,
  );
  useEffect(() => {
    if (!pluginViewId) pendingChecked.current = null;
    if (pendingChecked.current && canApplyChecked) {
      applyCheckedPaths(pendingChecked.current);
      pendingChecked.current = null;
    }
  }, [pluginViewId, canApplyChecked]); // eslint-disable-line react-hooks/exhaustive-deps

  const firstWrite = useRef(true);
  useEffect(() => {
    if (paused) return;
    // ticks named by the link are not in the state yet; writing now would drop them from the address
    if (pendingChecked.current) return;
    const path = buildPath(selectedKey, centerTab, pluginViewId, canApplyChecked ? checkedPaths : []);
    if (path === window.location.pathname + window.location.search) { firstWrite.current = false; return; }
    try {
      // The first write only tidies the address of a page opened without a link.
      if (firstWrite.current) window.history.replaceState(null, '', path);
      else window.history.pushState(null, '', path);
    } catch { /* an address bar that cannot be written (sandboxed frame) just keeps its path */ }
    firstWrite.current = false;
  }, [selectedKey, centerTab, pluginViewId, checkedPaths, canApplyChecked, paused]);

  const latest = useRef({ selectedKey, paused });
  latest.current = { selectedKey, paused };
  useEffect(() => {
    const onPopState = () => {
      const route = parseRoute(window.location.pathname, window.location.search);
      if (!route || latest.current.paused) return;
      setPluginViewId(route.plugin);
      pendingChecked.current = route.plugin && route.models.length ? route.models : null;
      if (!route.plugin) {
        const tab = routeTabToCenterTab(route.tab);
        setCenterTab(tab);
        if (tab === 'simulation') setMode('sim');
        if (tab === 'optimization') setMode('opt');
      }
      if (route.key && route.key !== latest.current.selectedKey) {
        setSelectedKey(route.key);
        loadFileContent(route.key, { preserveTab: true });
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
