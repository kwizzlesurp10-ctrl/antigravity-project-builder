import { test, expect } from '@playwright/test';

test.describe('Antigravity Project Builder E2E', () => {
  test('docks orbital modules, auto-resolves dependencies, and synthesizes code', async ({ page }) => {
    await page.goto('/');

    // 1. Verify initial Singularity Core state
    const core = page.getByTestId('singularity-core');
    await expect(core).toContainText('3 Modules Docked');

    // 2. Click pgvector module in Outer Belt -> auto-docks Supabase Postgres dependency
    const pgvectorNode = page.getByTestId('orbital-node-pgvector-rag');
    await pgvectorNode.click();

    await expect(pgvectorNode).toHaveAttribute('data-docked', 'true');
    await expect(page.getByTestId('orbital-node-supabase-db')).toHaveAttribute('data-docked', 'true');

    // 3. Trigger Kessler Syndrome Easter Egg (5 rapid clicks on Singularity Core)
    for (let i = 0; i < 5; i++) await core.click();
    await expect(page.locator('[data-kessler-mode]')).toHaveAttribute('data-kessler-mode', 'active');

    // 4. Synthesize full-stack bundle
    await page.getByTestId('ignite-singularity-btn').click();
    await expect(page.getByTestId('synthesis-modal')).toBeVisible();
    await expect(page.getByTestId('generated-code-viewer')).toContainText('create extension if not exists vector');
  });
});
