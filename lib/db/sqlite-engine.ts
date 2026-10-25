import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ORBITAL_MODULES, type OrbitalModule } from '@/lib/modules-catalog';

export interface BlueprintRecord {
  id: string;
  name: string;
  projectSlug: string;
  prompt: string;
  moduleIds: string[];
  gravityRpm: number;
  kesslerMode: boolean;
  filesCount: number;
  bundleBytes: number;
  sha256: string;
  createdAt: string;
}

export interface TelemetryRecord {
  id: string;
  eventType: string;
  projectName: string;
  moduleCount: number;
  filesCount: number;
  bundleBytes: number;
  durationMs: number;
  createdAt: string;
}

export interface VectorSearchResult {
  id: string;
  name: string;
  category: string;
  similarity: number;
  matchedTerms: string[];
}

const VECTOR_DIMENSIONS = 64;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'were', 'will', 'with', 'build', 'create', 'make',
  'app', 'application', 'project', 'system', 'using', 'need', 'want',
]);

/**
 * Domain concept clusters mapped to specific sub-ranges of the 64-dimensional vector:
 * - Cluster 0..11: AI / RAG / Vector / Embedding / LLM / Search
 * - Cluster 12..23: Auth / JWT / OAuth / Session / User / Login / RLS
 * - Cluster 24..35: DB / Postgres / SQL / Supabase / Schema / Storage / CRUD
 * - Cluster 36..47: UI / Frontend / React / Next / Tailwind / Glass / Animation / Motion / Anime / Orbit
 * - Cluster 48..63: DevOps / Docker / CI / Deploy / Vercel / Test / Playwright / QA / Security / Zod / Stripe / Billing / Payment
 */
interface ConceptRule {
  dimension: number;
  weight: number;
  terms: string[];
}

