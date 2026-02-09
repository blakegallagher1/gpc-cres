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
      const { data } = await supabase.auth.getSession();
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
