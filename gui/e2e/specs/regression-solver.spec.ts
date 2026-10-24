// The solver selector of the toolbar: the choice is remembered, goes into the run request, and the
// run answers with that solver (ADR 0163).

import { test, expect } from '@playwright/test';
import { waitForTree } from './helpers';

test('the solver chosen in the toolbar is sent with the run and remembered', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await waitForTree(page);
  await page.getByTestId('model-tree-folder-test_fixtures').click();
  await page.getByTestId('model-tree-folder-test_fixtures/valid').click();
  await page.getByTestId('model-tree-leaf-test_fixtures/valid/test_valid_equation_condition.yaml').click();
  await page.getByTestId('center-tab-simulation').click();

  const select = page.getByTestId('solver-select');
  await expect(select).toBeVisible({ timeout: 15_000 });
  await select.click();
  await page.locator('.ant-select-item-option', { hasText: 'fast' }).click();
  expect(await page.evaluate(() => localStorage.getItem('lm_solver'))).toBe('fast');

  const started = page.waitForResponse(r => r.url().endsWith('/api/simulation/start'));
  await expect(page.getByTestId('sim-run-button')).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId('sim-run-button').click();
  const response = await started;
  expect(JSON.parse(response.request().postData() || '{}').solver).toBe('fast');
  expect((await response.json()).data.solver.id).toBe('fast');
  await expect(page.getByTestId('sim-points-value')).toHaveText(/^[1-9]\d*$/, { timeout: 30_000 });

  await page.reload();
  await waitForTree(page);
  await page.getByTestId('center-tab-simulation').click();
  await expect(page.getByTestId('solver-select')).toContainText('fast');
});
