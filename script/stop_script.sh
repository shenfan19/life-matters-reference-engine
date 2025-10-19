#!/bin/bash
# stop.sh - 停止 LifeMatters 服务

echo "🛑 正在停止 LifeMatters 服务..."

# 停止后端
if [ -f ".backend.pid" ]; then
    BACKEND_PID=$(cat .backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo "   停止后端 (PID: $BACKEND_PID)..."
        kill $BACKEND_PID
        rm .backend.pid
        echo "   ✅ 后端已停止"
    else
        echo "   ⚠️  后端进程不存在"
        rm .backend.pid
    fi
else
    echo "   ⚠️  未找到后端 PID 文件"
fi

# 停止前端
if [ -f ".frontend.pid" ]; then
    FRONTEND_PID=$(cat .frontend.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "   停止前端 (PID: $FRONTEND_PID)..."
        kill $FRONTEND_PID
        rm .frontend.pid
        echo "   ✅ 前端已停止"
    else
        echo "   ⚠️  前端进程不存在"
        rm .frontend.pid
    fi
else
    echo "   ⚠️  未找到前端 PID 文件"
fi

# 额外检查：如果 PID 文件不存在，尝试通过端口查找并停止
echo ""
echo "🔍 检查端口占用..."

# 检查 5000 端口（后端）
BACKEND_PORT_PID=$(lsof -ti:5000 2>/dev/null)
if [ ! -z "$BACKEND_PORT_PID" ]; then
    echo "   发现后端进程 (PID: $BACKEND_PORT_PID) 占用端口 5000"
    kill $BACKEND_PORT_PID
    echo "   ✅ 已停止"
fi

# 检查 5173 端口（前端）
FRONTEND_PORT_PID=$(lsof -ti:5173 2>/dev/null)
if [ ! -z "$FRONTEND_PORT_PID" ]; then
    echo "   发现前端进程 (PID: $FRONTEND_PORT_PID) 占用端口 5173"
    kill $FRONTEND_PORT_PID
    echo "   ✅ 已停止"
fi

echo ""
echo "✅ 所有服务已停止"