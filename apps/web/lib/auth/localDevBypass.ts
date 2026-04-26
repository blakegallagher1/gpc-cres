import "server-only";

export type LocalDevAuthResult = {
  userId: string;
  orgId: string;
};

export const DEFAULT_LOCAL_DEV_AUTH_ORG_ID =
  "00000000-0000-0000-0000-000000000001";
export const DEFAULT_LOCAL_DEV_AUTH_USER_ID =
  "00000000-0000-0000-0000-000000000003";

export function getLocalDevAuthResult(): LocalDevAuthResult {
  const userId =
    process.env.LOCAL_DEV_AUTH_USER_ID?.trim() || DEFAULT_LOCAL_DEV_AUTH_USER_ID;
  const orgId =
    process.env.LOCAL_DEV_AUTH_ORG_ID?.trim() || DEFAULT_LOCAL_DEV_AUTH_ORG_ID;

  return { userId, orgId };
}

export function isAppRouteLocalBypassEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_DISABLE_AUTH !== "true") {
    return false;
  }

  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  return process.env.NEXT_PUBLIC_E2E === "true";
}
