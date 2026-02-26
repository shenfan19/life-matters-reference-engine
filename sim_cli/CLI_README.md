# LifeMatters CLI Tools

## 📌 定位说明

**状态**: 🟡 保留备用（Archived for Future Use）  
**优先级**: 低 - 不主动维护，仅应急使用  
**适用场景**: <1% 的批处理/自动化需求

---

## ⚠️ 重要提示

**99%的用户应该使用Web GUI**  
→ 访问 `http://localhost:5173` 或部署后的生产环境

CLI工具仅用于：
- 批量生成报告（媒体/NGO年度报告制作）
- 脚本化工作流（极少数Geek用户）
- 无图形界面的服务器环境（极罕见）

---

## 📂 文件说明

```
sim_cli/
├── CLI_README.md              # 本文件
├── loader_cli.py          # 模型加载CLI（已废弃，仅存档）
├── simulator_cli.py       # 仿真CLI（备用）
├── optimizer_cli.py       # 优化CLI（备用）
└── generator_cli.py       # 生成器CLI（已转为插件，仅存档）
```

### 功能对照表

| CLI工具 | 功能 | 状态 | GUI替代 |
|---------|------|------|---------|
| `loader_cli.py` | 列出/合并/验证模型 | ❌ 已废弃 | Loader组件 |
| `simulator_cli.py` | 运行仿真 | 🟡 备用 | Simulator组件 |
| `optimizer_cli.py` | 参数优化 | 🟡 备用 | Optimizer组件 |
| `generator_cli.py` | 模板生成 | ❌ 已转插件 | Plugin系统 |

---

## 🚀 快速使用（如果你真的需要）

### 前置条件

```bash
# 1. 确保Engine已安装
cd ../sim_engine
pip install -r requirements.txt

# 2. 设置Python路径
export PYTHONPATH="${PYTHONPATH}:$(pwd)/../sim_engine"
```

### 仿真示例

```bash
# 运行10年糖尿病仿真
python simulator_cli.py \
  --file obesity_diabetes \
  --time 87600 \
  --output results.csv
```

### 优化示例

```bash
# 寻找最优胰岛素剂量
python optimizer_cli.py \
  --file diabetes \
  --mode full_params \
  --method pymoo \
  --time 8760
```

---

## 🛠️ 维护策略

### 不主动维护的原因

1. **计算规模小**: LM的典型任务（10年×365步）在浏览器中<1秒完成
2. **用户需求低**: 目标用户是医学研究者和普通人，不是HPC工程师
3. **GUI已覆盖**: Web界面提供更好的交互体验
4. **成本收益比**: 维护CLI需额外15-20%工作量，但仅服务<1%用户

### 保留的原因

1. **应急备份**: 万一GUI出现严重bug时的后备方案
2. **批处理场景**: 极少数NGO/媒体需要批量生成100+报告
3. **未来可能性**: 如果项目大成功，可能需要企业级HPC版本

---

## 📋 典型使用场景

### 场景1: 批量生成健康报告

```bash
#!/bin/bash
# 为不同年龄/吸烟量组合生成CSV

for age in {20..70..10}; do
  for smoking in 0 5 10 20; do
    python simulator_cli.py \
      --file smoking_impact \
      --time 87600 \
      --output "reports/age${age}_smoke${smoking}.csv"
  done
done

# 输出: 50个CSV文件，用于制作信息图
```

**频率**: 年1-2次  
**用户**: 5-10个组织  
**替代方案**: GUI手动点击50次（10分钟）

### 场景2: 参数扫描（研究用）

```bash
# 探索胰岛素敏感性参数空间
for sensitivity in 0.5 1.0 1.5 2.0; do
  python optimizer_cli.py \
    --file diabetes \
    --param insulin_sensitivity=$sensitivity \
    --output "scan_${sensitivity}.yaml"
done
```

**频率**: 月1-2次  
**用户**: <5个研究者  
**替代方案**: GUI的"参数扫描"功能（计划开发）

---

## 🔧 如果CLI坏了怎么办

### 症状
- 运行报错：`ModuleNotFoundError: No module named 'src.loader'`
- 输出格式异常
- 与GUI结果不一致

### 修复优先级

**低优先级** - 除非用户主动投诉

1. 检查是否有简单的一行修复（如导入路径）
2. 如果需要>30分钟修复，建议用户改用GUI
3. 在GitHub Issues标记为"low-priority"

### 完全放弃CLI的触发条件

如果满足以下任一条件，可考虑彻底删除CLI：
- [ ] 连续6个月无人使用
- [ ] 维护成本>开发时间的10%
- [ ] 有3+用户反馈"CLI太难用，改用GUI了"

---

## 📚 参考文档

### 架构文档
- `../docs/architecture.md` - 了解CLI在整体架构中的位置
- `../sim_engine/README.md` - Engine API文档

### 历史决策
- **2025-01-02**: 决定将CLI转为"保留备用"状态
  - 原因: 计算规模小，用户需求低，GUI已覆盖
  - 决策文档: 见项目讨论记录

### 类似项目参考
- **Desmos**: 无CLI，仅Web
- **PhET**: 无CLI，仅Web + 离线包
- **Jupyter**: CLI为主，但定位完全不同（数据科学工作流）

---

## ❓ FAQ

### Q: 我应该用CLI还是GUI？
**A**: 99%情况下用GUI。除非你需要：
- 批量生成100+个报告
- 在无图形界面的服务器上运行
- 集成到自己的自动化流水线

### Q: CLI支持并行计算吗？
**A**: 不支持。如果需要HPC级别计算，说明：
- 你的需求超出了LM的设计范围
- 建议联系项目维护者讨论企业版需求

### Q: CLI会更新吗？
**A**: 不会主动更新。仅在以下情况被动修复：
- Engine API重大破坏性变更
- 用户报告严重bug且无GUI替代方案

### Q: 为什么不删除CLI？
**A**: 
1. 保留成本低（几个Python文件）
2. 万一GUI出现重大问题时的后备
3. 未来可能有企业用户需要批处理

---

## 🤝 贡献指南

**不接受CLI相关的Pull Request**，除非：
- 修复严重安全漏洞
- 一行代码级别的简单修复
- 有明确的企业用户需求

如果你想改进LifeMatters，请贡献到：
- GUI界面优化
- 新的科普模型
- Engine性能提升
- 文档完善

---

## 📞 联系方式

遇到问题？

1. **优先**: 检查GUI是否能完成你的需求
2. **其次**: 查看 `../docs/` 下的文档
3. **最后**: 提交GitHub Issue（标记 `cli` 标签）

**预期响应时间**: 
- GUI问题: 1-3天
- CLI问题: 1-2周（低优先级）

---

**文档版本**: v1.0  
**创建日期**: 2025-01-02  
**审阅周期**: 每年（如果CLI还存在的话）  
**维护状态**: 🟡 Archived - 保留但不主动维护
