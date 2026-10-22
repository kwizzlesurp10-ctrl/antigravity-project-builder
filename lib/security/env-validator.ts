import { z } from 'zod';

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (typeof val === 'string' && val.trim() === '' ? undefined : val), schema);

const RuntimeEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: emptyToUndefined(z.string().url().default('http://localhost:3000')),
  NEXT_PUBLIC_SUPABASE_URL: emptyToUndefined(z.string().url().optional()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: emptyToUndefined(z.string().min(10).optional()),
  SUPABASE_SERVICE_ROLE_KEY: emptyToUndefined(z.string().min(10).optional()),
  OPENAI_API_KEY: emptyToUndefined(z.string().min(1).optional()),
  AI_MODEL_ID: emptyToUndefined(z.string().default('gpt-4o-mini')),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  RAG_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.72),
  RATE_LIMIT_RPM: z.coerce.number().int().positive().default(60),
});

export type ValidatedEnv = z.infer<typeof RuntimeEnvSchema>;

export function validateRuntimeEnv(rawEnv: NodeJS.ProcessEnv = process.env): ValidatedEnv {
  const parsed = RuntimeEnvSchema.safeParse(rawEnv);
  if (!parsed.success) {
    throw new Error(
      `Invalid runtime environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`
    );
  }
  return parsed.data;
}
