import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("8h"),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().default("http://127.0.0.1:5173"),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  WHATSAPP_TOKEN: z.string().optional().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
  WHATSAPP_NOTIFY_TO: z.string().optional().default(""),
  PUSH_VAPID_PUBLIC_KEY: z.string().optional().default(""),
  PUSH_VAPID_PRIVATE_KEY: z.string().optional().default(""),
  PUSH_VAPID_SUBJECT: z.string().default("mailto:admin@carpinteria.local")
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  FRONTEND_URLS: parsedEnv.FRONTEND_URL.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
};