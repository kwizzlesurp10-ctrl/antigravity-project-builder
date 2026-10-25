import { ORBITAL_MODULES, OrbitalModule } from '@/lib/modules-catalog';
import { zipSync, strToU8 } from 'fflate';
import crypto from 'node:crypto';

export interface DependencyEdge {
  from: string;
  to: string;
}

export interface DependencyGraphResult {
  resolvedIds: string[];
  autoAddedIds: string[];
  topologicalOrder: string[];
  dependencyEdges: DependencyEdge[];
  /** Detected dependency cycles as ordered id paths (last id repeats the cycle start). */
  cycles: string[][];
}

export interface GravityConfig {
  rpm: number;
  kesslerMode: boolean;
}

export interface SynthesizeProjectOptions {
  projectName: string;
  description?: string;
  prompt?: string;
  moduleIds: string[];
  gravityConfig?: GravityConfig;
  customModules?: OrbitalModule[];
}

export interface SynthesizedFileMeta {
  path: string;
  bytes: number;
  category: string;
  moduleId: string;
}

export interface NormalizedEnvVar {
  key: string;
  defaultValue: string;
  description: string;
  required: boolean;
  moduleId: string;
  moduleName: string;
}

export interface SynthesizedProjectResult {
  projectName: string;
  description: string;
  prompt: string;
  resolvedIds: string[];
  autoAddedIds: string[];
  topologicalOrder: string[];
  dependencyEdges: DependencyEdge[];
  modules: OrbitalModule[];
  files: Record<string, string>;
  fileManifest: SynthesizedFileMeta[];
  filesMetadata: SynthesizedFileMeta[];
  filesCount: number;
  bundleBytes: number;
  sha256: string;
  generatedAt: string;
  gravityConfig: GravityConfig;
  manifest: {
    project: string;
    projectName: string;
    generatedAt: string;
    modules: string[];
    resolvedIds: string[];
    autoAddedIds: string[];
    topologicalOrder: string[];
    dependencyEdges: DependencyEdge[];
    filesCount: number;
    bundleBytes: number;
    sha256: string;
    fileManifest: SynthesizedFileMeta[];
  };
}

interface FlexibleEnvVarRecord {
  key?: string;
  name?: string;
  defaultValue?: string;
  value?: string;
  example?: string;
  description?: string;
  comment?: string;
  required?: boolean;
}

const FALLBACK_NPM_DEPENDENCIES: Record<string, Record<string, string>> = {
  'nextjs-app': {
    'lucide-react': '^0.475.0',
    zod: '^3.24.2',
  },
  'anime-physics': {
    animejs: '^3.2.2',
  },
  'supabase-auth': {
    '@supabase/ssr': '^0.5.2',
    '@supabase/supabase-js': '^2.49.1',
  },
  'supabase-db': {
    '@supabase/supabase-js': '^2.49.1',
  },
  'pgvector-rag': {
    '@supabase/supabase-js': '^2.49.1',
    openai: '^4.85.1',
  },
  'edge-ai-gateway': {
    ai: '^4.1.45',
    openai: '^4.85.1',
    zod: '^3.24.2',
  },
  'playwright-qa': {},
  'docker-spaces': {},
};

const FALLBACK_NPM_DEV_DEPENDENCIES: Record<string, Record<string, string>> = {
  'nextjs-app': {
    '@tailwindcss/postcss': '^4.0.6',
    tailwindcss: '^4.0.6',
  },
  'anime-physics': {
    '@types/animejs': '^3.1.13',
  },
  'playwright-qa': {
    '@playwright/test': '^1.50.1',
  },
};

const FALLBACK_ENV_VARS: Record<
  string,
  Array<{ key: string; defaultValue: string; description: string; required: boolean }>
