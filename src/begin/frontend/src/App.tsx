// frontend/src/App.tsx

import React, { useState } from 'react';
import { Layout, Menu, theme, Badge } from 'antd';
import { 
  AppstoreOutlined, 
  CloudUploadOutlined, 
  PlayCircleOutlined, 
  LineChartOutlined 
} from '@ant-design/icons';
import Generator from './components/Generator';
import Loader from './components/Loader';
import Simulator from './components/Simulator';
import Optimizer from './components/Optimizer';

const { Header, Content, Sider } = Layout;

const App: React.FC = () => {
  const [currentKey, setCurrentKey] = useState('1');
  const [simulationStatus, setSimulationStatus] = useState<'idle' | 'running' | 'paused' | 'completed'>('idle');
  const [loadedModules, setLoadedModules] = useState<number>(0);
  
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  // 菜单项
  const menuItems = [
    { 
      key: '1', 
      icon: <AppstoreOutlined />, 
      label: '参数生成器',
      description: 'Parameter Generator'
    },
    { 
      key: '2', 
      icon: <CloudUploadOutlined />, 
      label: 'MOD 加载器',
      description: 'Module Loader',
      badge: loadedModules
    },
    { 
      key: '3', 
      icon: <PlayCircleOutlined />, 
      label: '仿真器',
      description: 'Simulator',
      status: simulationStatus
    },
    { 
      key: '4', 
      icon: <LineChartOutlined />, 
      label: '优化器',
      description: 'Optimizer'
    },
  ];

  // 渲染当前模块
  const renderContent = () => {
    switch (currentKey) {
      case '1':
        return <Generator />;
      case '2':
        return <Loader onModulesChange={setLoadedModules} />;
      case '3':
        return <Simulator onStatusChange={setSimulationStatus} />;
      case '4':
        return <Optimizer />;
      default:
        return <div>请选择功能模块</div>;
    }
  };

  // 获取状态指示器颜色
  const getStatusColor = (status: string) => {
    switch(status) {
      case 'running': return '#52c41a';
      case 'paused': return '#faad14';
      case 'completed': return '#1890ff';
      default: return '#d9d9d9';
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider 
        theme="light" 
        width={250}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        <div style={{ 
          height: 64, 
          margin: '16px', 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          fontWeight: 'bold',
          color: '#1890ff',
          borderBottom: '2px solid #f0f0f0'
        }}>
          FEM 仿真系统
        </div>
        <Menu 
          theme="light" 
          selectedKeys={[currentKey]} 
          mode="inline"
          onClick={(e) => setCurrentKey(e.key)}
          items={menuItems.map(item => ({
            key: item.key,
            icon: item.icon,
            label: (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div>{item.label}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{item.description}</div>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <Badge count={item.badge} style={{ marginLeft: 8 }} />
                )}
                {item.status && item.status !== 'idle' && (
                  <div style={{ 
                    width: 8, 
                    height: 8, 
                    borderRadius: '50%', 
                    backgroundColor: getStatusColor(item.status),
                    marginLeft: 8
                  }} />
                )}
              </div>
            ),
          }))}
        />
        
        <div style={{ 
          position: 'absolute', 
          bottom: 16, 
          left: 16, 
          right: 16,
          fontSize: 12,
          color: '#999',
          textAlign: 'center',
          padding: '12px',
          borderTop: '1px solid #f0f0f0'
        }}>
          <div>系统状态: {simulationStatus === 'idle' ? '待命' : simulationStatus === 'running' ? '运行中' : simulationStatus === 'paused' ? '已暂停' : '已完成'}</div>
          <div>已加载模块: {loadedModules}</div>
        </div>
      </Sider>
      
      <Layout style={{ marginLeft: 250 }}>
        <Header style={{ 
          padding: '0 24px', 
          background: colorBgContainer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0'
        }}>
          <div style={{ fontSize: 18, fontWeight: 500 }}>
            {menuItems.find(item => item.key === currentKey)?.label}
          </div>
          <div style={{ fontSize: 12, color: '#999' }}>
            {new Date().toLocaleString('zh-CN')}
          </div>
        </Header>
        
        <Content style={{ margin: '24px 24px 0', overflow: 'initial' }}>
          <div
            style={{
              padding: 24,
              minHeight: 'calc(100vh - 112px)',
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
            }}
          >
            {renderContent()}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;