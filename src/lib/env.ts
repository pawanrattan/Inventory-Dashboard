import { z } from "zod";

const envSchema = z.object({
  // Database
  DB_HOST: z.string().min(1),
  DB_PORT: z.string().default("3306"),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),

  // Auth
  JWT_SECRET: z.string().min(1),

  // App
  NEXT_PUBLIC_API_BASE_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
