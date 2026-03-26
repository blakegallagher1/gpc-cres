import { URL } from "node:url";
import type { BrowserSession } from "./browser-session.js";

const DEFAULT_ALLOWED_HOSTS = ["gallagherpropco.com", "www.gallagherpropco.com"];
const DEFAULT_LOGIN_PATH = "/login";
const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 30_000;

/**
 * Runtime-only configuration for first-party site authentication.
 *
 * Credentials stay in environment variables so they are never committed and do
 * not need to be exposed to the model prompt.
 */
export type FirstPartyAuthProfile = {
  allowedHosts: string[];
  bootstrapTimeoutMs: number;
  email: string | null;
  loginPath: string;
  password: string | null;
};

/**
 * Result of a first-party auth bootstrap attempt.
 */
export type FirstPartyAuthBootstrapResult = {
  attempted: boolean;
  authenticated: boolean;
  detail: string;
};

function normalizeHost(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePath(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return DEFAULT_LOGIN_PATH;
  }
  const prefixed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return prefixed.length > 1 && prefixed.endsWith("/")
    ? prefixed.slice(0, -1)
    : prefixed;
}

function parseHosts(value: string | undefined): string[] {
  const parsed = (value ?? "")
    .split(",")
    .map(normalizeHost)
    .filter(Boolean);

  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_HOSTS;
}

function parseTimeout(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_BOOTSTRAP_TIMEOUT_MS;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function credentialsConfigured(profile: FirstPartyAuthProfile): boolean {
  return Boolean(profile.email && profile.password);
}

async function reuseAuthenticatedSessionIfPresent(options: {
  loginPath: string;
  loginUrl: string;
  page: BrowserSession["page"];
  targetUrl: string;
  timeoutMs: number;
}): Promise<FirstPartyAuthBootstrapResult | null> {
  const { loginPath, loginUrl, page, targetUrl, timeoutMs } = options;

  await page.goto(loginUrl, {
    timeout: timeoutMs,
    waitUntil: "load",
  });

  const landedOn = parseUrl(page.url());
  if (!landedOn || normalizePath(landedOn.pathname) === loginPath) {
    return null;
  }

  await page.goto(targetUrl, {
    timeout: timeoutMs,
    waitUntil: "load",
  });

  return {
    attempted: true,
    authenticated: true,
    detail: "Reused an existing authenticated first-party session.",
  };
}

async function revealCredentialFormIfNeeded(
  page: BrowserSession["page"],
): Promise<void> {
  const revealCredentialFormButton = page.getByRole("button", {
    name: /use credential sign-in/i,
  });
  const revealFormVisible = await revealCredentialFormButton
    .isVisible({ timeout: 1_500 })
    .catch(() => false);

  if (revealFormVisible) {
    await revealCredentialFormButton.click();
  }
}

async function submitCredentialSignIn(options: {
  email: string;
  loginPath: string;
  page: BrowserSession["page"];
  password: string;
  timeoutMs: number;
}): Promise<void> {
  const { email, loginPath, page, password, timeoutMs } = options;
  const emailInput = page.getByLabel("Email");
  const passwordInput = page.getByLabel("Password");
  const submitButton = page.getByRole("button", {
    name: /sign in with password/i,
  });

  await emailInput.waitFor({
    state: "visible",
    timeout: timeoutMs,
  });
  await emailInput.fill(email);
  await passwordInput.fill(password);

  await Promise.all([
    page.waitForURL((url) => normalizePath(url.pathname) !== loginPath, {
      timeout: timeoutMs,
    }),
    submitButton.click(),
  ]);
}

async function ensureAuthenticatedTarget(options: {
  loginPath: string;
  page: BrowserSession["page"];
  targetUrl: string;
  timeoutMs: number;
}): Promise<void> {
  const { loginPath, page, targetUrl, timeoutMs } = options;

  await page.goto(targetUrl, {
    timeout: timeoutMs,
    waitUntil: "load",
  });

  const finalUrl = parseUrl(page.url());
  if (finalUrl && normalizePath(finalUrl.pathname) === loginPath) {
    throw new Error(
      "First-party login did not complete successfully. Check the production-site email/password env vars.",
    );
  }
}

/**
 * Build the first-party auth profile from runtime environment variables.
 */
export function buildFirstPartyAuthProfile(
  env: NodeJS.ProcessEnv = process.env,
): FirstPartyAuthProfile {
  const email = env.GPC_PROD_SITE_EMAIL?.trim() ?? "";
  const password = env.GPC_PROD_SITE_PASSWORD?.trim() ?? "";

  return {
    allowedHosts: parseHosts(env.GPC_PROD_SITE_ALLOWED_HOSTS),
    bootstrapTimeoutMs: parseTimeout(env.GPC_PROD_SITE_BOOTSTRAP_TIMEOUT_MS),
    email: email.length > 0 ? email : null,
    loginPath: normalizePath(env.GPC_PROD_SITE_LOGIN_PATH),
    password: password.length > 0 ? password : null,
  };
}

/**
 * Determine whether the target URL is on an allowlisted first-party host.
 */
export function isFirstPartyUrl(
  rawUrl: string,
  profile: FirstPartyAuthProfile,
): boolean {
  const parsed = parseUrl(rawUrl);
  if (!parsed) {
    return false;
  }

  const host = normalizeHost(parsed.hostname);
  return profile.allowedHosts.some((allowedHost) => host === allowedHost);
}

/**
 * Resolve the login URL for an allowlisted first-party target.
 */
export function resolveFirstPartyLoginUrl(
  rawTargetUrl: string,
  profile: FirstPartyAuthProfile,
): string {
  const target = new URL(rawTargetUrl);
  return new URL(profile.loginPath, target.origin).toString();
}

/**
 * Sign into the first-party production site before the model receives the
 * initial screenshot. This keeps secrets inside the worker and out of prompts.
 */
export async function bootstrapFirstPartyLogin(options: {
  profile: FirstPartyAuthProfile;
  session: BrowserSession;
  targetUrl: string;
}): Promise<FirstPartyAuthBootstrapResult> {
  const { profile, session, targetUrl } = options;

  if (!isFirstPartyUrl(targetUrl, profile)) {
    return {
      attempted: false,
      authenticated: false,
      detail: "Skipped first-party auth bootstrap because the target host is not allowlisted.",
    };
  }

  if (!credentialsConfigured(profile)) {
    return {
      attempted: false,
      authenticated: false,
      detail: "Skipped first-party auth bootstrap because runtime credentials are not configured.",
    };
  }

  const loginUrl = resolveFirstPartyLoginUrl(targetUrl, profile);
  const loginPath = new URL(loginUrl).pathname;
  const { page } = session;
  const reusedSession = await reuseAuthenticatedSessionIfPresent({
    loginPath,
    loginUrl,
    page,
    targetUrl,
    timeoutMs: profile.bootstrapTimeoutMs,
  });
  if (reusedSession) {
    return reusedSession;
  }

  await revealCredentialFormIfNeeded(page);
  await submitCredentialSignIn({
    email: profile.email ?? "",
    loginPath,
    page,
    password: profile.password ?? "",
    timeoutMs: profile.bootstrapTimeoutMs,
  });
  await ensureAuthenticatedTarget({
    loginPath,
    page,
    targetUrl,
    timeoutMs: profile.bootstrapTimeoutMs,
  });

  return {
    attempted: true,
    authenticated: true,
    detail: "Authenticated the first-party production session before handing control to the model.",
  };
}
