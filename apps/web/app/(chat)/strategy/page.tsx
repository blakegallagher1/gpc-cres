import type { Metadata } from "next";
import Link from "next/link";
import {
  PublicSectionCard,
  PublicSiteShell,
  PublicStatList,
} from "@/components/marketing/PublicSiteShell";

const executionChain = [
  {
    title: "Buy",
    copy: "Pursue off-market, transitional, and basis-driven opportunities with a strict view on replacement cost and downside protection.",
    details: [
      "The first filter is whether the site can support a real operating thesis.",
      "Replacement cost, access, and downside protection matter more than broad market momentum.",
      "Origination stays tied to parcel context instead of drifting into deck language.",
    ],
  },
  {
    title: "Build",
    copy: "Move projects from site control into a workable plan with entitlement sequencing, infrastructure judgment, and operating constraints in view.",
    details: [
      "Sequence approvals and consultants after the practical path is legible.",
      "Keep infrastructure, access, and local execution friction visible while scope forms.",
      "Treat development as controlled decision-making, not optimism layered on a site.",
    ],
  },
  {
    title: "Manage",
    copy: "Hold assets that benefit from practical stewardship, tenant usability, and long-duration demand rather than speculative positioning.",
    details: [
      "Operating decisions stay connected to the original basis and site thesis.",
      "The hold period should compound judgment rather than resetting the file each cycle.",
      "Management success is measured by utility, collections, and durable demand.",
    ],
  },
] as const;

const strategyMetrics = [
  {
    label: "Sequence",
    value: "Buy -> Build -> Manage",
    detail: "The public strategy is stated as an operating chain so each phase informs the next.",
  },
  {
    label: "Development rule",
    value: "Approvals first",
    detail: "Capital follows a workable entitlement and infrastructure path rather than narrative momentum.",
  },
  {
    label: "Hold rule",
    value: "Memory compounds",
    detail: "The acquisition thesis should survive into ownership and daily operations.",
  },
] as const;

const decisionFilters = [
  "Does the site support a basis-led thesis before storytelling starts?",
  "Can the approvals and infrastructure path be sequenced without fantasy assumptions?",
  "Will the finished asset remain operationally useful long after the acquisition memo is closed?",
] as const;

export const metadata: Metadata = {
  title: "Investment Strategy | Gallagher Property Company",
  description:
    "Gallagher Property Company applies a buy, build, and manage operating sequence to manufactured housing and small-format industrial opportunities.",
};

export default function StrategyPage() {
  return (
    <PublicSiteShell
      aside={
        <div className="space-y-6">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-muted-foreground">
              Strategy brief
            </p>
            <p className="mt-5 text-2xl font-semibold tracking-[-0.04em]">
              Practical development judgment sits between acquisition and long-hold operations.
            </p>
          </div>
          <div className="space-y-4 border-t border-border/50 pt-6 text-sm leading-6 text-muted-foreground">
            {decisionFilters.map((filter) => (
              <p key={filter}>{filter}</p>
            ))}
          </div>
        </div>
      }
      description="The strategy is not broad real estate exposure. It is focused execution in property types where site control, approvals, and operations can be run with discipline from first screen through hold."
      eyebrow="Investment Strategy"
      intro={<PublicStatList items={strategyMetrics} />}
      title="Basis-driven acquisitions paired with practical development judgment."
    >
      <div className="grid gap-6">
        <PublicSectionCard
          body="The operating sequence is intentionally linear. Each phase must preserve the logic of the prior one instead of rewriting it."
          eyebrow="Execution Chain"
          title="Buy, build, and manage as one connected system"
        >
          <div className="grid gap-4">
            {executionChain.map((step, index) => (
              <div
                key={step.title}
                className="grid gap-4 rounded-[1.6rem] border border-border/60 bg-background/80 p-6 md:grid-cols-[88px_minmax(0,1fr)]"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border/70 bg-background text-lg font-semibold tracking-[-0.04em]">
                  0{index + 1}
                </div>
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.03em]">
                    {step.title}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                    {step.copy}
                  </p>
                  <ul className="mt-4 grid gap-3 text-sm leading-6 text-muted-foreground">
                    {step.details.map((detail) => (
                      <li key={detail} className="rounded-2xl border border-border/50 bg-background/90 px-4 py-3">
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </PublicSectionCard>

        <PublicSectionCard
          body="Strategy only works if each opportunity can survive three tests before the team spends real money or attention on expansion."
          eyebrow="Decision Filters"
          title="Questions that have to be answered before the work scales"
        >
          <div className="grid gap-4 md:grid-cols-3">
            {decisionFilters.map((filter) => (
              <div
                key={filter}
                className="rounded-[1.4rem] border border-border/55 bg-background/80 p-5 text-sm leading-6 text-muted-foreground"
              >
                {filter}
              </div>
            ))}
          </div>
        </PublicSectionCard>

        <PublicSectionCard
          body="The internal platform exists to keep this strategy executable. It gathers the site context, approvals, diligence, and evidence chain needed to move from decision to action."
          eyebrow="Next Section"
          title="See how the operating platform supports the strategy"
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/platform"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-border bg-background/80 px-6 text-sm font-medium transition-colors hover:bg-background"
            >
              Review platform
            </Link>
            <Link
              href="/focus"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-border bg-background/80 px-6 text-sm font-medium transition-colors hover:bg-background"
            >
              Review focus
            </Link>
          </div>
        </PublicSectionCard>
      </div>
    </PublicSiteShell>
  );
}
