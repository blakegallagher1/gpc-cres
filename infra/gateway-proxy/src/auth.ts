import { Env } from "./types";

export function validateBearer(request: Request, env: Env): boolean {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === env.GATEWAY_PROXY_TOKEN;
}

export function upstreamHeaders(env: Env, requestId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${env.LOCAL_API_KEY}`,
    "Content-Type": "application/json",
  };
  if (env.CF_ACCESS_CLIENT_ID) {
    headers["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
  }
  if (env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
  }
  if (requestId) {
    headers["x-request-id"] = requestId;
  }
  return headers;
}
