import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
const release = process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA;

Sentry.init({
  dsn,
  environment,
  release,
  enabled: Boolean(dsn),
  tracesSampleRate: 0,
});

export {};
