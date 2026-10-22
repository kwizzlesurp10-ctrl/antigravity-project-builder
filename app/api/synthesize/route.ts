import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ORBITAL_MODULES } from '@/lib/modules-catalog';
import { synthesizeProject, createProjectZipArchive } from '@/lib/synthesizer';
import { recordTelemetry, listCustomModules } from '@/lib/db/sqlite-engine';
import { validateRuntimeEnv } from '@/lib/security/env-validator';
import {
  checkSlidingWindowRateLimit,
  resolveClientIdentifier,
  buildRateLimitHeaders,
} from '@/lib/security/rate-limiter';

const VALID_IDS = ORBITAL_MODULES.map((m) => m.id) as [string, ...string[]];

const SynthesizeSchema = z.object({
  projectName: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Project name must be kebab-case alphanumeric')
    .default('antigravity-orbital-app'),
  description: z.string().max(280).optional(),
  prompt: z.string().max(500).optional(),
  moduleIds: z.array(z.string().min(2).max(64)).min(1),
  gravityConfig: z
    .object({
      rpm: z.number().min(0).max(5).default(1.0),
      kesslerMode: z.boolean().default(false),
    })
    .optional(),
  format: z.enum(['json', 'zip']).optional(),
});

export async function POST(request: Request) {
  const start = performance.now();
  const env = validateRuntimeEnv();
  const clientIp = resolveClientIdentifier(request);
  const rateLimit = checkSlidingWindowRateLimit(`synthesize:${clientIp}`, env.RATE_LIMIT_RPM * 2, 60_000);
  const rateHeaders = buildRateLimitHeaders(rateLimit);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', resetAtMs: rateLimit.resetAtMs },
      { status: 429, headers: rateHeaders }
    );
  }

  try {
    const url = new URL(request.url);
    const queryFormat = url.searchParams.get('format');
    const body = await request.json();
    const parsed = SynthesizeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400, headers: rateHeaders });
    }

    const customModules = listCustomModules();
    const validSet = new Set([...VALID_IDS, ...customModules.map((m) => m.id)]);
    const filteredIds = parsed.data.moduleIds.filter((id) => validSet.has(id));
    if (filteredIds.length === 0) {
      return NextResponse.json(
        { error: 'No valid orbital module IDs provided' },
        { status: 400, headers: rateHeaders }
      );
    }

    const result = synthesizeProject({
      projectName: parsed.data.projectName,
      description: parsed.data.description,
      prompt: parsed.data.prompt,
      moduleIds: filteredIds,
      gravityConfig: parsed.data.gravityConfig,
      customModules,
    });

    const durationMs = performance.now() - start;

    recordTelemetry({
      eventType: (parsed.data.format === 'zip' || queryFormat === 'zip') ? 'ZIP_EXPORT' : 'AST_SYNTHESIS',
      projectName: result.projectName,
      moduleCount: result.resolvedIds.length,
      filesCount: result.filesCount,
      bundleBytes: result.bundleBytes,
      durationMs,
    });

    if (parsed.data.format === 'zip' || queryFormat === 'zip') {
      const zipBytes = createProjectZipArchive(result.files, result.projectName);
      return new NextResponse(Buffer.from(zipBytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${result.projectName}.zip"`,
          'X-Bundle-SHA256': result.sha256,
          'X-Files-Count': String(result.filesCount),
          ...rateHeaders,
        },
      });
    }

    return NextResponse.json(
      {
        status: 'synthesized',
        durationMs: Number(durationMs.toFixed(2)),
        manifest: {
          ...result.manifest,
          description: result.description,
          files: result.files,
          fileMeta: result.fileManifest,
        },
        files: result.files,
      },
      { status: 200, headers: rateHeaders }
    );
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400, headers: rateHeaders });
  }
}

export async function GET(request: Request) {
  const start = performance.now();
  const url = new URL(request.url);
  const projectName = url.searchParams.get('projectName') || 'antigravity-orbital-app';
  const rawModules = url.searchParams.get('modules');
  const format = url.searchParams.get('format') || 'json';

  const customModules = listCustomModules();
  const validSet = new Set([...VALID_IDS, ...customModules.map((m) => m.id)]);
  const requestedIds = rawModules
    ? rawModules.split(',').filter((id) => validSet.has(id))
    : ['nextjs-app', 'anime-physics', 'supabase-db'];

  const result = synthesizeProject({
    projectName,
    moduleIds: requestedIds.length > 0 ? requestedIds : ['nextjs-app'],
    customModules,
  });

  const durationMs = performance.now() - start;

  if (format === 'zip') {
    recordTelemetry({
      eventType: 'ZIP_EXPORT',
      projectName: result.projectName,
      moduleCount: result.resolvedIds.length,
      filesCount: result.filesCount,
      bundleBytes: result.bundleBytes,
      durationMs,
    });
    const zipBytes = createProjectZipArchive(result.files, result.projectName);
    return new NextResponse(Buffer.from(zipBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${result.projectName}.zip"`,
        'X-Bundle-SHA256': result.sha256,
      },
    });
  }

  return NextResponse.json(
    {
      status: 'synthesized',
      durationMs: Number(durationMs.toFixed(2)),
      manifest: {
        ...result.manifest,
        description: result.description,
        files: result.files,
        fileMeta: result.fileManifest,
      },
      files: result.files,
    },
    { status: 200 }
  );
}
