# 0004 — Multilingual scheme: JSON locale files

**Status**: implemented
**Date**: 2026-04-01

## Background

The simulator UI needs to support Simplified Chinese, Traditional Chinese, and English. Originally all text was hardcoded in components, so switching languages only took effect in some areas; the Traditional Chinese locale file was missing the `sim.*` namespace, causing raw keys to be displayed instead of translated text.

## Decision

Adopt a JSON locale file scheme (building on the existing `useI18n()` hook):

- Locale file path: `sim_gui/public/locales/sim/{zh-CN,zh-TW,en}.json`
- Namespace prefix unified as `sim.*`, grouped by function:
  - `sim.mode.*` — mode switch labels
  - `sim.control.*` — run control buttons (run / pause / continue / step / reset / pending)
  - `sim.scene.*` — scene area (locked, select_hint, etc.)
  - `sim.section.*` — names of the left accordion sections
  - `sim.chart.*` — chart area (no_data, export_csv, etc.)
  - `sim.msg.*` — message/notification text
- All UI text goes through `t('sim.xxx')`; hardcoding Chinese or English in components is forbidden

## Consequences

- Full coverage across all three languages, with instant switching
- Keys are grouped clearly, so adding new text only requires updating three files
- New UI text requires manually syncing all three locale files; missing an update shows the raw key (this has already happened once: zh-TW was once missing every `sim.*` key)
