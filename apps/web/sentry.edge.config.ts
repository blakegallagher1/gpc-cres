import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;
const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";

Sentry.init({
  dsn,
  environment,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.3 : 1.0,
});

export {};
