@echo off
REM start.bat - Windows 一键启动脚本

echo ========================================
echo    LifeMatters 仿真系统启动
echo ========================================
echo.

REM 启动后端
python src\api_server.py

REM 等待后端启动
timeout /t 3 /nobreak >nul

REM 启动前端
cd src\frontend
npm run dev

REM 打开浏览器
timeout /t 2 /nobreak >nul
start http://localhost:5173

pause >nul
