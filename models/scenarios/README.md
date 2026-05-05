# models/scenarios — 完整可运行仿真场景

## 定位

`scenarios/` 存放**完整的、可在 GUI 中直接运行的仿真场景**，面向用户演示、教学和社会/历史科普。

与 `papers/` 的区别：
- `scenarios/`：展示用途，涵盖医学和社会历史场景，不与特定论文绑定
- `papers/`：学术论文专用，参数经过文献校准，用于复现论文数值

## 目录结构

```
scenarios/
  medical/    医学仿真场景（运动生理、营养、慢病管理等）
  social/     历史社会场景（战争、饥荒、瘟疫、历史人物生存决策等）
```

## 文件命名约定

历史场景按 `adYYYY_地区_主题.yaml` 格式命名，例如：
- `ad1666_uk_issac_newton.yaml` — 1666年英国，牛顿鼠疫隔离期
- `ad1847_hu_semmelweis.yaml` — 1847年匈牙利，塞麦尔维斯洗手实验

`_TODO` 后缀表示场景框架已创建但内容待填写。

## 与游戏的关系

`scenarios/` 中的场景可通过 Converter 工具半自动转换为 `stories/` 下的游戏故事格式。详见 [`docs/converter_design.md`](../../docs/converter_design.md)。
