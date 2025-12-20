# 快速开始指南

**目标**: 5分钟内运行你的第一个健康仿真

---

## 📋 前置要求

- Python 3.8+
- Node.js 16+
- Git

---

## 🚀 三步启动

### 1️⃣ 安装依赖

```bash
# 进入项目目录
cd lifematters

# Python依赖
pip install -r requirements.txt

# 前端依赖
cd src/frontend
npm install
cd ../..
```

### 2️⃣ 启动服务

**方式A：自动脚本（推荐）**

```bash
# Linux/macOS
./start.sh

# Windows
start.bat
```

**方式B：手动启动（开发时推荐）**

```bash
# 终端1 - 后端
python src/api_server.py

# 终端2 - 前端
cd src/frontend && npm run dev
```

### 3️⃣ 访问系统

打开浏览器访问：**http://localhost:5173**

成功后你会看到LifeMatters的主界面！

---

## 🎯 第一个仿真：吸烟对肺健康的影响

### 步骤1: 打开Loader

1. 点击左侧菜单"Loader"
2. 在文件树中找到 `mods/core/smoking.yaml`
3. 点击查看模型详情

你会看到：
- **变量**: lung_capacity（肺功能）, cigarettes_per_day（每日抽烟数）
- **公式**: 肺功能随抽烟量衰减的动力学方程

### 步骤2: 运行仿真

1. 点击左侧菜单"Simulator"
2. 调整参数：
   - `cigarettes_per_day`: 设为 20（重度吸烟者）
3. 点击"开始仿真"

### 步骤3: 查看结果

实时曲线显示：
- 横轴：时间（天数）
- 纵轴：肺功能百分比
- **观察**: 20年内肺功能从100%降至接近0

**恭喜！你完成了第一个健康仿真** 🎉

---

## 📊 核心模块使用

### Loader - 模型管理

**功能**:
- 浏览所有YAML模型
- 查看模型详情（变量、公式、配置）
- 合并多个模型

**操作**:
```
1. 左侧树形结构 → 点击文件
2. 右侧显示详情 → 元数据、变量、公式
3. 切换到"合并模型" → 勾选多个 → 点击"合并"
```

**输出**: 合并后的模型自动保存到 `mods/merged/`

---

### Simulator - 仿真运行

**功能**:
- 运行动力学仿真
- 实时调整参数
- 可视化状态变化

**操作**:
```
1. Loader中选择模型
2. Simulator设置参数（input/parameter类型变量）
3. 点击"开始仿真"
4. 实时查看曲线
```

**控制**:
- ⏸️ 暂停/继续
- 🔄 重置
- 💾 导出CSV

---

### Generator - 模型创建

**功能**:
- 无需编程创建YAML模型
- 图形化界面定义变量和公式

**操作**:
```
1. 填写元数据（名称、版本、作者）
2. 添加变量（点击"添加变量"）
   - 名称: blood_glucose
   - 初值: 100
   - 类型: state
   - 单位: mg/dL
3. 添加公式（点击"添加公式"）
   - 名称: glucose_regulation
   - 动力学: blood_glucose - insulin * 0.1 * dt
4. 点击"生成并下载YAML"
```

**输出**: 下载的YAML文件可放入 `mods/` 目录

---

### Optimizer - 参数优化

**功能**:
- 自动寻找最佳参数组合
- 支持多种优化算法

**操作**:
```
1. Loader中选择模型
2. Optimizer设置：
   - 优化目标: 最小化 medical_cost
   - 优化算法: 遗传算法
   - 变量范围: drug_dose [0, 100]
3. 点击"开始优化"
4. 查看最优解
```

**输出**: 最优参数组合 + 优化历史曲线

---

## 🎮 场景模式（Scenario）

Scenario是预配置的"一键运行"场景，无需手动设置参数。

### 运行预设场景

```bash
# 命令行方式
lifematters-simulator --scenario london_1910_flu.yaml

# 或在GUI中
Loader → mods/scenarios/london_1910_flu.yaml → Simulator → 自动加载参数
```

### 场景示例

| 场景 | 描述 | 位置 |
|------|------|------|
| `heavy_smoker.yaml` | 重度吸烟者肺功能衰退 | mods/scenarios/ |
| `elderly_patient.yaml` | 老年患者药物代谢 | mods/scenarios/ |
| `london_1910_flu.yaml` | 1910年伦敦流感爆发 | mods/scenarios/ |