const DOMAIN_CONCEPT_RULES: ConceptRule[] = [
  // Cluster 0..11: AI / RAG / Vector / LLM / Search
  { dimension: 0, weight: 3.2, terms: ['ai', 'artificial', 'intelligence', 'genai', 'agent', 'agentic', 'autonomous'] },
  { dimension: 1, weight: 3.4, terms: ['rag', 'retrieval', 'augmented', 'knowledge', 'context', 'chunk', 'document'] },
  { dimension: 2, weight: 3.4, terms: ['vector', 'pgvector', 'halfvec', 'hnsw', 'ivfflat', 'index', 'subspace'] },
  { dimension: 3, weight: 3.2, terms: ['embed', 'embedding', 'embeddings', 'cosine', 'similarity', 'semantic', 'dense'] },
  { dimension: 4, weight: 3.2, terms: ['llm', 'openai', 'gpt', 'claude', 'gemini', 'anthropic', 'model', 'completion'] },
  { dimension: 5, weight: 2.8, terms: ['search', 'query', 'ranking', 'hybrid', 'match', 'filter', 'discover'] },
  { dimension: 6, weight: 3.0, terms: ['stream', 'streaming', 'sse', 'edge', 'gateway', 'rpc', 'deno', 'latency'] },
  { dimension: 7, weight: 2.8, terms: ['chat', 'chatbot', 'assistant', 'copilot', 'prompt', 'conversation', 'message'] },
  { dimension: 8, weight: 2.5, terms: ['token', 'inference', 'summarize', 'classify', 'synthesis', 'neural'] },
  { dimension: 9, weight: 2.5, terms: ['memory', 'store', 'recall', 'nearest', 'neighbor', 'knn', 'ann'] },
  { dimension: 10, weight: 2.4, terms: ['function', 'serverless', 'worker', 'webhook', 'pipeline', 'orchestration'] },
  { dimension: 11, weight: 2.4, terms: ['multimodal', 'vision', 'voice', 'transcript', 'ragops', 'eval'] },

  // Cluster 12..23: Auth / JWT / OAuth / Session / User / Login / RLS
  { dimension: 12, weight: 3.4, terms: ['auth', 'authentication', 'authorize', 'authorization', 'identity', 'iam'] },
  { dimension: 13, weight: 3.2, terms: ['jwt', 'token', 'bearer', 'claim', 'signature', 'jose', 'refresh'] },
  { dimension: 14, weight: 3.2, terms: ['oauth', 'oauth2', 'oidc', 'sso', 'social', 'github', 'google', 'provider'] },
  { dimension: 15, weight: 3.0, terms: ['session', 'cookie', 'ssr', 'middleware', 'stateless', 'persist'] },
  { dimension: 16, weight: 2.8, terms: ['user', 'users', 'account', 'profile', 'member', 'tenant', 'org', 'multi'] },
  { dimension: 17, weight: 3.0, terms: ['login', 'logout', 'signin', 'signup', 'register', 'password', 'magic', 'otp'] },
  { dimension: 18, weight: 3.2, terms: ['rls', 'policy', 'policies', 'row', 'permission', 'rbac', 'role', 'access'] },
  { dimension: 19, weight: 2.6, terms: ['anonymous', 'guest', 'invite', 'onboarding', 'verification', 'mfa', '2fa'] },
  { dimension: 20, weight: 2.6, terms: ['zero', 'trust', 'guard', 'protected', 'route', 'private', 'gate'] },
  { dimension: 21, weight: 2.4, terms: ['passkey', 'webauthn', 'biometric', 'credential', 'secret', 'hash'] },
  { dimension: 22, weight: 2.4, terms: ['admin', 'moderator', 'owner', 'audit', 'governance', 'compliance'] },
  { dimension: 23, weight: 2.4, terms: ['directory', 'saml', 'enterprise', 'team', 'workspace', 'acl'] },

  // Cluster 24..35: DB / Postgres / SQL / Supabase / Schema / Storage / CRUD
  { dimension: 24, weight: 3.4, terms: ['db', 'database', 'datastore', 'persistence', 'oltp', 'acid', 'transaction'] },
  { dimension: 25, weight: 3.4, terms: ['postgres', 'postgresql', 'pg', 'pg17', 'relational', 'table', 'column'] },
  { dimension: 26, weight: 3.2, terms: ['sql', 'ddl', 'dml', 'query', 'join', 'foreign', 'primary', 'constraint'] },
  { dimension: 27, weight: 3.4, terms: ['supabase', 'postgrest', 'realtime', 'channel', 'broadcast', 'presence'] },
  { dimension: 28, weight: 3.0, terms: ['schema', 'migration', 'seed', 'model', 'entity', 'relation', 'orm', 'drizzle'] },
  { dimension: 29, weight: 2.8, terms: ['storage', 'bucket', 'blob', 'upload', 'file', 'media', 's3', 'cdn'] },
  { dimension: 30, weight: 2.8, terms: ['crud', 'insert', 'select', 'update', 'delete', 'upsert', 'mutation'] },
  { dimension: 31, weight: 2.8, terms: ['sync', 'live', 'websocket', 'subscription', 'event', 'replication'] },
  { dimension: 32, weight: 2.6, terms: ['jsonb', 'trigger', 'procedure', 'view', 'materialized', 'partition'] },
  { dimension: 33, weight: 2.5, terms: ['pool', 'pgbouncer', 'connection', 'replica', 'scale', 'sharding'] },
  { dimension: 34, weight: 2.5, terms: ['backup', 'snapshot', 'point', 'recovery', 'wal', 'archive', 'ledger'] },
  { dimension: 35, weight: 2.5, terms: ['analytics', 'telemetry', 'timeseries', 'log', 'metric', 'aggregation'] },

  // Cluster 36..47: UI / Frontend / React / Next / Tailwind / Glass / Animation / Motion / Anime / Orbit
  { dimension: 36, weight: 3.2, terms: ['ui', 'ux', 'interface', 'design', 'component', 'layout', 'view', 'screen'] },
  { dimension: 37, weight: 3.2, terms: ['frontend', 'client', 'browser', 'web', 'spa', 'pwa', 'responsive', 'mobile'] },
  { dimension: 38, weight: 3.4, terms: ['react', 'react19', 'hook', 'rsc', 'server', 'action', 'suspense', 'jsx', 'tsx'] },
  { dimension: 39, weight: 3.4, terms: ['next', 'nextjs', 'nextjs15', 'router', 'ppr', 'turbopack', 'appdir'] },
  { dimension: 40, weight: 3.4, terms: ['tailwind', 'tailwindcss', 'css', 'style', 'theme', 'dark', 'token', 'utility'] },
  { dimension: 41, weight: 3.2, terms: ['glass', 'glassmorphism', 'backdrop', 'blur', 'neon', 'glow', 'hud', 'obsidian'] },
  { dimension: 42, weight: 3.4, terms: ['animation', 'animate', 'transition', 'keyframe', 'choreography', 'timeline'] },
  { dimension: 43, weight: 3.4, terms: ['motion', 'physics', 'spring', 'gravity', 'velocity', 'inertia', '60fps'] },
  { dimension: 44, weight: 3.4, terms: ['anime', 'animejs', 'canvas', 'svg', 'webgl', 'three', 'shader', 'particle'] },
  { dimension: 45, weight: 3.2, terms: ['orbit', 'orbital', 'constellation', 'space', 'zero', 'kessler', 'spatial'] },
  { dimension: 46, weight: 3.4, terms: ['zustand', 'state', 'store', 'slice', 'selector', 'immutable', 'flux', 'redux'] },
  { dimension: 47, weight: 2.8, terms: ['dashboard', 'studio', 'canvas', 'interactive', 'creative', 'portfolio', 'landing'] },

  // Cluster 48..63: DevOps / Docker / CI / Deploy / Vercel / Test / Playwright / QA / Security / Zod / Stripe / Billing / Payment
  { dimension: 48, weight: 3.2, terms: ['devops', 'infra', 'infrastructure', 'platform', 'cloud', 'ops', 'sre'] },
  { dimension: 49, weight: 3.4, terms: ['docker', 'dockerfile', 'container', 'alpine', 'image', 'compose', 'kubernetes'] },
  { dimension: 50, weight: 3.2, terms: ['ci', 'cd', 'cicd', 'pipeline', 'workflow', 'github', 'action', 'automation'] },
  { dimension: 51, weight: 3.2, terms: ['deploy', 'deployment', 'release', 'production', 'hosting', 'standalone'] },
  { dimension: 52, weight: 3.2, terms: ['vercel', 'huggingface', 'hf', 'spaces', 'edge', 'cdn', 'preview'] },
  { dimension: 53, weight: 3.2, terms: ['test', 'testing', 'spec', 'assert', 'expect', 'suite', 'coverage', 'regression'] },
  { dimension: 54, weight: 3.4, terms: ['playwright', 'e2e', 'endtoend', 'chromium', 'headless', 'browser', 'automation'] },
  { dimension: 55, weight: 3.2, terms: ['qa', 'quality', 'a11y', 'accessibility', 'visual', 'snapshot', 'matrix'] },
  { dimension: 56, weight: 3.4, terms: ['security', 'secure', 'shield', 'owasp', 'csrf', 'xss', 'sanitize', 'hardening'] },
  { dimension: 57, weight: 3.4, terms: ['zod', 'validation', 'validate', 'validator', 'parse', 'safe', 'type', 'runtime'] },
  { dimension: 58, weight: 3.6, terms: ['stripe', 'checkout', 'webhook', 'customer', 'portal', 'merchant'] },
  { dimension: 59, weight: 3.6, terms: ['billing', 'subscription', 'plan', 'tier', 'metered', 'usage', 'seat', 'saas'] },
  { dimension: 60, weight: 3.6, terms: ['payment', 'pay', 'invoice', 'fintech', 'money', 'currency', 'card', 'revenue'] },
  { dimension: 61, weight: 2.8, terms: ['rate', 'limit', 'ratelimit', 'throttle', 'ddos', 'firewall', 'waf'] },
  { dimension: 62, weight: 2.8, terms: ['env', 'config', 'secret', 'vault', 'typescript', 'strict', 'contract'] },
  { dimension: 63, weight: 2.8, terms: ['monitor', 'health', 'probe', 'uptime', 'alert', 'trace', 'observability'] },
];

const SUPPLEMENTAL_MODULE_METADATA: Record<
  string,
  { name: string; category: string; keywords: string }
