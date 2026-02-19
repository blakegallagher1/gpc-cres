import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { prisma } from "@entitlement-os/db";
import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import { resolveSupabaseAnonKey, resolveSupabaseUrl } from "@/lib/db/supabaseEnv";

let hasLoggedMissingDatabaseUrl = false;
const DEFAULT_E2E_ORG_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_E2E_USER_ID = "00000000-0000-0000-0000-000000000002";

function isAuthDisabledForLocalDev(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";
}

function getDisabledAuthFallbackOrgId(): string {
  return (
    process.env.E2E_ORG_ID ||
    process.env.NEXT_PUBLIC_E2E_ORG_ID ||
    DEFAULT_E2E_ORG_ID
  );
}

function getDisabledAuthFallbackUserId(): string {
  return (
    process.env.E2E_USER_ID ||
    process.env.NEXT_PUBLIC_E2E_USER_ID ||
    DEFAULT_E2E_USER_ID
  );
}

/**
 * Resolve Supabase auth from request cookies.
 * Returns the authenticated user ID and their org ID, or null if unauthenticated.
 */
export async function resolveAuth(): Promise<{
  userId: string;
  orgId: string;
} | null> {
  return Sentry.startSpan(
    {
      name: "supabase.resolve_auth",
      op: "auth.resolve",
    },
    async () => {
      if (isAuthDisabledForLocalDev()) {
        return {
          userId: getDisabledAuthFallbackUserId(),
          orgId: getDisabledAuthFallbackOrgId(),
        };
      }

      const supabaseUrl = resolveSupabaseUrl() ?? "";
      const supabaseAnonKey = resolveSupabaseAnonKey() ?? "";
      const databaseUrl = process.env.DATABASE_URL || "";

      if (!supabaseUrl || !supabaseAnonKey) return null;
      if (!databaseUrl) {
        if (!hasLoggedMissingDatabaseUrl) {
          hasLoggedMissingDatabaseUrl = true;
          console.error(
            "[resolveAuth] Missing DATABASE_URL; skipping auth database lookup.",
          );
        }
        return null;
      }

      const cookieStore = await cookies();
      const headersStore = await headers();
      const authHeader = headersStore.get("authorization");
      const tokenFromHeader = authHeader?.toLowerCase().startsWith("bearer ")
        ? authHeader.slice("bearer ".length).trim()
        : null;

      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            // Supabase SSR expects auth cookies to be truly removed.
            // Leaving an empty-string cookie can trigger JSON.parse("") inside the
            // Supabase client, causing 500s on otherwise-unauthenticated requests.
            try {
              // Next.js cookies() supports delete(name) in modern versions.
              cookieStore.delete(name);
            } catch {
              cookieStore.set({ name, value: "", ...options, maxAge: 0 });
            }
          },
        },
      });

      if (tokenFromHeader) {
        const {
          data: { user },
          error: tokenError,
        } = await supabase.auth.getUser(tokenFromHeader);

        if (user) {
          const membership = await prisma.orgMembership.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: "asc" },
            select: { orgId: true },
          });

          if (membership) {
            return { userId: user.id, orgId: membership.orgId };
          }
          return null;
        }

        if (tokenError) {
          Sentry.captureException(tokenError, {
            tags: { route: "auth.resolve", authMode: "bearer" },
          });
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      // Look up org membership for this user
      let membership = await prisma.orgMembership.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        select: { orgId: true },
      });
      if (!membership) return null;

      return { userId: user.id, orgId: membership.orgId };
    },
  );
}
