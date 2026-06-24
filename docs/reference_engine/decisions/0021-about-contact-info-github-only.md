# 0021 — About 弹窗联系信息分层：项目 repo + 作者 email

**状态：** ✅ 已实施  
**日期：** 2026-04-09

## 背景

About 弹窗原先展示三项个人联系信息：邮件、个人 GitHub、主页。随着项目面向不同受众（普通用户 / coder / 学术用户），需要重新审视信息分层策略，并区分「项目信息」与「作者信息」。

## 决策

About 弹窗按分隔线划分两个区域：

**分隔线上方（项目区）**
- 项目名称、副标题、版本 · MIT License
- 项目 GitHub repo 链接：`github.com/shenfan19/life-matters`

**分隔线下方（作者区）**
- Fan Shen · Sun Yat-Sen University
- 邮件：`shenfan@mail.sysu.edu.cn`

主页链接不在 About 弹窗出现。

## 理由

**GitHub repo 归属项目区，而非作者区：**
用户从 About 弹窗点 GitHub，目的是找项目的 issue、源码、更新记录，链接到项目 repo 比个人主页更直接。

**邮件归属作者区：**
项目受众本身较窄（医学/社会学方向 + coder），实际流量低，爬虫垃圾邮件风险可忽略。邮件是最直接的反馈和合作联系渠道，不放反而失去沟通入口。

**主页不放的原因：**
学术用户通过搜索引擎或主动推广（作者发邮件时附上）进入，无需 About 弹窗引导。

**联系渠道三层分级：**

| 层级 | 入口 | 受众 |
|------|------|------|
| 1 — LM About 弹窗 | 项目 repo + 作者邮件 | 普通用户、coder |
| 2 — GitHub profile | 邮件 + 主页 | 技术用户、主动寻找者 |
| 3 — 主页 / 学校页面 | 完整学术信息 | 学术用户（搜索引擎或主动推广）|

**链接颜色：**
repo 和 email 链接均使用 `c.textMute`（灰色），与版本号、单位名保持同一视觉层级，不与标题（`c.text`）竞争焦点。

## 变更文件

- `game/src/components/AboutModal.tsx` — `AUTHOR` 改用 `repo` 字段；repo 链接移至分隔线上方；作者区改为 email only；链接色统一为 `c.textMute`
- `sim_gui/src/App.tsx` — 同上
