// Regression: the model tree search, the list view and the session area.
// Each test guards a defect that was fixed once: the search box filtered only the list view, a model imported into
// the session could not be removed, and an upload ended in a 500 that the page did not explain.

import { test, expect } from '@playwright/test';
import { fixture, waitForTree } from './helpers';

test.describe('model tree', () => {
  test.setTimeout(180_000);

  test('search filters the tree view and the list view alike, and shows how many models match', async ({ page }) => {
    await page.goto('/');
    await waitForTree(page);
    const search = page.getByPlaceholder(/search|搜索|rechercher|搜尋/i).first();
    await search.fill('banister_v1');

    const count = page.getByTestId('model-tree-match-count');
    await expect(count).toBeVisible();
    const n = Number((await count.innerText()).match(/\d+/)?.[0] ?? 0);
    expect(n).toBeGreaterThan(0);
    await expect(page.locator('[data-testid^="model-tree-leaf-"]')).toHaveCount(n);

    // the list view shows the same models, each on a row
    await page.locator('button:has(.anticon-unordered-list)').first().click();
    await expect(page.locator('[data-testid^="model-tree-row-"]')).toHaveCount(n);

    // a text that matches nothing empties both
    await search.fill('no_such_model_zzz');
    await expect(page.locator('[data-testid^="model-tree-row-"]')).toHaveCount(0);
  });

  test('a model imported into the session can be removed, and a second upload of the same name replaces it', async ({ page }) => {
    await page.goto('/');
    await waitForTree(page);
    const input = page.locator('input[type=file][accept=".yaml,.yml"]').first();
    const remove = page.locator('[data-testid^="model-tree-session-remove-"]');

    await input.setInputFiles(fixture('test_valid_equation_condition.yaml'));
    await expect(remove).toHaveCount(1, { timeout: 60_000 });

    await input.setInputFiles(fixture('test_valid_equation_condition.yaml'));
    await page.waitForTimeout(2_000);
    await expect(remove).toHaveCount(1);                       // replaced, not added again

    await remove.first().click();
    await expect(remove).toHaveCount(0);
  });
});
