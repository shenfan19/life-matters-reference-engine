// Regression: the answers of the backend that the page depends on, and that the server keeps answering while it works.
// Each test guards a defect that was fixed once: the tree took minutes to load because slow requests stopped the
// whole server, download of a model without optimization results was rejected with a 422, every upload ended in a
// 500, and the model answer repeated itself and kept an old alias for the simulation block.

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fixture } from './helpers';

test.describe('backend', () => {
  test.setTimeout(180_000);

  test('the health check answers quickly while the file tree is being built', async ({ request }) => {
    const slow = request.get('/api/files', { timeout: 150_000 });
    await new Promise(r => setTimeout(r, 300));
    const t0 = Date.now();
    const health = await request.get('/api/health', { timeout: 20_000 });
    const took = Date.now() - t0;
    expect(health.ok()).toBeTruthy();
    expect(took).toBeLessThan(3_000);
    expect((await slow).ok()).toBeTruthy();
  });

  test('a model is answered in the shape the page reads, with one channel', async ({ request }) => {
    const r = await request.get('/api/models/test_valid_equation_condition?folder=test_fixtures%2Fvalid', { timeout: 60_000 });
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.data.variables).toBeTruthy();
    expect(body.data.simulation).toBeDefined();
    expect(body.data.simulator).toBeUndefined();               // one name for the simulation block
    expect(body.variables).toBeUndefined();                    // and the content is not repeated at the top level
  });

  test('a model can be exported without optimization results', async ({ request }) => {
    const r = await request.post('/api/optimizer/export-model', {
      data: { model_key: 'test_fixtures/valid/test_valid_equation_condition.yaml', flatten_imports: false },
    });
    expect(r.status()).toBe(200);
    expect((await r.json()).text).toContain('variables');
  });

  test('an uploaded model is resolved and answered with its structure', async ({ request }) => {
    const text = fs.readFileSync(fixture('test_valid_equation_condition.yaml'), 'utf8');
    const r = await request.post('/api/model/upload-temp', { data: { text, filename: 'regression_upload.yaml' } });
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Object.keys(body.resolved.variables).length).toBeGreaterThan(0);
  });
});
