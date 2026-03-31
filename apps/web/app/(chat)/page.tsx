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
      <div className="absolute inset-x-0 top-0 -z-10 h-[44rem] bg-[radial-gradient(circle_at_top_left,oklch(var(--shell-glow)/0.18),transparent_32%),linear-gradient(180deg,transparent,oklch(var(--color-background)/0.12))]" />
      <div className="absolute inset-x-0 top-24 -z-10 mx-auto hidden h-[32rem] w-[92%] max-w-6xl rounded-[3rem] border border-border/40 bg-white/35 blur-3xl md:block dark:bg-white/6" />

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

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:items-end">
          <div className="max-w-4xl">
            <p className="font-mono text-[0.72rem] uppercase tracking-[0.34em] text-muted-foreground">
              Manufactured Housing + Flex Industrial
            </p>
            <h2 className="mt-5 text-lg font-semibold tracking-[-0.03em] sm:text-xl">
              Gallagher Property Company
            </h2>
            <h1 className="mt-5 max-w-4xl text-5xl leading-[0.95] font-semibold tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">
              We acquire and develop manufactured housing communities and infill
              industrial assets under 50,000 SF, focused on flex-warehouse.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Gallagher Property Company is built around functional real estate:
              housing communities with durable demand and small-format industrial
              properties where usability, access, and local scarcity drive value.
            </p>
            <p className="mt-4 font-mono text-[0.72rem] uppercase tracking-[0.28em] text-muted-foreground">
              See the site before the story gets expensive.
            </p>

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

          <aside className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-background/78 p-6 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.4)] backdrop-blur">
            <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-foreground/30 to-transparent" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-muted-foreground">
                  Focus Snapshot
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                  Two lanes. One operating discipline.
                </p>
              </div>
              <span className="rounded-full border border-border px-3 py-1 text-[0.68rem] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                2026
              </span>
            </div>

            <div className="mt-8 space-y-5">
              {investmentFocus.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[1.35rem] border border-border/65 bg-background/78 p-5"
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

            <div className="mt-8 grid grid-cols-2 gap-4 border-t border-border/65 pt-5 text-sm">
              <div>
                <p className="font-mono text-[0.66rem] uppercase tracking-[0.22em] text-muted-foreground">
                  Asset profile
                </p>
                <p className="mt-2 font-medium">Operationally useful, supply-aware</p>
              </div>
              <div>
                <p className="font-mono text-[0.66rem] uppercase tracking-[0.22em] text-muted-foreground">
                  Industrial lane
                </p>
                <p className="mt-2 font-medium">Under 50,000 SF, flex-warehouse</p>
              </div>
            </div>
          </aside>
        </div>

        <div
          id="focus"
          className="mt-12 grid gap-4 border-t border-border/55 pt-8 md:grid-cols-3"
        >
          {operatingPrinciples.map((principle) => (
            <div
              key={principle.title}
              className="rounded-[1.4rem] border border-border/55 bg-background/62 px-5 py-5 text-sm leading-6 text-muted-foreground backdrop-blur"
            >
              <p className="text-sm font-semibold tracking-[-0.02em] text-foreground">
                {principle.title}
              </p>
              <p className="mt-2">{principle.detail}</p>
            </div>
          ))}
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
