import React, { useState, useEffect } from 'react'; // 导入React、状态和效果钩子
import { TreeView, TreeItem } from '@mui/lab'; // 导入MUI树视图组件
import { Paper, Typography } from '@mui/material'; // 导入纸张和文本组件
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'; // 展开图标
import ChevronRightIcon from '@mui/icons-material/ChevronRight'; // 折叠图标

function Loader() {
  const [files, setFiles] = useState([]); // 存储文件列表
  const [selectedContent, setSelectedContent] = useState(''); // 存储选中文件内容

  useEffect(() => {
    // 模拟自动检索文件夹（实际可替换为API调用）
    setFiles([
      { id: '1', name: 'physiology', children: [{ id: '1-1', name: 'digestive.yaml' }, { id: '1-2', name: 'diabetes.yaml' }] }
    ]); // 设置示例文件树
  }, []); // 仅在组件挂载时执行

  // 处理文件点击
  const handleSelect = (nodeId) => {
    setSelectedContent(`选中文件: ${nodeId} 的YAML内容摘要: { variables: ..., formulas: ... }`); // 模拟显示YAML内容
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}> // 垂直布局
      <TreeView defaultCollapseIcon={<ExpandMoreIcon />} defaultExpandIcon={<ChevronRightIcon />} onNodeSelect={handleSelect}> // 树视图
        {files.map((folder) => ( // 渲染文件夹树
          <TreeItem key={folder.id} nodeId={folder.id} label={folder.name}> // 文件夹项
            {folder.children.map((file) => ( // 渲染子文件
              <TreeItem key={file.id} nodeId={file.id} label={file.name} /> // 文件项
            ))}
          </TreeItem>
        ))}
      </TreeView>
      <Paper style={{ marginTop: '16px', padding: '16px', flexGrow: 0 }}> // 下方固定面板
        <Typography variant="body1">{selectedContent}</Typography> // 显示选中内容
      </Paper>
    </div>
  );
}

export default Loader; // 导出Loader组件