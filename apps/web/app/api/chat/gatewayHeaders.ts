import {
  getPropertyDbScopeHeaders,
  type PropertyDbGatewayScope,
} from "@/lib/server/propertyDbRpc";

/**
 * Builds the gateway auth headers used by chat-route parcel planning calls.
 */
export function buildGatewayHeaders(
  gatewayKey: string,
  scope: PropertyDbGatewayScope,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${gatewayKey}`,
    apikey: gatewayKey,
    "Content-Type": "application/json",
    ...getPropertyDbScopeHeaders(scope),
  };

  const clientId = process.env.CF_ACCESS_CLIENT_ID?.trim();
  const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET?.trim();
  if (clientId && clientSecret) {
    headers["CF-Access-Client-Id"] = clientId;
    headers["CF-Access-Client-Secret"] = clientSecret;
  }

  return headers;
}
