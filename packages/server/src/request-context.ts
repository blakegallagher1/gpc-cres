export const REQUEST_ID_HEADER = "x-request-id";

interface HeaderReader {
  get(name: string): string | null;
  forEach?(callbackfn: (value: string, key: string) => void): void;
}

interface HeaderContainer {
  headers?: HeaderReader | Headers | null;
}

type RequestIdSource = HeaderReader | Headers | HeaderContainer | null | undefined;

function extractHeaders(source: RequestIdSource): HeaderReader | Headers | null {
  if (!source) {
    return null;
  }
  if (typeof (source as HeaderReader).get === "function") {
    return source as HeaderReader | Headers;
  }
  if (
    typeof source === "object" &&
    "headers" in source &&
    source.headers &&
    typeof source.headers.get === "function"
  ) {
    return source.headers;
  }
  return null;
}

function normalizeRequestId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, 256);
}

export function generateRequestId(): string {
  return crypto.randomUUID();
}

export function readRequestId(source: RequestIdSource): string | null {
  const headers = extractHeaders(source);
  if (!headers) {
    return null;
  }
  return normalizeRequestId(headers.get(REQUEST_ID_HEADER));
}

export function getOrCreateRequestId(source: RequestIdSource): string {
  return readRequestId(source) ?? generateRequestId();
}

export function cloneHeadersWithRequestId(source: RequestIdSource, requestId: string): Headers {
  const original = extractHeaders(source);
  const headers = new Headers();

  if (original && typeof original.forEach === "function") {
    original.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  headers.set(REQUEST_ID_HEADER, requestId);
  return headers;
}

export function setRequestIdHeader(headers: Headers, requestId: string): Headers {
  headers.set(REQUEST_ID_HEADER, requestId);
  return headers;
}

export function attachRequestId<T extends { headers: Headers }>(target: T, requestId: string): T {
  setRequestIdHeader(target.headers, requestId);
  return target;
}
