import type { Metadata } from "next";
import Link from "next/link";

const investmentFocus = [
  {
    label: "Manufactured Housing Communities",
    detail:
      "Acquire and develop communities where basis discipline, site control, and execution speed create durable housing supply.",
  },
  {
    label: "Infill Industrial Under 50,000 SF",
    detail:
      "Target small-bay industrial and flex-warehouse assets in infill locations where local access and functionality matter more than scale.",
  },
];

const operatingPrinciples = [
  {
    title: "Basis before story",
    detail:
      "Source assets where fragmented ownership, overlooked utility, and disciplined cost basis create the edge.",
  },
  {
    title: "Approvals before spend",
    detail:
      "Sequence development and diligence around what can actually be entitled, serviced, and executed.",
  },
  {
    title: "Operations before optics",
    detail:
      "Prioritize durable layouts, tenant usability, and repeatable demand over surface-level presentation.",
  },
];

const executionChain = [
  {
    title: "Buy",
    copy: "Pursue off-market, transitional, and basis-driven opportunities with a strict view on replacement cost and downside protection.",
  },
  {
    title: "Build",
    copy: "Move projects from site control into a workable plan with entitlement sequencing, infrastructure judgment, and operating constraints in view.",
  },
  {
    title: "Manage",
    copy: "Hold assets that benefit from practical stewardship, tenant usability, and long-duration demand rather than speculative positioning.",
  },
];

export const metadata: Metadata = {
  title: "Gallagher Property Company | Real Estate Investment & Development",
  description:
    "Gallagher Property Company acquires and develops manufactured housing communities and infill industrial assets under 50,000 SF, focused on flex-warehouse.",
};

