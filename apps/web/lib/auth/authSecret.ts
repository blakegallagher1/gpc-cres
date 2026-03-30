function normalizeSecret(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve the Auth.js session secret, accepting both the current
 * `AUTH_SECRET` name and the legacy `NEXTAUTH_SECRET` alias.
 */
export function getAuthSecret(): string | null {
  return normalizeSecret(process.env.AUTH_SECRET) ?? normalizeSecret(process.env.NEXTAUTH_SECRET);
}
