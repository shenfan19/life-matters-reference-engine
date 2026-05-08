# ADR 0048 — BabelLanguageManager 英文 Locale 误报警告消除
**日期**：2026-05-02  
**状态**：已实施

---

## 背景

每次初始化 `ModelStructure`（包括 Monte Carlo 多 run 时每个 `_clone_model()` 调用）均会创建一个新的 `BabelLanguageManager`，并尝试加载 `locales/en/LC_MESSAGES/` 目录。该目录不存在，产生警告：

```
WARNING:src.babel_manager:Locale en not found at locales\en\LC_MESSAGES, using NullTranslations
```

这不是错误：英文（`en`）是系统的**源语言**，源语言无需 `.mo` 翻译文件，直接使用 `NullTranslations`（原样返回字符串）是正确行为。但警告噪音干扰了对真实问题的排查，且在 MC 多 run 场景（如 20 条 run）下会打印 20 条相同警告。

---

## 决策

在 `_load_translations()` 中，对 `en` / `en_US` 跳过警告：

```python
if self.current_language not in ('en', 'en_US'):
    logger.warning(f"Locale {self.current_language} not found at {locale_path}, using NullTranslations")
```

非英文语言（如 `zh_CN`）找不到翻译文件时仍正常警告，提示开发者缺少翻译资源。

---

## 结果

```
sim_engine/src/babel_manager.py
  _load_translations(): 英文 locale 缺失时不再输出 WARNING，改为静默降级
```

---

## 代价与风险

- 若将来真的需要英文翻译文件（如英文变体替换），该静默逻辑需要移除。目前项目全程英文作为源语言，该场景不存在。
