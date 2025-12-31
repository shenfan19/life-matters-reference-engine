import { useEffect, useState } from 'react';
import DynamicForm from './DynamicForm';
import PluginLoader from '../core/PluginLoader';
import { PluginManifest } from '../core/types';

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

  if (!manifest) return <div>请选择插件</div>;

  // 根据 UI 类型渲染不同组件
  switch (manifest.ui.type) {
    case 'none':
      return <div>该插件无UI</div>;
    case 'schema':
      return <DynamicForm schema={manifest.ui.schema!} pluginId={manifest.id} />;
    case 'component':
      return <PluginLoader componentPath={manifest.ui.component_path!} />;
    default:
      return <div>未知UI类型</div>;
  }
}