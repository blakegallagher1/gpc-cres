import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";
import { PublicSiteShell } from "@/components/marketing/PublicSiteShell";

export const metadata: Metadata = {
  title: "Sign in | Gallagher Property Company",
  description: "Sign in to Entitlement OS for approved Gallagher Property Company operators.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <PublicSiteShell
        eyebrow="Operator access"
        title="Sign in to Entitlement OS"
        description="Use Google or company credentials. Sign-in is limited to approved operators."
        heroTone="auth"
        showMarketingCtas={false}
        showFooterLoginLink={false}
        intro={<LoginForm />}
      >
        {null}
      </PublicSiteShell>
    </Suspense>
  );
}
