# Life Matters · 仿真引擎

> 跨尺度多模型动力学仿真框架，对个体行为（Regimen）进行多目标优化决策。

本仓库包含：仿真后端（FastAPI）、仿真前端 GUI（React）。  
YAML 模型库独立维护，见 → **[life-matters-model](https://github.com/shenfan19/life-matters-model)**  
游戏前端独立维护，见 → **[life-matters-game](https://github.com/shenfan19/life-matters-game)**

---

## 免责声明

本项目中的历史与医学场景基于公开学术文献，仅用于健康决策教育目的。所有模拟内容不代表对历史人物的道德评判；历史数据经简化处理，不构成医学建议；仿真结果为模型推演，非历史事实重现。

---

## 项目定位

**Life Matters（LM）** 的核心能力：

1. 把医学/社会学文献里的统计结论（OR、HR、Cohen's d 等）转化为可运行的 YAML 动力学模型
2. 在统一框架内同时运行异尺度模型（分钟–小时–天–年）
3. 对行为干预方案（Regimen）做多目标 Pareto 优化
4. 把科研模型输出为游戏化场景，供 [life-matters-game](https://github.com/shenfan19/life-matters-game) 消费
5. 把多篇文献的参数装进同一框架，检验它们是否互相自洽（Simulation-as-Validation）


---

## 仓库结构

```
sim_engine/   Python 仿真引擎 + FastAPI 后端（端口 18080）
sim_gui/      仿真前端界面（React + Vite，端口 5173）
sim_cli/      命令行接口（lm-sim + 批量运行 batch.py），面向 AI/脚本场景，详见 docs/cli.md
script/       开发工具脚本（i18n、AI 辅助等）
docs/         技术规范与架构决策（ADR）
```

YAML 模型生态见 → [life-matters-model](https://github.com/shenfan19/life-matters-model)

---

## 变量类型体系

| 类型 | 用途 | 优化归属 |
|------|------|---------|
| `state` | 随时间演化的状态变量 | — |
| `input` | 用户干预量，由 Regimen 结构化调度 | 外环 opt（Simulator） |
| `parameter` | 动力学机制系数，由文献数据拟合确定 | 内环 opt（Modeller，待实现） |
| `evidence` | 文献直接给出的效应量（OR/HR/RR/Cohen's d），Loader 自动换算 | 不参与优化 |

---

## 双环优化架构

```
内环（Modeller，待实现）      外环（Simulator，当前主攻）
  calibrate parameter    →      search optimal input Regimen
  fit to literature data         Pareto front output
```

---

## 快速开始

**依赖**：Python 3.10+，Node.js 18+

```bash
# 后端
pip install -r sim_engine/requirements.txt
cd sim_engine && python src/api_server.py   # http://localhost:18080

# 仿真前端
cd sim_gui && npm install && npm run dev    # http://localhost:5173
```

`sim_gui` 通过 Vite proxy 将 `/api` 转发至后端 `:18080`。

如需同时运行游戏前端，克隆 [life-matters-game](https://github.com/shenfan19/life-matters-game) 并按其 README 启动（端口 5174，同样依赖本仓库后端）。

### 命令行接口（CLI）

面向脚本和 AI agent 的运行接口，无需启动后端/前端：

```bash
python sim_cli/main.py <model.yaml> --sim
python sim_cli/main.py <model.yaml> --opt

# 批量运行一个文件夹下的所有模型，生成 batch_report.md
python sim_cli/batch.py --folder <models_folder>
```

输出为结构化 CSV + 日志，写入 `output/<模型名>/`。Release 中提供编译好的 `lm-sim`，无需安装 Python。详见 [docs/cli.md](docs/cli.md)。

---

## 常见问题

**后端端口占用？** 默认 18080。修改 `sim_engine/src/api_server.py`，同步更新 `sim_gui/vite.config.ts` 的 proxy 目标。

**前端空白？** 确认后端已启动，访问 `http://localhost:18080/api/health` 验证，再检查 `npm install` 是否完成。

**如何添加模型？** 将 `.yaml` 放入 `../b_lm_model/models/references/` 对应子目录，命名规则 `{topic}_{year}_{author}.yaml`，格式见 [life-matters-model/docs/model.md](https://github.com/shenfan19/life-matters-model/blob/main/docs/model.md)。

---

## 文档索引

| 文档 | 内容 |
|------|------|
| [docs/sim_design.md](docs/sim_design.md) | Simulator 软件设计（Regimen K×4、会话管理） |
| [docs/sim_impl.md](docs/sim_impl.md) | Simulator 实现细节 |
| [docs/sim_requirements.md](docs/sim_requirements.md) | 软件需求文档 |
| [docs/opt.md](docs/opt.md) | Optimizer 设计与实现（NSGA-II、scipy、MC 内嵌） |
| [docs/cli.md](docs/cli.md) | CLI 批量运行接口说明 |
| [docs/validation.md](docs/validation.md) | 三层验证协议（数值精度 / 文献对标 / 优化合理性） |
| [docs/ui_guidelines.md](docs/ui_guidelines.md) | 前端 UI/UX 设计规范（颜色 token、i18n、响应式） |
| [docs/data_flow.md](docs/data_flow.md) | 数据流设计 |
| [docs/decisions/README.md](docs/decisions/README.md) | 架构决策记录索引（ADR） |

---

## Acknowledgments

This project was developed with AI coding assistance, primarily [Claude Code](https://claude.ai/code) (Anthropic), for code generation, automated testing, and documentation.

## License

PolyForm Noncommercial 1.0.0 — 学术和非商业用途免费，商业使用需授权。  
详见 [LICENSE](LICENSE) 或 https://polyformproject.org/licenses/noncommercial/1.0.0/
