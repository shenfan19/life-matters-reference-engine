# LifeMatters 仿真系统 - 前端使用指南

## 🎯 系统概述

**LifeMatters** 是一个模块化的医学与社会学仿真建模框架，支持从 YAML 配置文件动态加载模型，无需编程即可进行复杂仿真和优化。

### 核心特性
- ✅ **动态模型加载** - 所有变量、公式从 YAML 文件读取
- ✅ **三种数据类型** - input（输入）、parameter（参数）、state（状态）
- ✅ **四大核心模块** - Generator、Loader、Simulator、Optimizer
- ✅ **可折叠侧边栏** - 支持子菜单展开/收起
- ✅ **实时仿真** - 支持暂停、继续、参数调整
- ✅ **参数优化** - 支持多种优化算法

## 📦 文件结构

```
src/
├── App.tsx                    # 主应用（侧边栏导航）
└── components/
    ├── Generator.tsx          # 构造器 - 生成 YAML 模型
    ├── Loader.tsx            # 加载器 - 浏览和分析模型
    ├── Simulator.tsx         # 仿真器 - 运行动态仿真
    └── Optimizer.tsx         # 优化器 - 参数优化
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install antd
# 或
yarn add antd
```

### 2. 配置样式

在 `src/index.css` 中添加：

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#root {
  width: 100%;
  height: 100vh;
}

.ant-layout,
.ant-layout-content {
  max-width: none !important;
  width: 100% !important;
}
```

在 `src/main.tsx` 中导入 Ant Design 样式：

```typescript
import 'antd/dist/reset.css';
import './index.css';
```

### 3. 运行项目

```bash
npm run dev
```

访问 `http://localhost:5173`

## 📚 模块详解

### 1️⃣ Generator - 模型构造器

**功能：** 创建和编辑 YAML 模型文件

**子功能：**
- **模板生成** - 从预设模板快速创建模型
- **从论文生成** - 输入论文内容自动提取模型
- **手动编辑** - 完全自定义模型结构

**操作流程：**
1. 填写模型元数据（名称、版本、作者、描述）
2. 添加变量（类型：input/parameter/state）
3. 添加公式（描述动力学方程）
4. 点击"生成并下载 YAML"保存模型

**支持的变量类型：**
- `input` - 输入变量（用户可调整）
- `parameters` - 参数（固定或可优化）
- `state` - 状态变量（仿真过程中变化）

### 2️⃣ Loader - 模型加载器

**功能：** 浏览、分析和合并 YAML 模型文件

**子功能：**
- **浏览模型** - 树状结构显示所有模型文件
- **合并模型** - 将多个模型合并为一个
- **依赖分析** - 分析模型间的依赖关系

**界面布局：**
- **左侧** - 文件树（支持文件夹和文件显示）
- **右侧** - 模型详情（元数据、变量、公式、配置）

**详情标签页：**
1. **变量** - 按类型分组显示（input/parameter/state）
2. **公式** - 显示所有动力学方程
3. **仿真配置** - 步长、总时间、输出变量
4. **优化配置** - 优化方法、目标函数

### 3️⃣ Simulator - 仿真器

**功能：** 运行动态仿真，实时监控状态变化

**子功能：**
- **运行仿真** - 配置参数并启动仿真
- **实时监控** - 实时曲线和变量状态
- **历史记录** - 查看过往仿真记录

**操作流程：**
1. 在 Loader 中选择一个模型
2. 配置输入参数（仅 input 类型变量）
3. 点击"开始仿真"运行
4. 实时查看状态变量变化
5. 支持暂停、继续、终止操作
6. 导出 CSV 结果文件

**实时监控：**
- Canvas 实时曲线图（多变量）
- 状态变量卡片（数值显示）
- 数据表格（最近100行）

### 4️⃣ Optimizer - 优化器

**功能：** 优化模型参数，最小化/最大化目标函数

**子功能：**
- **参数优化** - 单目标优化
- **多目标优化** - 帕累托前沿分析
- **优化历史** - 查看过往优化记录

**支持的优化算法：**
- 网格搜索 (Grid Search)
- 遗传算法 (GA)
- 粒子群优化 (PSO)
- 梯度下降 (Gradient Descent)
- 模拟退火 (Simulated Annealing)

