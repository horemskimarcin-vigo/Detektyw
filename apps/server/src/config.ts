import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().default('pglite:./.data/pglite'),
  APP_URL: z.string().url().default('http://localhost:5173'),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Detektyw <no-reply@localhost>'),
  SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  CLIENT_DIST: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
  /** Opcjonalna warstwa LLM asystenta (wymaga ANTHROPIC_API_KEY). */
  ASSISTANT_LLM: z
    .enum(['on', 'off'])
    .default('off')
    .transform((v) => v === 'on'),
  ASSISTANT_LLM_MODEL: z.string().default('claude-opus-5-5'),
  ASSISTANT_LLM_MAX_PER_HOUR: z.coerce.number().int().min(1).default(30),
});

export interface Config {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl: string;
  appUrl: string;
  smtpUrl?: string;
  mailFrom: string;
  sessionDays: number;
  trustProxy: boolean;
  clientDist?: string;
  logLevel: string;
  cookieSecure: boolean;
  assistantLlm: boolean;
  assistantLlmModel: string;
  assistantLlmMaxPerHour: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = envSchema.parse(env);
  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    appUrl: e.APP_URL,
    smtpUrl: e.SMTP_URL,
    mailFrom: e.MAIL_FROM,
    sessionDays: e.SESSION_DAYS,
    trustProxy: e.TRUST_PROXY,
    clientDist: e.CLIENT_DIST,
    logLevel: e.LOG_LEVEL,
    cookieSecure: e.APP_URL.startsWith('https://'),
    assistantLlm: e.ASSISTANT_LLM,
    assistantLlmModel: e.ASSISTANT_LLM_MODEL,
    assistantLlmMaxPerHour: e.ASSISTANT_LLM_MAX_PER_HOUR,
  };
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'pglite:memory' }),
    logLevel: 'silent',
    ...overrides,
  };
}
