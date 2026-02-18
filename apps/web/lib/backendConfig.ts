export const BACKEND_URL_ERROR_MESSAGE =
  "Screening backend URL is not configured. Set NEXT_PUBLIC_BACKEND_URL for production.";

const DEFAULT_LOCAL_BACKEND_URL = "http://localhost:8000";

function normalizeBackendUrl(rawUrl: string): string {
  return rawUrl.trim().replace(/\/+$/, "");
}

function getConfiguredBackendCandidate(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_BACKEND_URL,
    process.env.BACKEND_URL,
    process.env.NEXT_PUBLIC_SCREENING_BACKEND_URL,
    process.env.SCREENING_BACKEND_URL,
  ];

  for (const candidate of candidates) {
    if (candidate?.trim()) {
      return normalizeBackendUrl(candidate);
    }
  }

  return "";
}

type BackendUrlOptions = {
  allowLocalFallback?: boolean;
};

export function getBackendBaseUrl(
  options: BackendUrlOptions = {}
): string {
  const configuredUrl = getConfiguredBackendCandidate();
  if (configuredUrl) {
    return configuredUrl;
  }

  // Browser fallback for integrated deployments: use same-origin app host.
  if (typeof window !== "undefined" && window.location?.origin) {
    return normalizeBackendUrl(window.location.origin);
  }

  if (process.env.NODE_ENV !== "production" && options.allowLocalFallback !== false) {
    return DEFAULT_LOCAL_BACKEND_URL;
  }

  return "";
}

export function getRequiredBackendBaseUrl(): string {
  const baseUrl = getBackendBaseUrl({ allowLocalFallback: false });
  if (!baseUrl) {
    throw new Error(BACKEND_URL_ERROR_MESSAGE);
  }
  return baseUrl;
}
