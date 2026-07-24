#!/usr/bin/env bash
# 在全新 Ubuntu droplet 上一次性搭建 SCS（公网演示部署）环境。只需要运行一次。
# 完整分步走查 + 概念说明见 docs/reference_engine/deploy_scs.md，照那份文档操作。
#
# 如果有域名，运行前把下面 SERVER_NAME 改成域名；只用 IP 访问就不用改。
set -e

# ── 按需修改 ──────────────────────────────────────────────────
SERVER_NAME="_"   # 有域名就填域名（如 lm.example.com），没有留 "_"（表示接受任何 Host，用 IP 直接访问）
# ──────────────────────────────────────────────────────────────

if [ "$EUID" -ne 0 ]; then
  echo "请用 sudo 运行：sudo bash scripts/scs_setup.sh"
  exit 1
fi

LM_USER="${SUDO_USER:-$USER}"
ENGINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARENT_DIR="$(dirname "$ENGINE_DIR")"
MODELS_DIR="$PARENT_DIR/life-matters-models/models"

if [ ! -d "$MODELS_DIR" ]; then
  echo "没找到 $MODELS_DIR"
  echo "请确认 life-matters-models 仓库已经 clone 到和本仓库同一个父目录下（并列，不是嵌套）。"
  exit 1
fi

echo "== 1/7 安装系统依赖（nginx / python / node）=="
apt-get update
apt-get install -y nginx python3-venv python3-pip curl ufw
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "== 2/7 建 Python 虚拟环境 + 装后端依赖 =="
python3 -m venv "$ENGINE_DIR/.venv"
"$ENGINE_DIR/.venv/bin/pip" install --upgrade pip
"$ENGINE_DIR/.venv/bin/pip" install -r "$ENGINE_DIR/reference_engine/requirements.txt"

echo "== 3/7 构建前端静态文件 =="
(cd "$ENGINE_DIR/gui" && npm ci && npm run build)

echo "== 4/7 写 .env（公网部署保护开关，见 ADR 0078/0128/0129）=="
cat > "$ENGINE_DIR/.env" <<EOF
LM_MODELS_PATH=$MODELS_DIR
SCS_MODE=true
LM_MAX_CONCURRENT_OPTS=2
LM_MAX_CONCURRENT_SIMS=5
EOF
chown "$LM_USER" "$ENGINE_DIR/.env"

echo "== 5/7 写 systemd 服务（后端常驻、开机自启、崩溃自动重启）=="
cat > /etc/systemd/system/lm-backend.service <<EOF
[Unit]
Description=Life Matters backend
After=network.target

[Service]
User=$LM_USER
WorkingDirectory=$ENGINE_DIR/reference_engine/src
EnvironmentFile=$ENGINE_DIR/.env
ExecStart=$ENGINE_DIR/.venv/bin/uvicorn api_server:app --host 127.0.0.1 --port 18080
Restart=always

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now lm-backend

echo "== 6/7 写 Nginx 反代配置（对外统一走 80 端口，不用记后端端口号）=="
cat > /etc/nginx/sites-available/life-matters <<EOF
server {
    listen 80;
    server_name $SERVER_NAME;

    location / {
        root $ENGINE_DIR/gui/dist;
        try_files \$uri /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:18080/;
        proxy_set_header Host \$host;
    }
}
EOF
ln -sf /etc/nginx/sites-available/life-matters /etc/nginx/sites-enabled/life-matters
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "== 7/7 打开防火墙端口（22 SSH / 80 HTTP，不开放后端 18080）=="
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable

echo ""
echo "完成。访问 http://<你的服务器公网IP>/ 应该能看到前端页面。"
echo ""
echo "常用命令："
echo "  查看后端日志：   journalctl -u lm-backend -f"
echo "  重启后端：       sudo systemctl restart lm-backend"
echo "  查看后端状态：   systemctl status lm-backend"
echo "  更新代码后重新部署：见 scripts/scs_redeploy.sh"
