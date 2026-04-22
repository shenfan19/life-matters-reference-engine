# MOD 实现

## 当前状态

MOD 系统尚未独立实现。当前所有"MOD"内容均为官方内嵌场景（`mods/stories/` 目录下的 YAML 包），没有用户上传/审核/分发机制。

## 已有基础

- `mods/` 目录结构已确立，场景作为文件夹包存在
- `game_story.yaml` + `cards/*.yaml` 格式已稳定（见 `game_impl.md`）
- 文件系统加载已通过 `newFormatLoader.ts` 实现

## 待实现

- [ ] MOD 上传入口（用户提交 ZIP/文件夹）
- [ ] MOD 浏览/下载页面
- [ ] 举报机制 UI
- [ ] MOD 元数据校验（格式合规性检查）
- [ ] 内容分级标注系统
- [ ] 角色邀请信提交入口
