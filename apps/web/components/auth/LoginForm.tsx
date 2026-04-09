"use client";

import { startTransition, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const HERO_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const loginErrorMessages: Record<string, string> = {
  unauthorized: "This account is not approved for access.",
  auth_unavailable: "Auth service unavailable. Please try again.",
  auth_no_org: "No default organization is configured for this workspace. Contact support.",
  auth_db_unreachable: "Auth database unavailable. Please try again.",
  CredentialsSignin: "Invalid email or password. Please try again.",
};

type SearchParams = ReturnType<typeof useSearchParams>;

function getSafeCallbackUrl(searchParams: SearchParams): string {
  const nextParam = searchParams?.get("next");
  return typeof nextParam === "string" && nextParam.startsWith("/") ? nextParam : "/chat";
}

function getLoginErrorMessage(searchParams: SearchParams): string | null {
  const errorCode = searchParams?.get("error");
  if (!errorCode) return null;
  return loginErrorMessages[errorCode] ?? "Unable to sign in. Please try again.";
}

interface SignInActionsProps {
  isBusy: boolean;
  onGoogleSignIn: () => Promise<void>;
  onPasswordAccess: () => void;
}

function SignInActions({ isBusy, onGoogleSignIn, onPasswordAccess }: SignInActionsProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button
        className="h-12 min-w-[14rem] shadow-sm transition-shadow hover:shadow-md"
        disabled={isBusy}
        onClick={() => {
          void onGoogleSignIn();
        }}
        size="lg"
      >
        Continue with Google
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>

      <Button
        className="h-12 min-w-[13rem]"
        disabled={isBusy}
        onClick={onPasswordAccess}
        size="lg"
        variant="outline"
      >
        Use company credentials
      </Button>
    </div>
  );
}

interface CredentialAccessProps {
  email: string;
  password: string;
  isBusy: boolean;
  isSubmitting: boolean;
  isVisible: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onToggle: () => void;
}

function CredentialAccess({
  email,
  password,
  isBusy,
  isSubmitting,
  isVisible,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onToggle,
}: CredentialAccessProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;

  return (
    <div className="border-t border-border/70 pt-6">
      <button
        className="font-mono text-xs uppercase tracking-[0.26em] text-muted-foreground transition-colors hover:text-foreground"
        onClick={onToggle}
        type="button"
      >
        {isVisible ? "Hide credential sign-in" : "Use credential sign-in"}
      </button>

      <AnimatePresence initial={false}>
        {isVisible ? (
          <motion.form
            animate={{ height: "auto", opacity: 1, y: 0 }}
            className="mt-5 space-y-5 overflow-hidden"
            exit={{ height: 0, opacity: 0, y: prefersReducedMotion ? 0 : -12 }}
            initial={{ height: 0, opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
            onSubmit={(event) => {
              void onSubmit(event);
            }}
            transition={{ duration: 0.35, ease: HERO_EASE }}
          >
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  autoComplete="email"
                  className="h-12"
                  id="email"
                  onChange={(event) => onEmailChange(event.target.value)}
                  placeholder="you@gallagherpropco.com"
                  required
                  type="email"
                  value={email}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  autoComplete="current-password"
                  className="h-12"
                  id="password"
                  onChange={(event) => onPasswordChange(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button className="h-12 shadow-sm" disabled={isBusy} size="lg" type="submit">
                {isSubmitting ? "Accessing..." : "Access Entitlement OS"}
              </Button>
              <p className="text-sm text-muted-foreground">
                Approved operators only. Google OAuth remains the default path.
              </p>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * Client-only sign-in actions for `/login`, composed inside `PublicSiteShell` from the server route.
 */
export function LoginForm() {
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [isCredentialSubmitting, setIsCredentialSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  useEffect(() => {
    const message = getLoginErrorMessage(searchParams);
    if (!message) return;

    startTransition(() => setShowPasswordForm(true));
    toast.error(message);
  }, [searchParams]);

  const isBusy = isCredentialSubmitting || isGoogleSubmitting;

  const revealPasswordAccess = () => {
    startTransition(() => setShowPasswordForm(true));
  };

  const handleCredentialSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCredentialSubmitting(true);

    try {
      await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: true,
        callbackUrl: getSafeCallbackUrl(searchParams),
      });
    } catch {
      toast.error("Login failed. Please try again.");
    } finally {
      setIsCredentialSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleSubmitting(true);

    try {
      await signIn("google", {
        callbackUrl: getSafeCallbackUrl(searchParams),
      });
    } catch {
      toast.error("Google sign-in failed. Please try again.");
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl space-y-8">
      <SignInActions
        isBusy={isBusy}
        onGoogleSignIn={handleGoogleSignIn}
        onPasswordAccess={revealPasswordAccess}
      />

      <CredentialAccess
        email={email}
        isBusy={isBusy}
        isSubmitting={isCredentialSubmitting}
        isVisible={showPasswordForm}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleCredentialSubmit}
        onToggle={() => {
          startTransition(() => setShowPasswordForm((current) => !current));
        }}
        password={password}
      />
    </div>
  );
}
