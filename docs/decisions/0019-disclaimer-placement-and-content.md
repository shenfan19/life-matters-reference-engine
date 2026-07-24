# 0019 — 免责声明：位置、内容与呈现规范

**状态**：✅ 已实施  
**日期**：2026-04-07

## 背景

项目涉及真实历史人物的健康决策模拟，需要在适当位置向用户说明学术目的与使用边界，同时符合学术合理使用（Fair Use）原则。此前免责声明文字散落在代码字符串中，缺乏统一出处，且部分位置完全缺失。

## 决策

### 1. 出现位置（共 4 处）

| 位置 | 时机 | 呈现形式 |
|------|------|---------|
| Game 首次进入（`game/App.tsx`） | 首次打开应用，`localStorage` 无接受记录 | 全屏遮罩，须点击确认后消失，永久记录 |
| Game Story 进入（`CardGame.tsx`） | 每次进入新 story | 全屏遮罩，点击「开始故事」继续 |
| Game About 弹窗（`AboutModal.tsx`） | 点击 ⓘ 图标 | 弹窗底部区块，分隔线隔开 |
| Sim About 弹窗（`sim_gui/App.tsx`） | 点击 ⓘ 图标 | 弹窗底部区块，分隔线隔开 |

### 2. 内容结构

所有位置统一使用相同的三段式结构，内容来源于 locale 键：

```
disclaimer.title  — 标题：「免责声明」/ 「Disclaimer」
disclaimer.intro  — 一句总述
disclaimer.points — 四条 bullet（数组）
```

四条内容：
1. 所有模拟内容不代表对历史人物的道德评判
2. 历史数据经简化处理，不构成医学建议
3. 涉及真实人物的场景均以教育为目的，符合学术合理使用（Fair Use）原则
4. 游戏/模拟结果为模型推演，非历史事实重现

### 3. 呈现规范

- **标题字号**大于正文，不使用 uppercase 小帽样式
- **不使用边框盒子**包裹免责声明区块；About 弹窗中用 `borderTop` 分隔线与作者信息区隔开
- Bullet 使用 `·`（居中点），不用 `•`（实心圆点）
- 底栏状态条保留一行短句（`statusBar.disclaimer`），作为持续提示

### 4. Locale 文件位置

实际服务的文件在各应用的 `public/locales/` 目录下，**不是**根目录 `locales/`：

```
game/public/locales/game/{en,zh-CN,zh-TW}.json
sim_gui/public/locales/sim/{en,zh-CN,zh-TW}.json
```

根目录 `locales/` 为备份/参考，不被 Vite 服务。

## 后果

- ✅ 用户在使用前必须主动确认免责声明（首次进入）
- ✅ 每个 story 进入时再次提示，覆盖偶发用户
- ✅ About 弹窗作为长期可查阅的出处
- ✅ 所有文字通过 i18n 管理，支持中英文繁简四语言
