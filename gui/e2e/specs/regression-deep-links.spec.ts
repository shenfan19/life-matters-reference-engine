// Regression: a link opens the model and the tab it names, and the address follows what is open.

import { test, expect } from '@playwright/test';
import { waitForTree } from './helpers';

const KEY = 'papers/lm_format/banister/banister_validation.yaml';
const NAME = 'banister_validation';

test.describe('deep links', () => {
  test.setTimeout(180_000);

  test('a link to the optimization tab opens that model on that tab', async ({ page }) => {
    await page.goto(`/model/${KEY}/opt`);
    await waitForTree(page);
    await expect(page.getByTestId('center-tab-optimization')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('body')).toContainText(NAME);
    expect(new URL(page.url()).pathname).toBe(`/model/${KEY}/opt`);
  });

  test('switching tabs writes the address, and back returns to the earlier tab', async ({ page }) => {
    await page.goto(`/model/${KEY}/overview`);
    await waitForTree(page);
    await expect(page.getByTestId('center-tab-intro')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('center-tab-simulation').click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/model/${KEY}/sim`);

    await page.goBack();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/model/${KEY}/overview`);
    await expect(page.getByTestId('center-tab-intro')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a path that is not a model link leaves the page on its usual start', async ({ page }) => {
    await page.goto('/model/nothing-here');
    await waitForTree(page);
    await expect(page.getByTestId('view-rail')).toBeVisible();
  });
  test('a link to a plugin opens its view with the models it names ticked, and keeps them in the address', async ({ page }) => {
    await page.goto(`/model/${KEY}/plugin/ve_graph?m=${KEY}`);
    await waitForTree(page);
    await expect(page.getByTestId('plugin-rail-ve_graph')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => new URL(page.url()).searchParams.getAll('m')).toEqual([KEY]);
    expect(new URL(page.url()).pathname).toBe(`/model/${KEY}/plugin/ve_graph`);

    await page.getByTestId('center-tab-simulation').click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/model/${KEY}/sim`);
    await page.goBack();
    await expect(page.getByTestId('plugin-rail-ve_graph')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a link to a plugin without a model, and a link to a plugin that does not exist', async ({ page }) => {
    await page.goto('/plugin/body_map');
    await waitForTree(page);
    await expect(page.getByTestId('plugin-rail-body_map')).toHaveAttribute('aria-pressed', 'true');
    expect(new URL(page.url()).pathname).toMatch(/^\/(plugin\/body_map|model\/.+\/plugin\/body_map)$/);

    await page.goto('/plugin/no_such_plugin');
    await waitForTree(page);
    await expect(page.getByTestId('plugin-rail-body_map')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => new URL(page.url()).pathname).not.toContain('no_such_plugin');
  });
});
