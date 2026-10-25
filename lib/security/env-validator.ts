import { z } from 'zod';

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (typeof val === 'string' && val.trim() === '' ? undefined : val), schema);

const RuntimeEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    NEXT_PUBLIC_APP_URL: emptyToUndefined(z.string().url().default('http://localhost:3000')),
    NEXT_PUBLIC_SUPABASE_URL: emptyToUndefined(z.string().url().optional()),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: emptyToUndefined(z.string().min(10).optional()),
    SUPABASE_SERVICE_ROLE_KEY: emptyToUndefined(z.string().min(10).optional()),
    OPENAI_API_KEY: emptyToUndefined(z.string().min(1).optional()),
    XAI_API_KEY: emptyToUndefined(z.string().min(1).optional()),
    AI_MODEL_ID: emptyToUndefined(z.string().default('grok-4.7')),
    AI_BASE_URL: emptyToUndefined(z.string().url().default('https://api.x.ai/v1')),
    EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
    RAG_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.72),
    RATE_LIMIT_RPM: z.coerce.number().int().positive().default(60),
    STRIPE_WEBHOOK_SECRET: emptyToUndefined(z.string().min(1).optional()),
    API_ADMIN_SECRET: emptyToUndefined(z.string().min(16).optional()),
    NEXT_PUBLIC_API_ADMIN_SECRET: emptyToUndefined(z.string().min(16).optional()),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.STRIPE_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STRIPE_WEBHOOK_SECRET'],
        message: 'STRIPE_WEBHOOK_SECRET is required when NODE_ENV=production',
      });
    }
    if (env.NODE_ENV === 'production' && !env.API_ADMIN_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['API_ADMIN_SECRET'],
        message: 'API_ADMIN_SECRET is required when NODE_ENV=production (mutates protected API routes)',
      });
    }
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