> = {
  'nextjs-app': [
    {
      key: 'NEXT_PUBLIC_APP_URL',
      defaultValue: 'http://localhost:3000',
      description: 'Public canonical URL for the Next.js 15 App Router deployment',
      required: true,
    },
  ],
  'anime-physics': [
    {
      key: 'NEXT_PUBLIC_ORBITAL_TARGET_FPS',
      defaultValue: '60',
      description: 'Target frame rate for the Anime.js orbital spring choreographer',
      required: false,
    },
  ],
  'supabase-auth': [
    {
      key: 'NEXT_PUBLIC_SUPABASE_AUTH_REDIRECT_URL',
      defaultValue: 'http://localhost:3000/auth/callback',
      description: 'OAuth & magic link callback URL for Supabase SSR session exchange',
      required: true,
    },
  ],
  'supabase-db': [
    {
      key: 'NEXT_PUBLIC_SUPABASE_URL',
      defaultValue: 'https://your-project-ref.supabase.co',
      description: 'Supabase project URL for PostgreSQL 17 REST & Realtime endpoints',
      required: true,
    },
    {
      key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      defaultValue: 'replace-with-supabase-anon-key',
      description: 'Supabase anonymous public API key governed by Row-Level Security (RLS)',
      required: true,
    },
    {
      key: 'SUPABASE_SERVICE_ROLE_KEY',
      defaultValue: 'replace-with-supabase-service-role-key',
      description: 'Server-only Supabase administrative key for migrations and trusted jobs',
      required: false,
    },
  ],
  'pgvector-rag': [
    {
      key: 'EMBEDDING_DIMENSIONS',
      defaultValue: '1536',
      description: 'Vector dimensionality for pgvector HNSW halfvec cosine index',
      required: true,
    },
    {
      key: 'RAG_MATCH_THRESHOLD',
      defaultValue: '0.78',
      description: 'Minimum cosine similarity threshold for semantic retrieval chunks',
      required: false,
    },
  ],
  'edge-ai-gateway': [
    {
      key: 'OPENAI_API_KEY',
      defaultValue: 'sk-proj-replace-with-your-openai-api-key',
      description: 'API key for low-latency LLM streaming and embedding synthesis',
      required: true,
    },
    {
      key: 'AI_GATEWAY_MODEL',
      defaultValue: 'gpt-4o-mini',
      description: 'Default inference model identifier for the Edge AI Gateway',
      required: false,
    },
  ],
  'playwright-qa': [
    {
      key: 'PLAYWRIGHT_TEST_BASE_URL',
      defaultValue: 'http://127.0.0.1:3000',
      description: 'Base URL targeted by Playwright E2E and accessibility verification suites',
      required: false,
    },
  ],
  'docker-spaces': [
    {
      key: 'PORT',
      defaultValue: '7860',
      description: 'Container listening port for Hugging Face Spaces & standalone Docker runtime',
      required: true,
    },
  ],
};

function sanitizeKebabName(rawName: string): string {
  const cleaned = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned.length >= 2 ? cleaned.slice(0, 64) : 'antigravity-orbital-app';
}

function getModuleNpmDeps(mod: OrbitalModule): Record<string, string> {
  const explicit = mod.npmDependencies ?? FALLBACK_NPM_DEPENDENCIES[mod.id] ?? {};
  return { ...explicit };
}

function getModuleNpmDevDeps(mod: OrbitalModule): Record<string, string> {
  const explicit = mod.npmDevDependencies ?? FALLBACK_NPM_DEV_DEPENDENCIES[mod.id] ?? {};
  return { ...explicit };
}

function getModuleEnvVars(mod: OrbitalModule): NormalizedEnvVar[] {
  const rawEnv = (mod.envVars ?? []) as unknown;
  const result: NormalizedEnvVar[] = [];

  if (Array.isArray(rawEnv) && rawEnv.length > 0) {
    for (const entry of rawEnv) {
      if (typeof entry === 'string') {
        const eqIdx = entry.indexOf('=');
        const key = eqIdx >= 0 ? entry.slice(0, eqIdx).trim() : entry.trim();
        const defaultValue = eqIdx >= 0 ? entry.slice(eqIdx + 1).trim() : '';
        if (key) {
          result.push({
            key,
            defaultValue,
            description: `${mod.name} environment variable`,
            required: true,
            moduleId: mod.id,
            moduleName: mod.name,
          });
        }
      } else if (entry && typeof entry === 'object') {
        const record = entry as FlexibleEnvVarRecord;
        const key = (record.key ?? record.name ?? '').trim();
        if (key) {
          result.push({
            key,
            defaultValue: String(record.defaultValue ?? record.value ?? record.example ?? ''),
            description: String(
              record.description ?? record.comment ?? `${mod.name} configuration parameter`
            ),
            required: record.required ?? true,
            moduleId: mod.id,
            moduleName: mod.name,
          });
        }
      }
    }
  } else if (rawEnv && typeof rawEnv === 'object' && !Array.isArray(rawEnv)) {
    for (const [key, val] of Object.entries(rawEnv as Record<string, unknown>)) {
      result.push({
        key,
        defaultValue: String(val ?? ''),
        description: `${mod.name} configuration parameter`,
        required: true,
        moduleId: mod.id,
        moduleName: mod.name,
      });
    }
  }

  if (result.length > 0) {
    return result;
  }

  const fallback = FALLBACK_ENV_VARS[mod.id] ?? [];
  return fallback.map((item) => ({
    ...item,
    moduleId: mod.id,
    moduleName: mod.name,
  }));
}

