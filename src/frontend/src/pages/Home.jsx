import React from 'react'; // 导入React
import { Typography, Paper } from '@mui/material'; // 导入MUI文本和纸张组件

function Home() {
  return (
    <Paper elevation={3} style={{ padding: '16px' }}> // 纸张容器，提供阴影效果
      <Typography variant="h4">欢迎使用LifeMatters框架</Typography> // 主标题
      <Typography variant="body1"> // 描述文本
        本框架面向医学与社会学研究，支持从科研论文生成动力学模型，并提供交互式仿真体验。
        请通过左侧侧栏选择模块开始操作。
      </Typography>
    </Paper>
  );
}

export default Home; // 导出主页组件