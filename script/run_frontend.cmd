@echo off

REM 打开浏览器
start http://localhost:5173

REM 启动前端
cd src\frontend
npm run dev
