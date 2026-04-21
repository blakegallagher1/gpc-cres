"use client";

import { ClerkProvider } from "@clerk/nextjs";

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
