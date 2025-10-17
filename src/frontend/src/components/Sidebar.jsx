// 文件名: src/components/Sidebar.jsx
import React from 'react';
import { Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Divider, IconButton } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import BuildIcon from '@mui/icons-material/Build'; // Generator
import DataUsageIcon from '@mui/icons-material/DataUsage'; // Loader
import ScienceIcon from '@mui/icons-material/Science'; // Simulator
import TrendingUpIcon from '@mui/icons-material/TrendingUp'; // Optimizer
import MenuIcon from '@mui/icons-material/Menu'; // 菜单图标
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'; // 折叠图标
import { Link } from 'react-router-dom';

const navItems = [
    { text: '主页', path: '/', icon: <HomeIcon /> },
    { text: '模型构造', path: '/generator', icon: <BuildIcon /> },
    { text: '模型加载', path: '/loader', icon: <DataUsageIcon /> },
    { text: '模型仿真', path: '/simulator', icon: <ScienceIcon /> },
    { text: '参数优化', path: '/optimizer', icon: <TrendingUpIcon /> },
];

function Sidebar({ open, toggleDrawer, drawerWidth }) {
    return (
        <Drawer
            sx={{
                width: drawerWidth,
                flexShrink: 0,
                '& .MuiDrawer-paper': {
                    width: drawerWidth,
                    boxSizing: 'border-box',
                    // 根据 open 状态控制侧栏的可见性
                    transform: open ? 'translateX(0)' : `translateX(-${drawerWidth}px)`,
                    transition: (theme) => 
                        theme.transitions.create('transform', {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.enteringScreen,
                        }),
                },
            }}
            variant="persistent" // 使用 persistent 模式
            anchor="left"
            open={open}
        >
            {/* 顶部的标题/关闭按钮 */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', minHeight: '64px', justifyContent: 'flex-end' }}>
                <IconButton onClick={toggleDrawer}>
                    {open ? <ChevronLeftIcon /> : <MenuIcon />}
                </IconButton>
            </div>
            <Divider />
            
            {/* 导航列表 */}
            <List>
                {navItems.map((item) => (
                    <ListItem key={item.text} disablePadding>
                        {/* 使用 Link 组件进行路由导航 */}
                        <ListItemButton component={Link} to={item.path}>
                            <ListItemIcon>{item.icon}</ListItemIcon>
                            <ListItemText primary={item.text} />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
        </Drawer>
    );
}

export default Sidebar;