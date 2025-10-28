// frontend/src/App.tsx

import React, { useState } from 'react';
import { Layout, Menu, theme } from 'antd';
import { 
  FileAddOutlined,
  FolderOpenOutlined, 
  PlayCircleOutlined, 
  LineChartOutlined,
  ExperimentOutlined,
  DatabaseOutlined,
  SettingOutlined
} from '@ant-design/icons';
import Generator from './components/Generator';
import Loader from './components/Loader';
import Simulator from './components/Simulator';
import Optimizer from './components/Optimizer';

const { Header, Content, Sider } = Layout;

const App: React.FC = () => {
  const [currentKey, setCurrentKey] = useState('1');
  const [collapsed, setCollapsed] = useState(false);
  const [selectedModel, setSelectedModel] = useState<any>(null);
  
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  // 菜单项配置（支持子菜单）
  const menuItems = [
    {
      key: '1',
      icon: <FileAddOutlined />,
      label: 'Generator - 构造器',
      children: [
        { key: '1-1', label: '模板生成' },
        { key: '1-2', label: '手动编辑' },
        { key: '1-3', label: '从论文生成' },
      ]
    },
    {
      key: '2',
      icon: <FolderOpenOutlined />,
      label: 'Loader - 加载器',
      children: [
        { key: '2-1', label: '浏览模型' },
        { key: '2-2', label: '合并模型' },
        { key: '2-3', label: '依赖分析' },
      ]
    },
    {
      key: '3',
      icon: <PlayCircleOutlined />,
      label: 'Simulator - 仿真器',
      children: [
        { key: '3-1', label: '运行仿真' },
        { key: '3-2', label: '实时监控' },
        { key: '3-3', label: '历史记录' },
      ]
    },
    {
      key: '4',
      icon: <LineChartOutlined />,
      label: 'Optimizer - 优化器',
      children: [
        { key: '4-1', label: '参数优化' },
        { key: '4-2', label: '多目标优化' },
        { key: '4-3', label: '优化历史' },
      ]
    },
  ];

  // 根据选择的菜单渲染内容
  const renderContent = () => {
    const mainKey = currentKey.split('-')[0];
    
    switch (mainKey) {
      case '1':
        return <Generator subPage={currentKey} />;
      case '2':
        return <Loader subPage={currentKey} onModelSelect={setSelectedModel} />;
      case '3':
        return <Simulator subPage={currentKey} selectedModel={selectedModel} />;
      case '4':
        return <Optimizer subPage={currentKey} selectedModel={selectedModel} />;
      default:
        return <div style={{ padding: 24 }}>请选择功能模块</div>;
    }
  };

  const getPageTitle = () => {
    const titles: Record<string, string> = {
      '1': 'Generator - 模型构造器',
      '1-1': 'Generator - 模板生成',
      '1-2': 'Generator - 手动编辑',
      '1-3': 'Generator - 从论文生成',
      '2': 'Loader - 模型加载器',
      '2-1': 'Loader - 浏览模型',
      '2-2': 'Loader - 合并模型',
      '2-3': 'Loader - 依赖分析',
      '3': 'Simulator - 仿真运行',
      '3-1': 'Simulator - 运行仿真',
      '3-2': 'Simulator - 实时监控',
      '3-3': 'Simulator - 历史记录',
      '4': 'Optimizer - 参数优化',
      '4-1': 'Optimizer - 参数优化',
      '4-2': 'Optimizer - 多目标优化',
      '4-3': 'Optimizer - 优化历史',
    };
    return titles[currentKey] || 'LifeMatters 仿真系统';
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider 
        theme="light" 
        width={260}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          boxShadow: '2px 0 8px rgba(0,0,0,0.1)'
        }}
      >
        {/* Logo 区域 */}
        <div style={{ 
          height: 64, 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: collapsed ? 16 : 18,
          fontWeight: 'bold',
          color: '#1890ff',
          borderBottom: '1px solid #f0f0f0',
          padding: '0 16px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}>
          {collapsed ? 'LM' : '🧬 LifeMatters'}
        </div>
        
        {/* 菜单 */}
        <Menu 
          theme="light" 
          selectedKeys={[currentKey]} 
          defaultOpenKeys={['1', '2', '3', '4']}
          mode="inline"
          onClick={(e) => setCurrentKey(e.key)}
          items={menuItems}
          style={{ borderRight: 0 }}
        />
        
        {/* 底部信息 */}
        {!collapsed && (
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
              <ExperimentOutlined /> 仿真系统 v2.1.0
            </div>
            <div>
              <DatabaseOutlined /> {selectedModel ? `已选: ${selectedModel.name}` : '未选择模型'}
            </div>
          </div>
        )}
      </Sider>
      
      {/* 主内容区域 */}
      <Layout style={{ marginLeft: collapsed ? 80 : 260, transition: 'margin-left 0.2s' }}>
        <Header style={{ 
          padding: '0 24px', 
          background: colorBgContainer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
          height: 64,
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
        }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: '#262626' }}>
            {getPageTitle()}
          </div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            {new Date().toLocaleString('zh-CN', { 
              year: 'numeric', 
              month: '2-digit', 
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
        </Header>
        
        <Content style={{ margin: '24px', overflow: 'initial' }}>
          <div
            style={{
              padding: 24,
              minHeight: 'calc(100vh - 112px)',
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
              width: '100%',
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
