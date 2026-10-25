import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';

test.describe('Antigravity Project Builder v3.5 Maximum Destiny Zero-Mock Suite', () => {
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

  test('API: /api/ai/stream enforces Zod validation, rate-limit headers, and RAG SSE streaming', async ({
    request,
  }) => {
    // 1. Verify Zod validation rejects empty prompt with 400 + rate-limit headers
    const invalidRes = await request.post('/api/ai/stream', {
      headers: { 'x-forwarded-for': '10.24.0.10' },
      data: { prompt: '' },
    });
    expect(invalidRes.status()).toBe(400);
    expect(invalidRes.headers()['x-ratelimit-limit']).toBeDefined();

    // 2. Verify valid prompt retrieves semantic RAG context and streams SSE chunks
    const streamRes = await request.post('/api/ai/stream', {
      headers: { 'x-forwarded-for': '10.24.0.11' },
      data: {
        prompt: 'pgvector HNSW semantic search with Supabase PostgreSQL RLS and Stripe webhooks',
        systemInstruction: 'Zero-Trust Orbital Auditor',
        matchCount: 3,
      },
    });
    expect(streamRes.status()).toBe(200);
    expect(streamRes.headers()['content-type']).toContain('text/event-stream');
    expect(Number(streamRes.headers()['x-ratelimit-remaining'])).toBeGreaterThanOrEqual(0);

    const sseBody = await streamRes.text();
    expect(sseBody).toContain('Zero-Trust Orbital Auditor');
    expect(sseBody).toContain('HNSW');
    expect(sseBody).toContain('data: [DONE]');

    // 3. Verify sliding-window rate limiter enforces 429 when server RATE_LIMIT_RPM is exceeded
    // (Playwright webServer sets RATE_LIMIT_RPM=8; client bypass headers are intentionally gone.)
    const throttleIp = `10.24.${Date.now() % 200}.${Date.now() % 200}`;
    let lastStatus = 0;
    for (let i = 0; i < 8; i++) {
      const allowed = await request.post('/api/ai/stream', {
        headers: { 'x-forwarded-for': throttleIp },
        data: { prompt: `Budget request ${i}` },
      });
      expect(allowed.status()).toBe(200);
      lastStatus = allowed.status();
    }
    expect(lastStatus).toBe(200);

    const blocked = await request.post('/api/ai/stream', {
      headers: { 'x-forwarded-for': throttleIp },
      data: { prompt: 'Request exceeding RPM budget' },
    });
    expect(blocked.status()).toBe(429);
    expect(blocked.headers()['retry-after']).toBeDefined();
  });

  test('API: /api/health, /api/rag/documents, /api/modules/forge, /api/audit/constellation, /api/blueprints/diff, /api/deploy/ignition, & /api/webhooks/stripe', async ({
    request,
  }) => {
    // 1. Health & Readiness Probe
    const healthRes = await request.get('/api/health');
    expect(healthRes.ok()).toBeTruthy();
    const health = await healthRes.json();
    expect(health.status).toBe('orbital-healthy');
    expect(health.database.vectorIndexSize).toBe(12);
    expect(health.database.ragDocumentsCount).toBeGreaterThanOrEqual(4);

    // 2. RAG Knowledge Base CRUD & Semantic Search
    const ragListRes = await request.get('/api/rag/documents?q=pgvector+HNSW+halfvec');
    expect(ragListRes.ok()).toBeTruthy();
    const ragList = await ragListRes.json();
    expect(ragList.documents.length).toBeGreaterThan(0);

    const ragCreateRes = await request.post('/api/rag/documents', {
      data: {
        title: 'E2E Zero-Trust Edge Playbook',
        category: 'security',
        content: 'Enforce strict rate limiting and Zod environment validation on all Edge routes.',
      },
    });
    expect(ragCreateRes.status()).toBe(201);
    const ragCreated = await ragCreateRes.json();
    const docId = ragCreated.document.id;

    const ragDeleteRes = await request.delete(`/api/rag/documents?id=${docId}`);
    expect(ragDeleteRes.ok()).toBeTruthy();

    // 3. Custom Module Forge: AI Skeleton Generator + Save + Synthesize Integration
    const skelRes = await request.post('/api/modules/forge', {
      data: {
        action: 'generate-skeleton',
        name: 'Temporal Queue Worker',
        category: 'backend',
        prompt: 'Distributed background queue worker with retry policies and Zod schemas',
      },
    });
    expect(skelRes.ok()).toBeTruthy();
    const skelData = await skelRes.json();
    expect(skelData.status).toBe('skeleton-generated');
    const customMod = skelData.module;

    const forgeSaveRes = await request.post('/api/modules/forge', {
      data: {
        action: 'save',
        ...customMod,
      },
    });
    expect(forgeSaveRes.status()).toBe(201);

    const synthWithCustom = await request.post('/api/synthesize', {
      data: {
        projectName: 'custom-forged-orbit',
        moduleIds: ['nextjs-app', customMod.id],
      },
    });
    expect(synthWithCustom.ok()).toBeTruthy();
    const synthCustomBody = await synthWithCustom.json();
    expect(synthCustomBody.manifest.resolvedIds).toContain(customMod.id);

    const forgeDelRes = await request.delete(`/api/modules/forge?id=${customMod.id}`);
    expect(forgeDelRes.ok()).toBeTruthy();

    // 4. 5-Pillar Zero-Trust Constellation Audit + Static AST & Secret Metrics
    const auditRes = await request.post('/api/audit/constellation', {
      data: {
        projectName: 'audit-orbit',
        moduleIds: ['nextjs-app', 'supabase-db', 'supabase-auth', 'zod-security', 'playwright-qa', 'docker-spaces'],
      },
    });
    expect(auditRes.ok()).toBeTruthy();
    const auditData = await auditRes.json();
    expect(auditData.totalScore).toBe(100);
    expect(auditData.pillars.length).toBe(5);
    expect(auditData.astMetrics).toBeDefined();
    expect(auditData.astMetrics.totalLinesOfCode).toBeGreaterThan(50);
    expect(auditData.astMetrics.secretScanClean).toBe(true);

    // 5. Blueprint AST & File Comparator (LCS Unified Diff)
    const diffRes = await request.post('/api/blueprints/diff', {
      data: {
        baseBlueprintId: 'bp-motion-creative-studio',
        targetBlueprintId: 'bp-zero-g-enterprise',
      },
    });
    expect(diffRes.ok()).toBeTruthy();
    const diffData = await diffRes.json();
    expect(diffData.status).toBe('diff-complete');
    expect(diffData.modulesDelta.added.length).toBeGreaterThan(0);
    const modifiedPkg = diffData.fileDiffs.find((f: { path: string }) => f.path === 'package.json');
    expect(modifiedPkg.additionsCount).toBeGreaterThan(0);
    expect(modifiedPkg.unifiedPreview).toContain('@@');

    // 6. Dual-Mode Deployment Ignition (Materialize to .data/ignited-projects/ + Verification Checks)
    const igniteRes = await request.post('/api/deploy/ignition', {
      data: {
        projectName: 'ignited-e2e-stack',
        moduleIds: ['nextjs-app', 'supabase-db', 'pgvector-rag'],
        mode: 'materialize',
      },
    });
    expect(igniteRes.ok()).toBeTruthy();
    const igniteData = await igniteRes.json();
    expect(igniteData.status).toBe('ignited');
    expect(igniteData.dockerCompose).toContain('pgvector/pgvector:pg17');
    expect(igniteData.materializedDir).toContain('ignited-e2e-stack');
    expect(Array.isArray(igniteData.verificationChecks)).toBe(true);
    expect(igniteData.verificationChecks.every((c: { passed: boolean }) => c.passed)).toBe(true);

    const igniteListRes = await request.get('/api/deploy/ignition');
    expect(igniteListRes.ok()).toBeTruthy();
    const igniteList = await igniteListRes.json();
    expect(
      igniteList.materializedProjects.some(
        (p: { projectName: string }) => p.projectName === 'ignited-e2e-stack'
      )
    ).toBe(true);

    // 7. Cryptographic Stripe Webhook Verification + SQLite Idempotency Ledger
    const uniqueEventId = `evt_orbital_e2e_${Date.now()}`;
    const webhookPayload = JSON.stringify({
      id: uniqueEventId,
      type: 'checkout.session.completed',
      data: { object: { customer_email: 'architect@antigravity.dev' } },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const secret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_orbital_e2e_secret';
    const sigHex = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${webhookPayload}`, 'utf8')
      .digest('hex');

    const stripeRes = await request.post('/api/webhooks/stripe', {
      headers: {
        'stripe-signature': `t=${timestamp},v1=${sigHex}`,
        'content-type': 'application/json',
      },
      data: webhookPayload,
    });
    expect(stripeRes.ok()).toBeTruthy();
    const stripeJson = await stripeRes.json();
    expect(stripeJson.verified).toBe(true);
    expect(stripeJson.idempotentReplay).toBe(false);

    // Replay same event ID to verify idempotency detection
    const replayRes = await request.post('/api/webhooks/stripe', {
      headers: {
        'stripe-signature': `t=${timestamp},v1=${sigHex}`,
        'content-type': 'application/json',
      },
      data: webhookPayload,
    });
    expect(replayRes.ok()).toBeTruthy();
    const replayJson = await replayRes.json();
    expect(replayJson.idempotentReplay).toBe(true);

    const ledgerRes = await request.get('/api/webhooks/stripe');
    expect(ledgerRes.ok()).toBeTruthy();
    const ledgerJson = await ledgerRes.json();
    expect(ledgerJson.events.some((e: { eventId: string }) => e.eventId === uniqueEventId)).toBe(
      true
    );
  });

  test('UI: navigates across Orbital Studio (/), AI Lab (/laboratory), Shield (/shield), and Forge (/forge)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('orbital-command-bar')).toBeVisible();

    // Navigate to AI & RAG Lab (/laboratory)
    await page.getByTestId('nav-laboratory').click();
    await expect(page.getByTestId('laboratory-page')).toBeVisible();
    await page.getByTestId('lab-stream-submit').click();
    await expect(page.getByTestId('lab-stream-output')).toContainText('Edge AI Gateway');

    // Navigate to Zero-Trust Shield & Diff (/shield)
    await page.getByTestId('nav-shield').click();
    await expect(page.getByTestId('shield-page')).toBeVisible();
    await expect(page.getByTestId('shield-readiness-score')).toBeVisible();
    await expect(page.getByTestId('diff-unified-viewer')).toBeVisible();

    // Navigate to Custom Module Forge IDE (/forge)
    await page.getByTestId('nav-forge').click();
    await expect(page.getByTestId('forge-page')).toBeVisible();
    await page.getByTestId('forge-generate-btn').click();
    await expect(page.getByTestId('forge-file-editor')).toBeVisible();
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
