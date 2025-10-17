import React from 'react'; // 导入React
import { Typography, TextField, Button } from '@mui/material'; // 导入MUI组件
import Simulator from './Simulator'; // 导入Simulator组件（嵌套使用）

function Optimizer() {
  return (
    <div>
      <Typography variant="h5">优化参数输入</Typography> // 标题
      <TextField label="优化方法 (e.g., grid)" fullWidth /> // 输入字段示例
      <TextField label="持续时间 (分钟)" fullWidth /> // 另一个输入字段
      <Button variant="contained">开始优化</Button> // 优化按钮
      <Typography variant="h6" style={{ marginTop: '16px' }}>嵌套仿真视图</Typography> // 子标题
      <Simulator /> // 嵌套Simulator组件，提供仿真部分
    </div>
  );
}

export default Optimizer; // 导出Optimizer组件