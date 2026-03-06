"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type TelemetryEventType =
  | "route_view"
  | "unhandled_error"
  | "unhandled_rejection"
  | "fetch_error"
  | "fetch_slow";

type TelemetryRequestInfo = {
  url: string;
  method: string;
  statusCode?: number | null;
  durationMs?: number | null;
  requestId?: string | null;
};

type TelemetryErrorInfo = {
  message?: string;
  name?: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
};

type TelemetryEvent = {
  type: TelemetryEventType;
  timestamp: string;
  sessionId: string;
  pagePath?: string;
  pageUrl?: string;
  referrer?: string;
  userAgent?: string;
  viewport?: {
    width: number;
    height: number;
    devicePixelRatio?: number;
  };
  request?: TelemetryRequestInfo;
  error?: TelemetryErrorInfo;
  reason?: string;
  durationMs?: number;
};

const OBS_ENDPOINT = "/api/observability/events";
const MAX_BATCH = 20;
const FLUSH_INTERVAL_MS = 5000;
const SLOW_FETCH_MS = 10000;

function nowIso(): string {
  return new Date().toISOString();
}

function getViewport() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  };
}

function safeString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

function getErrorInfo(error: unknown): TelemetryErrorInfo | undefined {
  if (!error) return undefined;
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl, window.location.origin);
  } catch {
    return null;
  }
}

function hasSkipHeader(headers?: HeadersInit): boolean {
  if (!headers) return false;
  if (headers instanceof Headers) {
    return headers.get("x-observability-skip") === "1";
  }
  if (Array.isArray(headers)) {
    return headers.some(
      ([key, value]) => key.toLowerCase() === "x-observability-skip" && value === "1",
    );
  }
  return Object.entries(headers).some(
    ([key, value]) =>
      key.toLowerCase() === "x-observability-skip" && String(value) === "1",
  );
}

function isTrackableHost(hostname: string, baseHost: string): boolean {
  return hostname === baseHost || hostname.endsWith(`.${baseHost}`);
}

