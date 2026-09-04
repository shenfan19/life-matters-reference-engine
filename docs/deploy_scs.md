# SCS 部署指南（公网演示服务器）

面向在 DigitalOcean 等云主机上部署本引擎公网演示实例的场景。假设你对 Linux 服务器运维不熟悉，
本文档按实际执行顺序写，照着做即可；概念说明见每一步前的简短解释。

---

## 0. 前置概念

- **systemd**：Ubuntu 自带的进程管理器。后端是一个要一直运行的 Python 程序，systemd 负责
  "服务器重启后自动拉起、进程崩溃后自动重启、提供统一的启停/查日志命令"，不需要人工守着终端。
- **Nginx**：反向代理。后端只监听 `127.0.0.1:18080`（外部连不进来，更安全），前端是构建后的
  静态文件。Nginx 对外统一开放 80 端口：访问网页文件时直接把文件发出去，访问 `/api/...` 时
  转发给 18080 端口的后端——访客只需要访问 `http://服务器IP/`，不需要知道后端端口号。
- 两者都由 `scripts/scs_setup.sh` 自动配置，不需要手写配置文件。

---

## 1. 准备服务器

1. 在 DigitalOcean 建一个 droplet，镜像选 **Ubuntu 22.04/24.04 LTS**，规格 1 vCPU / 1GB 内存
   起步即可（跑仿真/优化吃资源时可以临时升配，DO 按小时计费）
2. SSH 连上去（DO 控制台会给你 root 密码或让你配 SSH key）
3. 装 git：`sudo apt update && sudo apt install -y git`

## 2. 拉代码（两个仓库必须并列放在同一父目录下，不要嵌套）

```bash
mkdir -p ~/life-matters && cd ~/life-matters
git clone <life-matters-reference-engine 仓库地址>
git clone <life-matters-models 仓库地址>
```

得到：

```
~/life-matters/
├── life-matters-reference-engine/
└── life-matters-models/
```

## 3. 跑一键安装脚本

```bash
cd ~/life-matters/life-matters-reference-engine
chmod +x scripts/scs_setup.sh
sudo bash scripts/scs_setup.sh
```

这一步会自动做完：装 nginx/python/node → 建 Python 虚拟环境 `.venv` → 装后端依赖
（`reference_engine/requirements.txt`）→ 构建前端静态文件（`gui/dist/`）→ 写 `.env`
（`LM_MODELS_PATH` 指向 `life-matters-models/models`，`SCS_MODE=true` 禁止公网访客写服务器
文件，`LM_MAX_CONCURRENT_OPTS/SIMS` 限制并发防止把服务器打满）→ 写 systemd 服务
`lm-backend` → 写 Nginx 反代配置（含一个英文"维护中"占位页 `lm-test`，配合 `scs_toggle.sh
test/live` 临时下线时用） → 开放防火墙 22/80/443 端口。

**有域名**：跑之前先编辑 `scripts/scs_setup.sh` 顶部的 `SERVER_NAME` 变量改成域名；
只用 IP 访问的话不用改（保持 `_`）。

跑完访问 `http://<服务器公网IP>/`，应该能看到前端页面。

## 4. 日常操作

| 需求 | 命令 |
|---|---|
| 看后端实时日志 | `journalctl -u lm-backend -f` |
| 看后端是否正常运行 | `systemctl status lm-backend` |
| 重启后端 | `sudo systemctl restart lm-backend` |
| 重启 Nginx（改了配置后） | `sudo systemctl reload nginx` |
| 关闭/开启对外访问 | `bash scripts/scs_toggle.sh off` / `bash scripts/scs_toggle.sh on` |
| 切到维护占位页 / 切回真实应用 | `bash scripts/scs_toggle.sh test` / `bash scripts/scs_toggle.sh live` |
| 查看累计访问次数（私有，见下） | 浏览器打开 `http://<IP或域名>/api/stats/<LM_STATS_TOKEN>` |

**访问计数**：首页每次加载会给后端 `/api/visit` 打一次请求，按天累加写进服务器本地的
`output/visit_count.json`（日期为服务器本地时间，DO 默认 UTC），不记录 IP、cookie 或任何能
识别访客身份的信息。计数本身通过 `.env` 里的 `LM_STATS_TOKEN`（`scs_setup.sh` 装机时自动
随机生成一个,装机日志里会打印出完整查询地址,自己收藏,不要分享)私下查看，不设账号登录；
`/api/stats/<token>` 返回 `{"total": 总数, "by_day": {"2026-09-04": 3, ...}}`，纯文本 JSON，
按日期排序。地址没被访问过就没人知道它存在，`token` 对不上一律返回 404，不会暴露"这里有个
统计接口"这件事本身。

## 5. 更新代码后重新部署

```bash
cd ~/life-matters/life-matters-reference-engine
git pull
sudo bash scripts/scs_redeploy.sh
```

会重装可能变化的后端依赖、重新构建前端、重启 `lm-backend`。**不需要**重新跑
`scs_setup.sh`——nginx/systemd 的配置是一次性的，已经在跑了。

## 6. 排查

- **打不开网页**：`systemctl status lm-backend` 看后端是否在跑；`sudo nginx -t` 检查
  Nginx 配置语法；`sudo ufw status` 确认 80 端口确实开着。
- **后端启动失败**：`journalctl -u lm-backend -n 50` 看最近 50 行日志，多半是依赖没装全
  （重跑 `.venv/bin/pip install -r reference_engine/requirements.txt`）或 `.env` 里
  `LM_MODELS_PATH` 指错了路径。
- **改了 `.env` 不生效**：`.env` 只在后端启动时读一次，改完要 `sudo systemctl restart
  lm-backend`。

---

## 与本地开发的区别

本地试用（`./run.sh` / `run.cmd`）和这里的部署**不是一回事**，具体差异：

| | 本地 `run.sh`/`run.cmd` | SCS 部署 |
|---|---|---|
| 前端 | `npm run dev`，持续占一个进程，热更新 | 构建一次（`npm run build`），之后是纯静态文件，Nginx 直接发，不需要常驻前端进程 |
| 后端存活方式 | 前台跑，关窗口/Ctrl+C 就停 | systemd 常驻，重启/崩溃自动恢复 |
| 写权限 | 本地就是你自己，不限制 | `SCS_MODE=true`，禁止公网访客写服务器文件 |
| 对外暴露 | 只在 `localhost`，外部访问不到 | 后端仍只绑 `127.0.0.1`，Nginx 代理对公网开放 |

`run.sh` 在服务器上也能跑（比如装完环境后想先手动验证一下），但那只是一次性冒烟测试，
不是让服务持续对外运行的方式。
