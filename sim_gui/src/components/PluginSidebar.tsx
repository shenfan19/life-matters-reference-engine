// src/frontend/src/components/PluginSidebar.tsx
// 临时方案：直接在文件中定义类型，不从外部导入

// 内联类型定义
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
  plugins: PluginManifest[];
  activePlugin: string | null;
  onSelectPlugin: (id: string) => void;
}

export default function PluginSidebar({ plugins, activePlugin, onSelectPlugin }: Props) {
  const categories = [...new Set(plugins.map(p => p.category))];

  return (
    <div style={{ width: 250, borderRight: '1px solid #ccc', padding: 20 }}>
      <h2>插件 ({plugins.length})</h2>
      
      {plugins.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>
          暂无插件
        </div>
      )}
      
      {categories.map(category => (
        <div key={category} style={{ marginBottom: 20 }}>
          <h3 style={{ color: '#666', marginBottom: 10 }}>
            {category}
          </h3>
          {plugins
            .filter(p => p.category === category)
            .map(plugin => (
              <div
                key={plugin.id}
                onClick={() => onSelectPlugin(plugin.id)}
                style={{
                  padding: 8,
                  marginBottom: 5,
                  cursor: 'pointer',
                  borderRadius: 4,
                  background: activePlugin === plugin.id ? '#e8f5e9' : '#fff',
                  border: activePlugin === plugin.id ? '2px solid #007A33' : '1px solid #c8e6c9'
                }}
              >
                <div style={{ fontWeight: activePlugin === plugin.id ? 'bold' : 'normal' }}>
                  {plugin.name}
                </div>
                {plugin.description && (
                  <div style={{ color: '#666', marginTop: 4 }}>
                    {plugin.description}
                  </div>
                )}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
