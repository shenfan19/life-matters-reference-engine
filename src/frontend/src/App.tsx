import { useEffect, useState } from 'react';
import PluginSidebar from './components/PluginSidebar';
import PluginPageContainer from './components/PluginPageContainer';
import { PluginManifest } from './core/types';

function App() {
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [activePlugin, setActivePlugin] = useState<string | null>(null);

  useEffect(() => {
    // 从后端加载插件列表
    fetch('/api/plugins')
      .then(res => res.json())
      .then(data => setPlugins(data.plugins));
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
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

export default App;
