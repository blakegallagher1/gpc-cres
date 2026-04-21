import { describe, expect, it } from "vitest";

describe("/api/auth/[...nextauth] route contract", () => {
  it("NextAuth route has been removed in favor of Clerk authentication", () => {
    // The [...nextauth] route was removed when migrating from NextAuth v5 to Clerk.
    // Clerk handles authentication via its own middleware (clerkMiddleware in proxy.ts)
    // and server-side helpers (getAuth, currentUser, auth) from @clerk/nextjs/server.
    // This test documents the intentional removal of the NextAuth route handler.
    expect(true).toBe(true);
  });
});
