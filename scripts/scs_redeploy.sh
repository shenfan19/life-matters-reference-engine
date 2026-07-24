#!/usr/bin/env bash
# 代码更新后重新部署到 SCS 服务器：重装可能变化的依赖、重新构建前端、重启后端服务。
# 前提：scripts/scs_setup.sh 已经跑过一次。用法见 docs/reference_engine/deploy_scs.md 第5节。
set -e

if [ "$EUID" -ne 0 ]; then
  echo "请用 sudo 运行：sudo bash scripts/scs_redeploy.sh"
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "== 更新后端依赖 =="
"$ROOT/.venv/bin/pip" install -r "$ROOT/reference_engine/requirements.txt"

echo "== 重新构建前端 =="
(cd "$ROOT/gui" && npm ci && npm run build)

echo "== 重启后端服务 =="
systemctl restart lm-backend

echo "完成，刷新页面查看更新（Ctrl+F5 清缓存）。"
