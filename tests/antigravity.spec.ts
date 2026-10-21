import { test, expect } from '@playwright/test';

test.describe('Antigravity Project Builder v3.0 Zero-Mock Suite', () => {
  test('API: /api/recommend performs real 64-dim SQLite vector similarity search and dependency resolution', async ({
    request,
  }) => {
    const res = await request.post('/api/recommend', {
      data: {
        prompt: 'AI RAG SaaS with pgvector semantic search, Stripe billing, and Supabase Auth',
        threshold: 0.14,
      },
    });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.status).toBe('aligned');
    expect(json.recommendations.length).toBeGreaterThan(0);
    expect(json.recommendedIds).toContain('pgvector-rag');
    expect(json.recommendedIds).toContain('supabase-db');
    expect(json.recommendedIds).toContain('stripe-billing');
  });

  test('API: /api/synthesize generates multi-file AST manifest and binary ZIP archive', async ({
    request,
  }) => {
    const jsonRes = await request.post('/api/synthesize', {
      data: {
        projectName: 'e2e-orbital-test',
        moduleIds: ['nextjs-app', 'pgvector-rag', 'stripe-billing'],
      },
    });
    expect(jsonRes.ok()).toBeTruthy();
    const body = await jsonRes.json();
    expect(body.status).toBe('synthesized');
    expect(body.manifest.filesCount).toBeGreaterThanOrEqual(14);
    expect(body.manifest.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(body.files['package.json']).toContain('"stripe"');

    // Verify binary ZIP output
    const zipRes = await request.post('/api/synthesize?format=zip', {
      data: {
        projectName: 'e2e-orbital-test',
        moduleIds: ['nextjs-app', 'pgvector-rag'],
        format: 'zip',
      },
    });
    expect(zipRes.ok()).toBeTruthy();
    expect(zipRes.headers()['content-type']).toBe('application/zip');
    const buffer = await zipRes.body();
    // Standard PK\x03\x04 ZIP magic header
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  test('API: /api/blueprints & /api/telemetry persist and audit in SQLite', async ({ request }) => {
    const listRes = await request.get('/api/blueprints');
    expect(listRes.ok()).toBeTruthy();
    const listData = await listRes.json();
    expect(listData.blueprints.length).toBeGreaterThanOrEqual(4);

    const createRes = await request.post('/api/blueprints', {
      data: {
        name: 'Playwright Verification Constellation',
        projectSlug: 'pw-constellation',
        prompt: 'Automated E2E verification blueprint',
        moduleIds: ['nextjs-app', 'anime-physics', 'playwright-qa'],
        gravityRpm: 1.5,
        kesslerMode: false,
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    expect(created.blueprint.id).toMatch(/^bp-/);

    const delRes = await request.delete(`/api/blueprints?id=${created.blueprint.id}`);
    expect(delRes.ok()).toBeTruthy();

    const telRes = await request.get('/api/telemetry');
    expect(telRes.ok()).toBeTruthy();
    const tel = await telRes.json();
    expect(tel.vectorIndexSize).toBe(12);
    expect(tel.totalSyntheses).toBeGreaterThan(0);
  });

  test('UI: docks orbital modules, auto-resolves dependencies, and synthesizes code', async ({
    page,
  }) => {
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
    await expect(page.getByTestId('generated-code-viewer')).toContainText(
      'create extension if not exists vector'
    );
  });
});
