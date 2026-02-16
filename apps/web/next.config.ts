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
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT || "entitlement-os-web",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  autoInstrumentServerFunctions: true,
  silent: true,
  hideSourceMaps: false,
};

export default withSentryConfig(nextConfig, sentryOptions);
