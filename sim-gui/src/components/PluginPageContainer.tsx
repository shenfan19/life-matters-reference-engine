import { useEffect, useState } from 'react';
import DynamicForm from './DynamicForm';
import PluginLoader from '../core/PluginLoader';

// 内联类型定义
interface PluginManifest {
  id: string;
  name: string;
  version: string;
  category: string;
  ui: {
    type: 'none' | 'schema' | 'component';
    schema?: any;
    component_path?: string;
  };
}

interface Props {
  pluginId: string | null;
  plugins: PluginManifest[];
}

export default function PluginPageContainer({ pluginId, plugins }: Props) {
  const [manifest, setManifest] = useState<PluginManifest | null>(null);

  useEffect(() => {
    if (!pluginId) return;
    const plugin = plugins.find(p => p.id === pluginId);
    setManifest(plugin || null);
  }, [pluginId, plugins]);

  if (!manifest) {
    return (
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: '#999' 
      }}>
        请选择插件
      </div>
    );
  }

  switch (manifest.ui.type) {
    case 'none':
      return (
        <div style={{ padding: 20 }}>
          <h2>{manifest.name}</h2>
          <p>该插件在后台运行，无需UI界面</p>
        </div>
      );
    case 'schema':
      return <DynamicForm schema={manifest.ui.schema!} pluginId={manifest.id} />;
    case 'component':
      return <PluginLoader componentPath={manifest.ui.component_path!} />;
    default:
      return <div style={{ padding: 20 }}>未知UI类型: {manifest.ui.type}</div>;
  }
}
