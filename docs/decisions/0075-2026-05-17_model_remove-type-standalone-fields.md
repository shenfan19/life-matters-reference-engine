# ADR 0075 — 删除 YAML 顶层 `type` 和 `standalone` 字段

**日期**：2026-05-17  
**状态**：已采纳  
**范围**：`models/**/*.yaml`、`docs/model_design.md`、`sim_engine`、`sim_gui`

---

## 背景

YAML schema 历史上有两个顶层字段：

- `type: model | story`：区分"数学组件"与"组合分析案例"
- `standalone: true | false`：标记模型是否可以独立运行

## 问题

### `type` 字段

代码审查发现该字段**无任何行为影响**：

- `sim_engine` loader/validator/simulator 均不读取 `type` 字段
- `api_server.py` 读取后仅作为元数据返回给前端
- 前端仅将其渲染为一个蓝色 tag，无任何分支逻辑
- 64 个实际 YAML 文件中有 `type:` 字段，却对运行结果零影响

### `standalone` 字段

- `models/` 下实际写了 `standalone: false` 的文件：**0 个**
- `references/` 下 73 个"库组件"模型全部有完整的 `simulation:` 块，可以独立运行
- UI 代码中有一处警告逻辑，但从未被触发

### 设计层面

"是否能独立运行"本质上是一个**工程问题**，而非**语义标签问题**：一个只建模葡萄糖吸收的模型，在没有胰岛素反馈的情况下仍然可以运行，其运行结果对组件级验证（参数隔离、吸收曲线形状校验）是有价值的，即使在临床上无意义。强行用字段阻止运行反而妨碍调试。

"组件"与"完整案例"的区分已由**文件夹位置**自然表达：`references/` 存放可复用积木，`published/` 存放完整验证案例，无需额外字段重复。

## 决定

**删除 `type` 和 `standalone` 两个顶层字段**，包括：

- `model_design.md` schema 描述
- 所有 YAML 文件中的 `type:` 行（64 个）
- `api_server.py` 中收集 `model_type` 的代码
- `Simulator.tsx` 中的 `standalone` 警告逻辑和 `model_type` tag
- `Loader.tsx` 中的 `model_type` tag 显示
- `types.ts` 中 `DataNode` 接口的 `model_type` 字段

## 影响

| 方面 | 变化前 | 变化后 |
|------|--------|--------|
| 模型文件 | 64 个有 `type:` 行 | 无该字段，YAML 更简洁 |
| "组件"提示 | UI 显示蓝色 tag（无实际约束） | 无 tag，依赖文件夹位置区分 |
| 运行约束 | 无（`standalone` 从未阻止运行） | 无（一致） |
| 文件夹语义 | `references/` 隐含"库组件" | 不变，继续作为唯一区分手段 |

## 不在范围

- 修改引擎对"能否运行"的实际判断逻辑（引擎始终允许任何有效 YAML 运行）
- 修改 `variables` 下各变量的 `type:` 子字段（`input`/`state`/`parameter`/`evidence`，这些有明确行为差异，不受影响）
