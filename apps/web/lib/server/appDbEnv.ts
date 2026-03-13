export function isAppDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function shouldUseAppDatabaseDevFallback(): boolean {
  return process.env.NODE_ENV === "development" && !isAppDatabaseConfigured();
}

export function isLocalAppRuntime(): boolean {
  return !process.env.VERCEL;
}
