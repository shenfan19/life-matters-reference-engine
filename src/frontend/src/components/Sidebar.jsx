import React from 'react'; // 导入React
import { Drawer, List, ListItem, ListItemIcon, ListItemText, ListSubheader, Collapse } from '@mui/material'; // 导入MUI侧栏相关组件
import { Link } from 'react-router-dom'; // 导入路由链接
import ExpandLess from '@mui/icons-material/ExpandLess'; // 展开图标
import ExpandMore from '@mui/icons-material/ExpandMore'; // 折叠图标
import BuildIcon from '@mui/icons-material/Build'; // Generator图标
import FolderOpenIcon from '@mui/icons-material/FolderOpen'; // Loader图标
import PlayArrowIcon from '@mui/icons-material/PlayArrow'; // Simulator图标
import TuneIcon from '@mui/icons-material/Tune'; // Optimizer图标

function Sidebar({ open, toggleDrawer }) {
  const [expanded, setExpanded] = React.useState({}); // 管理每个主项的子选项展开状态

  // 处理子选项展开/折叠
  const handleExpand = (item) => {
    setExpanded((prev) => ({ ...prev, [item]: !prev[item] })); // 切换指定项的展开状态
  };

  return (
    <Drawer variant="persistent" anchor="left" open={open}> // 持久侧栏，左侧固定
      <List> // 侧栏列表
        <ListSubheader>LifeMatters 框架</ListSubheader> // 侧栏标题
        <ListItem button component={Link} to="/generator" onClick={toggleDrawer}> // Generator主项，点击导航
          <ListItemIcon><BuildIcon /></ListItemIcon> // 图标
          <ListItemText primary="Generator (构造)" /> // 文本
          <div onClick={() => handleExpand('generator')}> // 子选项展开按钮
            {expanded['generator'] ? <ExpandLess /> : <ExpandMore />} // 根据状态显示图标
          </div>
        </ListItem>
        <Collapse in={expanded['generator']} timeout="auto" unmountOnExit> // 子选项折叠容器
          <List component="div" disablePadding> // 子列表
            <ListItem button style={{ paddingLeft: '32px' }}> // 子项示例（可扩展）
              <ListItemText primary="模板生成" /> // 子选项文本
            </ListItem>
          </List>
        </Collapse>

        {/* 类似结构重复用于其他模块 */}
        <ListItem button component={Link} to="/loader" onClick={toggleDrawer}>
          <ListItemIcon><FolderOpenIcon /></ListItemIcon>
          <ListItemText primary="Loader (读取)" />
          <div onClick={() => handleExpand('loader')}>
            {expanded['loader'] ? <ExpandLess /> : <ExpandMore />}
          </div>
        </ListItem>
        <Collapse in={expanded['loader']} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            <ListItem button style={{ paddingLeft: '32px' }}>
              <ListItemText primary="文件合并" />
            </ListItem>
          </List>
        </Collapse>

        <ListItem button component={Link} to="/simulator" onClick={toggleDrawer}>
          <ListItemIcon><PlayArrowIcon /></ListItemIcon>
          <ListItemText primary="Simulator (仿真)" />
          <div onClick={() => handleExpand('simulator')}>
            {expanded['simulator'] ? <ExpandLess /> : <ExpandMore />}
          </div>
        </ListItem>
        <Collapse in={expanded['simulator']} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            <ListItem button style={{ paddingLeft: '32px' }}>
              <ListItemText primary="交互仿真" />
            </ListItem>
          </List>
        </Collapse>

        <ListItem button component={Link} to="/optimizer" onClick={toggleDrawer}>
          <ListItemIcon><TuneIcon /></ListItemIcon>
          <ListItemText primary="Optimizer (优化)" />
          <div onClick={() => handleExpand('optimizer')}>
            {expanded['optimizer'] ? <ExpandLess /> : <ExpandMore />}
          </div>
        </ListItem>
        <Collapse in={expanded['optimizer']} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            <ListItem button style={{ paddingLeft: '32px' }}>
              <ListItemText primary="多目标优化" />
            </ListItem>
          </List>
        </Collapse>
      </List>
    </Drawer>
  );
}

export default Sidebar; // 导出侧栏组件