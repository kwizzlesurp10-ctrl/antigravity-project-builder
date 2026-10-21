import { NextResponse } from 'next/server';
import { getTelemetrySummary } from '@/lib/db/sqlite-engine';

export async function GET() {
  const summary = getTelemetrySummary();
  const mem = process.memoryUsage();
  return NextResponse.json(
    {
      ...summary,
      runtime: {
        nodeVersion: process.version,
        uptimeSeconds: Math.round(process.uptime()),
        rssMb: Number((mem.rss / (1024 * 1024)).toFixed(1)),
        heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(1)),
      },
    },
    { status: 200 }
  );
}