/**
 * Resolves all transitive module dependencies from ORBITAL_MODULES and returns
 * a deterministic topological ordering where base dependencies precede dependents.
 */
export function resolveDependencyGraph(
  requestedIds: string[],
  customModules: OrbitalModule[] = []
): DependencyGraphResult {
  const combinedModules = [
    ...ORBITAL_MODULES,
    ...customModules.filter((c) => !ORBITAL_MODULES.some((m) => m.id === c.id)),
  ];
  const catalogMap = new Map<string, OrbitalModule>(combinedModules.map((m) => [m.id, m]));
  const catalogIndex = new Map<string, number>(combinedModules.map((m, idx) => [m.id, idx]));

  const initialRequested = Array.from(
    new Set(requestedIds.filter((id) => catalogMap.has(id)))
  );

  // Collect all reachable nodes (transitive closure of dependencies)
  const reachable = new Set<string>();
  const queue: string[] = [...initialRequested];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (reachable.has(currentId)) continue;
    const mod = catalogMap.get(currentId);
    if (!mod) continue;
    reachable.add(currentId);

    for (const depId of mod.dependencies ?? []) {
      if (catalogMap.has(depId) && !reachable.has(depId)) {
        queue.push(depId);
      }
    }
  }

  // Sort reachable IDs by catalog position so traversal is 100% deterministic
  const sortedReachable = Array.from(reachable).sort(
    (a, b) => (catalogIndex.get(a) ?? 999) - (catalogIndex.get(b) ?? 999)
  );

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const stack: string[] = [];
  const topologicalOrder: string[] = [];
  const dependencyEdges: DependencyEdge[] = [];
  const edgeKeys = new Set<string>();
  const cycles: string[][] = [];
  const seenCycleKeys = new Set<string>();

  const visit = (id: string) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      if (start >= 0) {
        const cycle = [...stack.slice(start), id];
        const key = cycle.join('>');
        if (!seenCycleKeys.has(key)) {
          seenCycleKeys.add(key);
          cycles.push(cycle);
        }
      }
      return;
    }
    const mod = catalogMap.get(id);
    if (!mod) return;

    visiting.add(id);
    stack.push(id);
    const deps = [...(mod.dependencies ?? [])].sort(
      (a, b) => (catalogIndex.get(a) ?? 999) - (catalogIndex.get(b) ?? 999)
    );

    for (const depId of deps) {
      if (reachable.has(depId)) {
        visit(depId);
        const edgeKey = `${depId}->${id}`;
        if (!edgeKeys.has(edgeKey)) {
          edgeKeys.add(edgeKey);
          dependencyEdges.push({ from: depId, to: id });
        }
      }
    }

    stack.pop();
    visiting.delete(id);
    visited.add(id);
    topologicalOrder.push(id);
  };

  for (const id of sortedReachable) {
    visit(id);
  }

  const requestedSet = new Set(initialRequested);
  const autoAddedIds = topologicalOrder.filter((id) => !requestedSet.has(id));

  return {
    resolvedIds: [...topologicalOrder],
    autoAddedIds,
    topologicalOrder,
    dependencyEdges,
    cycles,
  };
}

