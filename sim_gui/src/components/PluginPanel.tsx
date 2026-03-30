import { useEffect, useState } from 'react';
import PluginSidebar from './PluginSidebar';
import PluginPageContainer from './PluginPageContainer';

// 内联类型
interface PluginManifest {
  id: string;
  name: string;
  version: string;
  category: string;
  description?: string;
  ui: {
    type: 'none' | 'schema' | 'component';
    schema?: any;
    component_path?: string;
  };
}

export default function PluginPanel() {
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [activePlugin, setActivePlugin] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/plugins?v=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        setPlugins(data.plugins || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load plugins:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div>Loading plugins...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40 }}>
        <div style={{
          padding: 20,
          background: '#fff1f0',
          border: '1px solid #ffccc7',
          borderRadius: 4
        }}>
          <strong>Error loading plugins:</strong> {error}
          <div style={{ marginTop: 10 }}>
            请确保 Backend 已启动在 http://localhost:8001
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <PluginSidebar
        plugins={plugins}
        activePlugin={activePlugin}
        onSelectPlugin={setActivePlugin}
      />
      <PluginPageContainer
        pluginId={activePlugin}
        plugins={plugins}
      />
    </div>
  );
}
