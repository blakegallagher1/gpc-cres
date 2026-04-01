"use client";

import * as Sentry from "@sentry/nextjs";
import { mirrorClientTelemetryToLocalLog } from "./client-error-log";

export type ClientTelemetryKind =
  | "navigation"
  | "page_error"
  | "browser_error"
  | "unhandled_rejection"
  | "fetch_failure"
  | "map_metric";

export type ClientTelemetryContext = {
  route: string;
  viewId: string;
  userId?: string | null;
  orgId?: string | null;
  userEmail?: string | null;
};

export type ClientTelemetryEvent = {
  kind: ClientTelemetryKind;
  occurredAt: string;
  route: string;
  viewId: string;
  sessionId: string;
  level?: "info" | "warning" | "error";
  pageTitle?: string | null;
  message?: string | null;
  componentStack?: string | null;
  prevRoute?: string | null;
  url?: string | null;
  method?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  requestId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
};

const TELEMETRY_ENDPOINT = "/api/observability/events";
const SESSION_STORAGE_KEY = "gpc.observability.sessionId";

let telemetryContextGetter: (() => ClientTelemetryContext) | null = null;
let originalFetch: typeof window.fetch | null = null;
let cleanupTelemetry: (() => void) | null = null;
let cachedSessionId: string | null = null;

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `obs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createViewId(): string {
  return generateId();
}

export function getClientSessionId(): string {
  if (cachedSessionId) {
    return cachedSessionId;
  }

  if (typeof window === "undefined") {
    cachedSessionId = generateId();
    return cachedSessionId;
  }

  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) {
      cachedSessionId = existing;
      return existing;
    }
  } catch {
    // Ignore storage access issues and fall back to in-memory identifiers.
  }

  const nextId = generateId();
  cachedSessionId = nextId;

  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, nextId);
  } catch {
    // Ignore storage write failures.
  }

  return nextId;
}

function safeNowIso(): string {
  return new Date().toISOString();
}

function getCurrentContext(): ClientTelemetryContext {
  const fallbackRoute =
    typeof window === "undefined"
      ? "/"
      : `${window.location.pathname}${window.location.search}${window.location.hash}`;

  return (
    telemetryContextGetter?.() ?? {
      route: fallbackRoute,
      viewId: createViewId(),
    }
  );
}

function isIgnoredUrl(url: string): boolean {
  try {
    const parsed = new URL(
      url,
      typeof window !== "undefined" ? window.location.origin : "http://localhost",
    );
    if (
      parsed.protocol === "chrome-extension:" ||
      parsed.protocol === "moz-extension:" ||
      parsed.protocol === "safari-extension:"
    ) {
      return true;
    }

    if (typeof window !== "undefined") {
      const currentHostname = window.location.hostname;
      const currentBaseHost = currentHostname.includes(".")
        ? currentHostname.split(".").slice(-2).join(".")
        : currentHostname;
      const isTrustedHost =
        parsed.hostname === currentHostname ||
        parsed.hostname === currentBaseHost ||
        parsed.hostname.endsWith(`.${currentBaseHost}`);

      if (!isTrustedHost) {
        return true;
      }
    }

    return (
      parsed.pathname === TELEMETRY_ENDPOINT ||
      parsed.pathname.startsWith("/_next/") ||
      parsed.pathname.startsWith("/favicon")
    );
  } catch {
    return url.startsWith(TELEMETRY_ENDPOINT);
  }
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const initMethod = init?.method?.toUpperCase();
  if (initMethod) return initMethod;
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

function serializeErrorLike(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message || error.name || "Unknown error",
      stack: error.stack,
    };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "Unknown error");
    return { message };
  }

  return { message: "Unknown error" };
}

async function emitTelemetryEvent(event: ClientTelemetryEvent): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  mirrorClientTelemetryToLocalLog(event);

  if (!originalFetch) {
    originalFetch = window.fetch.bind(window);
  }

  const context = getCurrentContext();
  if (!context.orgId) {
    return;
  }

  try {
    await originalFetch(TELEMETRY_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ events: [event] }),
      keepalive: true,
    });
  } catch (error) {
    const serialized = serializeErrorLike(error);
    console.warn("[observability] failed to ingest client telemetry", serialized.message);
  }
}

export async function recordNavigationEvent(
  context: ClientTelemetryContext,
  prevRoute?: string | null,
): Promise<void> {
  await emitTelemetryEvent({
    kind: "navigation",
    occurredAt: safeNowIso(),
    route: context.route,
    viewId: context.viewId,
    sessionId: getClientSessionId(),
    prevRoute: prevRoute ?? null,
    level: "info",
    pageTitle: typeof document !== "undefined" ? document.title : null,
    metadata: {
      userId: context.userId ?? null,
      userEmail: context.userEmail ?? null,
    },
  });
}

export function capturePageError(error: Error, componentStack?: string | null): void {
  const context = getCurrentContext();
  const serialized = serializeErrorLike(error);

  void emitTelemetryEvent({
    kind: "page_error",
    occurredAt: safeNowIso(),
    route: context.route,
    viewId: context.viewId,
    sessionId: getClientSessionId(),
    level: "error",
    pageTitle: typeof document !== "undefined" ? document.title : null,
    message: serialized.message,
    componentStack: componentStack ?? null,
    metadata: {
      stack: serialized.stack ?? null,
      userId: context.userId ?? null,
      userEmail: context.userEmail ?? null,
    },
  });
}

export function recordClientMetricEvent(input: {
  message: string;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
  level?: "info" | "warning" | "error";
}): void {
  const context = getCurrentContext();

  void emitTelemetryEvent({
    kind: "map_metric",
    occurredAt: safeNowIso(),
    route: context.route,
    viewId: context.viewId,
    sessionId: getClientSessionId(),
    level: input.level ?? "info",
    pageTitle: typeof document !== "undefined" ? document.title : null,
    message: input.message,
    durationMs: input.durationMs ?? null,
    metadata: {
      ...(input.metadata ?? {}),
      userId: context.userId ?? null,
      userEmail: context.userEmail ?? null,
    },
  });
}

export function installGlobalBrowserTelemetry(
  getContext: () => ClientTelemetryContext,
): () => void {
  telemetryContextGetter = getContext;

  if (typeof window === "undefined") {
    return () => undefined;
  }

  if (cleanupTelemetry) {
    return cleanupTelemetry;
  }

  originalFetch = window.fetch.bind(window);

  const handleError = (event: ErrorEvent) => {
    const context = getCurrentContext();
    const errorLike = event.error ?? new Error(event.message || "Unhandled browser error");
    const serialized = serializeErrorLike(errorLike);

    Sentry.captureException(event.error ?? errorLike, {
      tags: { channel: "browser_error", route: context.route },
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });

    void emitTelemetryEvent({
      kind: "browser_error",
      occurredAt: safeNowIso(),
      route: context.route,
      viewId: context.viewId,
      sessionId: getClientSessionId(),
      level: "error",
      pageTitle: typeof document !== "undefined" ? document.title : null,
      message: serialized.message,
      metadata: {
        stack: serialized.stack ?? null,
        filename: event.filename ?? null,
        lineno: event.lineno ?? null,
        colno: event.colno ?? null,
        userId: context.userId ?? null,
        userEmail: context.userEmail ?? null,
      },
    });
  };

  const handleRejection = (event: PromiseRejectionEvent) => {
    const context = getCurrentContext();
    const serialized = serializeErrorLike(event.reason);

    Sentry.captureException(
      event.reason instanceof Error ? event.reason : new Error(serialized.message),
      { tags: { channel: "unhandled_rejection", route: context.route } },
    );

    void emitTelemetryEvent({
      kind: "unhandled_rejection",
      occurredAt: safeNowIso(),
      route: context.route,
      viewId: context.viewId,
      sessionId: getClientSessionId(),
      level: "error",
      pageTitle: typeof document !== "undefined" ? document.title : null,
      message: serialized.message,
      metadata: {
        stack: serialized.stack ?? null,
        userId: context.userId ?? null,
        userEmail: context.userEmail ?? null,
      },
    });
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const targetUrl = resolveUrl(input);
    if (!originalFetch) {
      throw new Error("Observability fetch wrapper is missing the original fetch reference");
    }

    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

    try {
      const response = await originalFetch(input, init);
      const durationMs = Math.max(
        0,
        Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt),
      );

      if (!isIgnoredUrl(targetUrl) && response.status >= 400) {
        const context = getCurrentContext();
        const requestId = response.headers.get("x-request-id");
        const correlationId =
          response.headers.get("x-correlation-id") ?? response.headers.get("traceparent");

        Sentry.addBreadcrumb({
          category: "fetch",
          level: "error",
          type: "http",
          data: {
            method: resolveMethod(input, init),
            statusCode: response.status,
            url: targetUrl,
          },
        });

        void emitTelemetryEvent({
          kind: "fetch_failure",
          occurredAt: safeNowIso(),
          route: context.route,
          viewId: context.viewId,
          sessionId: getClientSessionId(),
          level: response.status >= 500 ? "error" : "warning",
          pageTitle: typeof document !== "undefined" ? document.title : null,
          message: `Fetch failed with status ${response.status}`,
          url: targetUrl,
          method: resolveMethod(input, init),
          statusCode: response.status,
          durationMs,
          requestId,
          correlationId,
          metadata: {
            userId: context.userId ?? null,
            userEmail: context.userEmail ?? null,
          },
        });
      }

      return response;
    } catch (error) {
      const durationMs = Math.max(
        0,
        Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt),
      );

      if (!isIgnoredUrl(targetUrl)) {
        const context = getCurrentContext();
        const serialized = serializeErrorLike(error);
        Sentry.captureException(error instanceof Error ? error : new Error(serialized.message), {
          tags: { channel: "fetch_failure", route: context.route },
          extra: { url: targetUrl, method: resolveMethod(input, init) },
        });

        void emitTelemetryEvent({
          kind: "fetch_failure",
          occurredAt: safeNowIso(),
          route: context.route,
          viewId: context.viewId,
          sessionId: getClientSessionId(),
          level: "error",
          pageTitle: typeof document !== "undefined" ? document.title : null,
          message: serialized.message,
          url: targetUrl,
          method: resolveMethod(input, init),
          durationMs,
          metadata: {
            stack: serialized.stack ?? null,
            userId: context.userId ?? null,
            userEmail: context.userEmail ?? null,
          },
        });
      }

      throw error;
    }
  };

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleRejection);

  cleanupTelemetry = () => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleRejection);
    if (originalFetch) {
      window.fetch = originalFetch;
    }
    cleanupTelemetry = null;
    telemetryContextGetter = null;
  };

  return cleanupTelemetry;
}

export function __resetClientTelemetryForTests(): void {
  if (cleanupTelemetry) {
    cleanupTelemetry();
  }
  cleanupTelemetry = null;
  telemetryContextGetter = null;
  cachedSessionId = null;
  originalFetch = null;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures in tests.
    }
  }
}