function synthesizePackageJson(
  projectName: string,
  description: string,
  modules: OrbitalModule[]
): string {
  const dependencies: Record<string, string> = {
    next: '^15.2.0',
    react: '^19.0.0',
    'react-dom': '^19.0.0',
  };

  const devDependencies: Record<string, string> = {
    '@types/node': '^22.13.4',
    '@types/react': '^19.0.10',
    '@types/react-dom': '^19.0.4',
    typescript: '^5.7.3',
  };

  for (const mod of modules) {
    for (const [pkg, version] of Object.entries(getModuleNpmDeps(mod))) {
      dependencies[pkg] = version;
    }
    for (const [pkg, version] of Object.entries(getModuleNpmDevDeps(mod))) {
      devDependencies[pkg] = version;
    }
  }

  const sortedDeps = Object.fromEntries(
    Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))
  );
  const sortedDevDeps = Object.fromEntries(
    Object.entries(devDependencies).sort(([a], [b]) => a.localeCompare(b))
  );

  const hasPlaywright = modules.some((m) => m.id === 'playwright-qa');
  const hasSupabase = modules.some((m) => m.id.startsWith('supabase-') || m.id === 'pgvector-rag');

  const scripts: Record<string, string> = {
    dev: 'next dev --turbopack',
    build: 'next build',
    start: 'next start',
    typecheck: 'tsc --noEmit',
  };

  if (hasPlaywright) {
    scripts['test:e2e'] = 'playwright test';
  }
  if (hasSupabase) {
    scripts['db:types'] = 'supabase gen types typescript --local > lib/database.types.ts';
  }

  return JSON.stringify(
    {
      name: projectName,
      version: '1.0.0',
      private: true,
      description,
      scripts,
      dependencies: sortedDeps,
      devDependencies: sortedDevDeps,
      antigravity: {
        synthesizerVersion: '2.5.0',
        modules: modules.map((m) => m.id),
      },
    },
    null,
    2
  );
}

function synthesizeTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        lib: ['dom', 'dom.iterable', 'esnext'],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'preserve',
        incremental: true,
        plugins: [{ name: 'next' }],
        paths: {
          '@/*': ['./*'],
        },
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
      exclude: ['node_modules'],
    },
    null,
    2
  );
}

function synthesizeEnvExample(
  projectName: string,
  modules: OrbitalModule[],
  envVars: NormalizedEnvVar[]
): string {
  const lines: string[] = [
    `# ============================================================================`,
    `# ${projectName.toUpperCase()} — ANTIGRAVITY ORBITAL ENVIRONMENT MANIFEST`,
    `# Synthesized Modules: ${modules.map((m) => m.id).join(', ')}`,
    `# Copy this file to .env.local before running \`npm run dev\``,
    `# ============================================================================`,
    ``,
  ];

  const byModule = new Map<string, NormalizedEnvVar[]>();
  for (const envVar of envVars) {
    const group = byModule.get(envVar.moduleId) ?? [];
    group.push(envVar);
    byModule.set(envVar.moduleId, group);
  }

  for (const mod of modules) {
    const group = byModule.get(mod.id) ?? [];
    if (group.length === 0) continue;
    lines.push(`# --- [${mod.id}] ${mod.name} (${mod.subtitle}) ---`);
    for (const item of group) {
      const reqLabel = item.required ? 'REQUIRED' : 'OPTIONAL';
      lines.push(`# [${reqLabel}] ${item.description}`);
      lines.push(`${item.key}="${item.defaultValue}"`);
    }
    lines.push(``);
  }

  return lines.join('\n').trimEnd() + '\n';
}

