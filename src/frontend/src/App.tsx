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

  // 获取状态指示器颜色
  const getStatusColor = (status: string) => {
    switch(status) {
      case 'running': return '#52c41a';
      case 'paused': return '#faad14';
      case 'completed': return '#1890ff';
      default: return '#d9d9d9';
    }
  };

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

  // 菜单项配置
  const menuItems = [
    {
      key: '1',
      icon: <AppstoreOutlined />,
      label: '参数生成器',
    },
    {
      key: '2',
      icon: <CloudUploadOutlined />,
      label: (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>MOD 加载器</span>
          {loadedModules > 0 && <Badge count={loadedModules} style={{ marginLeft: 8 }} />}
        </span>
      ),
    },
    {
      key: '3',
      icon: <PlayCircleOutlined />,
      label: (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>仿真器</span>
          {simulationStatus !== 'idle' && (
            <span style={{ 
              width: 8, 
              height: 8, 
              borderRadius: '50%', 
              backgroundColor: getStatusColor(simulationStatus),
              marginLeft: 8,
              display: 'inline-block'
            }} />
          )}
        </span>
      ),
    },
    {
      key: '4',
      icon: <LineChartOutlined />,
      label: '优化器',
    },
  ];

  const getPageTitle = () => {
    switch(currentKey) {
      case '1': return '参数生成器';
      case '2': return 'MOD 加载器';
      case '3': return '仿真器';
      case '4': return '优化器';
      default: return 'FEM 系统';
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider 
        theme="light" 
        width={220}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        {/* Logo 区域 */}
        <div style={{ 
          height: 64, 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          fontWeight: 'bold',
          color: '#1890ff',
          borderBottom: '1px solid #f0f0f0',
          padding: '0 16px'
        }}>
          FEM 仿真系统
        </div>
        
        {/* 菜单 */}
        <Menu 
          theme="light" 
          selectedKeys={[currentKey]} 
          mode="inline"
          onClick={(e) => setCurrentKey(e.key)}
          items={menuItems}
          style={{ borderRight: 0 }}
        />
        
        {/* 底部状态栏 */}
        <div style={{ 
          position: 'absolute', 
          bottom: 0, 
          left: 0,
          right: 0,
          padding: '12px 16px',
          borderTop: '1px solid #f0f0f0',
          background: '#fafafa',
          fontSize: 12,
          color: '#666'
        }}>
          <div style={{ marginBottom: 4 }}>
            状态: {
              simulationStatus === 'idle' ? '待命' : 
              simulationStatus === 'running' ? '运行中' : 
              simulationStatus === 'paused' ? '已暂停' : 
              '已完成'
            }
          </div>
          <div>已加载: {loadedModules} 个模块</div>
        </div>
      </Sider>
      
      {/* 主内容区域 */}
      <Layout style={{ marginLeft: 220 }}>
        <Header style={{ 
          padding: '0 24px', 
          background: colorBgContainer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
          height: 64
        }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>
            {getPageTitle()}
          </div>
          <div style={{ fontSize: 12, color: '#999' }}>
            {new Date().toLocaleString('zh-CN')}
          </div>
        </Header>
        
        <Content style={{ margin: '24px 16px', overflow: 'initial' }}>
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