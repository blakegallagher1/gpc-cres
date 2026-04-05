import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface PublicSiteShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
  intro?: ReactNode;
  className?: string;
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
    detail: string;
  }[];
}

const PUBLIC_NAV = [
  { href: "/", label: "Home" },
  { href: "/focus", label: "Focus" },
  { href: "/strategy", label: "Strategy" },
  { href: "/platform", label: "Platform" },
] as const;

export function PublicSiteShell({
  eyebrow,
  title,
  description,
  children,
  aside,
  intro,
  className,
}: PublicSiteShellProps) {
  return (
    <main className={cn("relative overflow-hidden bg-transparent text-foreground", className)}>
      <div className="pointer-events-none absolute inset-0 -z-[6] public-site-grid opacity-[0.55] dark:opacity-[0.45]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-[5] mix-blend-multiply public-site-grain opacity-[0.038] dark:opacity-[0.07] dark:mix-blend-overlay"
      />
      <div className="absolute inset-x-0 top-0 -z-10 h-[48rem] bg-[radial-gradient(circle_at_18%_8%,oklch(var(--shell-glow)/0.16),transparent_32%),radial-gradient(circle_at_85%_12%,oklch(var(--shell-accent)/0.09),transparent_38%),linear-gradient(180deg,transparent,oklch(var(--color-background)/0.12))]" />
      <div className="absolute inset-x-0 top-16 -z-10 mx-auto hidden h-[30rem] w-[84%] max-w-5xl bg-white/14 blur-3xl md:block dark:bg-white/[0.06]" />

      <section className="mx-auto flex min-h-[100svh] w-full max-w-7xl flex-col px-5 pb-14 pt-6 sm:px-6 lg:px-8">
        <header className="mb-12 flex items-center justify-between gap-8 border-b border-border/55 pb-5">
          <div className="relative min-w-0">
            <span
              className="absolute -left-3 top-1 hidden h-[calc(100%-0.25rem)] w-px bg-gradient-to-b from-transparent via-border/70 to-transparent lg:block"
              aria-hidden
            />
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.34em] text-muted-foreground">
              Gallagher Property Company
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Real estate investment and development
            </p>
          </div>

          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            {PUBLIC_NAV.map((item) => (
              <Link
                key={item.href}
                className="relative pb-0.5 transition-colors duration-200 after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-foreground/70 after:transition-[width] after:duration-300 hover:text-foreground hover:after:w-full"
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-16">
          <div className="public-hero-stack max-w-5xl">
            <p className="font-mono text-[0.72rem] uppercase tracking-[0.32em] text-muted-foreground">
              {eyebrow}
            </p>
            <h1 className="mt-8 max-w-[14ch] font-[family-name:var(--font-display)] text-[clamp(3.8rem,7vw,6.8rem)] leading-[0.92] font-semibold tracking-[-0.06em]">
              {title}
            </h1>
            <p className="mt-8 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
              {description}
            </p>
            {intro ? <div className="mt-8">{intro}</div> : null}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="min-h-12 rounded-full px-6 text-sm font-medium shadow-sm transition-shadow hover:shadow-md">
                <Link href="/login">
                  Enter the live workspace
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                className="min-h-12 rounded-full px-6 text-sm font-medium transition-[box-shadow,background-color]"
                variant="outline"
              >
                <Link href="/">Back to overview</Link>
              </Button>
            </div>
          </div>

          <aside className="border-t border-border/55 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            {aside ?? (
              <>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-muted-foreground">
                  Public brief
                </p>
                <p className="mt-5 text-2xl font-semibold tracking-[-0.04em]">
                  One operating discipline across acquisition, development, and hold.
                </p>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  The public site sets the operating frame. The internal workspace handles mapping, diligence,
                  approvals, evidence, and execution.
                </p>
              </>
            )}
          </aside>
        </div>

        <div className="mt-14 flex-1">{children}</div>

        <footer className="mt-16 border-t border-border/55 pt-6">
          <div className="flex flex-col gap-5 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <p>Functional real estate, run with systems.</p>
            <div className="flex flex-wrap items-center gap-6">
              {PUBLIC_NAV.map((item) => (
                <Link
                  key={`footer-${item.href}`}
                  className="relative pb-0.5 transition-colors duration-200 after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-foreground/60 after:transition-[width] after:duration-300 hover:text-foreground hover:after:w-full"
                  href={item.href}
                >
                  {item.label}
                </Link>
              ))}
              <Link
                className="relative pb-0.5 transition-colors duration-200 after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-foreground/60 after:transition-[width] after:duration-300 hover:text-foreground hover:after:w-full"
                href="/login"
              >
                Login
              </Link>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}

export function PublicSectionCard({
  eyebrow,
  title,
  body,
  children,
  className,
}: PublicSectionCardProps) {
  return (
    <section
      className={cn(
        "public-section-reveal rounded-[1.75rem] border border-border/55 bg-background/75 p-6 shadow-[0_1px_0_0_oklch(var(--border)/0.55),0_22px_50px_-28px_oklch(var(--foreground)/0.12)] backdrop-blur-md md:p-8 dark:shadow-[0_1px_0_0_oklch(var(--border)/0.35),0_24px_60px_-32px_oklch(0_0_0/0.45)]",
        className,
      )}
    >
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
        {title}
      </h2>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
        {body}
      </p>
      {children ? <div className="mt-6">{children}</div> : null}
    </section>
  );
}

export function PublicStatList({ items }: PublicStatListProps) {
  return (
    <dl className="public-stat-stagger grid gap-4 md:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-[1.4rem] border border-border/50 bg-background/85 p-5 shadow-sm backdrop-blur-sm transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-md dark:bg-background/70"
        >
          <dt className="font-mono text-[0.66rem] uppercase tracking-[0.24em] text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-3 text-lg font-semibold tracking-[-0.03em]">
            {item.value}
          </dd>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {item.detail}
          </p>
        </div>
      ))}
    </dl>
  );
}
