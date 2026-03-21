"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const heroEase: [number, number, number, number] = [0.22, 1, 0.36, 1];

const loginErrorMessages: Record<string, string> = {
  unauthorized: "This account is not approved for access.",
  auth_unavailable: "Auth service unavailable. Please try again.",
  CredentialsSignin: "Invalid email or password. Please try again.",
};

const proofPoints = [
  {
    eyebrow: "Parcel intelligence",
    title: "Read the site before the first tour.",
    body: "Boundary, ownership, adjacency, and surface-level risk stay visible while the opportunity is still moving fast.",
  },
  {
    eyebrow: "Entitlement context",
    title: "Bring zoning and precedent into the same working pass.",
    body: "Jurisdiction signals, process detail, and comparable pathfinding show up before outside spend compounds.",
  },
  {
    eyebrow: "Workflow memory",
    title: "Keep the operating thread attached to the deal.",
    body: "Evidence, agent runs, and execution context persist with the opportunity instead of dissolving into inbox noise.",
  },
] as const;

const workflowSteps = [
  {
    step: "01",
    title: "Scan the parcel",
    body: "Open with parcel context, ownership shape, and immediate site risk so the first call starts on facts, not speculation.",
  },
  {
    step: "02",
    title: "Read the entitlement path",
    body: "Layer zoning posture, process friction, and precedent into one operating view before capital and counsel are committed.",
  },
  {
    step: "03",
    title: "Coordinate the work",
    body: "Move from research into workflows, approvals, evidence packaging, and agent execution without switching surfaces.",
  },
  {
    step: "04",
    title: "Preserve the learning",
    body: "Capture decisions, artifacts, and durable memory so each deal improves the next one instead of restarting from scratch.",
  },
] as const;

const heroOperatingLanes = [
  {
    step: "01",
    title: "Parcel scan",
    body: "Ownership, adjacency, drainage, and immediate site risk remain visible from the first pass.",
  },
  {
    step: "02",
    title: "Entitlement read",
    body: "Zoning posture, precedent, and process friction stay connected to the actual geography.",
  },
  {
    step: "03",
    title: "Run coordination",
    body: "Evidence, agent execution, and saved threads stay attached to the deal instead of splintering.",
  },
] as const;

const accessNotes = [
  "Google OAuth remains the default entry point for approved operators.",
  "Credential sign-in stays available as a fallback without changing the working surface.",
  "Saved threads, live parcels, and uploaded evidence persist into the next authenticated route.",
] as const;

