export const API_ROUTE_PATH = "/api/admin/codex";

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
