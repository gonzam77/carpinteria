import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("8h"),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
  GOOGLE_CLIENT_ID: z.string().optional().default("")
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  FRONTEND_URLS: parsedEnv.FRONTEND_URL.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
};
