"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface AuthGuardProps {
  children: React.ReactNode;
}

const DISABLE_AUTH = process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (DISABLE_AUTH) return;
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (DISABLE_AUTH) {
    return <>{children}</>;
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Checking session...
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return <>{children}</>;
}