export default function HomePage() {
  return (
    <main className="relative overflow-hidden bg-transparent text-foreground">
      <div className="absolute inset-x-0 top-0 -z-10 h-[44rem] bg-[radial-gradient(circle_at_top_left,oklch(var(--shell-glow)/0.14),transparent_28%),linear-gradient(180deg,transparent,oklch(var(--color-background)/0.1))]" />
      <div className="absolute inset-x-0 top-16 -z-10 mx-auto hidden h-[28rem] w-[84%] max-w-5xl bg-white/12 blur-3xl md:block dark:bg-white/5" />

      <section className="mx-auto flex min-h-[100svh] w-full max-w-7xl flex-col px-5 pb-14 pt-6 sm:px-6 lg:px-8">
        <header className="mb-12 flex items-center justify-between border-b border-border/55 pb-5">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.34em] text-muted-foreground">
              Gallagher Property Company
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Real estate investment and development
            </p>
          </div>

          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#focus" className="transition-colors hover:text-foreground">
              Focus
            </a>
            <a href="#strategy" className="transition-colors hover:text-foreground">
              Strategy
            </a>
            <a href="#platform" className="transition-colors hover:text-foreground">
              Platform
            </a>
          </nav>
        </header>

        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-16">
          <div className="max-w-5xl">
            <p className="font-mono text-[0.72rem] uppercase tracking-[0.32em] text-muted-foreground">
              Manufactured Housing + Flex Industrial
            </p>
            <h2 className="mt-6 text-2xl font-semibold tracking-[-0.05em] sm:text-3xl">
              Gallagher Property Company
            </h2>
            <h1 className="mt-8 max-w-[10.5ch] text-[clamp(4rem,8.6vw,7.75rem)] leading-[0.9] font-semibold tracking-[-0.075em]">
              <span className="block">We acquire and develop</span>
              <span className="mt-2 block">manufactured housing communities</span>
              <span className="mt-2 block">and infill industrial assets</span>
              <span className="mt-2 block text-foreground/78">
                under 50,000 SF, focused on flex-warehouse.
              </span>
            </h1>

            <div className="mt-10 max-w-3xl border-t border-border/55 pt-6">
              <p className="text-sm font-medium tracking-[-0.02em] text-foreground/88 sm:text-base">
                We acquire and develop manufactured housing communities and infill
                industrial assets under 50,000 SF, focused on flex-warehouse.
              </p>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Gallagher Property Company is built around functional real estate:
              housing communities with durable demand and small-format industrial
              properties where usability, access, and local scarcity drive value.
              </p>
              <p className="mt-4 font-mono text-[0.72rem] uppercase tracking-[0.28em] text-muted-foreground">
                See the site before the story gets expensive.
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-transform duration-200 hover:-translate-y-0.5"
              >
                Enter the platform
              </Link>
              <a
                href="#strategy"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-border bg-background/70 px-6 text-sm font-medium text-foreground backdrop-blur transition-colors hover:bg-background"
              >
                Review strategy
              </a>
            </div>
          </div>

          <aside className="border-t border-border/55 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <div className="flex items-center justify-between gap-4">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-muted-foreground">
                Focus Snapshot
              </p>
              <span className="text-[0.72rem] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                2026
              </span>
            </div>

            <p className="mt-5 text-2xl font-semibold tracking-[-0.04em]">
              Two lanes. One operating discipline.
            </p>

            <div className="mt-8 space-y-6">
              {investmentFocus.map((item, index) => (
                <div
                  key={item.label}
                  className={index === 0 ? "pb-6" : "border-t border-border/50 pt-6"}
                >
                  <p className="text-sm font-semibold tracking-[-0.02em]">
                    {item.label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>

            <dl className="mt-8 space-y-5 border-t border-border/50 pt-6 text-sm">
              <div>
                <dt className="font-mono text-[0.66rem] uppercase tracking-[0.22em] text-muted-foreground">
                  Asset profile
                </dt>
                <dd className="mt-2 font-medium">Operationally useful, supply-aware</dd>
              </div>
              <div>
                <dt className="font-mono text-[0.66rem] uppercase tracking-[0.22em] text-muted-foreground">
                  Industrial lane
                </dt>
                <dd className="mt-2 font-medium">Under 50,000 SF, flex-warehouse</dd>
              </div>
            </dl>
          </aside>
        </div>

        <div
          id="focus"
          className="mt-14 border-t border-border/55 pt-8"
        >
          <div className="grid gap-8 md:grid-cols-3 md:gap-6">
            {operatingPrinciples.map((principle, index) => (
              <div
                key={principle.title}
                className={
                  index === 0
                    ? "text-sm leading-6 text-muted-foreground md:pr-6"
                    : "border-t border-border/50 pt-6 text-sm leading-6 text-muted-foreground md:border-l md:border-t-0 md:pl-6 md:pt-0"
                }
              >
                <p className="text-sm font-semibold tracking-[-0.02em] text-foreground">
                  {principle.title}
                </p>
                <p className="mt-2">{principle.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="strategy"
        className="border-y border-border/50 bg-background/42 py-16 backdrop-blur-sm"
      >
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:px-8">
          <div>
            <p className="font-mono text-[0.72rem] uppercase tracking-[0.32em] text-muted-foreground">
              Investment Strategy
            </p>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              Basis-driven acquisitions paired with practical development
              judgment.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              The strategy is not broad real estate exposure. It is focused
              exposure to property types where local knowledge, site-level
              practicality, and disciplined execution can materially improve the
              outcome.
            </p>
          </div>

          <div className="grid gap-4">
            {executionChain.map((step, index) => (
              <div
                key={step.title}
                className="grid gap-4 rounded-[1.6rem] border border-border/60 bg-background/74 p-6 md:grid-cols-[80px_minmax(0,1fr)]"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border/70 bg-background text-lg font-semibold tracking-[-0.04em]">
                  0{index + 1}
                </div>
                <div>
                  <h3 className="text-lg font-semibold tracking-[-0.03em]">
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                    {step.copy}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="platform" className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
          <div>
            <p className="font-mono text-[0.72rem] uppercase tracking-[0.32em] text-muted-foreground">
              Operating Platform
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              Internal workflow, market visibility, and deal execution in one
              working environment.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              The website should reflect the actual business: acquisition,
              development, and operating work anchored to real assets. The live
              platform extends that operating discipline into mapping, diligence,
              workflows, approvals, and evidence.
            </p>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.58))] dark:bg-[linear-gradient(180deg,rgba(25,25,31,0.88),rgba(19,19,24,0.78))]">
            <div className="border-b border-border/60 px-5 py-4">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-muted-foreground">
                Investment Workflow
              </p>
            </div>

            <div className="grid gap-px bg-border/60 md:grid-cols-3">
              <div className="bg-background/88 p-5">
                <p className="font-mono text-[0.66rem] uppercase tracking-[0.22em] text-muted-foreground">
                  Origination
                </p>
                <p className="mt-3 text-lg font-semibold tracking-[-0.03em]">
                  Community and industrial opportunity intake
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Markets, parcels, ownership, and operating context gathered in
                  one place before capital is committed.
                </p>
              </div>

              <div className="bg-background/82 p-5">
                <p className="font-mono text-[0.66rem] uppercase tracking-[0.22em] text-muted-foreground">
                  Execution
                </p>
                <p className="mt-3 text-lg font-semibold tracking-[-0.03em]">
                  Entitlements, diligence, and development sequencing
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Approvals, constraints, and evidence organized into an
                  executable chain rather than scattered notes.
                </p>
              </div>

              <div className="bg-background/88 p-5">
                <p className="font-mono text-[0.66rem] uppercase tracking-[0.22em] text-muted-foreground">
                  Hold
                </p>
                <p className="mt-3 text-lg font-semibold tracking-[-0.03em]">
                  Durable operating memory for owned assets
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  The platform preserves what was learned so operating judgment
                  compounds instead of resetting on each deal.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-5 rounded-[2rem] border border-border/60 bg-background/68 px-6 py-6 backdrop-blur md:flex-row md:items-center">
          <div>
            <p className="text-xl font-semibold tracking-[-0.03em]">
              Looking at a manufactured housing or small-format industrial
              opportunity?
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              The public site sets the strategy clearly. The internal platform is
              where opportunities are reviewed, mapped, diligenced, and moved
              into execution.
            </p>
          </div>

          <Link
            href="/login"
            className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full border border-foreground bg-foreground px-6 text-sm font-medium text-background transition-transform duration-200 hover:-translate-y-0.5"
          >
            Enter the live workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
