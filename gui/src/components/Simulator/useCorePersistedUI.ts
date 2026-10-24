// useCorePersistedUI.ts: what the core keeps in the browser: the model tree on load, the model that was
// open last, the layout. What a module keeps (its results, its slice of the session of a model) is in the module.

import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { DataNode, ModelFile } from '../../types';
import { readSP, writeSP } from '../sim_tab/simUtils';
import { getInitialRoute } from '../../core/urlRoute';

interface Params {
  storyTree: DataNode[];
  setExpandedKeys: Dispatch<SetStateAction<React.Key[]>>;
  expandedKeys: React.Key[];
  loadFileTree: () => Promise<void>;
  loadFileContent: (filePath: string, opts?: { preserveTab?: boolean }) => Promise<ModelFile | null>;
  selectedKey: string | null;
  sessionReadyRef: MutableRefObject<boolean>;
  sessionEditedRef: MutableRefObject<boolean>;
  mode: string;
  openSections: Set<string>;
  sectionWeights: Record<string, number>;
}

export function useCorePersistedUI({
  storyTree, setExpandedKeys, expandedKeys, loadFileTree, loadFileContent,
  selectedKey, sessionReadyRef, sessionEditedRef,
  mode, openSections, sectionWeights,
}: Params) {
  // ── load tree on mount + restore selected model ──────────────────────────────
  useEffect(() => {
    if (storyTree.length === 0) loadFileTree();
  }, []);

  const initialSelectedKey = useRef<string | null>(getInitialRoute()?.key ?? readSP()?.selectedKey ?? null);
  useEffect(() => {
    if (storyTree.length === 0) return;
    // Restore previously selected model
    const key = initialSelectedKey.current;
    if (key) { initialSelectedKey.current = null; loadFileContent(key, { preserveTab: true }); }
    // Remove stale expandedKeys that no longer exist in the current tree
    const collectFolderKeys = (nodes: DataNode[], acc: Set<React.Key>) => {
      nodes.forEach(n => { if (!n.isLeaf) { acc.add(n.key); if (n.children) collectFolderKeys(n.children, acc); } });
    };
    const validKeys = new Set<React.Key>();
    collectFolderKeys(storyTree, validKeys);
    setExpandedKeys(prev => prev.filter(k => validKeys.has(k)));
  }, [storyTree]);

  // ── reset session-ready flag on selection change ─────────────────────────────
  useEffect(() => {
    sessionReadyRef.current = false;
    sessionEditedRef.current = false;
  }, [selectedKey]);

  // ── persist global UI state (selection, mode, layout) ────────────────────────
  useEffect(() => {
    const current = readSP() || {};
    writeSP({ ...current, selectedKey, mode, openSections: [...openSections], sectionWeights, expandedKeys });
  }, [selectedKey, mode, openSections, sectionWeights, expandedKeys]);
}
