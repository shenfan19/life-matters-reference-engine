# TODO: 后端持久化（取代 localStorage）

**优先级**：云部署前必须  
**关联决策**：[0005-localstorage-persistence.md](../decisions/0005-localstorage-persistence.md)

## 背景

当前用 localStorage 保存仿真状态，存在以下局限：

- 只在单一浏览器/设备可用，换设备数据消失
- 浏览器清缓存后数据丢失
- 5MB 上限，长仿真（高频采样 + 多变量）可能溢出
- 多用户云场景下无法共享结果

## 目标

用户关闭页面后，任意设备打开都能看到历史运行记录，结果可分享链接。

## 方案建议

### Phase 1 — 服务端存储运行结果
- 每次 Run 生成 `run_id`（UUID）
- 仿真完成后后端将 `outputs` 写入文件或数据库（SQLite 起步）
- 前端只在 localStorage 存 `run_id`，刷新后凭 `run_id` 从 `/api/runs/{id}` 拉取数据

### Phase 2 — 运行历史列表
- `/api/runs?scenario=xxx` 返回该场景的历史运行列表
- UI 增加 "历史" 面板，可查看/对比不同 run 的图表

### Phase 3 — 用户身份（多用户云）
- 登录后 run 绑定 user_id
- 支持 "我的运行记录" 和结果分享链接

## 注意事项

- Phase 1 完成后，可保留 localStorage 作为离线 fallback，优先从后端拉取
- 后端存储格式建议用 JSON Lines（每行一个 DataPoint），方便流式写入
- 数据量估算：1 步 × 10 变量 × 8 bytes × 86400 步/天 ≈ 6.9 MB/天，按需压缩
