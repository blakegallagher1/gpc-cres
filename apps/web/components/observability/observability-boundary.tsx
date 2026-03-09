"use client";

import * as Sentry from "@sentry/nextjs";
import { usePathname } from "next/navigation";
import { ErrorBoundary } from "@/components/error-boundary/ErrorBoundary";
import { capturePageError } from "./client-telemetry";

function routeKey(pathname: string | null): string {
  return pathname ?? "/";
}

function RootFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Something went wrong</h1>
      <p className="text-zinc-600">The application encountered an unexpected error.</p>
    </div>
  );
}

export function ObservabilityBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const boundaryKey = routeKey(pathname);

  return (
    <ErrorBoundary
      key={boundaryKey}
      fallback={<RootFallback />}
      onError={(error, errorInfo) => {
        Sentry.captureException(error, {
          tags: {
            channel: "page_error",
            route: boundaryKey,
          },
          extra: {
            componentStack: errorInfo.componentStack,
          },
        });
        capturePageError(error, errorInfo.componentStack);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