> = {
  'nextjs-app': {
    name: 'Next.js 15 App Router',
    category: 'frontend',
    keywords:
      'nextjs next react react19 frontend ui app router ppr server actions rsc suspense web typescript layout page routing dashboard',
  },
  'tailwind-design': {
    name: 'Tailwind v4 Glass UI',
    category: 'frontend',
    keywords:
      'tailwind tailwindcss css design system glass glassmorphism ui ux dark mode theme neon obsidian hud tokens responsive styling',
  },
  'anime-physics': {
    name: 'Anime.js Motion Engine',
    category: 'frontend',
    keywords:
      'anime animejs motion physics animation spring 60fps orbital choreography interactive creative studio canvas svg transition velocity',
  },
  'zustand-state': {
    name: 'Zustand Orbital Store',
    category: 'frontend',
    keywords:
      'zustand state management store client slice selector reactive persist undo redo flux frontend state sync',
  },
  'supabase-auth': {
    name: 'Supabase Auth + SSR',
    category: 'backend',
    keywords:
      'supabase auth authentication jwt oauth2 sso session cookie middleware user login signup RBAC identity zero trust security',
  },
  'supabase-db': {
    name: 'PostgreSQL 17 Core',
    category: 'database',
    keywords:
      'supabase db database postgres postgresql 17 sql schema rls row level security realtime crud storage table migration',
  },
  'pgvector-rag': {
    name: 'pgvector HNSW Engine',
    category: 'ai',
    keywords:
      'pgvector vector rag retrieval augmented generation embedding halfvec hnsw semantic search similarity cosine ai knowledge index',
  },
  'edge-ai-gateway': {
    name: 'Edge AI Streamer',
    category: 'ai',
    keywords:
      'edge ai llm gateway streaming openai claude gemini inference embedding rpc deno serverless agentic chat assistant',
  },
  'stripe-billing': {
    name: 'Stripe Billing & Webhooks',
    category: 'backend',
    keywords:
      'stripe billing payment checkout subscription webhook fintech invoice metered usage saas pricing revenue customer portal card',
  },
  'zod-security': {
    name: 'Zod API Shield',
    category: 'backend',
    keywords:
      'zod security validation schema parser sanitize api shield csrf xss rate limit owasp runtime typesafe contract guard',
  },
  'playwright-qa': {
    name: 'Playwright E2E Shield',
    category: 'devops',
    keywords:
      'playwright qa test testing e2e end-to-end visual regression accessibility a11y matrix headless browser assertion spec',
  },
  'docker-spaces': {
    name: 'Vercel + HF Spaces CI',
    category: 'devops',
    keywords:
      'docker dockerfile container vercel huggingface hf spaces ci cd deploy deployment standalone alpine devops cloud pipeline',
  },
};

function normalizeToken(raw: string): string {
  const clean = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (clean.length <= 3) return clean;
  if (clean.endsWith('ings') && clean.length > 6) return clean.slice(0, -4);
  if (clean.endsWith('ing') && clean.length > 5) return clean.slice(0, -3);
  if (clean.endsWith('ations') && clean.length > 8) return clean.slice(0, -6);
  if (clean.endsWith('ation') && clean.length > 7) return clean.slice(0, -5);
  if (clean.endsWith('ments') && clean.length > 7) return clean.slice(0, -5);
  if (clean.endsWith('ment') && clean.length > 6) return clean.slice(0, -4);
  if (clean.endsWith('ies') && clean.length > 5) return `${clean.slice(0, -3)}y`;
  if (clean.endsWith('es') && clean.length > 4 && !clean.endsWith('ses')) return clean.slice(0, -2);
  if (clean.endsWith('s') && clean.length > 4 && !clean.endsWith('ss')) return clean.slice(0, -1);
  return clean;
}

export function tokenizeText(text: string): string[] {
  const rawTokens = text
    .toLowerCase()
    .split(/[^a-z0-9+#.-]+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

  const stemmed: string[] = [];
  for (const token of rawTokens) {
    stemmed.push(token);
    const norm = normalizeToken(token);
    if (norm && norm !== token && norm.length >= 2) {
      stemmed.push(norm);
    }
    if (token.includes('-')) {
      for (const part of token.split('-')) {
        if (part.length >= 2 && !STOP_WORDS.has(part)) {
          stemmed.push(part);
          const normPart = normalizeToken(part);
          if (normPart && normPart !== part) stemmed.push(normPart);
        }
      }
    }
  }
  return stemmed;
}

function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Generates a deterministic, L2-normalized 64-dimensional semantic vector embedding.
 * Combines 5 architectural domain concept clusters (dims 0..63), token/bigram hashing,
 * and character trigram feature hashing across all 64 dimensions.
 */
export function computeSemanticEmbedding(text: string): number[] {
  const vec = new Float64Array(VECTOR_DIMENSIONS);
  const cleaned = (text || '').trim().toLowerCase();
  if (!cleaned) {
    return Array.from(vec);
  }

  const tokens = tokenizeText(cleaned);
  const tokenSet = new Set(tokens);

  // 1. Architectural domain concept cluster activation (dims 0..63)
  for (const rule of DOMAIN_CONCEPT_RULES) {
    let matches = 0;
    for (const term of rule.terms) {
      const normTerm = normalizeToken(term);
      if (tokenSet.has(term) || (normTerm && tokenSet.has(normTerm))) {
        matches += 1;
      } else {
        for (const tok of tokens) {
          if (tok.length >= 4 && (tok.startsWith(term) || term.startsWith(tok))) {
            matches += 0.45;
            break;
          }
        }
      }
    }
    if (matches > 0) {
      vec[rule.dimension] += rule.weight * (1 + Math.log1p(matches));
    }
  }

  // 2. Token + Bigram feature hashing across all 64 dimensions
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const h1 = fnv1aHash(`tok:${tok}`);
    const dim1 = h1 % VECTOR_DIMENSIONS;
    const dim2 = ((h1 >>> 8) ^ fnv1aHash(`alt:${tok}`)) % VECTOR_DIMENSIONS;
    vec[dim1] += 0.55;
    vec[dim2] += 0.25;

    if (i + 1 < tokens.length) {
      const bigram = `${tok}_${tokens[i + 1]}`;
      const hb = fnv1aHash(`bi:${bigram}`);
      vec[hb % VECTOR_DIMENSIONS] += 0.4;
    }
  }

  // 3. Character trigram feature hashing across all 64 dimensions
  const compact = cleaned.replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i <= compact.length - 3; i++) {
    const trigram = compact.slice(i, i + 3);
    if (trigram.includes(' ')) continue;
    const ht = fnv1aHash(`tri:${trigram}`);
    vec[ht % VECTOR_DIMENSIONS] += 0.08;
  }

  // 4. L2-normalize so cosineSimilarity(vecA, vecB) is an exact dot product in [0, 1]
  let sumSq = 0;
  for (let i = 0; i < VECTOR_DIMENSIONS; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm > 1e-12) {
    for (let i = 0; i < VECTOR_DIMENSIONS; i++) {
      vec[i] = Number((vec[i] / norm).toFixed(6));
    }
  }

  return Array.from(vec);
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const len = Math.min(vecA.length, vecB.length);
  let dot = 0;
  for (let i = 0; i < len; i++) {
    dot += vecA[i] * vecB[i];
  }
  return Math.max(0, Math.min(1, Number(dot.toFixed(4))));
}

