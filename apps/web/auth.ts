import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
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
  providers: [
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
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.orgId = (user as unknown as { orgId: string }).orgId;
        token.email = user.email ?? undefined;
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