**操作流程：**
1. 在 Loader 中选择模型
2. 选择优化目标（最小化/最大化）
3. 选择目标函数（state 类型变量）
4. 选择要优化的变量（parameter 类型）
5. 配置算法参数（迭代次数、持续时间等）
6. 点击"开始优化"运行
7. 查看最优解和优化历史

**优化结果：**
- 最优目标函数值
- 最优变量配置
- 迭代历史表格
- 可行解统计

## 🔧 YAML 模型格式

```yaml
metadata:
  name: "physiology"
  version: "2.1.0"
  author: "Minghui Wu"
  description: "器官功能模型"
  tags: ["organs", "function"]

imports:
  - insulin_system  # 导入其他模型

variables:
  liver_function:
    description: "肝功能系数"
    value: 1.0
    unit: "系数"
    type: "parameters"  # input/parameters/state
    bounds: [0.1, 1.0]
  
  water:
    description: "喝水"
    value: 1.0
    unit: "L"
    type: "input"
    bounds: [0.0, 1.0]

formulas:
  organ_function_recovery:
    description: "器官功能恢复"
    condition: "blood_glucose < 120"  # 触发条件
    priority: 2
    dynamics:
      liver_function: "min(1.0, liver_function + 0.0001)"
      kidney_function: "min(1.0, kidney_function + 0.0001)"

simulator:
  step_size: 1            # 时间步长（秒）
  total_time: 1440        # 总时间（秒）
  output_format: "csv"    # 输出格式
  output_variables:       # 要输出的变量
    - liver_function
    - kidney_function

optimizer:
  method: "grid"                        # 优化方法
  duration: 60.0                        # 持续时间（秒）
  targets_of_optimization:              # 优化目标
    - energy_expenditure
  variables_to_optimize:                # 要优化的变量
    - insulin_sensitivity
```

## 🎨 界面特点

### 侧边栏设计
- **可折叠** - 点击底部按钮收起/展开
- **子菜单** - 每个模块有3个子功能
- **状态显示** - 底部显示当前选中的模型

