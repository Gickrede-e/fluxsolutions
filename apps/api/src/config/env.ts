import { DEFAULT_ALLOWED_MIME_TYPES, DEFAULT_MAX_FILE_SIZE_BYTES, DEFAULT_MULTIPART_PART_SIZE_BYTES, parseBooleanEnv, splitCsv } from '@fluxsolutions/shared';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const currentFileDir = dirname(fileURLToPath(import.meta.url));
const apiRootDir = resolve(currentFileDir, '../..');
const repoRootDir = resolve(apiRootDir, '../..');

const envPaths = [
  resolve(repoRootDir, '.env'),
  resolve(apiRootDir, '.env'),
  resolve(process.cwd(), '.env'),
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1),

  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  WEB_BASE_URL: z.string().url().default('http://localhost:3000'),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(150),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_SHARE_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SHARE_VERIFICATION_TTL_SECONDS: z.coerce.number().int().positive().default(600),

  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z.string().optional(),

  MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(DEFAULT_MAX_FILE_SIZE_BYTES),
  MULTIPART_PART_SIZE_BYTES: z.coerce.number().int().positive().default(DEFAULT_MULTIPART_PART_SIZE_BYTES),
  ALLOWED_MIME_TYPES: z.string().optional(),
  PRESIGNED_URL_EXPIRES_SECONDS: z.coerce.number().int().positive().default(900),

  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1).optional(),
  S3_SECRET_KEY: z.string().min(1).optional(),
  MINIO_ROOT_USER: z.string().min(1).optional(),
  MINIO_ROOT_PASSWORD: z.string().min(1).optional(),
  S3_BUCKET: z.string().default('fluxsolutions-files'),
  S3_FORCE_PATH_STYLE: z.string().optional(),

  ENABLE_CLAMAV: z.string().optional(),
  CLAMAV_HOST: z.string().default('fluxsolutions-clamav'),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),

  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12).optional(),

  ENABLE_METRICS: z.string().optional(),
  SKIP_STARTUP_CHECKS: z.string().optional(),
});

const parsed = rawEnvSchema.parse(process.env);

const resolvedS3AccessKey = parsed.S3_ACCESS_KEY ?? parsed.MINIO_ROOT_USER;
const resolvedS3SecretKey = parsed.S3_SECRET_KEY ?? parsed.MINIO_ROOT_PASSWORD;

if (!resolvedS3AccessKey || !resolvedS3SecretKey) {
  throw new Error(
    'Missing object storage credentials. Set S3_ACCESS_KEY/S3_SECRET_KEY or MINIO_ROOT_USER/MINIO_ROOT_PASSWORD.',
  );
}

export const env = {
  ...parsed,
  S3_ACCESS_KEY: resolvedS3AccessKey,
  S3_SECRET_KEY: resolvedS3SecretKey,
  corsOrigins: splitCsv(parsed.CORS_ORIGIN),
  cookieSecure: parseBooleanEnv(parsed.COOKIE_SECURE, parsed.NODE_ENV === 'production'),
  s3ForcePathStyle: parseBooleanEnv(parsed.S3_FORCE_PATH_STYLE, true),
  enableClamav: parseBooleanEnv(parsed.ENABLE_CLAMAV, false),
  enableMetrics: parseBooleanEnv(parsed.ENABLE_METRICS, true),
  skipStartupChecks: parseBooleanEnv(parsed.SKIP_STARTUP_CHECKS, false),
  allowedMimeTypes: splitCsv(parsed.ALLOWED_MIME_TYPES).length
    ? splitCsv(parsed.ALLOWED_MIME_TYPES)
    : [...DEFAULT_ALLOWED_MIME_TYPES],
  s3PublicEndpoint: parsed.S3_PUBLIC_ENDPOINT ?? parsed.S3_ENDPOINT,
};

export type Env = typeof env;
