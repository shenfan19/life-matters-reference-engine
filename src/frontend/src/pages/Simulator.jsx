import React, { useState } from 'react';
import { Button, TextField, Typography, Box } from '@mui/material'; // 导入 Box
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'; // 导入 ResponsiveContainer

function Simulator() {
  const [running, setRunning] = useState(false);
  const [data, setData] = useState([]);
  const [params, setParams] = useState({ time: 8760 });
  const [outputMessage, setOutputMessage] = useState('等待仿真开始...'); // 新增输出状态

  const handleChange = (e) => {
    setParams({ ...params, [e.target.name]: e.target.value });
  };

  const startSimulation = () => {
    setRunning(true);
    setOutputMessage('仿真运行中...');
    
    // 模拟仿真过程
    const simulatedData = Array.from({ length: 10 }, (_, i) => ({ step: i * params.time / 10, value: Math.random() * 100 }));
    setData(simulatedData);
    
    // 模拟运行一段时间后完成
    setTimeout(() => {
        setRunning(false);
        setOutputMessage(`仿真已完成，总共运行 ${params.time} 小时。`);
    }, 1500); // 1.5秒后自动停止
  };

  const pauseSimulation = () => {
    setRunning(false);
    setOutputMessage('仿真已暂停。');
  };

  const stopSimulation = () => {
    setRunning(false);
    setData([]);
    setOutputMessage('仿真已终止，数据已清除。');
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom>模型仿真</Typography>
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <TextField 
            name="time" 
            label="总时间 (小时)" 
            type="number" 
            value={params.time} 
            onChange={handleChange} 
            variant="outlined"
            size="small"
        />
        <Button onClick={startSimulation} disabled={running} variant="contained" color="primary">运行</Button>
        <Button onClick={pauseSimulation} disabled={!running} variant="outlined">暂停</Button>
        <Button onClick={stopSimulation} disabled={data.length === 0 && !running} variant="outlined" color="error">结束</Button>
      </Box>
      
      <Typography variant="body1" sx={{ mt: 2, mb: 2 }}>
        **当前状态:** {outputMessage}
      </Typography>
      
      {/* 使用 ResponsiveContainer 使得图表适应父容器宽度 */}
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="step" label={{ value: '时间步长 (小时)', position: 'bottom' }} />
            <YAxis label={{ value: '结果值', angle: -90, position: 'left' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="value" stroke="#8884d8" activeDot={{ r: 8 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Box>
  );
}

export default Simulator;