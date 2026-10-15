// Regression: the view rail and the three plugins.
// Each test guards a defect that was fixed once: an empty organ could not be clicked inside its outline, and VE Graph
// failed as a whole when one ticked model could not be validated.

import { test, expect } from '@playwright/test';
import { waitForTree } from './helpers';

test.describe('plugins', () => {
  test.setTimeout(240_000);

  test('the rail lists the three views and the three plugins', async ({ page }) => {
    await page.goto('/');
    await waitForTree(page);
    for (const id of ['ve_graph', 'model_compose', 'body_map']) {
      await expect(page.getByTestId(`plugin-rail-${id}`)).toBeVisible({ timeout: 60_000 });
    }
    for (const key of ['intro', 'simulation', 'optimization']) {
      await expect(page.getByTestId(`center-tab-${key}`)).toBeVisible();
    }
  });

  test('Body Map: clicking an organ filters the model tree, the bar clears the filter, and Compose opens', async ({ page }) => {
    await page.goto('/');
    await waitForTree(page);
    await page.getByTestId('plugin-rail-body_map').click();
    const body = page.frameLocator('[data-testid="plugin-host-body_map"]');

    // an organ with nothing on it must still be clickable inside its outline
    await body.locator('[data-slot="liver"] .shape').first().click();
    const bar = page.getByTestId('model-tree-plugin-filter');
    await expect(bar).toBeVisible({ timeout: 60_000 });

    // picking a second one adds to the selection, and the switch changes how they combine
    await body.locator('[data-input="exercise"]').click();
    await expect(body.getByRole('button').filter({ hasText: /all of them|同时满足|tous/i })).toBeVisible();

    await body.locator('#compose').click();
    await expect(page.getByTestId('plugin-host-model_compose')).toBeVisible();
    await expect(bar).toBeVisible();                           // the filter stays when the view changes

    await page.getByTestId('model-tree-plugin-filter-clear').click();
    await expect(bar).toHaveCount(0);
  });

  test('VE Graph draws the models ticked in the tree together', async ({ page }) => {
    await page.goto('/');
    await waitForTree(page);
    await page.getByTestId('plugin-rail-ve_graph').click();
    const search = page.getByPlaceholder(/search|搜索|rechercher|搜尋/i).first();
    await search.fill('test_valid_banister_v1_step');
    const boxes = page.locator('input[type=checkbox][data-testid^="model-tree-check-"]');
    await expect(boxes.first()).toBeVisible({ timeout: 30_000 });
    await boxes.nth(0).click();
    await boxes.nth(1).click();

    const graph = page.frameLocator('[data-testid="plugin-host-ve_graph"]');
    await expect(graph.locator('#stats')).toContainText(/\d+/, { timeout: 60_000 });
    await expect(graph.locator('#title')).toContainText('+');  // the names of both models are in the title
    await expect(graph.locator('.node').first()).toBeVisible();
  });
});
