import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { prisma } from "@entitlement-os/db";
import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";

let hasLoggedMissingDatabaseUrl = false;

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
      const supabaseUrl =
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const supabaseAnonKey =
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        "";
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
            select: { orgId: true },
          });

          if (membership) {
            return { userId: user.id, orgId: membership.orgId };
          }

          const defaultOrg = await prisma.org.findFirst({ select: { id: true } });
          if (!defaultOrg) return null;

          await prisma.user.upsert({
            where: { id: user.id },
            update: { email: user.email ?? "" },
            create: { id: user.id, email: user.email ?? "" },
          });

          const fallback = await prisma.orgMembership.create({
            data: { orgId: defaultOrg.id, userId: user.id, role: "member" },
            select: { orgId: true },
          });

          return { userId: user.id, orgId: fallback.orgId };
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
        select: { orgId: true },
      });

      // Auto-provision: if user has no org, assign them to the default org
      if (!membership) {
        const defaultOrg = await prisma.org.findFirst({ select: { id: true } });
        if (!defaultOrg) return null;

        // Upsert user record (Supabase auth user may not exist in our User table yet)
        await prisma.user.upsert({
          where: { id: user.id },
          update: { email: user.email ?? "" },
          create: { id: user.id, email: user.email ?? "" },
        });

        membership = await prisma.orgMembership.create({
          data: { orgId: defaultOrg.id, userId: user.id, role: "member" },
          select: { orgId: true },
        });
      }

      return { userId: user.id, orgId: membership.orgId };
    },
  );
}
