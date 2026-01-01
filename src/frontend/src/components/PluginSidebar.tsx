import { useState, useEffect } from 'react';
import { PluginManifest } from '../core/types';

interface Props {
  plugins: PluginManifest[];
  activePlugin: string | null;
  onSelectPlugin: (id: string) => void;
}

export default function PluginSidebar({ plugins, activePlugin, onSelectPlugin }: Props) {
  // 插件启用状态（存储在 localStorage）
  const [enabledPlugins, setEnabledPlugins] = useState<Set<string>>(new Set());

  // 从 localStorage 加载启用状态
  useEffect(() => {
    const saved = localStorage.getItem('enabledPlugins');
    if (saved) {
      setEnabledPlugins(new Set(JSON.parse(saved)));
    }
  }, []);

  // 保存启用状态到 localStorage
  const togglePlugin = (pluginId: string) => {
    const newEnabled = new Set(enabledPlugins);
    if (newEnabled.has(pluginId)) {
      newEnabled.delete(pluginId);
    } else {
      newEnabled.add(pluginId);
    }
    setEnabledPlugins(newEnabled);
    localStorage.setItem('enabledPlugins', JSON.stringify([...newEnabled]));
  };

  // 按类别分组
  const categories = [...new Set(plugins.map(p => p.category))];

  return (
    <div style={{ width: 300, borderRight: '1px solid #e0e0e0', padding: 20, overflowY: 'auto' }}>
      <h2 style={{ marginBottom: 20 }}>插件 ({plugins.length})</h2>
      
      {categories.map(category => {
        const categoryPlugins = plugins.filter(p => p.category === category);
        
        return (
          <div key={category} style={{ marginBottom: 20 }}>
            <h3 style={{ 
              fontSize: 14, 
              color: '#666', 
              marginBottom: 10,
              textTransform: 'uppercase'
            }}>
              {category}
            </h3>
            
            {categoryPlugins.map(plugin => {
              const isEnabled = enabledPlugins.has(plugin.id);
              const isActive = activePlugin === plugin.id;
              
              return (
                <div
                  key={plugin.id}
                  style={{
                    marginBottom: 8,
                    padding: 10,
                    borderRadius: 4,
                    background: isActive ? '#e6f7ff' : isEnabled ? '#fff' : '#f5f5f5',
                    border: isActive ? '2px solid #1890ff' : '1px solid #d9d9d9',
                    opacity: isEnabled ? 1 : 0.6,
                    transition: 'all 0.2s'
                  }}
                >
                  {/* 插件头部 */}
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}>
                    {/* Enable 复选框 */}
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => togglePlugin(plugin.id)}
                      style={{ marginRight: 8, cursor: 'pointer' }}
                    />
                    
                    {/* 插件名称 */}
                    <div
                      onClick={() => isEnabled && onSelectPlugin(plugin.id)}
                      style={{
                        flex: 1,
                        cursor: isEnabled ? 'pointer' : 'not-allowed',
                        fontWeight: isActive ? 'bold' : 'normal'
                      }}
                    >
                      {plugin.name}
                    </div>
                    
                    {/* UI类型标记 */}
                    <span style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 3,
                      background: plugin.ui.type === 'component' ? '#fff7e6' : 
                                 plugin.ui.type === 'schema' ? '#e6fffb' : '#f0f0f0',
                      color: plugin.ui.type === 'component' ? '#fa8c16' :
                             plugin.ui.type === 'schema' ? '#13c2c2' : '#999',
                      border: '1px solid',
                      borderColor: plugin.ui.type === 'component' ? '#ffd591' :
                                  plugin.ui.type === 'schema' ? '#87e8de' : '#d9d9d9'
                    }}>
                      {plugin.ui.type}
                    </span>
                  </div>
                  
                  {/* 插件描述 */}
                  {isEnabled && (
                    <div style={{ 
                      fontSize: 12, 
                      color: '#666',
                      marginTop: 5 
                    }}>
                      {plugin.description || 'No description'}
                    </div>
                  )}
                  
                  {/* 版本号 */}
                  {isEnabled && (
                    <div style={{ 
                      fontSize: 10, 
                      color: '#999',
                      marginTop: 5 
                    }}>
                      v{plugin.version}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      
      {/* 底部说明 */}
      <div style={{ 
        marginTop: 20, 
        padding: 10, 
        background: '#f0f0f0', 
        borderRadius: 4,
        fontSize: 12,
        color: '#666'
      }}>
        💡 提示：勾选插件以启用，点击查看详情
      </div>
    </div>
  );
}
