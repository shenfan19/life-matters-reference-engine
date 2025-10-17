import React, { useState } from 'react'; // 导入React和状态钩子
import { Button, TextField, Typography } from '@mui/material'; // 导入MUI组件
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'; // 导入Recharts图表组件

function Simulator() {
  const [running, setRunning] = useState(false); // 仿真运行状态
  const [data, setData] = useState([]); // 存储曲线数据
  const [params, setParams] = useState({ time: 8760 }); // 输入参数

  // 处理输入变化
  const handleChange = (e) => {
    setParams({ ...params, [e.target.name]: e.target.value }); // 更新参数
  };

  // 启动仿真
  const startSimulation = () => {
    setRunning(true); // 设置运行中
    // 模拟仿真过程（实际可调用后端API）
    const simulatedData = Array.from({ length: 10 }, (_, i) => ({ step: i, value: Math.random() * 100 })); // 生成示例数据
    setData(simulatedData); // 更新数据
  };

  // 暂停仿真
  const pauseSimulation = () => setRunning(false); // 设置暂停

  // 结束仿真
  const stopSimulation = () => {
    setRunning(false); // 停止运行
    setData([]); // 清空数据
  };

  return (
    <div>
      <TextField name="time" label="总时间 (小时)" value={params.time} onChange={handleChange} /> // 输入框
      <Button onClick={startSimulation} disabled={running}>运行</Button> // 运行按钮
      <Button onClick={pauseSimulation} disabled={!running}>暂停</Button> // 暂停按钮
      <Button onClick={stopSimulation}>结束</Button> // 结束按钮
      <Typography variant="body1">输出文本: 仿真结果...</Typography> // 文本输出
      <LineChart width={600} height={300} data={data}> // 曲线图
        <CartesianGrid strokeDasharray="3 3" /> // 网格
        <XAxis dataKey="step" /> // X轴
        <YAxis /> // Y轴
        <Tooltip /> // 提示
        <Legend /> // 图例
        <Line type="monotone" dataKey="value" stroke="#8884d8" /> // 曲线
      </LineChart>
    </div>
  );
}

export default Simulator; // 导出Simulator组件