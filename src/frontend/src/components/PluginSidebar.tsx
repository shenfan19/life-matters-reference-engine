import { PluginManifest } from '../core/types';

interface Props {
  plugins: PluginManifest[];
  activePlugin: string | null;
  onSelectPlugin: (id: string) => void;
}

export default function PluginSidebar({ plugins, activePlugin, onSelectPlugin }: Props) {
  const categories = [...new Set(plugins.map(p => p.category))];

  return (
    <div style={{ width: 250, borderRight: '1px solid #ccc', padding: 20 }}>
      <h2>Plugins</h2>
      {categories.map(category => (
        <div key={category}>
          <h3>{category}</h3>
          {plugins
            .filter(p => p.category === category)
            .map(plugin => (
              <div
                key={plugin.id}
                onClick={() => onSelectPlugin(plugin.id)}
                style={{
                  padding: 8,
                  cursor: 'pointer',
                  background: activePlugin === plugin.id ? '#e0e0e0' : 'transparent'
                }}
              >
                {plugin.name}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