const heroReveal = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.72, ease: heroEase },
  },
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
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <motion.div whileHover={prefersReducedMotion ? undefined : { y: -2 }}>
        <Button
          className="h-12 min-w-[13rem] bg-white px-5 text-sm font-semibold text-black hover:bg-white/90"
          disabled={isBusy}
          onClick={() => {
            void onGoogleSignIn();
          }}
          size="lg"
        >
          Sign in with Google
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </motion.div>

      <motion.div whileHover={prefersReducedMotion ? undefined : { y: -2 }}>
        <Button
          className="h-12 min-w-[11rem] border-white/20 bg-white/6 px-5 text-sm font-semibold text-white hover:bg-white/12 hover:text-white"
          disabled={isBusy}
          onClick={onPasswordAccess}
          size="lg"
          variant="outline"
        >
          Use password
        </Button>
      </motion.div>
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
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
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
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="border-t border-white/15 pt-6">
      <button
        className="font-mono text-xs uppercase tracking-[0.26em] text-white/72 transition-colors hover:text-white"
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
            transition={{ duration: 0.35, ease: heroEase }}
          >
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-white/78" htmlFor="email">
                  Email
                </Label>
                <Input
                  autoComplete="email"
                  className="h-12 border-white/20 bg-white/5 text-white placeholder:text-white/45 focus-visible:ring-white/35 focus-visible:ring-offset-0"
                  id="email"
                  onChange={(event) => onEmailChange(event.target.value)}
                  placeholder="you@gallagherpropco.com"
                  required
                  type="email"
                  value={email}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-white/78" htmlFor="password">
                  Password
                </Label>
                <Input
                  autoComplete="current-password"
                  className="h-12 border-white/20 bg-white/5 text-white placeholder:text-white/45 focus-visible:ring-white/35 focus-visible:ring-offset-0"
                  id="password"
                  onChange={(event) => onPasswordChange(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                className="h-12 bg-white px-5 text-sm font-semibold text-black hover:bg-white/90"
                disabled={isBusy}
                size="lg"
                type="submit"
              >
                {isSubmitting ? "Signing in..." : "Sign in with password"}
              </Button>
              <p className="text-sm text-white/58">Approved operators only. Google OAuth remains the default path.</p>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * Public login landing surface for Entitlement OS.
 * Keeps authentication actions intact while upgrading the entry page into a branded, image-led experience.
 */
export function LoginLanding() {
  const searchParams = useSearchParams();
  const heroRef = useRef<HTMLElement | null>(null);
  const accessRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [isCredentialSubmitting, setIsCredentialSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const heroImageY = useTransform(scrollYProgress, [0, 1], [0, prefersReducedMotion ? 0 : 88]);
  const heroImageScale = useTransform(scrollYProgress, [0, 1], [1, prefersReducedMotion ? 1 : 1.05]);
  const heroOverlayOpacity = useTransform(scrollYProgress, [0, 1], [0.56, prefersReducedMotion ? 0.56 : 0.72]);

  useEffect(() => {
    const message = getLoginErrorMessage(searchParams);
    if (!message) return;

    startTransition(() => setShowPasswordForm(true));
    toast.error(message);
  }, [searchParams]);

  const isBusy = isCredentialSubmitting || isGoogleSubmitting;

  const revealPasswordAccess = () => {
    startTransition(() => setShowPasswordForm(true));
    accessRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  };

  const handleCredentialSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
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
    <div className="bg-background text-foreground">
      <section className="relative isolate min-h-[100svh] overflow-hidden bg-black text-white" ref={heroRef}>
        <motion.div className="absolute inset-0" style={{ scale: heroImageScale, y: heroImageY }}>
          <Image
            alt="Commercial parcels, infrastructure, and industrial buildings at blue hour"
            className="object-cover object-center"
            fill
            priority
            sizes="100vw"
            src="/images/entitlement-os-login-hero.png"
          />
        </motion.div>

        <motion.div
          className="absolute inset-0 bg-[linear-gradient(112deg,rgba(0,0,0,0.88)_0%,rgba(0,0,0,0.76)_28%,rgba(0,0,0,0.30)_58%,rgba(0,0,0,0.80)_100%)]"
          style={{ opacity: heroOverlayOpacity }}
        />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black via-black/48 to-transparent" />

        <div className="relative flex min-h-[100svh] items-end px-6 py-10 md:px-10 md:py-12 lg:px-16">
          <motion.div
            animate="visible"
            className="grid w-full gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:items-end"
            initial="hidden"
            variants={{
              hidden: {},
              visible: {
                transition: {
                  staggerChildren: 0.1,
                  delayChildren: 0.08,
                },
              },
            }}
          >
            <div className="max-w-xl space-y-8">
              <motion.div className="flex items-center gap-4" variants={heroReveal}>
                <Image alt="" className="h-12 w-12 rounded-2xl" height={48} priority src="/icon.svg" width={48} />
                <div>
                  <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-white/62">
                    Gallagher Property Company
                  </p>
                  <p className="mt-1 text-sm text-white/74">Commercial real estate operating system</p>
                </div>
              </motion.div>

              <motion.div className="space-y-4" variants={heroReveal}>
                <h1 className="max-w-[8.5ch] text-5xl font-semibold tracking-[-0.05em] text-balance sm:text-6xl lg:text-7xl">
                  Entitlement OS
                </h1>
                <p className="max-w-[16ch] text-3xl font-medium leading-tight tracking-[-0.04em] text-white/92 sm:text-4xl">
                  Know the site before the room does.
                </p>
                <p className="max-w-lg text-base leading-7 text-white/72 sm:text-lg">
                  One operating system for parcel intelligence, zoning context, active workflows, and durable deal memory.
                </p>
              </motion.div>

              <motion.div variants={heroReveal}>
                <SignInActions
                  isBusy={isBusy}
                  onGoogleSignIn={handleGoogleSignIn}
                  onPasswordAccess={revealPasswordAccess}
                />
              </motion.div>

              <motion.p className="max-w-md text-sm leading-6 text-white/58" variants={heroReveal}>
                Approved operators move directly into live parcels, evidence, workflows, and memory without leaving the working surface.
              </motion.p>
            </div>

            <motion.div
              className="hidden space-y-5 lg:block"
              variants={heroReveal}
            >
              <div className="border-t border-white/16 pt-4">
                <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-white/56">
                  Live operating layers
                </p>
              </div>
              <div className="space-y-4">
                {heroOperatingLanes.map((lane) => (
                  <div className="border-t border-white/12 pt-4" key={lane.step}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-white/48">
                          {lane.step}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white/94">
                          {lane.title}
                        </h3>
                      </div>
                      <span className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-white/40">
                        Live
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-white/62">{lane.body}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <main>
        <section className="border-b border-border bg-background px-6 py-20 md:px-10 lg:px-16">
          <div className="mx-auto max-w-6xl">
            <motion.div
              className="max-w-2xl"
              initial="hidden"
              variants={heroReveal}
              viewport={{ once: true, amount: 0.4 }}
              whileInView="visible"
            >
              <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-muted-foreground">Support</p>
              <h2 className="mt-3 max-w-[13ch] text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl">
                Three live layers before the first call.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                Parcel intelligence, entitlement context, and workflow memory arrive in one readable pass.
              </p>
            </motion.div>

            <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start">
              <motion.figure
                className="relative min-h-[24rem] overflow-hidden rounded-[2rem] border border-border/70 bg-muted/40"
                initial="hidden"
                variants={heroReveal}
                viewport={{ once: true, amount: 0.35 }}
                whileInView="visible"
              >
                <Image
                  alt="Industrial corridor and adjacent parcels at sunrise"
                  className="object-cover object-center"
                  fill
                  sizes="(min-width: 1024px) 52vw, 100vw"
                  src="/images/gpc-home-hero.png"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.06)_0%,rgba(15,23,42,0.16)_36%,rgba(15,23,42,0.78)_100%)]" />
                <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
                  <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/64">
                    Field context
                  </p>
                  <h3 className="mt-3 max-w-md text-2xl font-semibold tracking-[-0.04em] text-white sm:text-[2rem]">
                    Read the physical story before the memo starts writing itself.
                  </h3>
                  <p className="mt-4 max-w-lg text-sm leading-6 text-white/74">
                    Land, frontage, drainage, access, and neighboring industrial activity stay visible while the team decides whether the next hour of diligence is worth taking.
                  </p>
                </div>
              </motion.figure>

              <div className="divide-y divide-border border-y border-border">
                {proofPoints.map((point, index) => (
                  <motion.article
                    className="py-6 first:pt-0 last:pb-0 md:py-7"
                    initial="hidden"
                    key={point.title}
                    transition={{ delay: index * 0.08 }}
                    variants={heroReveal}
                    viewport={{ once: true, amount: 0.45 }}
                    whileInView="visible"
                  >
                    <p className="font-mono text-[0.7rem] uppercase tracking-[0.24em] text-muted-foreground">
                      {point.eyebrow}
                    </p>
                    <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em]">{point.title}</h3>
                    <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">{point.body}</p>
                  </motion.article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(15,23,42,0.04)_24%,rgba(255,255,255,0)_100%)] px-6 py-20 md:px-10 lg:px-16">
          <div className="absolute inset-x-0 top-0 h-px bg-border" />
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
            <motion.div
              className="max-w-lg lg:sticky lg:top-12"
              initial="hidden"
              variants={heroReveal}
              viewport={{ once: true, amount: 0.4 }}
              whileInView="visible"
            >
              <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-muted-foreground">Detail</p>
              <h2 className="mt-3 max-w-[12ch] text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl">
                From parcel scan to active deal room.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Entitlement OS keeps the research, execution, and memory trail attached to the opportunity while the deal is still moving.
              </p>
            </motion.div>

            <div className="space-y-8">
              {workflowSteps.map((step, index) => (
                <motion.article
                  className="grid gap-4 border-t border-border pt-5 md:grid-cols-[auto_1fr]"
                  initial="hidden"
                  key={step.step}
                  transition={{ delay: index * 0.06 }}
                  variants={heroReveal}
                  viewport={{ once: true, amount: 0.25 }}
                  whileInView="visible"
                >
                  <p className="font-mono text-sm uppercase tracking-[0.26em] text-muted-foreground">{step.step}</p>
                  <div>
                    <h3 className="text-xl font-semibold tracking-[-0.03em]">{step.title}</h3>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{step.body}</p>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-black px-6 py-20 text-white md:px-10 lg:px-16" ref={accessRef}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0)_44%)]" />

          <div className="relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
            <motion.div
              initial="hidden"
              variants={heroReveal}
              viewport={{ once: true, amount: 0.4 }}
              whileInView="visible"
            >
              <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-white/62">Final CTA</p>
              <h2 className="mt-3 max-w-[12ch] text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl">
                Enter the operating system.
              </h2>
              <p className="mt-4 max-w-lg text-base leading-7 text-white/68">
                Approved teams can move straight into live parcels, workflows, evidence, and memory capture from the same surface.
              </p>
              <div className="mt-8 space-y-3 border-t border-white/12 pt-6">
                {accessNotes.map((note) => (
                  <p className="max-w-lg text-sm leading-6 text-white/56" key={note}>
                    {note}
                  </p>
                ))}
              </div>
            </motion.div>

            <motion.div
              className="space-y-6"
              initial="hidden"
              variants={heroReveal}
              viewport={{ once: true, amount: 0.35 }}
              whileInView="visible"
            >
              <SignInActions
                isBusy={isBusy}
                onGoogleSignIn={handleGoogleSignIn}
                onPasswordAccess={() => {
                  startTransition(() => setShowPasswordForm(true));
                }}
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
            </motion.div>
          </div>
        </section>
      </main>
    </div>
  );
}
