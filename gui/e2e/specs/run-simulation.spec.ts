// gui/e2e/specs/run-simulation.spec.ts
// Golden-path smoke test: select a model in the tree, run a simulation, and
// verify the results panel actually receives data points. This is the layer
// test_verify/test_sim_cli_consistency.py does not cover — it imports engine
// functions directly and never exercises the GUI button -> API call wiring.
//
// Uses models/test_validation/valid/test_valid_formula_condition.yaml: a small deterministic
// bang-bang thermostat model kept specifically for engine/GUI validation
// (see its metadata.description in the YAML).

import { test, expect } from '@playwright/test';

test('select model, run simulation, see numeric results', async ({ page }) => {
  await page.goto('/');

  const testFolder = page.getByTestId('model-tree-folder-test_validation');
  await expect(testFolder).toBeVisible({ timeout: 15_000 });
  await testFolder.click();

  const validFolder = page.getByTestId('model-tree-folder-test_validation/valid');
  await expect(validFolder).toBeVisible();
  await validFolder.click();

  const modelLeaf = page.getByTestId('model-tree-leaf-test_validation/valid/test_valid_formula_condition.yaml');
  await expect(modelLeaf).toBeVisible();
  await modelLeaf.click();

  await page.getByTestId('center-tab-simulation').click();

  const runButton = page.getByTestId('sim-run-button');
  await expect(runButton).toBeEnabled({ timeout: 10_000 });
  await runButton.click();

  // Run completes quickly for this model (48h, hourly step); allow generous
  // margin for cold engine startup.
  await expect(page.getByTestId('sim-points-value')).toHaveText(/^[1-9]\d*$/, { timeout: 30_000 });
});
