// gui/src/components/plugins/PluginHost.tsx
// Shows one bundle plugin in an iframe that covers its parent, and tells it which model
// is selected and which theme and language are in use.
//
// Messages, both ways through postMessage:
//   host -> plugin  { type: 'lm-init', model: {key, title, path} | null, theme, lang }
//   plugin -> host  { type: 'lm-ready' }   sent once the plugin can receive; the host
//                                          answers with another lm-init
// The query string of the iframe carries theme and lang as well, so a plugin page
// opened on its own still has them.

import React, { useCallback, useEffect, useRef } from 'react';
import { API_BASE } from '../sim_tab/simUtils';
import type { getC } from '../../core/theme';
import type { ModelFile } from '../../types';

interface Props {
  pluginId: string;
  title: string;
  selectedModel: ModelFile | null;
  isDarkMode: boolean;
  language: string;
  c: ReturnType<typeof getC>;
}

const PluginHost: React.FC<Props> = ({ pluginId, title, selectedModel, isDarkMode, language, c }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const theme = isDarkMode ? 'dark' : 'light';
  const src = `${API_BASE}/plugins/${encodeURIComponent(pluginId)}/bundle/?theme=${theme}&lang=${encodeURIComponent(language)}`;

  const sendInit = useCallback(() => {
    const target = frameRef.current?.contentWindow;
    if (!target) return;
    const model = selectedModel
      ? { key: selectedModel.key, title: selectedModel.title, path: selectedModel.path }
      : null;
    target.postMessage({ type: 'lm-init', model, theme, lang: language }, new URL(src, window.location.href).origin);
  }, [selectedModel, theme, language, src]);

  // Send again whenever the model, theme or language changes.
  useEffect(() => { sendInit(); }, [sendInit]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      if (e.data?.type === 'lm-ready') sendInit();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [sendInit]);

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
