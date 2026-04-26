"use client";

import { ClerkProvider } from "@clerk/nextjs";

const LOCAL_AUTH_BYPASS = process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  if (LOCAL_AUTH_BYPASS) {
    return <>{children}</>;
  }

  return <ClerkProvider>{children}</ClerkProvider>;
}
