# Mods Manager — TODO Plan

> 状态：待开发。仿真核心流程完成后再做。
> 优先级：低（枝节功能，不影响仿真主流程）

---

## 目标

提供一个可视化的 Mods 管理器，允许用户灵活地：
- 在线编辑单个 model 或 scenario 的属性（变量初值、公式表达式、metadata 等）
- 灵活合并多个 model 文件（比 mod_merger 更细粒度）
- 拆分 / 删除 model 文件中的变量或公式块
- 管理 imports 依赖关系

---

## 功能模块拆解

### 1. 文件树管理
- [ ] 全局 mods 文件树（model + scenario + output 统一视图）
- [ ] 右键菜单：重命名、删除、复制、移动文件
- [ ] 拖拽移动文件（调整 imports 引用路径自动更新）
- [ ] 文件变更 dirty 标记（未保存高亮提示）

### 2. 属性在线编辑器
- [ ] 选中任意 model → 右侧展开可编辑的属性表单（变量、公式、metadata）
- [ ] 变量：支持修改 value / unit / type / bounds / description
- [ ] 公式：支持修改 condition / priority / dynamics 表达式（带语法高亮）
- [ ] 保存时写回 YAML 文件（调用 `/api/save-file`）
- [ ] 变更历史（Undo/Redo，至少一步）

### 3. 灵活合并
- [ ] 多选 model → 选择性勾选"要合并的变量/公式"（而不是全量合并）
- [ ] 冲突检测：同名变量提示选择保留哪个版本
- [ ] 合并结果预览（YAML diff 视图）后再确认保存

### 4. 拆分与重组
- [ ] 选中一个 model → 可视化选择哪些公式拆出为独立文件
- [ ] 自动生成 imports 引用更新建议
- [ ] 拆分出的文件可以直接命名并保存到目标目录

### 5. 删除与清理
- [ ] 删除变量时自动检测哪些公式引用了它（警告）
- [ ] 删除公式时检测依赖链
- [ ] 一键清理 `_output/` 目录中的 patch/merged/splited 临时文件

### 6. 依赖关系可视化
- [ ] 显示 scenario → imports → model 的依赖图
- [ ] 检测循环依赖
- [ ] 显示哪些变量被跨模型共享

---

## 技术设计思路

### 前端
- 基于现有 `mod_merger` 插件扩展，或作为独立插件 `mods_manager`
- 编辑器部分考虑使用 CodeMirror / Monaco Editor 做公式表达式的语法高亮
- 依赖图用 AntD Graph 或 D3.js

### 后端
- 需要新增端点：
  - `PATCH /api/file/:path` — 局部更新 YAML 中的某个字段
  - `DELETE /api/file/:path` — 删除文件
  - `GET /api/deps/:path` — 返回该文件的依赖图
- 保存时需要保留 YAML 注释（当前 `yaml.dump` 会丢失注释，考虑 `ruamel.yaml`）

---

## 开发前置条件

在开始开发 Mods Manager 之前，以下工作应已完成：

1. **仿真核心跑通** — Loader → Simulator → 结果输出链路稳定
2. **数据结构稳定** — model/scenario YAML 格式不再大改
3. **Story engine 完成** — 知道哪些字段在运行时会被修改，才知道哪些要支持在线编辑

---

## 参考

- 现有相关代码：`plugins/preprocessors/mod_merger/frontend.tsx`
- 保存接口：`POST /api/save-file`（已实现）
- 合并接口：`POST /api/merge`（已实现）
- 拆分接口：`POST /api/split`（已实现）
