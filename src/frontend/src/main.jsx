import React from 'react'; // 导入React
import ReactDOM from 'react-dom/client'; // 导入ReactDOM用于渲染
import App from './App'; // 导入App.js（注意：不是App.tsx）

// 创建根节点并渲染
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App /> // 渲染App组件
  </React.StrictMode>
);