# Claude Code 项目指令

## 项目概览

Life Matters（LM）——跨尺度多模型动力学仿真框架。
详见 `README.md`。

## 代码结构

```
sim_gui/      前端仿真界面（React + Vite，端口 5173）
game/         前端游戏界面（React + Vite，端口 5174）
sim_engine/   Python 仿真引擎 + API server
models/       YAML 模型生态（components/ + scenarios/ + stories/）
docs/         对外公开文档（技术规范、架构决策、建模格式）
go/           内部文档（策略规划、论文草稿、定位分析）——不随代码发布
```

## 目录发布规则

- `docs/`：**公开**，随代码发布到 GitHub，内容须适合外部读者
- `go/`：**内部**，不发布，不在 docs/ 中引用 go/ 下的路径
- 修改 docs/ 前确认内容不含商业策略、职业规划等内部信息

## 前端编码规范

所有 sim_gui 和 game 的 UI 代码必须遵循：

@docs/ui_guidelines.md

# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
