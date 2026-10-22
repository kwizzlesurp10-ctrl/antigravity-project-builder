import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ORBITAL_MODULES, type OrbitalModule, type ModuleCategory } from '@/lib/modules-catalog';
import {
  listCustomModules,
  saveCustomModule,
  deleteCustomModule,
  recordTelemetry,
  tokenizeText,
} from '@/lib/db/sqlite-engine';
import { validateRuntimeEnv } from '@/lib/security/env-validator';
import {
  checkSlidingWindowRateLimit,
  resolveClientIdentifier,
  buildRateLimitHeaders,
} from '@/lib/security/rate-limiter';

const CATEGORY_COLORS: Record<ModuleCategory, string> = {
  frontend: '#22d3ee',
  backend: '#a855f7',
  database: '#10b981',
  ai: '#c084fc',
  devops: '#f59e0b',
};

const GenerateSkeletonSchema = z.object({
  action: z.literal('generate-skeleton'),
  name: z.string().min(2).max(60),
  category: z.enum(['frontend', 'backend', 'database', 'ai', 'devops']).default('backend'),
  prompt: z.string().min(4).max(1000),
});

const SaveCustomModuleSchema = z.object({
  action: z.literal('save').optional(),
  id: z
    .string()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9-]+$/, 'Module ID must be kebab-case alphanumeric'),
  name: z.string().min(2).max(60),
  subtitle: z.string().min(2).max(90),
  description: z.string().min(4).max(400),
  category: z.enum(['frontend', 'backend', 'database', 'ai', 'devops']),
  color: z.string().min(4).max(20).optional(),
  mass: z.number().int().min(5).max(35).optional().default(15),
  baseAngle: z.number().int().min(0).max(359).optional().default(45),
  dependencies: z.array(z.string()).optional().default(['nextjs-app']),
  npmDependencies: z.record(z.string()).optional().default({}),
  envVars: z
    .array(
      z.object({
        key: z.string().min(1),
        defaultValue: z.string(),
        description: z.string(),
        required: z.boolean().default(false),
      })
    )
    .optional()
    .default([]),
  keywords: z.array(z.string()).optional().default([]),
  files: z.record(z.string()).refine((f) => Object.keys(f).length > 0, {
    message: 'At least one synthesized file is required',
  }),
});

function synthesizeModuleSkeleton(
  name: string,
  category: ModuleCategory,
  prompt: string
): OrbitalModule {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36) || 'custom-orbital-mod';

  const id = ORBITAL_MODULES.some((m) => m.id === slug) ? `custom-${slug}` : slug;
  const tokens = Array.from(new Set(tokenizeText(`${name} ${category} ${prompt}`))).slice(0, 12);
  const envKey = `${id.toUpperCase().replace(/-/g, '_')}_ENABLED`;

  const files: Record<string, string> = {};
  const deps: string[] = ['nextjs-app'];

  if (category === 'database') {
    deps.push('supabase-db');
    files[`supabase/migrations/20250201_${id.replace(/-/g, '_')}.sql`] = [
      `-- Custom Orbital Module Migration: ${name}`,
      `-- Synthesized from prompt: ${prompt.slice(0, 100)}`,
      `create table if not exists public.${id.replace(/-/g, '_')}_records (`,
      `  id uuid primary key default gen_random_uuid(),`,
      `  user_id uuid references auth.users(id) on delete cascade,`,
      `  payload jsonb not null default '{}'::jsonb,`,
      `  created_at timestamptz not null default now()`,
      `);`,
      ``,
      `alter table public.${id.replace(/-/g, '_')}_records enable row level security;`,
      ``,
      `create policy "Users manage own ${id} records"`,
      `  on public.${id.replace(/-/g, '_')}_records for all`,
      `  using ((select auth.uid()) = user_id)`,
      `  with check ((select auth.uid()) = user_id);`,
    ].join('\n');
  }

  if (category === 'backend' || category === 'ai') {
    deps.push('zod-security');
    files[`app/api/${id}/route.ts`] = [
      `import { NextResponse } from 'next/server';`,
      `import { z } from 'zod';`,
      ``,
      `const PayloadSchema = z.object({`,
      `  input: z.string().min(1).max(2000),`,
      `});`,
      ``,
      `export async function POST(request: Request) {`,
      `  const body = await request.json().catch(() => null);`,
      `  const parsed = PayloadSchema.safeParse(body);`,
      `  if (!parsed.success) {`,
      `    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });`,
      `  }`,
      `  return NextResponse.json({`,
      `    module: '${id}',`,
      `    status: 'processed',`,
      `    input: parsed.data.input,`,
      `  });`,
      `}`,
    ].join('\n');
  }

  files[`lib/modules/${id}.ts`] = [
    `/**`,
    ` * ${name} (${id})`,
    ` * ${prompt}`,
    ` */`,
    `export interface ${slug
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('')}Config {`,
    `  enabled: boolean;`,
    `  endpoint: string;`,
    `}`,
    ``,
    `export function create${slug
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('')}Service(): ${slug
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('')}Config {`,
    `  return {`,
    `    enabled: process.env.${envKey} !== 'false',`,
    `    endpoint: '/api/${id}',`,
    `  };`,
    `}`,
  ].join('\n');

  return {
    id,
    name,
    subtitle: `Custom ${category.toUpperCase()} Orbital Extension`,
    description: prompt.slice(0, 260),
    category,
    color: CATEGORY_COLORS[category],
    mass: 15,
    baseAngle: Math.floor(Math.random() * 320) + 15,
    dependencies: Array.from(new Set(deps)),
    npmDependencies: category === 'backend' || category === 'ai' ? { zod: '^3.24.2' } : {},
    envVars: [
      {
        key: envKey,
        defaultValue: 'true',
        description: `Enable ${name} orbital runtime module`,
        required: false,
      },
    ],
    keywords: tokens.length > 0 ? tokens : [id, category, 'custom'],
    files,
  };
}

