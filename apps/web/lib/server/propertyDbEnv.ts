type PropertyDbConfig = {
  url: string;
  key: string;
};

const loggedHealthChecks = new Set<string>();

export function isMissingOrPlaceholder(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "undefined" ||
    normalized === "null" ||
    normalized === "placeholder" ||
    normalized === "***" ||
    normalized.includes("placeholder")
  );
}

export function getPropertyDbConfigOrNull(): PropertyDbConfig | null {
  const url = process.env.LA_PROPERTY_DB_URL;
  const key = process.env.LA_PROPERTY_DB_KEY;

  if (!url || !key) return null;
  if (isMissingOrPlaceholder(url) || isMissingOrPlaceholder(key)) return null;

  return {
    url: url.trim(),
    key: key.trim(),
  };
}

export function requirePropertyDbConfig(routeTag: string): PropertyDbConfig {
  const config = getPropertyDbConfigOrNull();
  if (!config) {
    throw new Error(`[${routeTag}] Missing required LA_PROPERTY_DB_URL/LA_PROPERTY_DB_KEY.`);
  }
  return config;
}

function hostFromUrl(rawUrl: string): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return "invalid-url";
  }
}

export function logPropertyDbRuntimeHealth(routeTag: string): PropertyDbConfig | null {
  const config = getPropertyDbConfigOrNull();
  const key = `${routeTag}:${config ? "ok" : "invalid"}`;
  if (loggedHealthChecks.has(key)) {
    return config;
  }
  loggedHealthChecks.add(key);

  if (!config) {
    console.warn(
      `[property-db-health] route=${routeTag} status=invalid reason=missing_or_placeholder_env`,
    );
    return null;
  }

  console.info(
    `[property-db-health] route=${routeTag} status=ok host=${hostFromUrl(config.url)} key_present=true`,
  );
  return config;
}
