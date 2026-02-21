import { withSentryConfig } from "@sentry/nextjs";
import path from "path";
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
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

const sentryOptions = {
  org: "gpc-ul",
  project: "entitlement-os-web",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: true,
  hideSourceMaps: true,
  release: {
    name: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,
  },
  webpack: {
    autoInstrumentServerFunctions: true,
    treeshake: {
      removeDebugLogging: true,
    },
  },
};

export default withSentryConfig(nextConfig, sentryOptions);
