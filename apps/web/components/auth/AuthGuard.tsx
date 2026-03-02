"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/db/supabase";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";

interface AuthGuardProps {
  children: React.ReactNode;
}

const DISABLE_AUTH = process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const [isReady, setIsReady] = useState(DISABLE_AUTH);

  useEffect(() => {
    if (DISABLE_AUTH) return;

    let isMounted = true;

    const handleUnauthorized = async () => {
      await supabase.auth.signOut();
      router.replace("/login?error=unauthorized");
    };

    const checkSession = async () => {
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Session check timed out")), 5000)
        );
        const { data } = await Promise.race([sessionPromise, timeoutPromise]);
        if (!isMounted) return;
        if (!data.session) {
          router.replace("/login");
          return;
        }
        if (!isEmailAllowed(data.session.user?.email)) {
          await handleUnauthorized();
          return;
        }
        setIsReady(true);
      } catch (error) {
        console.error("[AuthGuard] Session check failed:", error);
        if (!isMounted) return;
        router.replace("/login");
      }
    };

    checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      if (!isEmailAllowed(session.user?.email)) {
        void handleUnauthorized();
        return;
      }
      setIsReady(true);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Checking session...
      </div>
    );
  }

  return <>{children}</>;
}
