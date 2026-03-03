import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@entitlement-os/db";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials.email as string | undefined)
          ?.trim()
          .toLowerCase();
        const password = credentials.password as string | undefined;

        if (!email || !password) return null;
        if (!isEmailAllowed(email)) return null;

        const user = await prisma.user.findFirst({
          where: { email },
          select: { id: true, email: true, passwordHash: true },
        });
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        const membership = await prisma.orgMembership.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "asc" },
          select: { orgId: true },
        });
        if (!membership) return null;

        return { id: user.id, email: user.email, orgId: membership.orgId };
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
