import { NextResponse } from 'next/server';
import { z } from 'zod';
import { synthesizeProject } from '@/lib/synthesizer';
import { listBlueprints, listCustomModules, recordTelemetry } from '@/lib/db/sqlite-engine';
import { validateRuntimeEnv } from '@/lib/security/env-validator';
import {
  checkSlidingWindowRateLimit,
  resolveClientIdentifier,
  buildRateLimitHeaders,
} from '@/lib/security/rate-limiter';

const DiffRequestSchema = z.object({
  baseBlueprintId: z.string().optional(),
  targetBlueprintId: z.string().optional(),
  baseModuleIds: z.array(z.string()).optional(),
  targetModuleIds: z.array(z.string()).optional(),
  baseName: z.string().optional().default('base-constellation'),
  targetName: z.string().optional().default('target-constellation'),
});

export interface FileDiffSummary {
  path: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  baseBytes: number;
  targetBytes: number;
  deltaBytes: number;
  additionsCount: number;
  deletionsCount: number;
  unifiedPreview: string;
}

function computeLineDiffStats(
  baseText: string,
  targetText: string,
  maxLines = 36
): { additionsCount: number; deletionsCount: number; unifiedPreview: string } {
  if (baseText === targetText) {
    return { additionsCount: 0, deletionsCount: 0, unifiedPreview: 'No line changes' };
  }
  const baseLines = baseText ? baseText.split('\n') : [];
  const targetLines = targetText ? targetText.split('\n') : [];

  const n = Math.min(baseLines.length, 300);
  const m = Math.min(targetLines.length, 300);
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (baseLines[i] === targetLines[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const ops: Array<{ type: 'equal' | 'delete' | 'insert'; line: string; oldLine: number; newLine: number }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (baseLines[i] === targetLines[j]) {
      ops.push({ type: 'equal', line: baseLines[i], oldLine: i + 1, newLine: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'delete', line: baseLines[i], oldLine: i + 1, newLine: j + 1 });
      i++;
    } else {
      ops.push({ type: 'insert', line: targetLines[j], oldLine: i + 1, newLine: j + 1 });
      j++;
    }
  }
  while (i < n) {
    ops.push({ type: 'delete', line: baseLines[i], oldLine: i + 1, newLine: j + 1 });
    i++;
  }
  while (j < m) {
    ops.push({ type: 'insert', line: targetLines[j], oldLine: i + 1, newLine: j + 1 });
    j++;
  }

  let additionsCount = Math.max(0, targetLines.length - m);
  let deletionsCount = Math.max(0, baseLines.length - n);
  for (const op of ops) {
    if (op.type === 'insert') additionsCount++;
    if (op.type === 'delete') deletionsCount++;
  }

  const previewLines: string[] = [
    `@@ -1,${baseLines.length} +1,${targetLines.length} @@ (+${additionsCount} / -${deletionsCount})`,
  ];

  for (let idx = 0; idx < ops.length; idx++) {
    const op = ops[idx];
    const nearChange =
      op.type !== 'equal' ||
      (idx > 0 && ops[idx - 1].type !== 'equal') ||
      (idx + 1 < ops.length && ops[idx + 1].type !== 'equal');

    if (!nearChange) continue;

    if (op.type === 'delete') {
      previewLines.push(`- ${op.line}`);
    } else if (op.type === 'insert') {
      previewLines.push(`+ ${op.line}`);
    } else {
      previewLines.push(`  ${op.line}`);
    }

    if (previewLines.length >= maxLines) {
      previewLines.push('... [unified diff truncated]');
      break;
    }
  }

  return {
    additionsCount,
    deletionsCount,
    unifiedPreview: previewLines.length > 1 ? previewLines.join('\n') : 'Whitespace/ordering diff',
  };
}

export async function POST(request: Request) {
  const start = performance.now();
  const env = validateRuntimeEnv();
  const clientIp = resolveClientIdentifier(request);
  const rateLimit = checkSlidingWindowRateLimit(`bp-diff:${clientIp}`, env.RATE_LIMIT_RPM, 60_000);
  const rateHeaders = buildRateLimitHeaders(rateLimit);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', resetAtMs: rateLimit.resetAtMs },
      { status: 429, headers: rateHeaders }
    );
  }

  try {
    const body = await request.json();
    const parsed = DiffRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400, headers: rateHeaders }
      );
    }

    const blueprints = listBlueprints();
    const customModules = listCustomModules();

    const baseBp = parsed.data.baseBlueprintId
      ? blueprints.find((b) => b.id === parsed.data.baseBlueprintId)
      : undefined;
    const targetBp = parsed.data.targetBlueprintId
      ? blueprints.find((b) => b.id === parsed.data.targetBlueprintId)
      : undefined;

    const baseIds = baseBp?.moduleIds ?? parsed.data.baseModuleIds ?? ['nextjs-app', 'supabase-db'];
    const targetIds =
      targetBp?.moduleIds ??
      parsed.data.targetModuleIds ??
      ['nextjs-app', 'supabase-db', 'pgvector-rag', 'edge-ai-gateway', 'zod-security'];

    const baseSynth = synthesizeProject({
      projectName: baseBp?.projectSlug ?? parsed.data.baseName,
      moduleIds: baseIds,
      customModules,
    });

    const targetSynth = synthesizeProject({
      projectName: targetBp?.projectSlug ?? parsed.data.targetName,
      moduleIds: targetIds,
      customModules,
    });

    const baseSet = new Set(baseSynth.resolvedIds);
    const targetSet = new Set(targetSynth.resolvedIds);

    const addedModules = targetSynth.resolvedIds.filter((id) => !baseSet.has(id));
    const removedModules = baseSynth.resolvedIds.filter((id) => !targetSet.has(id));
    const sharedModules = targetSynth.resolvedIds.filter((id) => baseSet.has(id));

    const allPaths = Array.from(
      new Set([...Object.keys(baseSynth.files), ...Object.keys(targetSynth.files)])
    ).sort((a, b) => a.localeCompare(b));

    const fileDiffs: FileDiffSummary[] = allPaths.map((filePath) => {
      const baseContent = baseSynth.files[filePath];
      const targetContent = targetSynth.files[filePath];
      const baseBytes = baseContent ? Buffer.byteLength(baseContent, 'utf8') : 0;
      const targetBytes = targetContent ? Buffer.byteLength(targetContent, 'utf8') : 0;

      if (baseContent === undefined && targetContent !== undefined) {
        const stats = computeLineDiffStats('', targetContent);
        return {
          path: filePath,
          status: 'added',
          baseBytes: 0,
          targetBytes,
          deltaBytes: targetBytes,
          additionsCount: stats.additionsCount,
          deletionsCount: stats.deletionsCount,
          unifiedPreview: stats.unifiedPreview,
        };
      }
      if (baseContent !== undefined && targetContent === undefined) {
        const stats = computeLineDiffStats(baseContent, '');
        return {
          path: filePath,
          status: 'removed',
          baseBytes,
          targetBytes: 0,
          deltaBytes: -baseBytes,
          additionsCount: stats.additionsCount,
          deletionsCount: stats.deletionsCount,
          unifiedPreview: stats.unifiedPreview,
        };
      }
      if (baseContent !== targetContent) {
        const stats = computeLineDiffStats(baseContent ?? '', targetContent ?? '');
        return {
          path: filePath,
          status: 'modified',
          baseBytes,
          targetBytes,
          deltaBytes: targetBytes - baseBytes,
          additionsCount: stats.additionsCount,
          deletionsCount: stats.deletionsCount,
          unifiedPreview: stats.unifiedPreview,
        };
      }
      return {
        path: filePath,
        status: 'unchanged',
        baseBytes,
        targetBytes,
        deltaBytes: 0,
        additionsCount: 0,
        deletionsCount: 0,
        unifiedPreview: 'Identical AST artifact',
      };
    });

    recordTelemetry({
      eventType: 'BLUEPRINT_DIFF',
      projectName: `${baseSynth.projectName}..${targetSynth.projectName}`.slice(0, 48),
      moduleCount: targetSynth.resolvedIds.length,
      filesCount: allPaths.length,
      bundleBytes: Math.abs(targetSynth.bundleBytes - baseSynth.bundleBytes),
      durationMs: performance.now() - start,
    });

    return NextResponse.json(
      {
        status: 'diff-complete',
        base: {
          projectName: baseSynth.projectName,
          resolvedIds: baseSynth.resolvedIds,
          filesCount: baseSynth.filesCount,
          bundleBytes: baseSynth.bundleBytes,
          sha256: baseSynth.sha256,
        },
        target: {
          projectName: targetSynth.projectName,
          resolvedIds: targetSynth.resolvedIds,
          filesCount: targetSynth.filesCount,
          bundleBytes: targetSynth.bundleBytes,
          sha256: targetSynth.sha256,
        },
        modulesDelta: {
          added: addedModules,
          removed: removedModules,
          shared: sharedModules,
        },
        bytesDelta: targetSynth.bundleBytes - baseSynth.bundleBytes,
        filesDeltaCount: fileDiffs.filter((f) => f.status !== 'unchanged').length,
        fileDiffs,
      },
      { status: 200, headers: rateHeaders }
    );
  } catch {
    return NextResponse.json(
      { error: 'Invalid blueprint diff request' },
      { status: 400, headers: rateHeaders }
    );
  }
}
