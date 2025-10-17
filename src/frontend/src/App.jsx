import React, { useState } from 'react'; // 导入React核心和状态钩子
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'; // 导入路由组件
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'; // 导入MUI主题和基础样式
import Sidebar from './components/Sidebar'; // 导入自定义侧栏组件
import Home from './pages/Home'; // 导入主页
import Generator from './pages/Generator'; // 导入Generator页面
import Loader from './pages/Loader'; // 导入Loader页面
import Simulator from './pages/Simulator'; // 导入Simulator页面
import Optimizer from './pages/Optimizer'; // 导入Optimizer页面

const theme = createTheme(); // 创建默认MUI主题

function App() {
  const [open, setOpen] = useState(true); // 管理侧栏展开状态，默认展开

  // 定义侧栏切换函数
  const toggleDrawer = () => {
    setOpen(!open); // 切换侧栏展开/折叠
  };

  return (
    <ThemeProvider theme={theme}> // 应用MUI主题
      <CssBaseline /> // 重置浏览器默认样式
      <Router> // 启用路由
        <div style={{ display: 'flex' }}> // 整体布局为flex，侧栏与内容并列
          <Sidebar open={open} toggleDrawer={toggleDrawer} /> // 渲染侧栏组件
          <main style={{ flexGrow: 1, padding: '16px' }}> // 主内容区域，自动填充剩余空间
            <Routes> // 定义路由路径
              <Route path="/" element={<Home />} /> // 主页路由
              <Route path="/generator" element={<Generator />} /> // Generator路由
              <Route path="/loader" element={<Loader />} /> // Loader路由
              <Route path="/simulator" element={<Simulator />} /> // Simulator路由
              <Route path="/optimizer" element={<Optimizer />} /> // Optimizer路由
            </Routes>
          </main>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App; // 导出App组件