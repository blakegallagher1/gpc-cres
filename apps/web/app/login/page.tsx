import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";
import { PublicSiteShell } from "@/components/marketing/PublicSiteShell";

const ACCESS_NOTES = [
  "Approved operators go straight into active deals, memory, and execution.",
  "Google OAuth remains the default entry point for approved operators.",
  "Company credentials remain available when OAuth is not the working path.",
] as const;

export const metadata: Metadata = {
  title: "Sign in | Gallagher Property Company",
  description: "Sign in to Entitlement OS for approved Gallagher Property Company operators.",
};

/** Public auth entry: same chrome as the marketing site, primary surface is sign-in (not a long-form ad). */
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <PublicSiteShell
        aside={
          <div className="space-y-5">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-muted-foreground">Access</p>
            <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">
              The public site states the strategy. The workspace keeps it executable.
            </p>
            <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
              {ACCESS_NOTES.map((note) => (
                <li className="flex gap-2.5" key={note}>
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/45" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        }
        description="Use Google or company credentials. Sign-in is limited to approved operators."
        eyebrow="Operator access"
        showFooterLoginLink={false}
        heroTone="auth"
        intro={<LoginForm />}
        showMarketingCtas={false}
        title="Sign in to Entitlement OS"
      >
        {null}
      </PublicSiteShell>
    </Suspense>
  );
}
