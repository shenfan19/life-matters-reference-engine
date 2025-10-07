# 人体小肠动力系统
## 输入参数
小肠的主要功能是进一步消化食物并吸收营养物质。输入参数反映进入小肠的食物和液体的状态。
- `digested_protein` (已消化的蛋白质): 克
- `glucose` (葡萄糖): 克
- `fats` (脂肪): 克
- `intestinal_fluid` (小肠液): 毫升（包括胆汁、胰液和肠液）

## 性能参数
- `absorption_rate` (吸收率): 每分钟吸收的营养物质百分比
- `intestinal_motility` (肠道蠕动): 蠕动次数/分钟

## 数学函数
小肠的吸收率和蠕动速度取决于输入的营养物质和液体。

- 肠道蠕动 (intestinal_motility):
  $$intestinal\_motility = 12 + \frac{glucose + fats}{100}$$

- 吸收率 (absorption_rate):
  $$absorption\_rate = 70 + 0.1 \times (intestinal\_fluid - 200) \quad \text{(限制在70\%到90\%之间)}$$

此函数根据输入的已消化的蛋白质、葡萄糖、脂肪和小肠液计算小肠的蠕动速度、吸收率、已吸收的营养物质和未被吸收的残余。通过调整小肠液的量，可以模拟不同的吸收率和蠕动条件，从而影响营养物质的吸收效率。


# 人体大肠动力系统
## 输入参数
大肠的主要功能是吸收水分和盐分，以及储存和排泄未消化的食物残渣。输入参数反映进入大肠的物质状态。
- `residue_protein` (蛋白质残渣): 克
- `residue_glucose` (葡萄糖残渣): 克
- `residue_fats` (脂肪残渣): 克
- `water_intake` (水分摄入): 毫升

## 性能参数
- `water_absorption` (水分吸收): 毫升
- `colonic_motility` (结肠蠕动): 蠕动次数/分钟

## 数学函数
大肠的水分吸收和蠕动频率取决于进入的残渣量和水分。

- 结肠蠕动 (colonic_motility):
  $$colonic\_motility = 8 + \frac{residue\_protein + residue\_glucose + residue\_fats}{100}$$

- 水分吸收 (water_absorption):
  $$water\_absorption = \frac{water\_intake}{2} + 0.05 \times (residue\_protein + residue\_glucose + residue\_fats)$$

此函数基于输入的蛋白质残渣、葡萄糖残渣、脂肪残渣和水分摄入量，计算大肠的蠕动频率和水分吸收量。通过调整水分的输入和残渣的比例，可以模拟大肠的水分回收效率和废物处理能力。
