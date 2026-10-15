#!/usr/bin/env bash
# 停止 LM Reference Engine 的后端（18080）和 GUI（5173、5174），连同它们启动的子进程。
# Ctrl+C 没清理干净、再次启动提示端口被占用时用这个。
# 只停止"监听这些端口"的进程，浏览器等只是连接过来的程序不受影响。
#   bash stop.sh            停止默认端口
#   bash stop.sh --list     只列出占用情况，不停止
#   bash stop.sh 18080      只停止指定端口
LIST=0; PORTS=()
for a in "$@"; do
  if [ "$a" = "--list" ]; then LIST=1; else PORTS+=("$a"); fi
done
[ ${#PORTS[@]} -eq 0 ] && PORTS=(18080 5173 5174)

listening_pids() {  # 监听某个端口的进程号
  if [ "$OS" = "Windows_NT" ]; then
    netstat -ano -p tcp | tr -d '\r' | awk -v p=":$1" '$4=="LISTENING" && $2 ~ (p "$") {print $5}' | sort -u
  else
    lsof -t -i "tcp:$1" -sTCP:LISTEN 2>/dev/null || fuser "$1/tcp" 2>/dev/null | tr -s ' ' '\n'
  fi
}

found=0
for port in "${PORTS[@]}"; do
  for pid in $(listening_pids "$port"); do
    [ -z "$pid" ] || [ "$pid" = "0" ] && continue
    found=1
    if [ "$OS" = "Windows_NT" ]; then
      name=$(tasklist //FI "PID eq $pid" //FO CSV //NH 2>/dev/null | tr -d '\r' | cut -d, -f1 | tr -d '"')
    else
      name=$(ps -o comm= -p "$pid" 2>/dev/null)
    fi
    if [ "$LIST" = "1" ]; then
      echo "port $port: ${name:-?} (pid $pid)"
    else
      echo "port $port: stopping ${name:-?} (pid $pid)"
      if [ "$OS" = "Windows_NT" ]; then
        taskkill //T //F //PID "$pid" >/dev/null   # /T 连同它启动的子进程一起结束
      else
        pkill -TERM -P "$pid" 2>/dev/null; kill -TERM "$pid" 2>/dev/null
      fi
    fi
  done
done
[ "$found" = "0" ] && echo "Nothing is listening on ${PORTS[*]}."
exit 0
