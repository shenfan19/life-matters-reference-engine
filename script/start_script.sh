#!/bin/bash
# start.sh - 一键启动 LifeMatters 系统

echo "🚀 启动 LifeMatters 仿真系统..."
echo ""

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: 未找到 Python 3"
    echo "   请先安装 Python 3.8+"
    exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js"
    echo "   请先安装 Node.js 16+"
    exit 1
fi

# 检查 mods 目录
if [ ! -d "mods" ]; then
    echo "❌ 错误: mods 目录不存在"
    echo "   请确保在项目根目录运行此脚本"
    exit 1
fi

echo "✅ 环境检查通过"
echo ""

# 安装 Python 依赖（如果需要）
if [ ! -f ".venv/bin/activate" ]; then
    echo "📦 安装 Python 依赖..."
    pip install Flask Flask-CORS PyYAML asteval 2>&1 | grep -v "Requirement already satisfied" || true
fi

# 安装前端依赖（如果需要）
if [ ! -d "src/frontend/node_modules" ]; then
    echo "📦 安装前端依赖..."
    cd src/frontend
    npm install
    cd ../..
fi

echo ""
echo "✅ 依赖检查完成"
echo ""

# 创建日志目录
mkdir -p logs

# 启动后端
echo "🔧 启动后端 API 服务 (http://localhost:5000)..."
python src/api_server.py > logs/backend.log 2>&1 &
BACKEND_PID=$!
echo "   后端 PID: $BACKEND_PID"

# 等待后端启动
sleep 2

# 检查后端是否启动成功
if ! curl -s http://localhost:5000/api/health > /dev/null; then
    echo "❌ 后端启动失败"
    echo "   查看日志: cat logs/backend.log"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo "✅ 后端启动成功"
echo ""

# 启动前端
echo "🎨 启动前端服务 (http://localhost:5173)..."
cd src/frontend
npm run dev > ../../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ../..
echo "   前端 PID: $FRONTEND_PID"
echo ""

# 保存 PID
echo $BACKEND_PID > .backend.pid
echo $FRONTEND_PID > .frontend.pid

echo "=========================================="
echo "🎉 LifeMatters 已启动！"
echo "=========================================="
echo ""
echo "📡 后端 API:  http://localhost:5000"
echo "🌐 前端界面:  http://localhost:5173"
echo ""
echo "📋 查看日志:"
echo "   后端: tail -f logs/backend.log"
echo "   前端: tail -f logs/frontend.log"
echo ""
echo "🛑 停止服务:"
echo "   ./stop.sh"
echo ""
echo "按 Ctrl+C 退出（但服务会继续运行）"
echo "=========================================="

# 等待用户输入
read -p "按 Enter 键打开浏览器..."

# 打开浏览器
if command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:5173
elif command -v open &> /dev/null; then
    open http://localhost:5173
elif command -v start &> /dev/null; then
    start http://localhost:5173
fi

echo ""
echo "提示: 服务正在后台运行"
echo "      运行 ./stop.sh 停止服务"