function synthesizeInteractiveAppPage(
  projectName: string,
  description: string,
  prompt: string,
  modules: OrbitalModule[],
  autoAddedIds: string[],
  gravityConfig: GravityConfig
): string {
  const moduleCardsJson = JSON.stringify(
    modules.map((m) => ({
      id: m.id,
      name: m.name,
      subtitle: m.subtitle,
      category: m.category,
      color: m.color,
      mass: m.mass,
      dependencies: m.dependencies,
      autoCaptured: autoAddedIds.includes(m.id),
      files: Object.keys(m.files ?? {}),
    })),
    null,
    2
  );

  return `'use client';

import React, { useState } from 'react';

interface SynthesizedModuleCard {
  id: string;
  name: string;
  subtitle: string;
  category: string;
  color: string;
  mass: number;
  dependencies: string[];
  autoCaptured: boolean;
  files: string[];
}

const ACTIVE_MODULES: SynthesizedModuleCard[] = ${moduleCardsJson};

export default function SynthesizedProjectPage() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string>(ACTIVE_MODULES[0]?.id ?? '');

  const categories = ['all', ...Array.from(new Set(ACTIVE_MODULES.map((m) => m.category)))];
  const visibleModules =
    activeCategory === 'all'
      ? ACTIVE_MODULES
      : ACTIVE_MODULES.filter((m) => m.category === activeCategory);

  const selectedModule =
    ACTIVE_MODULES.find((m) => m.id === selectedId) ?? ACTIVE_MODULES[0] ?? null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="rounded-2xl border border-cyan-500/30 bg-slate-900/70 p-6 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-cyan-400">
              Antigravity Synthesized Runtime • ${gravityConfig.kesslerMode ? 'Kessler Overdrive' : 'Nominal Orbit'} (${gravityConfig.rpm} RPM)
            </span>
            <h1 className="text-3xl font-bold tracking-tight mt-1">${projectName}</h1>
            <p className="text-sm text-slate-400 mt-1">${description.replace(/'/g, "\\'")}</p>
            ${
              prompt
                ? `<p className="text-xs font-mono text-cyan-300/90 mt-2">Prompt: &ldquo;${prompt.replace(/"/g, '&quot;')}&rdquo;</p>`
                : ''
            }
          </div>
          <div className="flex items-center gap-3">
            <a
              href="#modules-grid"
              className="px-4 py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/30 transition"
            >
              Explore {ACTIVE_MODULES.length} Active Modules
            </a>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={\`px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition cursor-pointer \${
                activeCategory === cat
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }\`}
            >
              {cat}
            </button>
          ))}
        </div>

        <section id="modules-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleModules.map((mod) => (
            <button
              key={mod.id}
              onClick={() => setSelectedId(mod.id)}
              className={\`text-left p-5 rounded-2xl border transition cursor-pointer \${
                selectedModule?.id === mod.id
                  ? 'bg-slate-900 border-cyan-400 shadow-lg shadow-cyan-500/10'
                  : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
              }\`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {mod.category}
                </span>
                {mod.autoCaptured && (
                  <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-400/30 px-2 py-0.5 rounded-full">
                    Auto-Dependency
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold mt-3 flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block"
                  style={{ backgroundColor: mod.color }}
                />
                {mod.name}
              </h2>
              <p className="text-xs text-slate-400 mt-1">{mod.subtitle}</p>
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>Mass: {mod.mass}u</span>
                <span>{mod.files.length} file(s)</span>
              </div>
            </button>
          ))}
        </section>

        {selectedModule && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
            <h3 className="text-lg font-bold">
              Module Telemetry: {selectedModule.name} ({selectedModule.id})
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Dependencies:{' '}
              {selectedModule.dependencies.length > 0
                ? selectedModule.dependencies.join(', ')
                : 'None (Root Base Module)'}
            </p>
            <div className="mt-4">
              <h4 className="text-xs font-mono uppercase text-cyan-400 mb-2">
                Synthesized Module Artifacts
              </h4>
              <ul className="space-y-1 text-xs font-mono text-slate-300">
                {selectedModule.files.map((filePath) => (
                  <li key={filePath} className="py-1 px-3 rounded bg-slate-950 border border-slate-800">
                    {filePath}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
`;
}

function synthesizeReadme(options: {
  projectName: string;
  description: string;
  prompt: string;
  modules: OrbitalModule[];
  autoAddedIds: string[];
  dependencyEdges: DependencyEdge[];
  envVars: NormalizedEnvVar[];
  gravityConfig: GravityConfig;
}): string {
  const {
    projectName,
    description,
    prompt,
    modules,
    autoAddedIds,
    dependencyEdges,
    envVars,
    gravityConfig,
  } = options;

  const mermaidLines: string[] = ['flowchart TD'];
  for (const mod of modules) {
    const safeNodeId = mod.id.replace(/[^a-zA-Z0-9_]/g, '_');
    const roleTag = autoAddedIds.includes(mod.id) ? ' [Auto-Captured]' : '';
    mermaidLines.push(`  ${safeNodeId}["${mod.name} (${mod.category})${roleTag}"]`);
  }
  for (const edge of dependencyEdges) {
    const fromSafe = edge.from.replace(/[^a-zA-Z0-9_]/g, '_');
    const toSafe = edge.to.replace(/[^a-zA-Z0-9_]/g, '_');
    mermaidLines.push(`  ${fromSafe} --> ${toSafe}`);
  }

  const envTableRows =
    envVars.length > 0
      ? envVars
          .map(
            (e) =>
              `| \`${e.key}\` | \`${e.defaultValue}\` | \`${e.moduleId}\` | ${
                e.required ? 'Yes' : 'No'
              } | ${e.description} |`
          )
          .join('\n')
      : '| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | `nextjs-app` | Yes | Base application URL |';

  const moduleRows = modules
    .map(
      (m) =>
        `- **${m.name}** (\`${m.id}\` — *${m.category}*): ${m.subtitle}${
          autoAddedIds.includes(m.id) ? ' *(Auto-resolved via dependency graph)*' : ''
        }`
    )
    .join('\n');

  return `# ${projectName}

${description}

> **Synthesized Prompt**: ${prompt || 'Orbital full-stack architecture synthesized via Antigravity Singularity Core.'}
> **Gravity Telemetry**: ${gravityConfig.rpm} RPM • Mode: ${
    gravityConfig.kesslerMode ? 'Kessler Syndrome Overdrive' : 'Standard Zero-G Orbit'
  }

## Active Orbital Modules (${modules.length})

${moduleRows}

## Topological Architecture Graph

\`\`\`mermaid
${mermaidLines.join('\n')}
\`\`\`

## Environment Variables

| Variable | Default Value | Module | Required | Description |
| :--- | :--- | :--- | :--- | :--- |
${envTableRows}

## Quickstart Commands

\`\`\`bash
# 1. Install merged dependencies
npm install

# 2. Configure local environment variables
cp .env.example .env.local

# 3. Start the Next.js 15 Turbopack development server
npm run dev

# 4. Verify production build and TypeScript AST
npm run build
\`\`\`
`;
}

/**
 * Synthesizes a complete, runnable multi-file project bundle from selected module IDs,
 * automatically resolving transitive dependencies and generating merged configuration files.
 */
export function synthesizeProject(options: SynthesizeProjectOptions): SynthesizedProjectResult {
  const projectName = sanitizeKebabName(options.projectName || 'antigravity-orbital-app');
  const description =
    options.description?.trim() ||
    `Full-stack orbital architecture synthesized by Antigravity Project Builder (${projectName}).`;
  const prompt = options.prompt?.trim() || 'Zero-G Full-Stack Singularity Blueprint';
  const gravityConfig: GravityConfig = options.gravityConfig ?? {
    rpm: 3.2,
    kesslerMode: false,
  };

  const requestedIds =
    options.moduleIds && options.moduleIds.length > 0 ? options.moduleIds : ['nextjs-app'];

  const customModules = options.customModules ?? [];
  const combinedModules = [
    ...ORBITAL_MODULES,
    ...customModules.filter((c) => !ORBITAL_MODULES.some((m) => m.id === c.id)),
  ];

  const graph = resolveDependencyGraph(requestedIds, customModules);
  const catalogMap = new Map<string, OrbitalModule>(combinedModules.map((m) => [m.id, m]));

  const modules: OrbitalModule[] = graph.topologicalOrder
    .map((id) => catalogMap.get(id))
    .filter((m): m is OrbitalModule => Boolean(m));

  const files: Record<string, string> = {};
  const fileOrigin = new Map<string, { category: string; moduleId: string }>();

  // 1. Collect all module files in topological order so dependent overrides are deterministic
  for (const mod of modules) {
    for (const [rawPath, content] of Object.entries(mod.files ?? {})) {
      const normalizedPath = rawPath.replace(/^\.?\/+/, '');
      files[normalizedPath] = content;
      fileOrigin.set(normalizedPath, {
        category: mod.category,
        moduleId: mod.id,
      });
    }
  }

  // 2. Collect and deduplicate environment variables across all resolved modules
  const seenEnvKeys = new Set<string>();
  const mergedEnvVars: NormalizedEnvVar[] = [];
  for (const mod of modules) {
    for (const envVar of getModuleEnvVars(mod)) {
      if (!seenEnvKeys.has(envVar.key)) {
        seenEnvKeys.add(envVar.key);
        mergedEnvVars.push(envVar);
      }
    }
  }

  // 3. Dynamically synthesize interactive app/page.tsx listing & linking all active modules
  files['app/page.tsx'] = synthesizeInteractiveAppPage(
    projectName,
    description,
    prompt,
    modules,
    graph.autoAddedIds,
    gravityConfig
  );
  fileOrigin.set('app/page.tsx', {
    category: 'frontend',
    moduleId: graph.resolvedIds.includes('nextjs-app') ? 'nextjs-app' : 'core-synthesizer',
  });

  // 4. Dynamically synthesize package.json, tsconfig.json, .env.example, and README.md
  files['package.json'] = synthesizePackageJson(projectName, description, modules);
  fileOrigin.set('package.json', { category: 'config', moduleId: 'core-synthesizer' });

  files['tsconfig.json'] = synthesizeTsConfig();
  fileOrigin.set('tsconfig.json', { category: 'config', moduleId: 'core-synthesizer' });

  files['.env.example'] = synthesizeEnvExample(projectName, modules, mergedEnvVars);
  fileOrigin.set('.env.example', { category: 'config', moduleId: 'core-synthesizer' });

  files['README.md'] = synthesizeReadme({
    projectName,
    description,
    prompt,
    modules,
    autoAddedIds: graph.autoAddedIds,
    dependencyEdges: graph.dependencyEdges,
    envVars: mergedEnvVars,
    gravityConfig,
  });
  fileOrigin.set('README.md', { category: 'documentation', moduleId: 'core-synthesizer' });

  // 5. Compute per-file metadata, total bundleBytes, filesCount, and deterministic SHA-256 digest
  const sortedPaths = Object.keys(files).sort((a, b) => a.localeCompare(b));
  const hash = crypto.createHash('sha256');
  const fileManifest: SynthesizedFileMeta[] = [];
  let bundleBytes = 0;

  for (const filePath of sortedPaths) {
    const content = files[filePath];
    const encoded = strToU8(content);
    const bytes = encoded.byteLength;
    bundleBytes += bytes;

    hash.update(`FILE:${filePath}:${bytes}\n`);
    hash.update(encoded);
    hash.update('\n');

    const origin = fileOrigin.get(filePath) ?? {
      category: 'core',
      moduleId: 'core-synthesizer',
    };

    fileManifest.push({
      path: filePath,
      bytes,
      category: origin.category,
      moduleId: origin.moduleId,
    });
  }

  const sha256 = hash.digest('hex');
  const filesCount = fileManifest.length;
  const generatedAt = new Date().toISOString();

  return {
    projectName,
    description,
    prompt,
    resolvedIds: graph.resolvedIds,
    autoAddedIds: graph.autoAddedIds,
    topologicalOrder: graph.topologicalOrder,
    dependencyEdges: graph.dependencyEdges,
    modules,
    files,
    fileManifest,
    filesMetadata: fileManifest,
    filesCount,
    bundleBytes,
    sha256,
    generatedAt,
    gravityConfig,
    manifest: {
      project: projectName,
      projectName,
      generatedAt,
      modules: graph.resolvedIds,
      resolvedIds: graph.resolvedIds,
      autoAddedIds: graph.autoAddedIds,
      topologicalOrder: graph.topologicalOrder,
      dependencyEdges: graph.dependencyEdges,
      filesCount,
      bundleBytes,
      sha256,
      fileManifest,
    },
  };
}

/**
 * Packages all synthesized project files into a standards-compliant binary .zip archive
 * rooted at `${projectName}/${filePath}` using fflate's synchronous deflate encoder.
 */
export function createProjectZipArchive(
  files: Record<string, string>,
  projectName: string
): Uint8Array {
  const cleanRoot = sanitizeKebabName(projectName || 'antigravity-orbital-app');
  const zipEntries: Record<string, Uint8Array> = {};

  const sortedPaths = Object.keys(files).sort((a, b) => a.localeCompare(b));
  for (const rawPath of sortedPaths) {
    const cleanPath = rawPath.replace(/^\.?\/+/, '');
    if (!cleanPath) continue;
    zipEntries[`${cleanRoot}/${cleanPath}`] = strToU8(files[rawPath] ?? '');
  }

  return zipSync(zipEntries, { level: 6 });
}
