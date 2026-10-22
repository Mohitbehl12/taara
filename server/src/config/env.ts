import 'dotenv/config';

const str = (k: string, fallback?: string) => process.env[k] ?? fallback ?? '';

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: str('NODE_ENV', 'development'),
  databaseUrl: str('DATABASE_URL'),          // empty → embedded PGlite in ./.data (demo only)
  jwtSecret: str('JWT_SECRET', 'dev-only-change-me'),
  publicUrl: str('PUBLIC_URL', 'http://localhost:4000'),
  corsOrigins: str('CORS_ORIGINS', '*'),

  // OTP: in dev, OTP_DEV_CODE is accepted for any phone and SMS is not sent.
  otpDevCode: str('OTP_DEV_CODE'),
  msg91AuthKey: str('MSG91_AUTH_KEY'),
  msg91TemplateId: str('MSG91_TEMPLATE_ID'),

  googleClientIds: str('GOOGLE_CLIENT_IDS').split(',').filter(Boolean),
  appleBundleId: str('APPLE_BUNDLE_ID', 'in.taara.app'),

  anthropicApiKey: str('ANTHROPIC_API_KEY'),
  aiModel: str('AI_MODEL', 'claude-sonnet-5-5'),
  aiFastModel: str('AI_FAST_MODEL', 'claude-haiku-5-5'),

  sarvamApiKey: str('SARVAM_API_KEY'),

  razorpayKeyId: str('RAZORPAY_KEY_ID'),
  razorpayKeySecret: str('RAZORPAY_KEY_SECRET'),
  razorpayWebhookSecret: str('RAZORPAY_WEBHOOK_SECRET'),

  expoAccessToken: str('EXPO_ACCESS_TOKEN'),
  adminPhones: str('ADMIN_PHONES').split(',').filter(Boolean),
  // Demo mode: POST /auth/demo hands out a fresh guest account so people can try the app without logging in.
  // Never allowed in production.
  demoMode: str('DEMO_MODE') === 'true',
};

export const isProd = env.nodeEnv === 'production';

export function assertProdConfig() {
  if (!isProd) return;
  const missing = [
    ['DATABASE_URL', env.databaseUrl], ['JWT_SECRET', env.jwtSecret !== 'dev-only-change-me' ? env.jwtSecret : ''],
    ['RAZORPAY_KEY_ID', env.razorpayKeyId], ['RAZORPAY_KEY_SECRET', env.razorpayKeySecret],
    ['RAZORPAY_WEBHOOK_SECRET', env.razorpayWebhookSecret], ['ANTHROPIC_API_KEY', env.anthropicApiKey],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (env.otpDevCode) missing.push('OTP_DEV_CODE must be empty in production');
  if (env.demoMode) missing.push('DEMO_MODE must be off in production');
  if (missing.length) throw new Error(`Missing production config: ${missing.join(', ')}`);
}
