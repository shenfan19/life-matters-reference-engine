import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme, Box, Toolbar } from '@mui/material'; // 导入 Box 和 Toolbar
import Sidebar from './components/Sidebar'; 
import Home from './pages/Home';
import Generator from './pages/Generator';
import Loader from './pages/Loader';
import Simulator from './pages/Simulator';
import Optimizer from './pages/Optimizer';

const theme = createTheme();
const drawerWidth = 240; // 定义侧栏宽度

function App() {
  const [open, setOpen] = useState(true); // 管理侧栏展开状态

  const toggleDrawer = () => {
    setOpen(!open);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Box sx={{ display: 'flex' }}> {/* 整体布局为flex */}
          {/* 1. 侧栏组件：负责渲染侧栏和导航链接 */}
          <Sidebar open={open} toggleDrawer={toggleDrawer} drawerWidth={drawerWidth} /> 
          
          {/* 2. 主内容区域 */}
          <Box
            component="main"
            sx={{
              flexGrow: 1,
              p: 3, // padding
              // 关键：根据侧栏的打开状态调整左侧边距
              width: { sm: `calc(100% - ${open ? drawerWidth : 0}px)` },
              marginLeft: { sm: open ? `${drawerWidth}px` : 0 },
              transition: theme.transitions.create(['margin', 'width'], {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
              }),
            }}
          >
            <Toolbar /> {/* 占位符，模拟顶部 AppBar 的高度，防止内容被遮挡 */}
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/generator" element={<Generator />} />
              <Route path="/loader" element={<Loader />} />
              <Route path="/simulator" element={<Simulator />} />
              <Route path="/optimizer" element={<Optimizer />} />
            </Routes>
          </Box>
        </Box>
      </Router>
    </ThemeProvider>
  );
}

export default App;