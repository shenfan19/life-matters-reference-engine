// The view rail: the model editor is a button on it, the buttons can be dragged into another order,
// and a right-click lists them with a tick each to show or hide them. Both are remembered (ADR 0163).

import { test, expect, type Page } from '@playwright/test';
import { waitForTree } from './helpers';

const order = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll('[data-testid^="rail-slot-"]')].map(e => e.getAttribute('data-testid')!.replace('rail-slot-', '')));

test('model editor button, drag to reorder, right-click to show and hide', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await waitForTree(page);
  await page.evaluate(() => { localStorage.removeItem('lm_rail_order'); localStorage.removeItem('lm_rail_hidden'); });
  await page.reload();
  await waitForTree(page);

  // the editor is on the rail from the start, after the three views
  expect((await order(page)).slice(0, 4)).toEqual(['intro', 'simulation', 'optimization', 'builder']);
  await page.getByTestId('view-rail-builder').click();
  await expect(page.getByTestId('view-rail-builder-close')).toBeVisible();
  await expect(page.getByTestId('center-tab-simulation')).toHaveAttribute('aria-disabled', 'true');
  await page.getByTestId('view-rail-builder-close').click();
  await expect(page.getByTestId('view-rail-builder-close')).toHaveCount(0);

  // drag Simulation above Overview
  await page.getByTestId('rail-slot-simulation').dragTo(page.getByTestId('rail-slot-intro'));
  expect((await order(page)).slice(0, 2)).toEqual(['simulation', 'intro']);
  await page.reload();
  await waitForTree(page);
  expect((await order(page)).slice(0, 2)).toEqual(['simulation', 'intro']);

  // right-click: hide Optimization, it leaves the rail and stays gone after a reload
  await page.getByTestId('view-rail').click({ button: 'right', position: { x: 40, y: 600 } });
  await page.getByTestId('rail-menu-optimization').click();
  await expect(page.getByTestId('rail-menu-optimization')).toBeVisible();   // the menu stays open for more ticks
  await expect(page.getByTestId('center-tab-optimization')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.reload();
  await waitForTree(page);
  await expect(page.getByTestId('center-tab-optimization')).toHaveCount(0);

  // reset brings back the order and the hidden button
  await page.getByTestId('view-rail').click({ button: 'right', position: { x: 40, y: 600 } });
  await page.getByTestId('rail-menu-reset').click();
  await expect(page.getByTestId('center-tab-optimization')).toBeVisible();
  expect((await order(page)).slice(0, 4)).toEqual(['intro', 'simulation', 'optimization', 'builder']);
});