export async function GET() {
  const customModules = listCustomModules();
  return NextResponse.json(
    {
      status: 'online',
      canonicalCount: ORBITAL_MODULES.length,
      customCount: customModules.length,
      customModules,
      allModules: [...ORBITAL_MODULES, ...customModules],
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const start = performance.now();
  const env = validateRuntimeEnv();
  const clientIp = resolveClientIdentifier(request);
  const rateLimit = checkSlidingWindowRateLimit(`forge:${clientIp}`, env.RATE_LIMIT_RPM, 60_000);
  const rateHeaders = buildRateLimitHeaders(rateLimit);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', resetAtMs: rateLimit.resetAtMs },
      { status: 429, headers: rateHeaders }
    );
  }

  try {
    const body = await request.json();

    if (body?.action === 'generate-skeleton') {
      const parsedSkeleton = GenerateSkeletonSchema.safeParse(body);
      if (!parsedSkeleton.success) {
        return NextResponse.json(
          { error: parsedSkeleton.error.flatten() },
          { status: 400, headers: rateHeaders }
        );
      }

      const skeleton = synthesizeModuleSkeleton(
        parsedSkeleton.data.name,
        parsedSkeleton.data.category,
        parsedSkeleton.data.prompt
      );

      return NextResponse.json(
        { status: 'skeleton-generated', module: skeleton },
        { status: 200, headers: rateHeaders }
      );
    }

    const parsedSave = SaveCustomModuleSchema.safeParse(body);
    if (!parsedSave.success) {
      return NextResponse.json(
        { error: parsedSave.error.flatten() },
        { status: 400, headers: rateHeaders }
      );
    }

    const data = parsedSave.data;
    if (ORBITAL_MODULES.some((m) => m.id === data.id)) {
      return NextResponse.json(
        { error: `Cannot overwrite canonical orbital module '${data.id}'` },
        { status: 409, headers: rateHeaders }
      );
    }

    const saved = saveCustomModule({
      id: data.id,
      name: data.name,
      subtitle: data.subtitle,
      description: data.description,
      category: data.category,
      color: data.color || CATEGORY_COLORS[data.category],
      mass: data.mass,
      baseAngle: data.baseAngle,
      dependencies: data.dependencies,
      npmDependencies: data.npmDependencies,
      envVars: data.envVars,
      keywords: data.keywords.length > 0 ? data.keywords : tokenizeText(`${data.name} ${data.description}`),
      files: data.files,
    });

    recordTelemetry({
      eventType: 'MODULE_FORGED',
      projectName: saved.id,
      moduleCount: 1,
      filesCount: Object.keys(saved.files).length,
      bundleBytes: JSON.stringify(saved.files).length,
      durationMs: performance.now() - start,
    });

    return NextResponse.json(
      { status: 'forged', module: saved },
      { status: 201, headers: rateHeaders }
    );
  } catch {
    return NextResponse.json(
      { error: 'Invalid module forge payload' },
      { status: 400, headers: rateHeaders }
    );
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing custom module id' }, { status: 400 });
  }
  const deleted = deleteCustomModule(id);
  return NextResponse.json({ deleted, id }, { status: deleted ? 200 : 404 });
}
