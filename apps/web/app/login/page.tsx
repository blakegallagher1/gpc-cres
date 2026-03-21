import { Suspense } from "react";
import { LoginLanding } from "@/components/auth/LoginLanding";

/** Public auth entry page that wraps the branded login landing in Suspense for search-param access. */
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginLanding />
    </Suspense>
  );
}
