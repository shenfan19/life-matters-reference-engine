# ADR 0064 — 编辑态刷新源文件，运行态固定快照

## 状态

✅ 已实施（sim）；Game repo 按此原则实现

## 日期

2026-05-07

## 背景

用户在外部修改 YAML 后，GUI 如果继续复用已经加载过的模型内容，会出现“页面选择和运行没有变化，刷新浏览器才生效”的问题。另一方面，用户也希望网页断开或刷新后，仍尽量保留工作状态和运行结果。

这两类需求容易冲突：编辑态应该尽快看到最新源文件；运行态则必须保证可复现，不能因为 YAML 半路改变而污染已有仿真或牌局。

## 决策

采用统一原则：

> 编辑态随时刷新源文件；运行态/对局态固定启动快照。

### Simulator

- 前端保留 UI 状态：选中模型、左侧树展开、tab、输入配置、字号、暗色模式等。
- 前端不把模型内容作为长期真相：选择模型、恢复选中模型、手动刷新时重新读取 YAML 和 resolved imports。
- 后端 `LoaderEngine.fetch()` 增加 `use_cache` 参数；GUI resolved model 与新仿真 session 使用 `use_cache=False`，保证读到最新 YAML。
- 仿真开始后，session 内持有启动时的 resolved model 对象。已有 session 不受后续 YAML 修改影响。
- 前端保存 `sessionId`，刷新/断开后通过 `GET /api/simulation/session/{session_id}` 重新 attach。
- 如果 session 还在，恢复进度、已有轨迹、输出变量、Monte Carlo run 数据和 seed；如果 session 不在，只保留本地最后结果供查看，不能继续运行。

### Game

Game repo 采用同一边界：

- Story/Card 选择和编辑态读取最新 YAML。
- 开局时固定 story/card definition snapshot，并记录 source hash 或版本。
- 页面恢复时恢复牌局状态：手牌、牌库、弃牌、场上牌、回合、资源、随机种子。
- 源 YAML 更新不改变当前牌局，只影响新开局。
- 云端版本应把 save/session 存入服务端数据库，而不是只依赖 localStorage。

## 影响

- 外部修改 YAML 后，重新选择或点击刷新即可在 GUI 中看到最新 resolved model。
- 新仿真会读取最新 YAML；已有仿真保持启动时快照，结果可复现。
- 刷新页面后，树展开和选中项会保留。
- 后端重启后，内存 session 会丢失；这是当前本地开发阶段可接受的限制。上云后需要 session TTL 和持久化存储。

## 后续

- 为 resolved model API 增加 `source_hash` / `updated_at`，前端可在已锁定模型变更后提示重新验证。
- Game repo 实现 save snapshot 时记录 `source_hash`，源文件更新后提示“当前对局使用旧快照，新开局使用新版”。
