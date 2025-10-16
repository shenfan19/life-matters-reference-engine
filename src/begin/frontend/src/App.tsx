// frontend/src/App.tsx

import React, { useState } from 'react';
import { Layout, Menu, theme, Tabs, Card, Row, Col } from 'antd';
import { SettingOutlined, TableOutlined, LineChartOutlined, FolderOutlined } from '@ant-design/icons';
import ParamInput from './components/ParamInput'; // 稍后创建
import ModManager from './components/ModManager'; // 稍后创建

const { Header, Content, Sider } = Layout;

// 假设这是您的所有页面/功能模块
const items = [
  { key: '1', icon: <TableOutlined />, label: '参数输入与控制' },
  { key: '2', icon: <FolderOutlined />, label: 'MOD 模块管理' },
  { key: '3', icon: <LineChartOutlined />, label: '结果显示与监控' },
  { key: '4', icon: <SettingOutlined />, label: '优化与高级设置' },
];

const App: React.FC = () => {
  const [currentKey, setCurrentKey] = useState('1');
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  // 根据选中的菜单渲染不同的内容
  const renderContent = () => {
    switch (currentKey) {
      case '1':
        return <ParamInput />; // 核心参数输入 Data Grid
      case '2':
        return <ModManager />; // MOD 模块树状图
      case '3':
        // 使用 Ant Design 的 Tabs 来分隔不同的结果视图
        return (
          <Tabs
            defaultActiveKey="monitor"
            items={[
              { key: 'monitor', label: '实时监控图表', children: <Card title="实时曲线变化">这里是 ECharts 实时图表</Card> },
              { key: 'status', label: '变量状态显示', children: <Card title="变量状态">这里是多个柱状图/文本显示</Card> },
              { key: 'text', label: '特殊状态文本', children: <Card title="状态输出">当前特殊状态：未开始仿真</Card> },
            ]}
          />
        );
      case '4':
        return (
          <Card title="优化系统配置">
            这里是公式、约束、最大/最小值等单选框和表单
          </Card>
        );
      default:
        return <div>请选择功能模块</div>;
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="light" collapsible collapsed={false} onCollapse={() => {}}>
        <div style={{ height: 32, margin: 16, textAlign: 'center', fontWeight: 'bold' }}>
          FEM 系统
        </div>
        <Menu 
          theme="light" 
          defaultSelectedKeys={[currentKey]} 
          mode="inline" 
          items={items} 
          onClick={(e) => setCurrentKey(e.key)} 
        />
      </Sider>
      <Layout>
        <Content style={{ margin: '24px 16px 0', overflow: 'initial' }}>
          <div
            style={{
              padding: 24,
              minHeight: '80vh',
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