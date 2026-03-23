// game/src/core/storyI18n.ts
// Story-level i18n: load a parallel translation YAML and deep-merge string fields onto the base story.
// Numbers, boolean fields, and game-logic arrays are preserved from the base; only string leaves are replaced.

import type { Language } from './i18n';

/**
 * Deep-merge: replaces string leaf values from `overlay` into `base`.
 * Non-string values (numbers, booleans, arrays of effects, etc.) are always kept from `base`.
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
 * Tries to fetch the language overlay for a story.
 * Path convention: `stories/foo/game_story.yaml` → `stories/foo/game_story.zh-CN.yaml`
 * Returns null if not found or language is 'en'.
 */
export async function loadStoryOverlay(cleanPath: string, lang: Language): Promise<unknown> {
  if (lang === 'en') return null;
  const overlayPath = cleanPath.replace(/\.(yaml|yml)$/, `.${lang}.yaml`);
  try {
    const res = await fetch(`/api/file/${overlayPath}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success) return null;
    return data.data?.content ?? null;
  } catch {
    return null;
  }
}
