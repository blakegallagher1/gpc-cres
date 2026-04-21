import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────
   "Blackstone meets Apple meets Stripe"

   Monochrome, editorial, institutional.
   Typography-led. No grid overlays. No colored accents.
   Vintage illustration on the right. Pill nav. Calm.
   ────────────────────────────────────────────────── */

interface PublicSiteShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  /** Right-side hero illustration (ReactNode, typically an SVG). */
  illustration?: ReactNode;
  className?: string;
  /** When false, hides the default marketing CTAs. Default true. */
  showMarketingCtas?: boolean;
  /** Compact layout for sign-in. Default "marketing". */
  heroTone?: "marketing" | "auth";
  /** When false, hides the Login link in the footer. Default true. */
  showFooterLoginLink?: boolean;
  /** Content placed between description and CTA (e.g. login form). */
  intro?: ReactNode;
}

interface PublicSectionCardProps {
  eyebrow: string;
  title: string;
  body: string;
  children?: ReactNode;
  className?: string;
}

interface PublicStatListProps {
  items: readonly {
    label: string;
    value: string;
    detail?: string;
  }[];
}

const PUBLIC_NAV = [{ href: "/", label: "Home" }] as const;

export function PublicSiteShell({
  eyebrow,
  title,
  description,
  children,
  illustration,
  className,
  showMarketingCtas = true,
  heroTone = "marketing",
  showFooterLoginLink = true,
  intro,
}: PublicSiteShellProps) {
  const isAuth = heroTone === "auth";

  return (
    <main className={cn("public-shell relative min-h-screen overflow-hidden", className)}>
      {/* ── HEADER ── */}
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 sm:px-8 lg:px-12">
        <Link href="/" className="group flex items-baseline gap-3">
          <span className="font-mono text-[0.64rem] font-medium uppercase tracking-[0.32em] text-[var(--pub-fg)]">
            Gallagher Property Company
          </span>
        </Link>

        {/* Pill navigation */}
        <nav className="hidden items-center md:flex">
          <div className="flex items-center gap-1 rounded-full border border-[var(--pub-border)] px-1.5 py-1">
            {PUBLIC_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-4 py-1.5 text-[0.82rem] text-[var(--pub-muted)] transition-colors duration-200 hover:bg-[var(--pub-fg)] hover:text-[var(--pub-bg)]"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <Link
            href="/login"
            className="ml-6 text-[0.82rem] text-[var(--pub-muted)] transition-colors duration-200 hover:text-[var(--pub-fg)]"
          >
            Sign in
          </Link>
        </nav>
      </header>

      {/* ── Thin rule below header ── */}
      <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
        <div className="public-rule" />
      </div>

      {/* ── HERO (split-screen) ── */}
      <section
        className={cn(
          "mx-auto grid max-w-7xl gap-8 px-6 sm:px-8 lg:px-12",
          isAuth
            ? "min-h-[60vh] items-center py-16 lg:grid-cols-[1fr_16rem]"
            : "min-h-[82vh] items-center py-20 lg:grid-cols-2",
        )}
      >
        {/* Left: messaging + CTA */}
        <div className="public-hero-stack flex max-w-2xl flex-col justify-center">
          <p className="font-mono text-[0.68rem] font-medium uppercase tracking-[0.3em] text-[var(--pub-muted)]">
            {eyebrow}
          </p>
          <h1
            className={cn(
              "font-[family-name:var(--font-display)] font-black text-[var(--pub-fg)]",
              isAuth
                ? "mt-5 max-w-[24ch] text-[clamp(1.8rem,3.6vw,3rem)] leading-[1.08] tracking-[-0.03em]"
                : "mt-6 max-w-[16ch] text-[clamp(3.2rem,6.5vw,5.8rem)] leading-[0.92] tracking-[-0.04em]",
            )}
          >
            {title}
          </h1>
          <p className="mt-6 max-w-xl text-[1.05rem] leading-[1.7] text-[var(--pub-muted)]">
            {description}
          </p>
          {intro ? <div className="mt-8">{intro}</div> : null}
          {showMarketingCtas ? (
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/login"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--pub-fg)] px-7 text-[0.88rem] font-medium text-[var(--pub-bg)] transition-transform duration-200 hover:-translate-y-0.5"
              >
                Enter workspace
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center gap-1.5 px-2 text-[0.88rem] font-medium text-[var(--pub-muted)] transition-colors duration-200 hover:text-[var(--pub-fg)]"
              >
                Review operator access
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : null}
        </div>

        {/* Right: illustration */}
        {illustration ? (
          <div
            className={cn(
              "hidden items-center justify-center text-[var(--pub-fg)] lg:flex",
              isAuth ? "max-h-[24rem]" : "max-h-[32rem]",
            )}
          >
            {illustration}
          </div>
        ) : null}
      </section>

      {/* ── Rule between hero and content ── */}
      {children ? (
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
          <div className="public-rule" />
        </div>
      ) : null}

      {/* ── CONTENT ── */}
      {children ? (
        <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-12">
          {children}
        </section>
      ) : null}

      {/* ── FOOTER ── */}
      <footer className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
        <div className="border-t border-[var(--pub-border)] py-8">
          <div className="flex flex-col gap-4 text-[0.82rem] text-[var(--pub-muted)] sm:flex-row sm:items-center sm:justify-between">
            <p>&copy; {new Date().getFullYear()} Gallagher Property Company</p>
            <div className="flex flex-wrap items-center gap-6">
              {PUBLIC_NAV.map((item) => (
                <Link
                  key={`f-${item.href}`}
                  href={item.href}
                  className="transition-colors duration-200 hover:text-[var(--pub-fg)]"
                >
                  {item.label}
                </Link>
              ))}
              {showFooterLoginLink ? (
                <Link
                  href="/login"
                  className="transition-colors duration-200 hover:text-[var(--pub-fg)]"
                >
                  Sign in
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

/* ──────────────────────────────────────────────────
   Section Card — editorial, not card-heavy
   ────────────────────────────────────────────────── */
export function PublicSectionCard({
  eyebrow,
  title,
  body,
  children,
  className,
}: PublicSectionCardProps) {
  return (
    <section className={cn("public-section-reveal py-10", className)}>
      <p className="font-mono text-[0.66rem] font-medium uppercase tracking-[0.28em] text-[var(--pub-muted)]">
        {eyebrow}
      </p>
      <h2 className="mt-4 max-w-3xl font-[family-name:var(--font-display)] text-[clamp(1.6rem,3.2vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.03em] text-[var(--pub-fg)]">
        {title}
      </h2>
      <p className="mt-4 max-w-2xl text-[0.95rem] leading-[1.7] text-[var(--pub-muted)]">
        {body}
      </p>
      {children ? <div className="mt-8">{children}</div> : null}
    </section>
  );
}

/* ──────────────────────────────────────────────────
   Stat List — minimal, inline. Adapts to 2 or 3+ items.
   ────────────────────────────────────────────────── */
export function PublicStatList({ items }: PublicStatListProps) {
  const cols = items.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3";
  return (
    <dl className={cn("grid gap-0 border-t border-[var(--pub-border)]", cols)}>
      {items.map((item, i) => (
        <div
          key={item.label}
          className={cn(
            "border-b border-[var(--pub-border)] py-5",
            i > 0 && "md:border-l md:pl-6",
          )}
        >
          <dt className="font-mono text-[0.64rem] font-medium uppercase tracking-[0.24em] text-[var(--pub-muted)]">
            {item.label}
          </dt>
          <dd className="mt-2 font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.03em] text-[var(--pub-fg)]">
            {item.value}
          </dd>
          {item.detail ? (
            <p className="mt-1.5 text-[0.84rem] leading-[1.6] text-[var(--pub-muted)]">
              {item.detail}
            </p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
