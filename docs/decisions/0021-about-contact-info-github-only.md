# 0021 — About 弹窗联系信息：仅保留 GitHub，去除邮件与主页

**状态：** ✅ 已实施  
**日期：** 2026-04-09

## 背景

About 弹窗原先展示三项联系信息：邮件（mail）、GitHub、主页（homepage）。随着项目面向不同受众（普通用户 / coder / 学术用户），需要重新审视信息分层策略。

## 决策

About 弹窗中**仅保留 GitHub 链接**，移除邮件地址和主页链接。  
作者署名保留 `Fan Shen · Sun Yat-Sen University`，交代学术背景但不开放直接联系入口。

## 理由

联系渠道按受众分三个层级：

| 层级 | 入口 | 受众 |
|------|------|------|
| 1 — LM About 弹窗 | GitHub 链接 + 署名 | 普通用户、coder |
| 2 — GitHub profile | 邮件 + 主页 | 技术用户、主动寻找联系方式的人 |
| 3 — 主页 / 学校页面 | 完整学术信息 | 学术用户（通过搜索引擎或主动推广进入）|

**About 弹窗放邮件的问题：**
- 公开邮件地址易被爬虫收集，导致垃圾邮件
- 对普通用户而言，邮件联系门槛高且不自然

**About 弹窗放主页的问题：**
- 主页包含实名照片，作者不希望在非学术推广场景下被动曝光
- 普通用户/coder 受众不需要访问学术主页

**只放 GitHub 的好处：**
- coder 受众可通过 GitHub issue / discussion 自然联系
- 学术用户通过搜索引擎可独立找到学校页面，无需 About 弹窗引导
- 信息流向清晰，不强迫任何层级的用户进入不匹配的渠道

## 变更文件

- `game/src/components/AboutModal.tsx` — 移除 email、homepage 字段渲染及 `MailOutlined`、`HomeOutlined` 导入
- `sim_gui/src/App.tsx` — 同上
