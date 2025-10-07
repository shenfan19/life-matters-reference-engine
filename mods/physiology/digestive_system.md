# 示例 MOD 1: 更多高级工具

## 功能描述
本 MOD 为 `Life Matters` 添加了一系列新的高级工具和相关的制作配方。
* **增强效果**：部分基础资源（例如稀有木材、矿石）的采集效率得到显著提升。

## mod安装
将 `example_mod_1` 文件夹完整放置到游戏根目录的 `mods/` 目录下即可。

## 兼容性
* **兼容游戏版本**：[版本号] 及以上。
* **潜在冲突**：可能与修改工具属性、制作系统或资源采集机制的其他 MOD 发生冲突。建议在使用前阅读其他 MOD 的说明。

## 脚本编写
模型通过YAML文件定义，包含以下核心部分：
```yaml
# 示例结构
variables:
  blood_glucose:
    unit: mmol/L
    normal_range: [3.9, 6.1]
    
rules:
  insulin_response:
    trigger: blood_glucose > 6.1
    action: increase_insulin(20%)
```

## 更新日志
### v1.0.1 - 2025-06-17
* **修复**：修复了钻石斧耐久度显示错误的问题。
* **调整**：微调了能量剑的伤害输出，使其更符合后期平衡。
* **优化**：略微提高了钛镐对稀有矿石的开采速度。

### v1.0.0 - 2025-06-10
* **首次发布**：
    * 新增：钻石斧、钛镐、能量剑三种高级工具。
    * 新增：对应的制作配方，需在高级工作台制作。
    * 新增：部分稀有资源的基础采集效率提升。
* **兼容性**：支持游戏版本 v1.0.0。

# 人体能量动力系统
此函数根据输入的蛋白质、淀粉、水和化学物质计算胃部动力系统的性能参数、消化成果和可能的健康问题。

## 通用参数
- 时间步长：
- 人体质量：

## 状态参数
- `proteins` (蛋白质): 克
- `starches` (淀粉): 克
- `water` (水): 毫升
- `chemicals` (化学物质): 克
- `peristalsis` (胃蠕动): 蠕动次数/分钟
- `acid_volume` (胃酸量): mL
- `stomach_volume` (胃容积): mL

## 动力学函数
数学函数设计考虑胃部的基本生理功能，根据输入的食物类型和化学物质计算胃酸的分泌量、胃蠕动频率和胃的扩张容量。

- 胃蠕动 (peristalsis):
  $$
  peristalsis = 3 + \frac{starches}{50} + \frac{proteins}{30}
  $$

- 胃酸量 (acid_volume):
  $$
  acid_volume = 20 + 0.1 \times proteins + 0.05 \times starches + 0.2 \times chemicals
  $$

- 胃容积 (stomach_volume):
  $$
  stomach_volume = water + proteins \times 1.5 + starches \times 1.2
  $$

- 消化成果:
  - 糖: \( \text{glucose} = \frac{starches \times 1.1}{2} \)（将部分淀粉转化为糖）
  - 蛋白质: \( \text{digested_protein} = \frac{proteins \times 0.8}{2} \)（部分蛋白质被消化）

  - 胃酸过多: \( \text{if } acid_volume > 50 \)
  - 动力不足: \( \text{if } peristalsis < 5 \)
  - 粘膜溃疡: \( \text{if } chemicals > 10 \)
