#!/usr/bin/env bash
# SCS 部署的开关/切换脚本，用法: scripts/scs_toggle.sh on|off|test|live
# on/off  控制后端与 Nginx 是否运行
# test/live  切换 Nginx 指向维护占位页（lm-test）还是真实应用（life-matters）
set -e
case "$1" in
  on)   sudo systemctl start lm-backend
        sudo systemctl start nginx
        echo "已开启" ;;
  off)  sudo systemctl stop nginx
        sudo systemctl stop lm-backend
        echo "已关闭" ;;
  test) sudo rm -f /etc/nginx/sites-enabled/life-matters
        sudo ln -sf /etc/nginx/sites-available/lm-test /etc/nginx/sites-enabled/lm-test
        sudo nginx -t && sudo systemctl reload nginx
        echo "已切换到: test" ;;
  live) sudo rm -f /etc/nginx/sites-enabled/lm-test
        sudo ln -sf /etc/nginx/sites-available/life-matters /etc/nginx/sites-enabled/life-matters
        sudo nginx -t && sudo systemctl reload nginx
        echo "已切换到: live" ;;
  *) echo "用法: scripts/scs_toggle.sh on|off|test|live"; exit 1 ;;
esac
