import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@entitlement-os/db";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";
import { logger, serializeErrorForLogs } from "@/lib/logger";

const ENABLE_BREAK_GLASS_FALLBACK =
  process.env.AUTH_ENABLE_CREDENTIALS_FALLBACK === "true";

let hasWarnedAboutFallback = false;

export const AUTH_NO_ORG_ERROR = "auth_no_org";
export const AUTH_DB_UNREACHABLE_ERROR = "auth_db_unreachable";

type OAuthProvisionResult = true | `/login?error=${typeof AUTH_NO_ORG_ERROR | typeof AUTH_DB_UNREACHABLE_ERROR}`;

function equalsConstantTime(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

async function isValidPassword(password: string, passwordHash?: string | null): Promise<boolean> {
  if (passwordHash) {
    const matchesHash = await bcrypt.compare(password, passwordHash);
    if (matchesHash) return true;
  }

  if (!ENABLE_BREAK_GLASS_FALLBACK) {
    return false;
  }

  const fallback = process.env.AUTH_CREDENTIALS_FALLBACK_PASSWORD;
  if (!fallback) return false;

  if (!hasWarnedAboutFallback) {
    logger.warn("Auth break-glass fallback password path enabled", {
      recommendation: "Disable AUTH_ENABLE_CREDENTIALS_FALLBACK after incident recovery.",
    });
    hasWarnedAboutFallback = true;
  }

  return equalsConstantTime(password, fallback);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureOAuthUserProvisioned(
  email: string,
  waitForRetry: (ms: number) => Promise<void> = sleep,
): Promise<OAuthProvisionResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const existing = await prisma.user.findFirst({
        where: { email },
        select: { id: true },
      });
      if (!existing) {
        const userId = randomUUID();
        const defaultOrg = await prisma.org.findFirst({
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (!defaultOrg) {
          logger.error("Auth OAuth auto-provisioning failed", {
            email,
            reason: "missing_default_org",
          });
          return `/login?error=${AUTH_NO_ORG_ERROR}`;
        }
        await prisma.user.create({
          data: { id: userId, email },
        });
        await prisma.orgMembership.create({
          data: { userId, orgId: defaultOrg.id, role: "member" },
        });
        logger.info("Auth OAuth user auto-provisioned", {
          email,
          orgId: defaultOrg.id,
        });
      }
      return true;
    } catch (error) {
      if (attempt === 0) {
        logger.warn("Auth OAuth provisioning failed, retrying", {
          email,
          attempt,
          ...serializeErrorForLogs(error),
        });
        await waitForRetry(500);
        continue;
      }
      logger.error("Auth OAuth user provisioning failed after retry", {
        email,
        ...serializeErrorForLogs(error),
      });
      return `/login?error=${AUTH_DB_UNREACHABLE_ERROR}`;
    }
  }

  return `/login?error=${AUTH_DB_UNREACHABLE_ERROR}`;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  debug: process.env.NODE_ENV !== "production",
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const email = (credentials.email as string | undefined)
            ?.trim()
            .toLowerCase();
          const password = credentials.password as string | undefined;
          logger.debug("Auth credentials authorize requested", {
            email,
          });

          if (!email || !password) {
            logger.debug("Auth credentials authorize rejected", {
              reason: "missing_email_or_password",
            });
            return null;
          }
          if (!isEmailAllowed(email)) {
            logger.debug("Auth credentials authorize rejected", {
              email,
              reason: "email_not_allowed",
            });
            return null;
          }

          const user = await prisma.user.findFirst({
            where: { email },
            select: { id: true, email: true, passwordHash: true },
          });
          if (!user) {
            logger.debug("Auth credentials authorize rejected", {
              email,
              reason: "user_not_found",
            });
            return null;
          }

          const valid = await isValidPassword(password, user.passwordHash);
          if (!valid) {
            logger.debug("Auth credentials authorize rejected", {
              email,
              reason: "invalid_password",
            });
            return null;
          }

          const membership = await prisma.orgMembership.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: "asc" },
            select: { orgId: true },
          });
          if (!membership) {
            logger.debug("Auth credentials authorize rejected", {
              email,
              reason: "no_org_membership",
            });
            return null;
          }

          logger.debug("Auth credentials authorize succeeded", {
            email,
            orgId: membership.orgId,
          });
          return { id: user.id, email: user.email, orgId: membership.orgId };
        } catch (error) {
          logger.error("Auth credentials authorize failed", serializeErrorForLogs(error));
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      // Credentials provider already validates in authorize() — allow through.
      if (account?.provider === "credentials") return true;

      // For OAuth (Google), enforce the email allowlist.
      const email = user.email?.trim().toLowerCase();
      if (!email || !isEmailAllowed(email)) {
        logger.debug("Auth OAuth sign-in rejected", {
          email,
          reason: "email_not_allowed",
        });
        return "/login?error=unauthorized";
      }

      return ensureOAuthUserProvisioned(email);
    },
    async jwt({ token, user, account }) {
      // Credentials provider sets orgId directly on the user object.
      if (user && account?.provider === "credentials") {
        token.userId = user.id;
        token.orgId = (user as unknown as { orgId: string }).orgId;
        token.email = user.email ?? undefined;
        return token;
      }

      // OAuth sign-in: look up userId and orgId from DB by email (retry once on transient failure).
      if (user && account?.provider && account.provider !== "credentials") {
        const email = user.email?.trim().toLowerCase();
        if (email) {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const dbUser = await prisma.user.findFirst({
                where: { email },
                select: { id: true, email: true },
              });
              if (dbUser) {
                const membership = await prisma.orgMembership.findFirst({
                  where: { userId: dbUser.id },
                  orderBy: { createdAt: "asc" },
                  select: { orgId: true },
                });
                token.userId = dbUser.id;
                token.orgId = membership?.orgId;
                token.email = dbUser.email;
              }
              break;
            } catch (error) {
              if (attempt === 0) {
                logger.warn("Auth JWT callback DB lookup failed, retrying", {
                  email,
                  attempt,
                  ...serializeErrorForLogs(error),
                });
                await new Promise((r) => setTimeout(r, 500));
                continue;
              }
              logger.error("Auth JWT callback DB lookup failed after retry", {
                email,
                ...serializeErrorForLogs(error),
              });
            }
          }
        }
      }

      return token;
    },
    session({ session, token }) {
      if (token.userId) session.user.id = token.userId;
      if (token.orgId)
        (session.user as unknown as { orgId: string }).orgId = token.orgId;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
