// Shared helpers of the regression specs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '..', '..', '..');

// The models directory the backend reads: LM_MODELS_PATH, a `models` link in the repo, or the models repository next to it.
export function modelsDir(): string {
  const candidates = [
    process.env.LM_MODELS_PATH,
    path.join(REPO_ROOT, 'models'),
    path.join(REPO_ROOT, '..', 'life-matters-models', 'models'),
  ].filter(Boolean) as string[];
  const found = candidates.find(c => fs.existsSync(path.join(c, 'test_fixtures')));
  if (!found) throw new Error('models directory with test_fixtures not found, set LM_MODELS_PATH');
  return found;
}

export function fixture(name: string): string {
  return path.join(modelsDir(), 'test_fixtures', 'valid', name);
}

// The model tree is loaded when its header shows a count above zero and the backend is not offline.
export async function waitForTree(page: Page, timeout = 120_000) {
  await page.waitForFunction(() => {
    const m = document.body.innerText.match(/\((\d+)\)/);
    return !!document.querySelector('[data-testid="view-rail"]') && !!m && Number(m[1]) > 0
      && !/offline|离线|hors ligne|離線/i.test(document.body.innerText);
  }, null, { timeout });
}
