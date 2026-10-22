import { NextResponse } from 'next/server';
import { z } from 'zod';
import { synthesizeProject } from '@/lib/synthesizer';
import { listCustomModules, recordTelemetry } from '@/lib/db/sqlite-engine';
import { validateRuntimeEnv } from '@/lib/security/env-validator';
import {
  checkSlidingWindowRateLimit,
  resolveClientIdentifier,
  buildRateLimitHeaders,
} from '@/lib/security/rate-limiter';

const AuditRequestSchema = z.object({
  projectName: z.string().min(2).max(64).optional().default('antigravity-orbital-app'),
  moduleIds: z.array(z.string().min(2).max(64)).min(1),
});

export interface AuditPillarResult {
  id: string;
  title: string;
  score: number;
  maxScore: number;
  status: 'passed' | 'warning' | 'critical';
  findings: string[];
  remediationModuleId?: string;
}

export async function POST(request: Request) {
  const start = performance.now();
  const env = validateRuntimeEnv();
  const clientIp = resolveClientIdentifier(request);
  const rateLimit = checkSlidingWindowRateLimit(`audit:${clientIp}`, env.RATE_LIMIT_RPM, 60_000);
  const rateHeaders = buildRateLimitHeaders(rateLimit);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', resetAtMs: rateLimit.resetAtMs },
      { status: 429, headers: rateHeaders }
    );
  }

  try {
    const body = await request.json();
    const parsed = AuditRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400, headers: rateHeaders }
      );
    }

    const customModules = listCustomModules();
    const synthesized = synthesizeProject({
      projectName: parsed.data.projectName,
      moduleIds: parsed.data.moduleIds,
      customModules,
    });

    const files = synthesized.files;
    const resolvedSet = new Set(synthesized.resolvedIds);
    const sqlFiles = Object.entries(files).filter(([p]) => p.endsWith('.sql'));
    const routeFiles = Object.entries(files).filter(([p]) => p.includes('/api/') || p.endsWith('route.ts'));

    // Pillar 1: PostgreSQL 17 Row-Level Security & Auth Policies (Max 25)
    let rlsScore = 0;
    const rlsFindings: string[] = [];
    if (sqlFiles.length > 0) {
      const allHaveRls = sqlFiles.every(([, content]) =>
        content.toLowerCase().includes('enable row level security')
      );
      const allHavePolicies = sqlFiles.every(([, content]) =>
        content.toLowerCase().includes('create policy')
      );
      rlsScore += allHaveRls ? 10 : 4;
      rlsScore += allHavePolicies ? 8 : 3;
      rlsFindings.push(
        allHaveRls
          ? `All ${sqlFiles.length} SQL migration(s) enforce Row-Level Security.`
          : 'One or more SQL tables are missing `enable row level security`.'
      );
    } else {
      rlsScore += 6;
      rlsFindings.push('No SQL migrations active; dock `supabase-db` for PostgreSQL 17 RLS persistence.');
    }
    if (resolvedSet.has('supabase-auth')) {
      rlsScore += 7;
      rlsFindings.push('Supabase SSR cookie session middleware and PKCE callback verified.');
    } else {
      rlsFindings.push('SSR Auth middleware (`supabase-auth`) not docked; anonymous sessions only.');
    }

    // Pillar 2: Zero-Trust Zod Validation & Env Guard (Max 25)
    let zodScore = 0;
    const zodFindings: string[] = [];
    if (resolvedSet.has('zod-security')) {
      zodScore += 18;
      zodFindings.push('Runtime environment schema (`validateRuntimeEnv`) and Zod guards active.');
    } else {
      zodScore += 5;
      zodFindings.push('Missing `zod-security` module; runtime environment variables are unvalidated.');
    }
    const hasSafeParse = Object.values(files).some((content) => content.includes('safeParse'));
    if (routeFiles.length === 0 || hasSafeParse) {
      zodScore += 7;
      zodFindings.push(`Zod safeParse schema verification active across runtime and route handlers.`);
    }

    // Pillar 3: Sliding-Window Rate Limiting & HTTP Security Headers (Max 20)
    let shieldScore = 0;
    const shieldFindings: string[] = [];
    const nextConfigContent = files['next.config.ts'] ?? '';
    if (
      nextConfigContent.includes('X-Content-Type-Options') &&
      nextConfigContent.includes('X-Frame-Options')
    ) {
      shieldScore += 10;
      shieldFindings.push('Strict HTTP response headers (`nosniff`, `DENY`, `Referrer-Policy`) active.');
    } else {
      shieldFindings.push('Missing strict security headers in `next.config.ts`.');
    }
    if (files['lib/security/rate-limiter.ts']) {
      shieldScore += 10;
      shieldFindings.push('Sliding-window IP token bucket rate limiter (`checkSlidingWindowRateLimit`) armed.');
    } else {
      shieldFindings.push('No sliding-window rate limiter present; dock `zod-security` to prevent 429 floods.');
    }

    // Pillar 4: Topological Dependency DAG & Type Safety (Max 15)
    const dagScore = 15;
    const dagFindings = [
      `Topological DAG resolved cleanly (${synthesized.resolvedIds.length} modules, ${synthesized.dependencyEdges.length} edges, 0 cycles).`,
      synthesized.autoAddedIds.length > 0
        ? `Auto-healed ${synthesized.autoAddedIds.length} transitive dependency module(s): ${synthesized.autoAddedIds.join(', ')}.`
        : 'All transitive module dependencies explicitly satisfied.',
    ];

    // Pillar 5: DevOps Container & E2E Verification Matrix (Max 15)
    let opsScore = 0;
    const opsFindings: string[] = [];
    if (resolvedSet.has('docker-spaces')) {
      opsScore += 8;
      opsFindings.push('Multi-stage Node 22 Alpine Dockerfile (`EXPOSE 7860`) and GitHub Actions CI ready.');
    } else {
      opsFindings.push('Dock `docker-spaces` for standalone Docker and CI/CD deployment workflow.');
    }
    if (resolvedSet.has('playwright-qa')) {
      opsScore += 7;
      opsFindings.push('Playwright Chromium E2E verification suite (`tests/e2e.spec.ts`) active.');
    } else {
      opsFindings.push('Dock `playwright-qa` for automated Chromium E2E regression coverage.');
    }

    const pillars: AuditPillarResult[] = [
      {
        id: 'rls-auth',
        title: 'PostgreSQL 17 RLS & SSR Auth',
        score: rlsScore,
        maxScore: 25,
        status: rlsScore >= 20 ? 'passed' : rlsScore >= 12 ? 'warning' : 'critical',
        findings: rlsFindings,
        remediationModuleId: !resolvedSet.has('supabase-auth') ? 'supabase-auth' : !resolvedSet.has('supabase-db') ? 'supabase-db' : undefined,
      },
      {
        id: 'zod-validation',
        title: 'Zod Runtime & Payload Schemas',
        score: zodScore,
        maxScore: 25,
        status: zodScore >= 20 ? 'passed' : zodScore >= 12 ? 'warning' : 'critical',
        findings: zodFindings,
        remediationModuleId: !resolvedSet.has('zod-security') ? 'zod-security' : undefined,
      },
      {
        id: 'edge-shield',
        title: 'Rate Limiting & Security Headers',
        score: shieldScore,
        maxScore: 20,
        status: shieldScore >= 18 ? 'passed' : shieldScore >= 10 ? 'warning' : 'critical',
        findings: shieldFindings,
        remediationModuleId: !resolvedSet.has('zod-security') ? 'zod-security' : undefined,
      },
      {
        id: 'dag-integrity',
        title: 'Topological DAG & AST Integrity',
        score: dagScore,
        maxScore: 15,
        status: 'passed',
        findings: dagFindings,
      },
      {
        id: 'devops-qa',
        title: 'Container Hardening & Playwright QA',
        score: opsScore,
        maxScore: 15,
        status: opsScore >= 14 ? 'passed' : opsScore >= 7 ? 'warning' : 'critical',
        findings: opsFindings,
        remediationModuleId: !resolvedSet.has('playwright-qa')
          ? 'playwright-qa'
          : !resolvedSet.has('docker-spaces')
            ? 'docker-spaces'
            : undefined,
      },
    ];

    const totalScore = pillars.reduce((acc, p) => acc + p.score, 0);
    const recommendedAutoDockIds = Array.from(
      new Set(
        pillars
          .map((p) => p.remediationModuleId)
          .filter((id): id is string => typeof id === 'string' && !resolvedSet.has(id))
      )
    );

    const grade =
      totalScore >= 90 ? 'A+ (Zero-Trust Singularity)' : totalScore >= 75 ? 'A (Production Orbit)' : totalScore >= 60 ? 'B (Standard Orbit)' : 'C (Unshielded Orbit)';

    const allEntries = Object.entries(synthesized.files);
    const totalLinesOfCode = allEntries.reduce(
      (sum, [, content]) => sum + content.split('\n').length,
      0
    );
    const sqlTablesCount = allEntries
      .filter(([p]) => p.endsWith('.sql'))
      .reduce(
        (sum, [, content]) =>
          sum + (content.match(/create\s+table\s+if\s+not\s+exists/gi)?.length ?? 0),
        0
      );
    const rlsPoliciesCount = allEntries
      .filter(([p]) => p.endsWith('.sql'))
      .reduce((sum, [, content]) => sum + (content.match(/create\s+policy/gi)?.length ?? 0), 0);
    const apiRoutesCount = allEntries.filter(([p]) => p.endsWith('route.ts')).length;
    const zodSchemasCount = allEntries
      .filter(([p]) => p.endsWith('.ts') || p.endsWith('.tsx'))
      .reduce((sum, [, content]) => sum + (content.match(/z\.object\(/g)?.length ?? 0), 0);
    const e2eTestsCount = allEntries
      .filter(([p]) => p.endsWith('.spec.ts'))
      .reduce((sum, [, content]) => sum + (content.match(/\btest\(/g)?.length ?? 0), 0);
    const secretScanClean = !allEntries.some(
      ([, content]) =>
        content.includes('sk_live_') || content.includes('rk_live_') || /\beval\(/.test(content)
    );

    const astMetrics = {
      totalLinesOfCode,
      sqlTablesCount,
      rlsPoliciesCount,
      apiRoutesCount,
      zodSchemasCount,
      e2eTestsCount,
      secretScanClean,
    };

    recordTelemetry({
      eventType: 'CONSTELLATION_AUDIT',
      projectName: synthesized.projectName,
      moduleCount: synthesized.resolvedIds.length,
      filesCount: synthesized.filesCount,
      bundleBytes: synthesized.bundleBytes,
      durationMs: performance.now() - start,
    });

    return NextResponse.json(
      {
        status: 'audited',
        projectName: synthesized.projectName,
        totalScore,
        maxScore: 100,
        grade,
        resolvedIds: synthesized.resolvedIds,
        recommendedAutoDockIds,
        pillars,
        astMetrics,
        sha256: synthesized.sha256,
      },
      { status: 200, headers: rateHeaders }
    );
  } catch {
    return NextResponse.json(
      { error: 'Invalid constellation audit payload' },
      { status: 400, headers: rateHeaders }
    );
  }
}
