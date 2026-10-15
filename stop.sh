#!/usr/bin/env bash
# 停止 LM Reference Engine 的后端（18080）和 GUI（5173、5174），连同它们启动的子进程。
# Ctrl+C 没清理干净、再次启动提示端口被占用时用这个。
# 只停止"监听这些端口"的进程，浏览器等只是连接过来的程序不受影响。
#   bash stop.sh            停止默认端口
#   bash stop.sh --list     只列出占用情况，不停止
#   bash stop.sh 18080      只停止指定端口
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python "$ROOT/scripts/kill_ports.py" "$@"
