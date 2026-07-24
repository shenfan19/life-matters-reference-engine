@echo off
REM 一键启动 LM Reference Engine 后端 + GUI 前端（dev 模式），两个可见窗口。
REM 用途：本地试用（外部用户）、SCS 服务器上的手动/冒烟测试运行。
REM 生产环境常驻部署仍走 systemd/服务化 + Nginx，不用本脚本常驻。
setlocal
set ROOT=%~dp0

start "LM Backend"  cmd /k "cd /d "%ROOT%reference_engine" && python src\api_server.py"
start "LM Frontend" cmd /k "cd /d "%ROOT%gui" && npm run dev"

echo.
echo Backend:  http://127.0.0.1:18080
echo Frontend: http://localhost:5173
echo 关闭上面两个窗口即可停止；关不掉就跑 scripts\kill_ports.py 强制清理端口（python scripts\kill_ports.py）。
echo.
endlocal
