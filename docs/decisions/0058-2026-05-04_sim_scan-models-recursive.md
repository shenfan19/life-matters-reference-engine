# 0058 — `scan_models` 改为递归发现所有子目录

**日期**：2026-05-04  
**状态**：✅ 已实施

---

## 背景

`LoaderEngine.scan_models()` 原实现：

- 未指定 `folders` 时，只扫描 `models/` 根目录一层（`os.listdir`）。
- 指定 `folders` 时，只扫对应目录一层（非递归）。

`models/` 根目录下没有任何直接 YAML 文件，所有文件都在子目录中。因此无参数调用时返回空列表，只有前端明确指定 folder 时才能看到模型。

新增 `models/published/paper1/`、`paper2/`、`paper3/` 后，问题更突出：不修改代码则这些目录对 GUI 不可见。

---

## 决策

**两处修改，共同实现"识别整个 models/ 目录"：**

**后端 `scan_models()`**：未指定 `folders` 时，先用 `os.walk` 递归收集 `models/` 下所有子目录，再逐一扫描。

**前端 `Simulator.tsx` `loadFileTree()`**：原硬编码只提取 `scenarios` 和 `components` 两个子节点。改为动态遍历 `models/` 的所有直接子目录，每个子目录生成一个带标题的分组（`COMPONENTS`、`SCENARIOS`、`PAPER` 等），跳过 `stories/`（游戏内容，待移出）。

**前端 `ModsManager.tsx`**：原过滤器只保留 `components/` 和 `scenarios/` 开头的节点。改为只排除 `stories/`，其余所有节点均可见。

```python
if not folders:
    folders = [None]
    for root, dirs, _ in os.walk(base_dir):
        dirs[:] = [d for d in dirs if d not in _skip]
        for d in dirs:
            rel = os.path.relpath(os.path.join(root, d), base_dir).replace('\\', '/')
            folders.append(rel)
```

跳过目录集合 `_skip = {'merged', 'splited', 'output', '__pycache__', '.git', '_output'}`。

**指定 `folders` 时行为不变**（向后兼容）：只扫指定目录一层。

---

## 权衡

**名称冲突**：不同子目录下若有同名 YAML 文件，后扫到的覆盖先扫到的（dict key 为文件名）。当前所有文件名无冲突，日后新增文件时需注意。

**stories/ 中的 card YAML**：格式与 scenario YAML 不同，load 会失败，被 `logger.warning` 跳过。`stories/` 计划后续移出 `models/`，届时此噪音消失。

**性能**：首次全量扫描会尝试加载所有 YAML（含 stub 文件）。stub 加载失败被跳过，开销可接受。

---

## 理由

- `models/` 目录应被视为一个统一的模型生态，不需要用户记忆具体子目录路径。
- `find_model_file()` 本已是递归全树搜索，`scan_models` 保持一致。
- 新增 `models/published/` 后无需任何额外配置，自动可见。
