// gui/src/components/plugins/PluginHost.tsx
// Shows one bundle plugin in an iframe that covers its parent, and tells it which model
// is selected and which theme and language are in use.
//
// Messages, both ways through postMessage:
//   host -> plugin  { type: 'lm-init', model: {key, title, path} | null, models: [{key, title, path}], theme, lang }
//                   models is the list ticked in the model tree, and is empty unless the plugin
//                   asked for ui.model_selection: multi
//   plugin -> host  { type: 'lm-ready' }   sent once the plugin can receive; the host
//                                          answers with another lm-init
//   plugin -> host  { type: 'lm-set-models', paths: [...] }   asks the host to tick exactly these
//                                          models in the tree, in this order. Honoured only for
//                                          a plugin with ui.model_selection: multi
//   plugin -> host  { type: 'lm-filter-models', paths: [...] | null, label?: string }   shows only these
//                                          models in the tree, with a bar that clears the filter. null clears it
//   plugin -> host  { type: 'lm-open-plugin', id: 'model_compose' }   switches to another bundle plugin,
//                                          the ticked models stay ticked
// The query string of the iframe carries theme and lang as well, so a plugin page
// opened on its own still has them.

import React, { useCallback, useEffect, useRef } from 'react';
import { API_BASE } from '../sim_tab/simUtils';
import type { getC } from '../../core/theme';
import type { ModelFile } from '../../types';

const NO_MODELS: { key: string; title: string; path: string }[] = [];

interface Props {
  pluginId: string;
  title: string;
  selectedModel: ModelFile | null;
  checkedModels?: { key: string; title: string; path: string }[];
  // called when the page asks for models to be ticked; paths are model paths without a file suffix
  onSetModels?: (paths: string[]) => void;
  // called when the page asks for the tree to show only some models, or null to show all
  onFilterModels?: (paths: string[] | null, label: string) => void;
  onOpenPlugin?: (id: string) => void;
  isDarkMode: boolean;
  language: string;
  c: ReturnType<typeof getC>;
}

const PluginHost: React.FC<Props> = ({ pluginId, title, selectedModel, checkedModels = NO_MODELS, onSetModels, onFilterModels, onOpenPlugin, isDarkMode, language, c }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const theme = isDarkMode ? 'dark' : 'light';
  const src = `${API_BASE}/plugins/${encodeURIComponent(pluginId)}/bundle/?theme=${theme}&lang=${encodeURIComponent(language)}`;

  const sendInit = useCallback(() => {
    const target = frameRef.current?.contentWindow;
    if (!target) return;
    const model = selectedModel
      ? { key: selectedModel.key, title: selectedModel.title, path: selectedModel.path }
      : null;
    target.postMessage({ type: 'lm-init', model, models: checkedModels, theme, lang: language }, new URL(src, window.location.href).origin);
  }, [selectedModel, checkedModels, theme, language, src]);

  // Send again whenever the model, the ticked models, the theme or the language changes.
  useEffect(() => { sendInit(); }, [sendInit]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      if (e.data?.type === 'lm-ready') sendInit();
      if (e.data?.type === 'lm-set-models' && Array.isArray(e.data.paths)) {
        onSetModels?.(e.data.paths.filter((x: unknown) => typeof x === 'string'));
      }
      if (e.data?.type === 'lm-filter-models') {
        const paths = Array.isArray(e.data.paths) ? e.data.paths.filter((x: unknown) => typeof x === 'string') : null;
        onFilterModels?.(paths, typeof e.data.label === 'string' ? e.data.label : '');
      }
      if (e.data?.type === 'lm-open-plugin' && typeof e.data.id === 'string') onOpenPlugin?.(e.data.id);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [sendInit, onSetModels, onFilterModels, onOpenPlugin]);

  return (
    <iframe
      ref={frameRef}
      src={src}
      title={title}
      data-testid={`plugin-host-${pluginId}`}
      onLoad={sendInit}
      style={{ position: 'absolute', inset: 0, zIndex: 20, width: '100%', height: '100%', border: 'none', background: c.bg }}
    />
  );
};

export default PluginHost;
