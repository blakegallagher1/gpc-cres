"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

interface AuthGuardProps {
  children: React.ReactNode;
}

const DISABLE_AUTH = process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";

export function AuthGuard({ children }: AuthGuardProps) {
  if (DISABLE_AUTH) {
    return <>{children}</>;
  }

  return <ClerkAuthGuard>{children}</ClerkAuthGuard>;
}

function ClerkAuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/login");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Checking session...
      </div>
    );
  }

  if (!isSignedIn) {
    return null;
  }

  return <>{children}</>;
}
