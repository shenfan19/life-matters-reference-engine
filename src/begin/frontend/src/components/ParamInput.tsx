// frontend/src/components/ParamInput.tsx

import React, { useState } from 'react';
import { Button, message, Upload, Space, Card, Slider, Row, Col } from 'antd';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

const ParamInput: React.FC = () => {
  // Data Grid 的初始数据 (10个变量)
  const [rowData, setRowData] = useState([
    { param: 'Length', value: 10.5, unit: 'm', description: '梁的长度' },
    { param: 'E Modulus', value: 200, unit: 'GPa', description: '弹性模量' },
    { param: 'Density', value: 7850, unit: 'kg/m³', description: '材料密度' },
    { param: 'Width', value: 0.2, unit: 'm', description: '截面宽度' },
    { param: 'Height', value: 0.3, unit: 'm', description: '截面高度' },
    { param: 'Load', value: 1000, unit: 'N', description: '施加载荷' },
    { param: 'Temperature', value: 25, unit: '°C', description: '环境温度' },
    { param: 'Poisson Ratio', value: 0.3, unit: '-', description: '泊松比' },
    { param: 'Time Step', value: 0.01, unit: 's', description: '时间步长' },
    { param: 'Iterations', value: 100, unit: '-', description: '迭代次数' },
  ]);

  // 列定义
  const columnDefs = [
    { field: 'param', headerName: '参数名称', width: 150, editable: false },
    { field: 'value', headerName: '数值', editable: true, type: 'numericColumn' },
    { field: 'unit', headerName: '单位', width: 100, editable: true },
    { field: 'description', headerName: '描述', editable: true, flex: 1 },
  ];

  const handleCellValueChanged = (params: any) => {
    console.log('Cell value changed:', params);
    message.info(`已更新 ${params.data.param} 的值`);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* CSV 读入和状态保存区域 */}
      <Card title="控制面板">
        <Space wrap>
          <Upload accept=".csv" beforeUpload={() => false}>
            <Button>读入 CSV 文件</Button>
          </Upload>
          <Button onClick={() => message.success('状态已保存')}>保存当前状态</Button>
          <Button type="primary">开始/继续仿真</Button>
          <Button danger>暂停/终止仿真</Button>
        </Space>
      </Card>

      {/* 拖动条区域 */}
      <Card title="仿真中实时调整 (拖动条)">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Row gutter={16} align="middle">
            <Col span={4}>调整参数 A:</Col>
            <Col span={20}><Slider defaultValue={30} /></Col>
          </Row>
          <Row gutter={16} align="middle">
            <Col span={4}>调整参数 B:</Col>
            <Col span={20}><Slider defaultValue={50} /></Col>
          </Row>
        </Space>
      </Card>

      {/* Data Grid 区域 */}
      <Card title="核心参数输入 (Excel 式)">
        <div className="ag-theme-alpine" style={{ height: 400, width: '100%' }}>
          <AgGridReact
            rowData={rowData}
            columnDefs={columnDefs}
            onCellValueChanged={handleCellValueChanged}
          />
        </div>
      </Card>
    </Space>
  );
};

export default ParamInput;