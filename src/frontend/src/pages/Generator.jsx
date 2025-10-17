import React, { useState } from 'react'; // 导入React和状态钩子
import { Button, Dialog, DialogTitle, DialogContent, TextField } from '@mui/material'; // 导入MUI按钮和对话框组件
import jsyaml from 'js-yaml'; // 导入YAML处理库

function Generator() {
  const [open, setOpen] = useState(false); // 管理对话框打开状态
  const [params, setParams] = useState({}); // 存储输入参数

  // 处理输入变化
  const handleChange = (e) => {
    setParams({ ...params, [e.target.name]: e.target.value }); // 更新参数对象
  };

  // 生成并保存YAML
  const handleGenerate = () => {
    const yamlData = jsyaml.dump(params); // 将参数转换为YAML字符串
    const blob = new Blob([yamlData], { type: 'text/yaml' }); // 创建Blob对象
    const url = URL.createObjectURL(blob); // 生成下载URL
    const a = document.createElement('a'); // 创建下载链接
    a.href = url; // 设置链接
    a.download = 'generated.yaml'; // 设置文件名
    a.click(); // 触发下载
    setOpen(false); // 关闭对话框
  };

  return (
    <div>
      <Button variant="contained" onClick={() => setOpen(true)}>打开构造对话框</Button> // 打开对话框按钮
      <Dialog open={open} onClose={() => setOpen(false)}> // 对话框组件
        <DialogTitle>输入构造参数</DialogTitle> // 标题
        <DialogContent> // 内容
          <TextField name="risk_name" label="风险名称" onChange={handleChange} fullWidth /> // 输入字段示例
          <TextField name="increase_rate" label="增加率" onChange={handleChange} fullWidth /> // 另一个输入字段
          <Button onClick={handleGenerate}>生成并保存YAML</Button> // 生成按钮
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Generator; // 导出Generator组件