function buildModuleCorpus(mod: OrbitalModule): string {
  const extra = SUPPLEMENTAL_MODULE_METADATA[mod.id]?.keywords ?? '';
  const maybeKeywords = Array.isArray((mod as unknown as { keywords?: string[] }).keywords)
    ? ((mod as unknown as { keywords: string[] }).keywords).join(' ')
    : '';
  const maybeTags = Array.isArray((mod as unknown as { tags?: string[] }).tags)
    ? ((mod as unknown as { tags: string[] }).tags).join(' ')
    : '';
  const maybeDesc =
    typeof (mod as unknown as { description?: string }).description === 'string'
      ? (mod as unknown as { description: string }).description
      : '';
  const fileNames = Object.keys(mod.files || {}).join(' ');
  return [
    mod.id,
    mod.name,
    mod.subtitle,
    mod.category,
    mod.dependencies.join(' '),
    maybeKeywords,
    maybeTags,
    maybeDesc,
    fileNames,
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

function computeBundleStats(moduleIds: string[]): {
  filesCount: number;
  bundleBytes: number;
  sha256: string;
} {
  const catalogMap = new Map(ORBITAL_MODULES.map((m) => [m.id, m]));
  const hash = crypto.createHash('sha256');
  let filesCount = 4; // package.json, tsconfig.json, README.md, .env.example
  let bundleBytes = 1840;

  for (const id of moduleIds) {
    const mod = catalogMap.get(id);
    if (mod) {
      const entries = Object.entries(mod.files);
      filesCount += entries.length;
      for (const [filePath, content] of entries) {
        bundleBytes += Buffer.byteLength(content, 'utf8') + filePath.length;
        hash.update(`${filePath}:${content}`);
      }
    } else {
      filesCount += 2;
      bundleBytes += 640;
      hash.update(`module:${id}`);
    }
  }

  return {
    filesCount,
    bundleBytes,
    sha256: hash.digest('hex'),
  };
}

/**
 * Local SQLite is development-only. On Vercel / Lambda the filesystem under
 * `/tmp` is ephemeral and must not be used as a durable store.
 *
 * Production durable path: configure Supabase/Postgres using the schema at
 * `supabase/migrations/20250101000000_antigravity_schema.sql` with:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   - SUPABASE_SERVICE_ROLE_KEY
 */
export function getDataDir(): string {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const message = [
      'SQLite /tmp persistence is disabled on Vercel/Lambda.',
      'Configure durable Supabase/Postgres instead of relying on ephemeral /tmp storage.',
      'Required env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.',
      'Apply schema: supabase/migrations/20250101000000_antigravity_schema.sql',
    ].join(' ');
    console.error(`[antigravity:persistence] ${message}`);
    throw new Error(message);
  }
  return path.join(process.cwd(), '.data');
}

let dbInstance: DatabaseSync | null = null;
let lastSeededModuleCount = 0;

function getDatabase(): DatabaseSync {
  if (dbInstance) {
    if (ORBITAL_MODULES.length !== lastSeededModuleCount) {
      seedModuleVectors(dbInstance);
    }
    return dbInstance;
  }

  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'antigravity.sqlite');

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS orbital_module_vectors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      corpus TEXT NOT NULL,
      embedding_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_blueprints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      project_slug TEXT NOT NULL,
      prompt TEXT NOT NULL,
      module_ids_json TEXT NOT NULL,
      gravity_rpm REAL NOT NULL DEFAULT 1.0,
      kessler_mode INTEGER NOT NULL DEFAULT 0,
      files_count INTEGER NOT NULL DEFAULT 0,
      bundle_bytes INTEGER NOT NULL DEFAULT 0,
      sha256 TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telemetry_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      project_name TEXT NOT NULL,
      module_count INTEGER NOT NULL,
      files_count INTEGER NOT NULL,
      bundle_bytes INTEGER NOT NULL,
      duration_ms REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rag_documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'architecture',
      project_id TEXT NOT NULL DEFAULT 'global',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      embedding_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS custom_orbital_modules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      color TEXT NOT NULL,
      mass INTEGER NOT NULL DEFAULT 15,
      base_angle INTEGER NOT NULL DEFAULT 45,
      dependencies_json TEXT NOT NULL DEFAULT '["nextjs-app"]',
      npm_dependencies_json TEXT NOT NULL DEFAULT '{}',
      env_vars_json TEXT NOT NULL DEFAULT '[]',
      keywords_json TEXT NOT NULL DEFAULT '[]',
      files_json TEXT NOT NULL DEFAULT '{}',
      embedding_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      customer_email TEXT NOT NULL DEFAULT '',
      subscription_status TEXT NOT NULL DEFAULT 'active',
      payload_json TEXT NOT NULL DEFAULT '{}',
      verified INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `);

  seedModuleVectors(db);
  seedStarterBlueprints(db);
  seedStarterRagDocuments(db);

  dbInstance = db;
  return db;
}

function seedModuleVectors(db: DatabaseSync): void {
  const now = new Date().toISOString();
  const upsertStmt = db.prepare(`
    INSERT INTO orbital_module_vectors (id, name, category, corpus, embedding_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      corpus = excluded.corpus,
      embedding_json = excluded.embedding_json,
      updated_at = excluded.updated_at
  `);

  const seenIds = new Set<string>();

  for (const mod of ORBITAL_MODULES) {
    seenIds.add(mod.id);
    const corpus = buildModuleCorpus(mod);
    const embedding = computeSemanticEmbedding(corpus);
    upsertStmt.run(
      mod.id,
      mod.name,
      mod.category,
      corpus,
      JSON.stringify(embedding),
      now
    );
  }

  // Ensure all 12 canonical orbital modules are indexed even if catalog is mid-expansion
  for (const [id, meta] of Object.entries(SUPPLEMENTAL_MODULE_METADATA)) {
    if (seenIds.has(id)) continue;
    const corpus = `${id} ${meta.name} ${meta.category} ${meta.keywords}`;
    const embedding = computeSemanticEmbedding(corpus);
    upsertStmt.run(
      id,
      meta.name,
      meta.category,
      corpus,
      JSON.stringify(embedding),
      now
    );
  }

  lastSeededModuleCount = ORBITAL_MODULES.length;
}

function seedStarterBlueprints(db: DatabaseSync): void {
  const countRow = db
    .prepare('SELECT COUNT(*) as count FROM project_blueprints')
    .get() as { count: number } | undefined;

  if (countRow && countRow.count > 0) {
    return;
  }

  const allTwelveModuleIds = [
    'nextjs-app',
    'tailwind-design',
    'anime-physics',
    'zustand-state',
    'supabase-auth',
    'supabase-db',
    'pgvector-rag',
    'edge-ai-gateway',
    'stripe-billing',
    'zod-security',
    'playwright-qa',
    'docker-spaces',
  ];

  const starters: Array<{
    id: string;
    name: string;
    projectSlug: string;
    prompt: string;
    moduleIds: string[];
    gravityRpm: number;
    kesslerMode: number;
  }> = [
    {
      id: 'bp-ai-rag-saas',
      name: 'AI RAG SaaS Starter',
      projectSlug: 'ai-rag-saas-starter',
      prompt:
        'Build a multi-tenant AI RAG SaaS platform with pgvector semantic search, edge LLM streaming, Supabase Auth + PostgreSQL RLS, Tailwind glass UI, and Zod API validation.',
      moduleIds: [
        'nextjs-app',
        'tailwind-design',
        'supabase-auth',
        'supabase-db',
        'pgvector-rag',
        'edge-ai-gateway',
        'zod-security',
      ],
      gravityRpm: 1.25,
      kesslerMode: 0,
    },
    {
      id: 'bp-zero-g-enterprise',
      name: 'Zero-G Full-Stack Enterprise',
      projectSlug: 'zero-g-fullstack-enterprise',
      prompt:
        'Full-spectrum enterprise constellation uniting Next.js 15, Tailwind v4, Anime.js physics, Zustand state, Supabase Auth & DB, pgvector RAG, Edge AI, Stripe billing, Zod security, Playwright E2E, and Docker CI.',
      moduleIds: allTwelveModuleIds,
      gravityRpm: 1.6,
      kesslerMode: 0,
    },
    {
      id: 'bp-fintech-billing-core',
      name: 'Realtime FinTech & Billing Core',
      projectSlug: 'realtime-fintech-billing-core',
      prompt:
        'High-assurance FinTech billing engine with Stripe subscription webhooks, Supabase PostgreSQL ledger + SSR Auth, Zustand realtime store, Zod schema guards, and Playwright E2E verification.',
      moduleIds: [
        'nextjs-app',
        'zustand-state',
        'supabase-auth',
        'supabase-db',
        'stripe-billing',
        'zod-security',
        'playwright-qa',
      ],
      gravityRpm: 1.15,
      kesslerMode: 0,
    },
    {
      id: 'bp-motion-creative-studio',
      name: 'Motion-First Creative Studio',
      projectSlug: 'motion-first-creative-studio',
      prompt:
        '60fps orbital design studio powered by Next.js 15, Tailwind v4 glassmorphism, Anime.js spring physics choreography, Zustand spatial state, and standalone Docker Spaces deployment.',
      moduleIds: [
        'nextjs-app',
        'tailwind-design',
        'anime-physics',
        'zustand-state',
        'docker-spaces',
      ],
      gravityRpm: 1.45,
      kesslerMode: 0,
    },
  ];

  const insertBlueprint = db.prepare(`
    INSERT INTO project_blueprints (
      id, name, project_slug, prompt, module_ids_json,
      gravity_rpm, kessler_mode, files_count, bundle_bytes, sha256, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertTelemetry = db.prepare(`
    INSERT INTO telemetry_events (
      id, event_type, project_name, module_count, files_count, bundle_bytes, duration_ms, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const baseTime = Date.now() - 1000 * 60 * 15;

  starters.forEach((starter, index) => {
    const stats = computeBundleStats(starter.moduleIds);
    const createdAt = new Date(baseTime + index * 60_000).toISOString();
    insertBlueprint.run(
      starter.id,
      starter.name,
      starter.projectSlug,
      starter.prompt,
      JSON.stringify(starter.moduleIds),
      starter.gravityRpm,
      starter.kesslerMode,
      stats.filesCount,
      stats.bundleBytes,
      stats.sha256,
      createdAt
    );

    insertTelemetry.run(
      `tel-seed-${index + 1}`,
      'BLUEPRINT_SYNTHESIS',
      starter.projectSlug,
      starter.moduleIds.length,
      stats.filesCount,
      stats.bundleBytes,
      Number((14.2 + index * 3.7).toFixed(2)),
      createdAt
    );
  });
}

function seedStarterRagDocuments(db: DatabaseSync): void {
  const countRow = db
    .prepare('SELECT COUNT(*) as count FROM rag_documents')
    .get() as { count: number } | undefined;

  if (countRow && countRow.count > 0) {
    return;
  }

  const playbooks = [
    {
      id: 'rag-doc-zero-trust-rls',
      title: 'Zero-Trust PostgreSQL 17 Row-Level Security & JWT Claims Playbook',
      category: 'security',
      content:
        'Enforce Row-Level Security (RLS) on every public table using `alter table public.<name> enable row level security;`. Always wrap `auth.uid()` in a scalar subquery `(select auth.uid()) = user_id` so PostgreSQL 17 caches the JWT claim per statement rather than re-evaluating per row. Pair database policies with Zod runtime environment validation (`validateRuntimeEnv`) and sliding-window IP rate limiting (`checkSlidingWindowRateLimit`).',
      metadata: { moduleIds: ['supabase-db', 'supabase-auth', 'zod-security'], version: '17.0' },
    },
    {
      id: 'rag-doc-nextjs15-ppr',
      title: 'Next.js 15 App Router, Partial Prerendering (PPR), & Server Actions Architecture',
      category: 'frontend',
      content:
        'Next.js 15 App Router uses React 19 Server Components by default, async `cookies()` / `headers()` APIs, and `output: standalone` for minimal Docker container footprints. Configure strict security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`) in `next.config.ts` and cap Server Actions `bodySizeLimit` to `2mb`.',
      metadata: { moduleIds: ['nextjs-app', 'tailwind-design', 'docker-spaces'], version: '15.2' },
    },
    {
      id: 'rag-doc-pgvector-hnsw',
      title: 'pgvector halfvec(1536) HNSW Index Tuning & Hybrid Lexical-Cosine Retrieval',
      category: 'ai',
      content:
        'Use 16-bit `halfvec(1536)` columns with `halfvec_cosine_ops` HNSW indexes (`m = 16, ef_construction = 64`) to cut PostgreSQL vector memory usage by 50% while preserving >99% recall. Expose similarity search via a `language sql stable` RPC (`match_documents`) with explicit `set search_path = public, extensions` and combine dense cosine similarity with lexical token boosting.',
      metadata: { moduleIds: ['pgvector-rag', 'edge-ai-gateway', 'supabase-db'], version: '0.8.0' },
    },
    {
      id: 'rag-doc-stripe-idempotency',
      title: 'Cryptographic Stripe Webhook Verification & Idempotent Subscription State Machines',
      category: 'backend',
      content:
        'Read the raw HTTP request body via `await request.text()` and verify the `stripe-signature` header using `stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)`. Process `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted` idempotently by upserting subscription state keyed by Stripe event ID and customer ID.',
      metadata: { moduleIds: ['stripe-billing', 'zod-security', 'supabase-db'], version: '2024-11-20' },
    },
  ];

  const insertDoc = db.prepare(`
    INSERT INTO rag_documents (
      id, title, content, category, project_id, metadata_json, embedding_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  for (const doc of playbooks) {
    const embedding = computeSemanticEmbedding(`${doc.title} ${doc.category} ${doc.content}`);
    insertDoc.run(
      doc.id,
      doc.title,
      doc.content,
      doc.category,
      'global',
      JSON.stringify(doc.metadata),
      JSON.stringify(embedding),
      now
    );
  }
}

export function searchModulesByVector(
  prompt: string,
  threshold = 0.14
): Array<{
  id: string;
  name: string;
  category: string;
  similarity: number;
  matchedTerms: string[];
}> {
  const db = getDatabase();
  const cleanPrompt = (prompt || '').trim();
  if (!cleanPrompt) {
    return [];
  }

  const queryVec = computeSemanticEmbedding(cleanPrompt);
  const queryTokens = Array.from(new Set(tokenizeText(cleanPrompt)));

  const rows = db
    .prepare(
      'SELECT id, name, category, corpus, embedding_json FROM orbital_module_vectors'
    )
    .all() as Array<{
    id: string;
    name: string;
    category: string;
    corpus: string;
    embedding_json: string;
  }>;

  const customRows = db
    .prepare(
      'SELECT id, name, subtitle, description, category, keywords_json, embedding_json FROM custom_orbital_modules'
    )
    .all() as Array<{
    id: string;
    name: string;
    subtitle: string;
    description: string;
    category: string;
    keywords_json: string;
    embedding_json: string;
  }>;

  const activeCatalogIds = new Set(ORBITAL_MODULES.map((m) => m.id));
  const combinedRows = [
    ...rows.filter((r) => activeCatalogIds.size === 0 || activeCatalogIds.has(r.id)),
    ...customRows.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      corpus: `${c.id} ${c.name} ${c.subtitle} ${c.description} ${c.category} ${c.keywords_json}`,
      embedding_json: c.embedding_json,
    })),
  ];

  const results: Array<{
    id: string;
    name: string;
    category: string;
    similarity: number;
    matchedTerms: string[];
  }> = [];

  for (const row of combinedRows) {
    const docVec = JSON.parse(row.embedding_json) as number[];
    const docTokens = new Set(tokenizeText(row.corpus));

    const matchedTerms: string[] = [];
    for (const qTok of queryTokens) {
      if (qTok.length < 2) continue;
      if (docTokens.has(qTok)) {
        matchedTerms.push(qTok);
      } else {
        for (const dTok of docTokens) {
          if (
            qTok.length >= 4 &&
            dTok.length >= 4 &&
            (dTok.startsWith(qTok) || qTok.startsWith(dTok))
          ) {
            matchedTerms.push(qTok);
            break;
          }
        }
      }
    }

    const rawCosine = cosineSimilarity(queryVec, docVec);
    const lexicalBoost = Math.min(0.18, matchedTerms.length * 0.045);
    const similarity = Number(Math.min(0.99, rawCosine + lexicalBoost).toFixed(4));

    if (similarity >= threshold) {
      results.push({
        id: row.id,
        name: row.name,
        category: row.category,
        similarity,
        matchedTerms: Array.from(new Set(matchedTerms)).slice(0, 8),
      });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results;
}

export function listBlueprints(): BlueprintRecord[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT id, name, project_slug, prompt, module_ids_json, gravity_rpm,
              kessler_mode, files_count, bundle_bytes, sha256, created_at
       FROM project_blueprints
       ORDER BY created_at DESC`
    )
    .all() as Array<{
    id: string;
    name: string;
    project_slug: string;
    prompt: string;
    module_ids_json: string;
    gravity_rpm: number;
    kessler_mode: number;
    files_count: number;
    bundle_bytes: number;
    sha256: string;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    projectSlug: row.project_slug,
    prompt: row.prompt,
    moduleIds: JSON.parse(row.module_ids_json) as string[],
    gravityRpm: Number(row.gravity_rpm),
    kesslerMode: Boolean(row.kessler_mode),
    filesCount: Number(row.files_count),
    bundleBytes: Number(row.bundle_bytes),
    sha256: row.sha256,
    createdAt: row.created_at,
  }));
}

