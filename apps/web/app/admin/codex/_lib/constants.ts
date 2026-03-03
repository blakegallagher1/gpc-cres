export const API_ROUTE_PATH = "/api/admin/codex";

export const ACTIVE_THREAD_STORAGE_KEY = "admin.codex.activeThreadId";

const configuredDefaultCwd = process.env.NEXT_PUBLIC_CODEX_DEFAULT_CWD?.trim();
export const DEFAULT_ADMIN_CWD =
  configuredDefaultCwd && configuredDefaultCwd.length > 0 ? configuredDefaultCwd : null;

export const DEFAULT_THREAD_START_CONFIG = {
  model: "gpt-5.3-codex",
  cwd: DEFAULT_ADMIN_CWD,
  approvalPolicy: "on-request" as const,
  sandboxPolicy: DEFAULT_ADMIN_CWD
    ? {
        type: "workspaceWrite" as const,
        writableRoots: [DEFAULT_ADMIN_CWD],
        networkAccess: false,
      }
    : undefined,
};

export const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;

export const SCROLL_AUTO_THRESHOLD_PX = 100;

export const CODEX_ERROR_EXPLANATIONS: Record<string, string> = {
  ContextWindowExceeded:
    "The model context limit was reached. Start a new thread before continuing this conversation.",
  UsageLimitExceeded:
    "Usage limits have been exceeded for this thread. Start a new thread and try again shortly.",
  contextWindowExceeded:
    "The model context limit was reached. Start a new thread before continuing this conversation.",
  usageLimitExceeded:
    "Usage limits have been exceeded for this thread. Start a new thread and try again shortly.",
};
