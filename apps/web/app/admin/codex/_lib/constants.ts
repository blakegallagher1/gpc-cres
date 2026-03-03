const WORKER_RELAY_URL = "wss://agents.gallagherpropco.com/codex";
const CONTROLLER_BLOCKED_HOST = "codex-controller.gallagherpropco.com";
const WORKER_HOST = "agents.gallagherpropco.com";
const WORKER_PATH = "/codex";

const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

function isLikelyLocalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return LOCAL_HOSTNAMES.has(normalized) || normalized.endsWith(".local");
}

function isPlainHost(raw: string): boolean {
  return /^[a-z0-9.-]+(?::\d+)?$/i.test(raw);
}

function normalizeRelayUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (trimmed.includes(CONTROLLER_BLOCKED_HOST)) {
    return WORKER_RELAY_URL;
  }

  if (isPlainHost(trimmed) && !trimmed.startsWith("/")) {
    if (trimmed.includes(WORKER_HOST) || trimmed.includes(CONTROLLER_BLOCKED_HOST)) {
      return WORKER_RELAY_URL;
    }
    return `wss://${trimmed}`;
  }

  if (trimmed.startsWith("wss://") || trimmed.startsWith("ws://")) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.hostname === WORKER_HOST && (!parsed.pathname || parsed.pathname === "/")) {
        const withPath = `${parsed.protocol}//${parsed.host}${WORKER_PATH}`;
        return withPath;
      }
    } catch {
      // keep as-is if parsing fails.
    }
    return trimmed;
  }

  // Normalize accidental HTTPS relay URLs that should be websocket endpoints.
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.hostname === WORKER_HOST && parsed.pathname.startsWith(WORKER_PATH)) {
        return `wss://${parsed.host}${parsed.pathname}`;
      }
    } catch {
      // If parsing fails, keep original value for explicit admin control.
    }
  }

  return trimmed;
}

function isProductionHost(hostname: string): boolean {
  return hostname.includes("gallagherpropco.com");
}

function resolveDefaultRelayUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_CODEX_RELAY_URL;
  if (explicit) {
    const normalized = normalizeRelayUrl(explicit);
    if (typeof window !== "undefined" && isLikelyLocalHost(window.location.hostname)) {
      return normalized.startsWith("/") ? normalized : "/api/admin/codex";
    }
    return normalized;
  }

  if (
    typeof window !== "undefined" &&
    !isLikelyLocalHost(window.location.hostname) &&
    isProductionHost(window.location.hostname)
  ) {
    return WORKER_RELAY_URL;
  }

  return "/api/admin/codex";
}

export const API_ROUTE_PATH = resolveDefaultRelayUrl();

export const ACTIVE_THREAD_STORAGE_KEY = "admin.codex.activeThreadId";

export const DEFAULT_ADMIN_CWD = "/home/blake/repos/gpc-cres";

export const DEFAULT_THREAD_START_CONFIG = {
  model: "gpt-5.3-codex",
  cwd: DEFAULT_ADMIN_CWD,
  approvalPolicy: "onRequest" as const,
  sandboxPolicy: {
    type: "workspaceWrite" as const,
    writableRoots: [DEFAULT_ADMIN_CWD],
    networkAccess: false,
  },
};

export const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;

export const SCROLL_AUTO_THRESHOLD_PX = 100;

export const CODEX_ERROR_EXPLANATIONS: Record<string, string> = {
  ContextWindowExceeded:
    "The model context limit was reached. Start a new thread before continuing this conversation.",
  UsageLimitExceeded:
    "Usage limits have been exceeded for this thread. Start a new thread and try again shortly.",
};