export function saveBlueprint(input: {
  name: string;
  projectSlug: string;
  prompt: string;
  moduleIds: string[];
  gravityRpm?: number;
  kesslerMode?: boolean;
  filesCount: number;
  bundleBytes: number;
  sha256: string;
}): BlueprintRecord {
  const db = getDatabase();
  const id = `bp-${crypto.randomUUID().slice(0, 12)}`;
  const createdAt = new Date().toISOString();
  const gravityRpm = typeof input.gravityRpm === 'number' ? input.gravityRpm : 1.0;
  const kesslerMode = Boolean(input.kesslerMode);
  const cleanModuleIds = Array.from(new Set(input.moduleIds));

  db.prepare(
    `INSERT INTO project_blueprints (
      id, name, project_slug, prompt, module_ids_json,
      gravity_rpm, kessler_mode, files_count, bundle_bytes, sha256, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name.trim() || 'Untitled Orbital Blueprint',
    input.projectSlug.trim() || 'antigravity-orbital-app',
    input.prompt.trim(),
    JSON.stringify(cleanModuleIds),
    gravityRpm,
    kesslerMode ? 1 : 0,
    input.filesCount,
    input.bundleBytes,
    input.sha256,
    createdAt
  );

  return {
    id,
    name: input.name.trim() || 'Untitled Orbital Blueprint',
    projectSlug: input.projectSlug.trim() || 'antigravity-orbital-app',
    prompt: input.prompt.trim(),
    moduleIds: cleanModuleIds,
    gravityRpm,
    kesslerMode,
    filesCount: input.filesCount,
    bundleBytes: input.bundleBytes,
    sha256: input.sha256,
    createdAt,
  };
}

export function deleteBlueprint(id: string): boolean {
  const db = getDatabase();
  const result = db
    .prepare('DELETE FROM project_blueprints WHERE id = ?')
    .run(id);
  return Number(result.changes) > 0;
}

export function recordTelemetry(event: {
  eventType: string;
  projectName: string;
  moduleCount: number;
  filesCount: number;
  bundleBytes: number;
  durationMs: number;
}): void {
  const db = getDatabase();
  const id = `tel-${crypto.randomUUID().slice(0, 12)}`;
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO telemetry_events (
      id, event_type, project_name, module_count, files_count, bundle_bytes, duration_ms, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    event.eventType,
    event.projectName,
    event.moduleCount,
    event.filesCount,
    event.bundleBytes,
    Number(event.durationMs.toFixed(2)),
    createdAt
  );
}

export interface RagDocumentRecord {
  id: string;
  title: string;
  content: string;
  category: string;
  projectId: string;
  metadata: Record<string, unknown>;
  similarity?: number;
  matchedTerms?: string[];
  createdAt: string;
}

export function getTelemetrySummary(): {
  totalSyntheses: number;
  avgDurationMs: number;
  totalBlueprints: number;
  vectorIndexSize: number;
  customModulesCount: number;
  ragDocumentsCount: number;
  stripeWebhookEventsCount: number;
  recentEvents: TelemetryRecord[];
} {
  const db = getDatabase();

  const statsRow = db
    .prepare(
      `SELECT COUNT(*) as total_syntheses, COALESCE(AVG(duration_ms), 0) as avg_duration_ms
       FROM telemetry_events`
    )
    .get() as { total_syntheses: number; avg_duration_ms: number } | undefined;

  const blueprintsRow = db
    .prepare('SELECT COUNT(*) as total_blueprints FROM project_blueprints')
    .get() as { total_blueprints: number } | undefined;

  const vectorsRow = db
    .prepare('SELECT COUNT(*) as vector_index_size FROM orbital_module_vectors')
    .get() as { vector_index_size: number } | undefined;

  const customModsRow = db
    .prepare('SELECT COUNT(*) as custom_modules_count FROM custom_orbital_modules')
    .get() as { custom_modules_count: number } | undefined;

  const ragDocsRow = db
    .prepare('SELECT COUNT(*) as rag_docs_count FROM rag_documents')
    .get() as { rag_docs_count: number } | undefined;

  const stripeEventsRow = db
    .prepare('SELECT COUNT(*) as stripe_events_count FROM stripe_webhook_events')
    .get() as { stripe_events_count: number } | undefined;

  const recentRows = db
    .prepare(
      `SELECT id, event_type, project_name, module_count, files_count, bundle_bytes, duration_ms, created_at
       FROM telemetry_events
       ORDER BY created_at DESC
       LIMIT 15`
    )
    .all() as Array<{
    id: string;
    event_type: string;
    project_name: string;
    module_count: number;
    files_count: number;
    bundle_bytes: number;
    duration_ms: number;
    created_at: string;
  }>;

  return {
    totalSyntheses: Number(statsRow?.total_syntheses ?? 0),
    avgDurationMs: Number((statsRow?.avg_duration_ms ?? 0).toFixed(2)),
    totalBlueprints: Number(blueprintsRow?.total_blueprints ?? 0),
    vectorIndexSize: Number(vectorsRow?.vector_index_size ?? 0),
    customModulesCount: Number(customModsRow?.custom_modules_count ?? 0),
    ragDocumentsCount: Number(ragDocsRow?.rag_docs_count ?? 0),
    stripeWebhookEventsCount: Number(stripeEventsRow?.stripe_events_count ?? 0),
    recentEvents: recentRows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      projectName: row.project_name,
      moduleCount: Number(row.module_count),
      filesCount: Number(row.files_count),
      bundleBytes: Number(row.bundle_bytes),
      durationMs: Number(row.duration_ms),
      createdAt: row.created_at,
    })),
  };
}

export function listRagDocuments(
  query?: string,
  threshold = 0.12,
  limit = 20
): RagDocumentRecord[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT id, title, content, category, project_id, metadata_json, embedding_json, created_at
       FROM rag_documents
       ORDER BY created_at DESC`
    )
    .all() as Array<{
    id: string;
    title: string;
    content: string;
    category: string;
    project_id: string;
    metadata_json: string;
    embedding_json: string;
    created_at: string;
  }>;

  const cleanQuery = (query || '').trim();
  if (!cleanQuery) {
    return rows.slice(0, limit).map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      category: r.category,
      projectId: r.project_id,
      metadata: JSON.parse(r.metadata_json || '{}') as Record<string, unknown>,
      createdAt: r.created_at,
    }));
  }

  const queryVec = computeSemanticEmbedding(cleanQuery);
  const queryTokens = Array.from(new Set(tokenizeText(cleanQuery)));
  const scored: RagDocumentRecord[] = [];

  for (const r of rows) {
    const docVec = JSON.parse(r.embedding_json) as number[];
    const docTokens = new Set(tokenizeText(`${r.title} ${r.category} ${r.content}`));
    const matchedTerms: string[] = [];

    for (const qTok of queryTokens) {
      if (docTokens.has(qTok)) {
        matchedTerms.push(qTok);
      } else {
        for (const dTok of docTokens) {
          if (qTok.length >= 4 && dTok.length >= 4 && (dTok.startsWith(qTok) || qTok.startsWith(dTok))) {
            matchedTerms.push(qTok);
            break;
          }
        }
      }
    }

    const rawCosine = cosineSimilarity(queryVec, docVec);
    const lexicalBoost = Math.min(0.22, matchedTerms.length * 0.05);
    const similarity = Number(Math.min(0.99, rawCosine + lexicalBoost).toFixed(4));

    if (similarity >= threshold) {
      scored.push({
        id: r.id,
        title: r.title,
        content: r.content,
        category: r.category,
        projectId: r.project_id,
        metadata: JSON.parse(r.metadata_json || '{}') as Record<string, unknown>,
        similarity,
        matchedTerms: Array.from(new Set(matchedTerms)).slice(0, 8),
        createdAt: r.created_at,
      });
    }
  }

  scored.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
  return scored.slice(0, limit);
}

