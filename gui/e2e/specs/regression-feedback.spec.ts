// Regression: what the page tells the user after an action, and the controls that must be reachable.
// B-010 toasts never rendered, B-011 a tooltip covered the Run button, B-012 Reload left the results in place.

import { test, expect, type Page } from '@playwright/test';
import { waitForTree } from './helpers';

const KEY = 'test_fixtures/valid/test_valid_equation_condition.yaml';

async function openSimulation(page: Page) {
  await page.goto(`/model/${KEY}/sim`);
  await waitForTree(page);
  await expect(page.getByTestId('center-tab-simulation')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('sim-run-button')).toBeEnabled({ timeout: 30_000 });
  await page.mouse.move(900, 700);
}

async function runToEnd(page: Page) {
  await page.getByTestId('sim-run-button').click();
  await expect(page.getByTestId('sim-points-value')).toHaveText('48', { timeout: 60_000 });
}

test.describe('feedback and reachable controls', () => {
  test.setTimeout(180_000);

  test('a toast is drawn after Copy link', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openSimulation(page);
    await page.getByRole('button', { name: /复制链接|Copy link/ }).click();
    await expect(page.locator('.ant-message-notice')).toBeVisible({ timeout: 5_000 });
  });

  test('the Run button can be clicked right after the pointer left the tree toggle', async ({ page }) => {
    await openSimulation(page);
    const toggle = (await page.getByTestId('view-rail-tree-toggle').boundingBox())!;
    const run = (await page.getByTestId('sim-run-button').boundingBox())!;
    await page.mouse.move(toggle.x + toggle.width / 2, toggle.y + toggle.height / 2);
    await page.waitForTimeout(1200);
    await page.mouse.move(run.x + run.width / 2, run.y + run.height / 2, { steps: 15 });
    await page.waitForTimeout(400);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByTestId('sim-points-value')).toHaveText(/^[1-9]\d*$/, { timeout: 30_000 });
  });

  test('Reload clears the simulation results', async ({ page }) => {
    await openSimulation(page);
    await runToEnd(page);
    await page.getByRole('button', { name: /重载|Reload/ }).click();
    await expect(page.getByTestId('sim-points-value')).toHaveText('0', { timeout: 10_000 });
  });

  test('a run of several plans reports its points and its steps, and Reload clears it', async ({ page }) => {
    await page.goto('/model/test_fixtures/valid/test_valid_opt_t1_pareto.yaml/sim');
    await waitForTree(page);
    await expect(page.getByTestId('sim-run-button')).toContainText(/3/, { timeout: 30_000 });
    await page.mouse.move(900, 700);
    await page.getByTestId('sim-run-button').click();
    await expect(page.locator('body')).toContainText(/step (\d+)\/\1 · completed/, { timeout: 120_000 });
    await expect(page.getByTestId('sim-points-value')).toHaveText(/^[1-9]\d*$/);
    await page.getByRole('button', { name: /重载|Reload/ }).click();
    await expect(page.getByTestId('sim-points-value')).toHaveText('0', { timeout: 10_000 });
  });
});
