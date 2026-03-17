import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@entitlement-os/db";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";

const ENABLE_BREAK_GLASS_FALLBACK =
  process.env.AUTH_ENABLE_CREDENTIALS_FALLBACK === "true";

let hasWarnedAboutFallback = false;

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
    console.warn(
      "[auth] break-glass fallback password path is enabled. Disable AUTH_ENABLE_CREDENTIALS_FALLBACK after incident recovery.",
    );
    hasWarnedAboutFallback = true;
  }

  return equalsConstantTime(password, fallback);
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
          console.log("[auth] authorize called, email:", credentials?.email);
          const email = (credentials.email as string | undefined)
            ?.trim()
            .toLowerCase();
          const password = credentials.password as string | undefined;

          if (!email || !password) {
            console.log("[auth] missing email or password");
            return null;
          }
          if (!isEmailAllowed(email)) {
            console.log("[auth] email not allowed:", email);
            return null;
          }

          const user = await prisma.user.findFirst({
            where: { email },
            select: { id: true, email: true, passwordHash: true },
          });
          if (!user) {
            console.log("[auth] user not found");
            return null;
          }

          const valid = await isValidPassword(password, user.passwordHash);
          if (!valid) {
            console.log("[auth] invalid password");
            return null;
          }

          const membership = await prisma.orgMembership.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: "asc" },
            select: { orgId: true },
          });
          if (!membership) {
            console.log("[auth] no org membership");
            return null;
          }

          console.log("[auth] authorize success for", email);
          return { id: user.id, email: user.email, orgId: membership.orgId };
        } catch (error) {
          console.error("[auth] authorize error:", error);
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
        console.log("[auth] OAuth email not allowed:", email);
        return "/login?error=unauthorized";
      }

      // Auto-provision user + org membership on first OAuth sign-in.
      // Retry once on transient DB errors to avoid auth_unavailable flakes.
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
              console.error("[auth] no org exists for auto-provisioning");
              return "/login?error=auth_unavailable";
            }
            await prisma.user.create({
              data: { id: userId, email },
            });
            await prisma.orgMembership.create({
              data: { userId, orgId: defaultOrg.id, role: "member" },
            });
            console.log("[auth] auto-provisioned OAuth user:", email);
          }
          break; // success — exit retry loop
        } catch (error) {
          if (attempt === 0) {
            console.warn("[auth] OAuth provisioning failed, retrying:", error);
            await new Promise((r) => setTimeout(r, 500));
            continue;
          }
          console.error("[auth] OAuth user provisioning error after retry:", error);
          return "/login?error=auth_unavailable";
        }
      }

      return true;
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
                console.warn("[auth] jwt callback DB lookup failed, retrying:", error);
                await new Promise((r) => setTimeout(r, 500));
                continue;
              }
              console.error("[auth] jwt callback DB lookup failed after retry:", error);
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
