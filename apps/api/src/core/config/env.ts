import "dotenv/config";
import { z } from "zod";

const integerFromEnv = (fallback: number) =>
  z.preprocess(
    (value) => value === undefined ? fallback : Number.parseInt(String(value), 10),
    z.number().int(),
  );

const maxUploadFromEnv = z.preprocess(
  (value) => Math.max(1, Number.parseInt(String(value ?? "100"), 10) || 100),
  z.number().int(),
);

const envSchema = z.object({
  PORT: integerFromEnv(8000).pipe(z.number().positive()),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NODE_ENV: z.string().default("development"),
  JWT_SECRET: z.string().optional(),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  APP_URL: z.string().optional(),
  CLIENT_URL: z.string().optional(),
  MAIL_USER: z.string().optional(),
  MAIL_APP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  MAIL_HOST: z.string().default("smtp.gmail.com"),
  MAIL_PORT: integerFromEnv(465).pipe(z.number().positive()),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  // Reverse-proxy hops in front of the API (Render = 1). 0 / unset = trust none.
  TRUST_PROXY: integerFromEnv(0).pipe(z.number().int().min(0)),
  MAX_UPLOAD_MB: maxUploadFromEnv,
  CRON_SECRET: z.string().optional(),
  FX_RATE_USD_PHP: z.preprocess(
    (value) => value === undefined ? 62.73 : Number.parseFloat(String(value)),
    z.number().finite(),
  ),
  FX_RATE_AS_OF: z.string().default("2026-09-22"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

const values = parsed.data;
if (values.NODE_ENV === "production" && !values.JWT_SECRET) {
  throw new Error("Invalid environment configuration: JWT_SECRET is required in production");
}

export const env = {
  PORT: values.PORT,
  DATABASE_URL: values.DATABASE_URL,
  NODE_ENV: values.NODE_ENV,
  JWT_SECRET: values.JWT_SECRET ?? "dev-secret-change-in-prod",
  CORS_ORIGIN: values.CORS_ORIGIN,
  APP_URL: (values.APP_URL ?? values.CLIENT_URL ?? values.CORS_ORIGIN).replace(/\/+$/, ""),
  MAIL_USER: values.MAIL_USER,
  MAIL_APP_PASSWORD: values.MAIL_APP_PASSWORD?.replace(/\s+/g, ""),
  MAIL_FROM: values.MAIL_FROM,
  MAIL_HOST: values.MAIL_HOST,
  MAIL_PORT: values.MAIL_PORT,
  BLOB_READ_WRITE_TOKEN: values.BLOB_READ_WRITE_TOKEN,
  S3_ENDPOINT: values.S3_ENDPOINT || undefined,
  S3_REGION: values.S3_REGION || "us-east-1",
  S3_BUCKET: values.S3_BUCKET || undefined,
  S3_ACCESS_KEY_ID: values.S3_ACCESS_KEY_ID || undefined,
  S3_SECRET_ACCESS_KEY: values.S3_SECRET_ACCESS_KEY || undefined,
  TRUST_PROXY: values.TRUST_PROXY,
  MAX_UPLOAD_MB: values.MAX_UPLOAD_MB,
  CRON_SECRET: values.CRON_SECRET || undefined,
  FX_RATE_USD_PHP: values.FX_RATE_USD_PHP,
  FX_RATE_AS_OF: values.FX_RATE_AS_OF,
} as const;

/** True when an S3-compatible bucket (Filebase, MinIO, ...) is fully configured. */
export const isS3Configured = (): boolean =>
  Boolean(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
