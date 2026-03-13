import { useEffect, useState } from 'react';
import DynamicForm from './DynamicForm';
import PluginLoader from '../core/PluginLoader';

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

interface Props {
  pluginId: string;
  isDarkMode?: boolean;
}

export default function PluginView({ pluginId, isDarkMode }: Props) {
  const [manifest, setManifest] = useState<PluginManifest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/plugins')
      .then(res => res.json())
      .then(data => {
        const plugin = (data.plugins || []).find((p: any) => p.id === pluginId);
        setManifest(plugin || null);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load plugin:', err);
        setLoading(false);
      });
  }, [pluginId]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        Loading plugin...
      </div>
    );
  }

  if (!manifest) {
    return (
      <div style={{ padding: 40 }}>
        <div style={{
          padding: 20,
          background: '#fff1f0',
          border: '1px solid #ffccc7',
          borderRadius: 4
        }}>
          Plugin not found: {pluginId}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 20 }}>
      {/* 插件头部信息 */}
      <div style={{ marginBottom: 20, flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>{manifest.name}</h1>
        <div style={{ color: '#999', marginTop: 5 }}>
          {manifest.description || 'No description'}
        </div>
        <div style={{
          marginTop: 10,
          display: 'flex',
          gap: 10,
          fontSize: 12
        }}>
          <span style={{
            padding: '2px 8px',
            background: '#f0f0f0',
            borderRadius: 3
          }}>
            v{manifest.version}
          </span>
          <span style={{
            padding: '2px 8px',
            background: isDarkMode ? '#1e293b' : '#e6f7ff',
            color: isDarkMode ? '#38bdf8' : '#1890ff',
            borderRadius: 3
          }}>
            {manifest.category}
          </span>
          <span style={{
            padding: '2px 8px',
            background: isDarkMode ? '#1e293b' : '#f5f5f5',
            color: isDarkMode ? '#94a3b8' : '#64748b',
            borderRadius: 3
          }}>
            {manifest.ui.type}
          </span>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, paddingTop: 20, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* 根据UI类型显示内容 */}
        {manifest.ui.type === 'none' && (
          <div style={{
            padding: 20,
            background: '#fafafa',
            borderRadius: 4,
            textAlign: 'center',
            color: '#999'
          }}>
            该插件在后台运行，无需UI界面
          </div>
        )}

        {manifest.ui.type === 'schema' && manifest.ui.schema && (
          <DynamicForm schema={manifest.ui.schema} pluginId={manifest.id} />
        )}

        {manifest.ui.type === 'component' && manifest.ui.component_path && (
          <PluginLoader pluginId={manifest.id} componentPath={manifest.ui.component_path} isDarkMode={isDarkMode} />
        )}
      </div>
    </div>
  );
}