export function ObservabilityProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = useMemo(() => searchParams?.toString() ?? "", [searchParams]);

  const sessionIdRef = useRef<string | null>(null);
  const queueRef = useRef<TelemetryEvent[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);

  const ensureSessionId = () => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const storageKey = "observability-session-id";
    try {
      const existing = window.sessionStorage.getItem(storageKey);
      if (existing) {
        sessionIdRef.current = existing;
        return existing;
      }
      const fresh = window.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random()}`;
      window.sessionStorage.setItem(storageKey, fresh);
      sessionIdRef.current = fresh;
      return fresh;
    } catch {
      const fallback = window.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random()}`;
      sessionIdRef.current = fallback;
      return fallback;
    }
  };

  const enqueue = (event: TelemetryEvent) => {
    queueRef.current.push(event);
    if (queueRef.current.length >= MAX_BATCH) {
      void flush("batch");
      return;
    }
    scheduleFlush();
  };

  const scheduleFlush = () => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      void flush("timer");
    }, FLUSH_INTERVAL_MS);
  };

  const flush = async (reason: "batch" | "timer" | "pagehide" | "visibility" | "unmount") => {
    if (flushingRef.current) return;
    if (queueRef.current.length === 0) return;

    const batch = queueRef.current.splice(0, MAX_BATCH);
    const payload = JSON.stringify({ events: batch });

    flushingRef.current = true;
    try {
      if (reason !== "timer" && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(OBS_ENDPOINT, blob);
        return;
      }

      await fetch(OBS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-observability-skip": "1",
        },
        body: payload,
        credentials: "include",
        keepalive: true,
      });
    } catch {
      // Best-effort telemetry only.
    } finally {
      flushingRef.current = false;
      if (queueRef.current.length > 0) {
        scheduleFlush();
      }
    }
  };

  useEffect(() => {
    if (!pathname) return;
    const sessionId = ensureSessionId();
    const pageUrl = `${window.location.origin}${pathname}`;

    enqueue({
      type: "route_view",
      timestamp: nowIso(),
      sessionId,
      pagePath: pathname,
      pageUrl,
      referrer: safeString(document.referrer),
      userAgent: safeString(navigator.userAgent),
      viewport: getViewport(),
    });
  }, [pathname, searchKey]);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const sessionId = ensureSessionId();
      const pagePath = window.location.pathname;

      enqueue({
        type: "unhandled_error",
        timestamp: nowIso(),
        sessionId,
        pagePath,
        pageUrl: `${window.location.origin}${pagePath}`,
        referrer: safeString(document.referrer),
        userAgent: safeString(navigator.userAgent),
        viewport: getViewport(),
        error: {
          message: safeString(event.message),
          name: event.error?.name,
          stack: event.error?.stack,
          filename: safeString(event.filename),
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const sessionId = ensureSessionId();
      const pagePath = window.location.pathname;
      const error = getErrorInfo(event.reason);

      enqueue({
        type: "unhandled_rejection",
        timestamp: nowIso(),
        sessionId,
        pagePath,
        pageUrl: `${window.location.origin}${pagePath}`,
        referrer: safeString(document.referrer),
        userAgent: safeString(navigator.userAgent),
        viewport: getViewport(),
        reason: safeString(error?.message ?? String(event.reason)),
        error,
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.fetch !== "function") return;

    const baseHost = window.location.hostname.replace(/^www\./, "");
    const originalFetch = window.fetch.bind(window);
    const wrappedKey = "__gpc_observability_fetch_wrapped__";
    const windowWithFlag = window as unknown as Record<string, unknown>;

    if (windowWithFlag[wrappedKey]) {
      return;
    }

    windowWithFlag[wrappedKey] = true;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : null;
      const rawUrl = request?.url ?? (typeof input === "string" ? input : input.toString());
      const url = parseUrl(rawUrl);

      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      const headers = init?.headers ?? request?.headers;

      if (hasSkipHeader(headers)) {
        return originalFetch(input, init);
      }

      if (!url) {
        return originalFetch(input, init);
      }

      if (url.pathname.startsWith(OBS_ENDPOINT)) {
        return originalFetch(input, init);
      }

      const isApiPath = url.pathname.startsWith("/api/");
      const isTrackable = isApiPath && isTrackableHost(url.hostname, baseHost);

      if (!isTrackable) {
        return originalFetch(input, init);
      }

      const start = performance?.now ? performance.now() : Date.now();
      try {
        const response = await originalFetch(input, init);
        const end = performance?.now ? performance.now() : Date.now();
        const durationMs = Math.round(end - start);

        if (!response.ok || durationMs >= SLOW_FETCH_MS) {
          const sessionId = ensureSessionId();
          const pagePath = window.location.pathname;
          const requestId =
            response.headers.get("x-request-id") ??
            response.headers.get("x-correlation-id") ??
            response.headers.get("x-trace-id");

          enqueue({
            type: response.ok ? "fetch_slow" : "fetch_error",
            timestamp: nowIso(),
            sessionId,
            pagePath,
            pageUrl: `${window.location.origin}${pagePath}`,
            referrer: safeString(document.referrer),
            userAgent: safeString(navigator.userAgent),
            viewport: getViewport(),
            durationMs,
            request: {
              url: url.pathname,
              method,
              statusCode: response.status,
              durationMs,
              requestId: safeString(requestId) ?? null,
            },
            error: response.ok
              ? undefined
              : {
                  message: `HTTP ${response.status}`,
                },
          });
        }

        return response;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw error;
        }

        const end = performance?.now ? performance.now() : Date.now();
        const durationMs = Math.round(end - start);
        const sessionId = ensureSessionId();
        const pagePath = window.location.pathname;
        const errorInfo = getErrorInfo(error);

        enqueue({
          type: "fetch_error",
          timestamp: nowIso(),
          sessionId,
          pagePath,
          pageUrl: `${window.location.origin}${pagePath}`,
          referrer: safeString(document.referrer),
          userAgent: safeString(navigator.userAgent),
          viewport: getViewport(),
          durationMs,
          request: {
            url: url.pathname,
            method,
            statusCode: null,
            durationMs,
            requestId: null,
          },
          error: errorInfo,
        });

        throw error;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        void flush("visibility");
      }
    };

    window.addEventListener("pagehide", () => void flush("pagehide"));
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.fetch = originalFetch;
      delete windowWithFlag[wrappedKey];
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    return () => {
      void flush("unmount");
    };
  }, []);

  return <>{children}</>;
}
