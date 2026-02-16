import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@entitlement-os/shared",
    "@entitlement-os/db",
    "@entitlement-os/openai",
  ],
  images: {
    unoptimized: true,
  },
};

const sentryOptions = {
  org: "gpc-ul",
  project: "entitlement-os-web",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  autoInstrumentServerFunctions: true,
  silent: true,
  hideSourceMaps: true,
  disableLogger: true,
  release: {
    name: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,
  },
};

export default withSentryConfig(nextConfig, sentryOptions);