---

## 📂 项目结构速览

```
lifematters/
├── mods/                    # YAML模型文件
│   ├── core/               # 科研模型（纯科学）
│   │   ├── smoking.yaml
│   │   └── aspirin.yaml
│   └── scenarios/          # 科普场景（预配置）
│       └── heavy_smoker.yaml
│
├── src/
│   ├── api_server.py       # Flask后端
│   ├── loader/             # 模型加载引擎
│   ├── simulator/          # 仿真引擎
│   └── frontend/           # React前端
│
├── docs/                    # 文档
│   ├── quickstart.md       # 本文档
│   ├── core_mods.md        # Core层规范
│   ├── scenarios.md        # Scenario层规范
│   └── architecture.md     # 系统架构
│
└── start.sh / start.bat    # 启动脚本
```

---

## 🐛 常见问题

### Q1: 后端启动失败 - 端口占用

```bash
# 错误: Address already in use (5000)

# 解决方案1: 杀死占用进程
# Linux/macOS
lsof -ti:5000 | xargs kill

# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# 解决方案2: 修改端口
# 编辑 src/api_server.py
app.run(port=5001)  # 改为其他端口
```

### Q2: 前端显示空白

**检查清单**:
1. 后端是否运行？访问 http://localhost:5000/api/health
2. 浏览器控制台（F12）是否有错误？
3. 前端是否正确启动？终端应显示 `http://localhost:5173`

**常见原因**:
- 后端未启动 → 先运行 `python src/api_server.py`
- 依赖未安装 → `cd src/frontend && npm install`
- 端口冲突 → 关闭占用5173端口的程序

### Q3: YAML文件读取失败

**可能原因**:
- YAML语法错误
- 文件编码不是UTF-8
- 文件路径错误

**验证方法**:
```bash
# 检查YAML语法
python -c "import yaml; yaml.safe_load(open('mods/your_file.yaml'))"

# 如果报错，修正YAML格式
# 常见错误：缩进不一致、冒号后缺空格、引号不配对
```

### Q4: 合并功能无法使用

**检查**:
1. 是否至少选择了2个模型？
2. `mods/merged/` 目录是否存在且有写权限？
3. 后端日志是否有错误提示？

**解决**:
```bash
# 手动创建目录
mkdir -p mods/merged

# 检查权限
ls -la mods/
```

### Q5: 仿真结果不符合预期

**调试步骤**:
1. 检查初值是否合理
2. 查看公式是否正确（Loader → 模型详情 → 公式section）
3. 缩短仿真时间，观察初期变化
4. 使用简化模型验证（删除部分公式，逐步添加）

**示例**:
```yaml
# 如果肺功能衰减过快
formulas:
  damage:
    dynamics:
      # 原公式: lung_capacity - cigarettes_per_day * 0.1 * dt
      # 修改衰减系数:
      lung_capacity: lung_capacity - cigarettes_per_day * 0.01 * dt
```

---

## 🎓 下一步

完成快速开始后，你可以：

1. **学习编写模型**: 阅读 [docs/core_mods.md](core_mods.md)
2. **创建科普场景**: 阅读 [docs/scenarios.md](scenarios.md)
3. **了解系统架构**: 阅读 [docs/architecture.md](architecture.md)
4. **浏览示例库**: 查看 `mods/core/` 和 `mods/scenarios/`
5. **贡献代码**: 提交Pull Request到GitHub

---

## 📚 推荐学习路径

### 对于医学研究者
```
快速开始 → Core层规范 → 编写自己的模型 → 运行仿真验证
```

### 对于科普设计者
```
快速开始 → Scenario层规范 → 浏览Core库 → 组合场景
```

### 对于开发者
```
快速开始 → 系统架构 → 阅读源码 → 提交PR
```

---

## 💡 提示

- 🔧 开发时使用**手动启动**方式，方便查看日志
- 📝 修改YAML后需重新加载（点击Loader刷新按钮）
- 💾 定期备份你的自定义模型
- 🐞 遇到问题查看后端终端日志，通常有详细错误信息

---

**准备好了吗？开始你的健康仿真之旅** 🚀

有问题？查看 [常见问题](https://github.com/your-org/lifematters/issues) 或提交Issue。
