# 0061 — 中间结果用 models/temp/ 暂存，不建用户账号体系

**状态**：📋 已决策  
**日期**：2026-05-06

## 背景

仿真/优化过程会产生中间文件：opt 结果写回的 input override、暂存的参数覆盖、生成的图表。
原 `users/` 目录设计为多用户云服务（账号隔离、存档、优化历史），与当前 MVP 目标（发表论文、本地演示）严重过载。
删除 `users/` 后需要一个轻量替代方案，避免浏览器刷新导致中间结果丢失。

## 决策

以 `models/temp/{job_id}/` 作为会话级暂存区，不引入用户账号系统：

```
models/temp/
  {job_id}/
    input_override.yaml   # opt 结果写回的新 input（可直接喂给 sim）
    charts/               # 生成的图表文件
    result.csv            # 仿真/优化输出
```

- `job_id` 由后端在任务创建时生成（uuid），返回给前端
- 前端将 `job_id` 存入 `localStorage`，刷新后可恢复
- 后端启动时清理超过 N 小时的 temp 目录（建议 24h）
- 用户可通过 `GET /api/download/result/{job_id}` 下载任意文件
- opt 结果 YAML 可直接作为新 scenario 的 input，或由用户命名后移至 `models/scenarios/`

同时删除：
- `users/` 目录（全部）
- `tools/update_yaml_steps.py`（一次性迁移脚本）
- `script/` 中已过期的迁移和运行脚本（见下方列表）

## 后果

- ✅ 无需实现认证、账号隔离、云存储
- ✅ 刷新安全：job_id 持久化在 localStorage，中间结果不丢
- ✅ models/ 路径后端已知，不需新增配置
- ✅ 大幅减少代码量，专注 MVP
- ⚠️ 多用户并发时 temp 目录混用（单机演示无影响，上线前需隔离）
- ⚠️ 服务器重启后 temp 清空，需告知用户及时下载

## 删除清单

**script/ 删除：**
- `migrate_sim_format.py` — 一次性格式迁移，已完成
- `setup_locales.bat` / `setup_locales.py` — 一次性 locale 初始化，已完成
- `run_backend.cmd` / `run_frontend.cmd` — 路径已过期
- `test_loader.cmd` — 引用不存在的旧路径
- `get_stru_x1_stru.cmd` / `get_stru_x3_fast.cmd` — 被 v2_filt 覆盖
- `sync_i18n.py` — i18n 已改为直接 JSON，不再用 gettext 转换

**script/ 保留：**
- `get_stru_v2_filt.cmd` — 导出项目结构给 LLM 使用
- `wipe_pycache.cmd` — 清理 `__pycache__`
- `prep_po_to_mo.cmd` — gettext 编译（待确认是否仍需要）
