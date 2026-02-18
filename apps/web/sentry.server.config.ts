import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
const release = process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA;

if (!dsn && process.env.NODE_ENV !== "test") {
  const log = process.env.NODE_ENV === "production" ? console.error : console.warn;
  log(
    "[sentry] Server SDK disabled: missing NEXT_PUBLIC_SENTRY_DSN/SENTRY_DSN.",
  );
}

function parseSampleRate(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

const baseSampleRate = parseSampleRate(
  process.env.SENTRY_TRACES_BASE_SAMPLE_RATE,
  process.env.NODE_ENV === "production" ? 0.01 : 1,
);
const chatAgentSampleRate = parseSampleRate(
  process.env.SENTRY_TRACES_CHAT_SAMPLE_RATE,
  process.env.NODE_ENV === "production" ? 0.2 : 1,
);

function isChatOrAgentRoute(samplingContext: {
  name?: string;
  attributes?: Record<string, unknown>;
}): boolean {
  const name = typeof samplingContext.name === "string" ? samplingContext.name : "";
  const attrs = samplingContext.attributes ?? {};
  const httpTarget =
    typeof attrs["http.target"] === "string" ? attrs["http.target"] : "";
  const urlPath =
    typeof attrs["url.path"] === "string" ? attrs["url.path"] : "";
  const combined = `${name} ${httpTarget} ${urlPath}`.toLowerCase();
  return (
    combined.includes("/api/chat") ||
    combined.includes("/api/agent") ||
    combined.includes("/agents")
  );
}

Sentry.init({
  dsn,
  environment,
  release,
  enabled: Boolean(dsn),
  tracesSampler: (samplingContext) =>
    isChatOrAgentRoute(samplingContext)
      ? chatAgentSampleRate
      : baseSampleRate,
});

export {};
