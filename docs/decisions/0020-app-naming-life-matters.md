# 0020 — App naming: unified as Life Matters, with the Chinese subtitle shown only in About

**Status**: implemented
**Date**: 2026-04-07

## Background

The app previously used both "Life Matters" and "立民" together, joined by a "·" (`Life Matters·立民`), appearing in the title bar, About dialog, and elsewhere. "立民" was an early-stage Chinese free translation of the name, fairly subjective in tone and less universal than the English name; appearing side by side with it in formal UI felt unstable, and it was hard to read at small font sizes.

## Decision

### 1. A single external name

Every UI location (title bar, browser tab, status bar, disclaimer) uses **Life Matters** uniformly, the same in both Chinese and English.

The `app.title` locale key is `"Life Matters"` in every language.

### 2. An exception for the About dialog

The About dialog, as the detailed presentation of project information, shows **Life Matters (立民)** as its title under the Chinese locale, keeping the Chinese subtitle in parentheses for users who want the background.

Implementation: a separate `about.name` locale key is added, managed independently of `app.title`:

| Language | `app.title` | `about.name` |
|------|-------------|--------------|
| en | Life Matters | Life Matters |
| zh-CN | Life Matters | Life Matters (立民) |
| zh-TW | Life Matters | Life Matters (立民) |

The About dialog title uses `t('about.name')`; every other location uses `t('app.title')`.

### 3. The disclaimer title

`disclaimer.title` is simplified to:
- Chinese: `免责声明` / `免責聲明`
- English: `Disclaimer`

It no longer carries a Life Matters or 立民 prefix, avoiding repetition in a context where the brand name already appears.

## Consequences

- High-visibility locations such as the title bar and status bar are concise and consistent
- The "立民" subtitle is preserved in the About dialog, so the original naming intent is not entirely lost
- `app.title` and `about.name` are managed separately, so future adjustments to one do not affect the other