export function saveRagDocument(input: {
  title: string;
  content: string;
  category?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
}): RagDocumentRecord {
  const db = getDatabase();
  const id = `rag-doc-${crypto.randomUUID().slice(0, 10)}`;
  const createdAt = new Date().toISOString();
  const title = input.title.trim();
  const content = input.content.trim();
  const category = (input.category || 'architecture').trim();
  const projectId = (input.projectId || 'global').trim();
  const metadata = input.metadata ?? {};
  const embedding = computeSemanticEmbedding(`${title} ${category} ${content}`);

  db.prepare(
    `INSERT INTO rag_documents (
      id, title, content, category, project_id, metadata_json, embedding_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    title,
    content,
    category,
    projectId,
    JSON.stringify(metadata),
    JSON.stringify(embedding),
    createdAt
  );

  return {
    id,
    title,
    content,
    category,
    projectId,
    metadata,
    createdAt,
  };
}

export function deleteRagDocument(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM rag_documents WHERE id = ?').run(id);
  return Number(result.changes) > 0;
}

export function listCustomModules(): OrbitalModule[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT id, name, subtitle, description, category, color, mass, base_angle,
              dependencies_json, npm_dependencies_json, env_vars_json, keywords_json, files_json
       FROM custom_orbital_modules
       ORDER BY created_at ASC`
    )
    .all() as Array<{
    id: string;
    name: string;
    subtitle: string;
    description: string;
    category: OrbitalModule['category'];
    color: string;
    mass: number;
    base_angle: number;
    dependencies_json: string;
    npm_dependencies_json: string;
    env_vars_json: string;
    keywords_json: string;
    files_json: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    subtitle: r.subtitle,
    description: r.description,
    category: r.category,
    color: r.color,
    mass: Number(r.mass),
    baseAngle: Number(r.base_angle),
    dependencies: JSON.parse(r.dependencies_json || '[]') as string[],
    npmDependencies: JSON.parse(r.npm_dependencies_json || '{}') as Record<string, string>,
    envVars: JSON.parse(r.env_vars_json || '[]') as OrbitalModule['envVars'],
    keywords: JSON.parse(r.keywords_json || '[]') as string[],
    files: JSON.parse(r.files_json || '{}') as Record<string, string>,
  }));
}

