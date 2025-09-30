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
