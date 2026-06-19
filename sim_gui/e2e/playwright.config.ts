// sim_gui/e2e/playwright.config.ts
// GUI end-to-end test skeleton (task 3 of 2026-06-19 code-trust-verification-infra).
// Starts both the FastAPI backend (sim_engine) and the Vite dev server, then
// drives the real browser through: open page -> select model -> run simulation
// -> assert the results panel shows numeric output.
//
// Run from sim_gui/: npx playwright test -c e2e/playwright.config.ts
// First time only: npx playwright install chromium

import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIM_GUI_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SIM_GUI_DIR, '..');

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'python src/api_server.py',
      cwd: path.resolve(REPO_ROOT, 'sim_engine'),
      env: {
        SCS_MODE: 'true',
        LM_MODELS_PATH: path.resolve(REPO_ROOT, 'models'),
      },
      url: 'http://127.0.0.1:18080/api/health',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run dev',
      cwd: SIM_GUI_DIR,
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
