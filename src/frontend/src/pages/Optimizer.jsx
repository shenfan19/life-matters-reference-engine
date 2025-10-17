import React from 'react';
import { Typography, TextField, Button, Box, Paper, Divider } from '@mui/material'; // 导入 Box, Paper, Divider
import Simulator from './Simulator'; 

function Optimizer() {
  return (
    <Box sx={{ p: 2 }}>
      <Paper elevation={3} sx={{ p: 3, mb: 4 }}>
        <Typography variant="h5" gutterBottom>优化参数配置</Typography> 
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 400 }}>
            <TextField label="优化方法 (e.g., Grid Search)" fullWidth variant="outlined" size="small" /> 
            <TextField label="最大迭代次数" fullWidth type="number" variant="outlined" size="small" />
            <TextField label="目标变量" fullWidth variant="outlined" size="small" />
            <Button variant="contained" color="secondary" sx={{ mt: 1 }}>开始优化</Button>
        </Box>
      </Paper>
      
      <Divider sx={{ mb: 4 }} />
      
      <Typography variant="h6" gutterBottom>优化过程中的嵌套仿真视图</Typography> 
      <Simulator /> 
    </Box>
  );
}

export default Optimizer;