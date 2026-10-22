import { NextResponse } from 'next/server';
import { validateRuntimeEnv } from '@/lib/security/env-validator';
import { getTelemetrySummary } from '@/lib/db/sqlite-engine';

export async function GET() {
  const start = performance.now();
  try {
    const env = validateRuntimeEnv();
    const telemetry = getTelemetrySummary();
    const mem = process.memoryUsage();

    return NextResponse.json(
      {
        status: 'orbital-healthy',
        timestamp: new Date().toISOString(),
        latencyMs: Number((performance.now() - start).toFixed(2)),
        environment: {
          nodeEnv: env.NODE_ENV,
          appUrl: env.NEXT_PUBLIC_APP_URL,
          aiModelId: env.AI_MODEL_ID,
          embeddingDimensions: env.EMBEDDING_DIMENSIONS,
          rateLimitRpm: env.RATE_LIMIT_RPM,
          supabaseConfigured: Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
        },
        database: {
          engine: 'node:sqlite (WAL)',
          vectorIndexSize: telemetry.vectorIndexSize,
          customModulesCount: telemetry.customModulesCount,
          ragDocumentsCount: telemetry.ragDocumentsCount,
          totalBlueprints: telemetry.totalBlueprints,
          totalSyntheses: telemetry.totalSyntheses,
        },
        runtime: {
          nodeVersion: process.version,
          uptimeSeconds: Math.round(process.uptime()),
          rssMb: Number((mem.rss / (1024 * 1024)).toFixed(1)),
          heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(1)),
        },
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        status: 'degraded',
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
