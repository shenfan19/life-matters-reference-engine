// game/src/core/storyI18n.ts
// Story-level i18n: load a per-story i18n/{lang}.yaml overlay and apply it to the
// assembled GameStory object (meta, variables, win/lose conditions, card display text).
// Numbers, booleans, and game-logic values are always preserved from base.

import type { Language } from './i18n';
import { fetchYaml } from './fetchYaml';

// ── Overlay schema ────────────────────────────────────────────────────────────

export interface StoryI18nOverlay {
  meta?: Partial<{ name: string; description: string; science_note: string; [k: string]: string | undefined }>;
  variable_display?: Record<string, { label?: string }>;
  win_conditions?: Array<{ message?: string }>;
  lose_conditions?: Array<{ message?: string }>;
  cards?: Record<string, { name?: string; description?: string; flavor?: string; science?: string }>;
}

// ── Loaders ───────────────────────────────────────────────────────────────────

/**
 * Load the i18n/{lang}.yaml overlay file for a story.
 * storyDir is relative to mods/ (e.g. "stories/social/ad1666_uk_issac_newton").
 * Returns null if lang equals baseLang or the file doesn't exist.
 */
export async function loadI18nOverlay(
  storyDir: string,
  lang: Language,
  baseLang = 'zh-CN',
): Promise<StoryI18nOverlay | null> {
  if (lang === baseLang) return null;
  try {
    return await fetchYaml(`${storyDir}/i18n/${lang}.yaml`) as StoryI18nOverlay;
  } catch {
    return null;
  }
}

// ── Overlay application ───────────────────────────────────────────────────────

/**
 * Apply an i18n overlay onto an assembled GameStory object (mutates in place).
 * playerCards / envCards are the same arrays that become player_cards / environment_cards.
 */
export function applyI18nOverlay(
  story: any,
  overlay: StoryI18nOverlay | null,
  playerCards: any[],
  envCards: any[],
): void {
  if (!overlay) return;

  // Meta strings
  if (overlay.meta) {
    for (const [k, v] of Object.entries(overlay.meta)) {
      if (typeof v === 'string') story.meta[k] = v;
    }
  }

  // Variable display labels
  if (overlay.variable_display) {
    for (const [key, val] of Object.entries(overlay.variable_display)) {
      if (story.variables[key] && val.label) {
        story.variables[key].label = val.label;
      }
    }
  }

  // Win / lose condition messages (matched by index)
  if (overlay.win_conditions) {
    overlay.win_conditions.forEach((oc, i) => {
      if (oc.message && story.win_conditions?.[i]) {
        story.win_conditions[i].message = oc.message;
      }
    });
  }
  if (overlay.lose_conditions) {
    overlay.lose_conditions.forEach((oc, i) => {
      if (oc.message && story.lose_conditions?.[i]) {
        story.lose_conditions[i].message = oc.message;
      }
    });
  }

  // Card display text — keyed by card id (copies suffix stripped for matching)
  if (overlay.cards) {
    const cardMap = overlay.cards;
    for (const pc of playerCards) {
      const baseId = pc.id.replace(/_\d+$/, '');
      const o = cardMap[pc.id] ?? cardMap[baseId];
      if (!o) continue;
      if (o.name    !== undefined) pc.name   = o.name;
      if (o.flavor  !== undefined) pc.flavor = o.flavor;
    }
    for (const ec of envCards) {
      const o = cardMap[ec.id];
      if (!o) continue;
      if (o.name        !== undefined) ec.name        = o.name;
      if (o.description !== undefined) ec.description = o.description;
      if (o.science     !== undefined) ec.science     = o.science;
    }
  }
}

// ── Legacy: game_story.{lang}.yaml overlay (kept for backward compat) ─────────

/**
 * Deep-merge: replaces string leaf values from `overlay` into `base`.
 * Non-string values (numbers, booleans, arrays of effects, etc.) are always kept from base.
 */
export function mergeStringOverlay<T>(base: T, overlay: unknown): T {
  if (overlay === null || overlay === undefined) return base;
  if (typeof base === 'string' && typeof overlay === 'string') return overlay as unknown as T;
  if (typeof base !== 'object' || typeof overlay !== 'object' || Array.isArray(base)) return base;
  const result = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(overlay as object)) {
    if (key in result) {
      result[key] = mergeStringOverlay(result[key], (overlay as Record<string, unknown>)[key]);
    }
  }
  return result as T;
}

/**
 * @deprecated Use loadI18nOverlay instead.
 * Path convention: stories/foo/game_story.yaml → stories/foo/game_story.zh-CN.yaml
 */
export async function loadStoryOverlay(cleanPath: string, lang: Language): Promise<unknown> {
  if (lang === 'en') return null;
  const overlayPath = cleanPath.replace(/\.(yaml|yml)$/, `.${lang}.yaml`);
  try {
    return await fetchYaml(overlayPath);
  } catch {
    return null;
  }
}