export function saveCustomModule(mod: OrbitalModule): OrbitalModule {
  const db = getDatabase();
  const createdAt = new Date().toISOString();
  const corpus = buildModuleCorpus(mod);
  const embedding = computeSemanticEmbedding(corpus);

  db.prepare(
    `INSERT INTO custom_orbital_modules (
      id, name, subtitle, description, category, color, mass, base_angle,
      dependencies_json, npm_dependencies_json, env_vars_json, keywords_json, files_json,
      embedding_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      subtitle = excluded.subtitle,
      description = excluded.description,
      category = excluded.category,
      color = excluded.color,
      mass = excluded.mass,
      base_angle = excluded.base_angle,
      dependencies_json = excluded.dependencies_json,
      npm_dependencies_json = excluded.npm_dependencies_json,
      env_vars_json = excluded.env_vars_json,
      keywords_json = excluded.keywords_json,
      files_json = excluded.files_json,
      embedding_json = excluded.embedding_json`
  ).run(
    mod.id,
    mod.name,
    mod.subtitle,
    mod.description,
    mod.category,
    mod.color,
    mod.mass,
    mod.baseAngle,
    JSON.stringify(mod.dependencies ?? []),
    JSON.stringify(mod.npmDependencies ?? {}),
    JSON.stringify(mod.envVars ?? []),
    JSON.stringify(mod.keywords ?? []),
    JSON.stringify(mod.files ?? {}),
    JSON.stringify(embedding),
    createdAt
  );

  return mod;
}

