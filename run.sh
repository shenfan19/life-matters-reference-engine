#!/usr/bin/env bash
# 一键启动 LM Reference Engine 后端 + GUI 前端（dev 模式）。
# 用途：本地试用（外部用户）、SCS 服务器上的手动/冒烟测试运行。
# 生产环境常驻部署仍走 systemd + Nginx（见 docs/reference_engine 部署说明），不用本脚本常驻。
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
  echo ""
  echo "Stopping backend/frontend..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(cd "$ROOT/reference_engine" && python src/api_server.py) &
BACKEND_PID=$!

(cd "$ROOT/gui" && npm run dev) &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://127.0.0.1:18080"
echo "Frontend: http://localhost:5173"
echo "按 Ctrl+C 停止两个进程。"
echo ""

wait
