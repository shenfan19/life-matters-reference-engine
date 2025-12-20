# LifeMatters

**让医学数据"动起来"的健康仿真平台**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![React](https://img.shields.io/badge/react-18.0+-61DAFB.svg)](https://reactjs.org/)

---

## 🎯 这是什么？

LifeMatters是一个**双引擎健康仿真平台**：

- **科研层**：医学研究者用YAML配置快速建立动力学模型（无需编程）
- **科普层**：普通人通过游戏化界面体验健康风险（一键运行场景）

**定位**：医学领域的 Jupyter Notebook + Desmos

---

## ⚡ 快速开始

### 安装

```bash
# 克隆项目
git clone https://github.com/your-org/lifematters.git
cd lifematters

# 安装依赖
pip install -r requirements.txt
cd src/frontend && npm install
```

### 运行

```bash
# 启动后端
python src/api_server.py

# 启动前端（新终端）
cd src/frontend && npm run dev
```

访问 http://localhost:5173

**详细指南**: 见 [docs/quickstart.md](docs/quickstart.md)

---

## 🏗️ 核心功能

| 模块 | 功能 | 用户 |
|------|------|------|
| **Core Mods** | YAML配置化建模 | 医学研究者 |
| **Scenarios** | 一键场景运行 | 科普设计者/普通用户 |
| **Simulator** | 动力学仿真引擎 | 所有用户 |
| **Optimizer** | 参数自动优化 | 科研人员 |

---

## 📝 示例：吸烟对肺健康影响

**Core层（科研模型）**:
```yaml
# mods/core/smoking.yaml
variables:
  lung_capacity: {value: 100, type: state, unit: "%"}
  cigarettes_per_day: {value: 0, type: input}

formulas:
  damage:
    dynamics:
      lung_capacity: lung_capacity - cigarettes_per_day * 0.1 * dt
```

**Scenario层（科普场景）**:
```yaml
# mods/scenarios/heavy_smoker.yaml
imports:
  - core/smoking

patches:
  smoking:
    variables:
      cigarettes_per_day: 20  # 重度吸烟者
```

运行后实时显示肺功能衰退曲线，直观感受20年健康变化。

---

## 📚 文档

| 文档 | 内容 |
|------|------|
| [快速开始](docs/quickstart.md) | 5分钟跑起来 |
| [Core层规范](docs/core_mods.md) | 如何编写科研模型 |
| [Scenario层规范](docs/scenarios.md) | 如何设计科普场景 |
| [系统架构](docs/architecture.md) | 技术架构说明 |

---

## 🎓 适用场景

### 科研应用
- 快速验证医学理论
- 参数优化（如最佳药物剂量）
- 政策效果模拟（如禁烟政策）

### 科普教育
- 学校健康课互动教学
- 医院慢性病管理教育
- 媒体科普内容制作

### 个人使用
- "如果我改变生活方式会怎样？"
- 长期健康风险评估
- 行为改变可视化激励

---

## 🚀 项目状态

- ✅ Core代码完成80%（Loader、Simulator）
- ✅ Web界面基础架构完成
- 🔲 MVP阶段：3个科普场景（吸烟、饮食、战争）
- 🔲 Phase 2：建立模型库，发表论文

**目标**: 成为健康教育技术的标准工具

---

## 🤝 贡献

欢迎三类贡献者：

1. **科研者**：提交Core层模型（mods/core/）
2. **设计者**：创建Scenario场景（mods/scenarios/）
3. **开发者**：改进引擎和界面

详见 [CONTRIBUTING.md](CONTRIBUTING.md)

---

## 📄 许可证

MIT License - 见 [LICENSE](LICENSE)

---

## 🔗 相关项目

- **CPT**: 为什么仿真有效（理论层）
- **LifeMatters**: 如何实现仿真（工具层）
- **Porter**: 历史场景案例（应用层）

---

## 📧 联系

- GitHub Issues: 问题反馈
- Email: your-email@example.com
- 讨论组: [链接]

---

**让健康数据动起来，让科普不再枯燥** 🚀