export function deleteCustomModule(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM custom_orbital_modules WHERE id = ?').run(id);
  return Number(result.changes) > 0;
}

export function getAllCatalogModules(): OrbitalModule[] {
  const custom = listCustomModules();
  const canonicalIds = new Set(ORBITAL_MODULES.map((m) => m.id));
  return [...ORBITAL_MODULES, ...custom.filter((c) => !canonicalIds.has(c.id))];
}

export interface StripeWebhookEventRecord {
  eventId: string;
  eventType: string;
  customerEmail: string;
  subscriptionStatus: string;
  payload: Record<string, unknown>;
  verified: boolean;
  createdAt: string;
}

export function recordStripeWebhookEvent(input: {
  eventId: string;
  eventType: string;
  customerEmail?: string;
  subscriptionStatus?: string;
  payload?: Record<string, unknown>;
  verified?: boolean;
}): { record: StripeWebhookEventRecord; idempotentReplay: boolean } {
  const db = getDatabase();
  const existing = db
    .prepare(
      `SELECT event_id, event_type, customer_email, subscription_status, payload_json, verified, created_at
       FROM stripe_webhook_events
       WHERE event_id = ?`
    )
    .get(input.eventId) as
    | {
        event_id: string;
        event_type: string;
        customer_email: string;
        subscription_status: string;
        payload_json: string;
        verified: number;
        created_at: string;
      }
    | undefined;

  if (existing) {
    return {
      record: {
        eventId: existing.event_id,
        eventType: existing.event_type,
        customerEmail: existing.customer_email,
        subscriptionStatus: existing.subscription_status,
        payload: JSON.parse(existing.payload_json || '{}') as Record<string, unknown>,
        verified: Boolean(existing.verified),
        createdAt: existing.created_at,
      },
      idempotentReplay: true,
    };
  }

  const createdAt = new Date().toISOString();
  const customerEmail = (input.customerEmail || 'architect@antigravity.dev').trim();
  const subscriptionStatus =
    input.subscriptionStatus ||
    (input.eventType === 'customer.subscription.deleted'
      ? 'canceled'
      : input.eventType === 'customer.subscription.updated'
        ? 'past_due'
        : 'active');
  const payload = input.payload ?? {};
  const verified = input.verified ?? true;

  db.prepare(
    `INSERT INTO stripe_webhook_events (
      event_id, event_type, customer_email, subscription_status, payload_json, verified, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.eventId,
    input.eventType,
    customerEmail,
    subscriptionStatus,
    JSON.stringify(payload),
    verified ? 1 : 0,
    createdAt
  );

  return {
    record: {
      eventId: input.eventId,
      eventType: input.eventType,
      customerEmail,
      subscriptionStatus,
      payload,
      verified,
      createdAt,
    },
    idempotentReplay: false,
  };
}

export function listStripeWebhookEvents(limit = 25): StripeWebhookEventRecord[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT event_id, event_type, customer_email, subscription_status, payload_json, verified, created_at
       FROM stripe_webhook_events
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    event_id: string;
    event_type: string;
    customer_email: string;
    subscription_status: string;
    payload_json: string;
    verified: number;
    created_at: string;
  }>;

  return rows.map((row) => ({
    eventId: row.event_id,
    eventType: row.event_type,
    customerEmail: row.customer_email,
    subscriptionStatus: row.subscription_status,
    payload: JSON.parse(row.payload_json || '{}') as Record<string, unknown>,
    verified: Boolean(row.verified),
    createdAt: row.created_at,
  }));
}