### 主题色彩
- Generator - 金色 (#ffd700)
- Loader - 蓝色 (#00ccff)  
- Simulator - 青色 (#00ccff)
- Optimizer - 红色 (#ff6666)

### 响应式布局
- 自适应宽度，充分利用屏幕空间
- 卡片式设计，清晰分组
- 标签页优化，避免信息过载

## 🔌 API 接口（待实现）

当前版本使用**模拟数据**，后续需要连接后端 API：

```typescript
// 获取模型列表
GET /api/models?folder=physiology

// 获取模型详情
GET /api/models/:name

// 运行仿真
POST /api/simulate
Body: { model_name, input_params, duration }

// 运行优化
POST /api/optimize
Body: { model_name, variables, targets, algorithm }
```

## 📝 开发建议

### 1. 连接后端
将模拟数据替换为真实 API 调用：

```typescript
// 在 Loader.tsx 中
const fetchModels = async () => {
  const response = await fetch('/api/models');
  const data = await response.json();
  setTreeData(data);
};
```

### 2. 添加文件上传
支持用户上传 YAML 文件：

```typescript
const uploadModel = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  await fetch('/api/models/upload', {
    method: 'POST',
    body: formData,
  });
};
```

### 3. 实时通信
使用 WebSocket 实现实时仿真数据推送：

```typescript
const ws = new WebSocket('ws://localhost:8000/simulate');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  setSimulationData(prev => [...prev, data]);
};
```

### 4. 数据可视化增强
集成 ECharts 或 Recharts 实现更丰富的图表：

```typescript
import * as echarts from 'echarts';

const renderChart = () => {
  const chart = echarts.init(chartRef.current);
  chart.setOption({
    xAxis: { type: 'category', data: times },
    yAxis: { type: 'value' },
    series: [{
      data: values,
      type: 'line',
      smooth: true,
    }]
  });
};
```

### 5. 状态管理
使用 Redux 或 Zustand 统一管理全局状态：

```typescript
// store.ts
import create from 'zustand';

interface AppState {
  selectedModel: any;
  simulationStatus: 'idle' | 'running' | 'paused';
  setSelectedModel: (model: any) => void;
  setSimulationStatus: (status: string) => void;
}

export const useStore = create<AppState>((set) => ({
  selectedModel: null,
  simulationStatus: 'idle',
  setSelectedModel: (model) => set({ selectedModel: model }),
  setSimulationStatus: (status: any) => set({ simulationStatus: status }),
}));
```

## 🐛 常见问题

### Q1: 右侧内容显示太窄？
**A:** 检查 `src/index.css` 是否包含以下代码：
```css
.ant-layout,
.ant-layout-content {
  max-width: none !important;
  width: 100% !important;
}
```

### Q2: 选择模型后其他模块看不到？
**A:** 确保在 App.tsx 中正确传递 `selectedModel`：
```typescript
<Simulator selectedModel={selectedModel} />
<Optimizer selectedModel={selectedModel} />
```

### Q3: Canvas 曲线不显示？
**A:** 检查：
1. `simulationData` 是否有数据
2. Canvas ref 是否正确绑定
3. 浏览器是否支持 Canvas API

### Q4: 变量类型显示错误？
**A:** 确保 YAML 中的 `type` 字段使用小写：
```yaml
type: "input"      # ✅ 正确
type: "INPUT"      # ❌ 错误
```

### Q5: 优化算法不生效？
**A:** 检查：
1. 模型是否包含 `optimizer` 字段
2. `variables_to_optimize` 是否为 parameter 类型
3. `targets_of_optimization` 是否为 state 类型

## 📊 性能优化建议

### 1. 虚拟滚动
对于大量数据，使用虚拟滚动：

```typescript
import { List } from 'react-virtualized';

<List
  width={800}
  height={400}
  rowCount={simulationData.length}
  rowHeight={50}
  rowRenderer={({ index, style }) => (
    <div style={style}>{simulationData[index]}</div>
  )}
/>
```

### 2. 数据采样
仿真数据过多时，采样显示：

```typescript
const sampledData = simulationData.filter((_, i) => i % 10 === 0);
```

### 3. Canvas 优化
使用 requestAnimationFrame 优化绘制：

```typescript
let animationId: number;

const draw = () => {
  // 绘制逻辑
  animationId = requestAnimationFrame(draw);
};

useEffect(() => {
  draw();
  return () => cancelAnimationFrame(animationId);
}, []);
```

### 4. 防抖和节流
对于频繁更新的操作：

```typescript
import { debounce } from 'lodash';

const handleSearch = debounce((value: string) => {
  // 搜索逻辑
}, 300);
```

## 🎯 未来规划

### 即将实现的功能
- [ ] 文件上传和在线编辑
- [ ] 实时协作（多人同时编辑模型）
- [ ] 模型版本控制
- [ ] 自动保存草稿
- [ ] 导出为 PDF 报告
- [ ] 3D 可视化（器官模型）
- [ ] AI 辅助建模（GPT 集成）

### 长期目标
- [ ] 移动端适配
- [ ] 插件系统
- [ ] 社区模型库
- [ ] 在线教程和文档
- [ ] 多语言支持（英文、中文）

## 📞 技术支持

- **GitHub**: https://github.com/shenfan19/life-matters
- **文档**: 参见 `README.md` 和 `a_mod_rule.md`
- **问题反馈**: 提交 GitHub Issue
- **邮件**: support@lifematters.dev

## 🌟 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

### 代码规范
- 使用 TypeScript 类型定义
- 遵循 ESLint 规则
- 添加必要的注释
- 编写单元测试

### 提交信息规范
```
feat: 添加新功能
fix: 修复 bug
docs: 更新文档
style: 代码格式调整
refactor: 代码重构
test: 添加测试
chore: 构建工具或辅助工具变动
```

## 📜 许可证

本项目采用 MIT 许可证。详见 LICENSE 文件。

## 🙏 致谢

- **Ant Design** - 优秀的 React UI 库
- **React** - 强大的前端框架
- **TypeScript** - 类型安全的 JavaScript
- **所有贡献者** - 感谢每一位参与者

---

**最后更新**: 2024-10-17

**版本**: v1.0.0

祝使用愉快！🎉