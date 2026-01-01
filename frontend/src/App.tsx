import { useState } from 'react';
import Loader from './components/Loader';
import Simulator from './components/Simulator';
import Optimizer from './components/Optimizer';
import PluginView from './components/PluginView';

function App() {
  const [currentPage, setCurrentPage] = useState('loader');
  const [selectedModel, setSelectedModel] = useState<any>(null);

  const corePages = [
    { id: 'loader', name: '模型加载', icon: '📁' },
    { id: 'simulator', name: '仿真器', icon: '▶️' },
    { id: 'optimizer', name: '优化器', icon: '🎯' }
  ];

  const renderContent = () => {
    switch (currentPage) {
      case 'loader':
        return <Loader onModelSelect={setSelectedModel} />;
      case 'simulator':
        return <Simulator selectedModel={selectedModel} />;
      case 'optimizer':
        return <Optimizer selectedModel={selectedModel} />;
      default:
        // 如果是插件ID，显示插件视图
        if (currentPage.startsWith('plugin:')) {
          const pluginId = currentPage.replace('plugin:', '');
          return <PluginView pluginId={pluginId} />;
        }
        return <div>选择功能</div>;
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* 左侧导航 */}
      <div style={{ 
        width: 250, 
        borderRight: '1px solid #e0e0e0',
        background: '#fafafa',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Logo/Title */}
        <div style={{ 
          padding: 20, 
          borderBottom: '1px solid #e0e0e0',
          background: '#fff'
        }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>LifeMatters</h2>
          <div style={{ fontSize: 12, color: '#999', marginTop: 5 }}>
            健康轨迹仿真平台
          </div>
        </div>

        {/* 核心功能组 */}
        <div style={{ padding: 15 }}>
          <div style={{ 
            fontSize: 12, 
            color: '#999', 
            marginBottom: 10,
            fontWeight: 'bold',
            textTransform: 'uppercase'
          }}>
            核心功能
          </div>
          {corePages.map(page => (
            <div
              key={page.id}
              onClick={() => setCurrentPage(page.id)}
              style={{
                padding: '10px 15px',
                marginBottom: 5,
                cursor: 'pointer',
                borderRadius: 4,
                background: currentPage === page.id ? '#1890ff' : '#fff',
                color: currentPage === page.id ? '#fff' : '#333',
                fontWeight: currentPage === page.id ? 'bold' : 'normal',
                border: '1px solid',
                borderColor: currentPage === page.id ? '#1890ff' : '#e0e0e0',
                transition: 'all 0.2s'
              }}
            >
              {page.icon} {page.name}
            </div>
          ))}
        </div>

        {/* 插件扩展组 */}
        <PluginList 
          currentPage={currentPage}
          onSelectPlugin={(id) => setCurrentPage(`plugin:${id}`)}
        />
      </div>

      {/* 右侧内容区 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {renderContent()}
      </div>
    </div>
  );
}

// 插件列表组件
function PluginList({ currentPage, onSelectPlugin }: { currentPage: string, onSelectPlugin: (id: string) => void }) {
  const [plugins, setPlugins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useState(() => {
    fetch('/api/plugins')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        setPlugins(data.plugins || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load plugins:', err);
        setError(err.message);
        setLoading(false);
      });
  });

  return (
    <div style={{ padding: 15, borderTop: '1px solid #e0e0e0' }}>
      <div style={{ 
        fontSize: 12, 
        color: '#999', 
        marginBottom: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase'
      }}>
        插件扩展
      </div>

      {loading && (
        <div style={{ padding: 10, fontSize: 12, color: '#999' }}>
          加载中...
        </div>
      )}

      {error && (
        <div style={{ 
          padding: 10, 
          fontSize: 11, 
          color: '#ff4d4f',
          background: '#fff1f0',
          borderRadius: 4,
          border: '1px solid #ffccc7'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: 5 }}>
            ⚠️ 后端未连接
          </div>
          <div>请启动 Backend:</div>
          <code style={{ fontSize: 10 }}>
            python src/dynamics/main.py
          </code>
        </div>
      )}

      {!loading && !error && plugins.length === 0 && (
        <div style={{ padding: 10, fontSize: 12, color: '#999' }}>
          暂无插件
        </div>
      )}

      {plugins.map(plugin => {
        const isActive = currentPage === `plugin:${plugin.id}`;
        return (
          <div
            key={plugin.id}
            onClick={() => onSelectPlugin(plugin.id)}
            style={{
              padding: '10px 15px',
              marginBottom: 5,
              cursor: 'pointer',
              borderRadius: 4,
              background: isActive ? '#52c41a' : '#fff',
              color: isActive ? '#fff' : '#333',
              fontWeight: isActive ? 'bold' : 'normal',
              border: '1px solid',
              borderColor: isActive ? '#52c41a' : '#e0e0e0',
              transition: 'all 0.2s'
            }}
          >
            🔌 {plugin.name}
            <div style={{ 
              fontSize: 10, 
              marginTop: 3,
              opacity: isActive ? 0.9 : 0.6
            }}>
              {plugin.category}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default App;
