import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  PublicSectionCard,
  PublicSiteShell,
  PublicStatList,
} from "@/components/marketing/PublicSiteShell";
import { SequenceIllustration } from "@/components/marketing/illustrations";

const executionChain = [
  {
    step: "01",
    title: "Buy",
    copy: "Pursue off-market, transitional, and basis-driven opportunities with a strict view on replacement cost and downside protection.",
    details: [
      "The first filter is whether the site can support a real operating thesis.",
      "Replacement cost, access, and downside protection matter more than broad market momentum.",
      "Origination stays tied to parcel context instead of drifting into deck language.",
    ],
  },
  {
    step: "02",
    title: "Build",
    copy: "Move projects from site control into a workable plan with entitlement sequencing, infrastructure judgment, and operating constraints in view.",
    details: [
      "Sequence approvals and consultants after the practical path is legible.",
      "Keep infrastructure, access, and local execution friction visible while scope forms.",
      "Treat development as controlled decision-making, not optimism layered on a site.",
    ],
  },
  {
    step: "03",
    title: "Manage",
    copy: "Hold assets that benefit from practical stewardship, tenant usability, and long-duration demand rather than speculative positioning.",
    details: [
      "Operating decisions stay connected to the original basis and site thesis.",
      "The hold period should compound judgment rather than resetting the file each cycle.",
      "Management success is measured by utility, collections, and durable demand.",
    ],
  },
] as const;

const metrics = [
  { label: "Sequence", value: "Buy \u2192 Build \u2192 Manage", detail: "The public strategy is stated as an operating chain so each phase informs the next." },
  { label: "Development rule", value: "Approvals first", detail: "Capital follows a workable entitlement and infrastructure path rather than narrative momentum." },
  { label: "Hold rule", value: "Memory compounds", detail: "The acquisition thesis should survive into ownership and daily operations." },
] as const;

const decisionFilters = [
  "Does the site support a basis-led thesis before storytelling starts?",
  "Can the approvals and infrastructure path be sequenced without fantasy assumptions?",
  "Will the finished asset remain operationally useful long after the acquisition memo is closed?",
] as const;

export const metadata: Metadata = {
  title: "Investment Strategy | Gallagher Property Company",
  description: "Buy, build, and manage as one connected operating sequence for manufactured housing and small-format industrial opportunities.",
};

export default function StrategyPage() {
  return (
    <PublicSiteShell
      eyebrow="Investment Strategy"
      title="Basis-driven acquisitions paired with practical development judgment."
      description="The strategy is not broad real estate exposure. It is focused execution in property types where site control, approvals, and operations can be run with discipline from first screen through hold."
      illustration={<SequenceIllustration className="h-full w-full max-h-[28rem] opacity-80" />}
    >
      <div className="mb-12">
        <PublicStatList items={metrics} />
      </div>

      {/* Execution chain — editorial numbered list */}
      <PublicSectionCard
        eyebrow="Execution chain"
        title="Buy, build, and manage as one connected system"
        body="The operating sequence is intentionally linear. Each phase must preserve the logic of the prior one instead of rewriting it."
      >
        <div className="mt-2 divide-y divide-[var(--pub-border)]">
          {executionChain.map((step) => (
            <div key={step.title} className="py-8 first:pt-0 last:pb-0">
              <div className="flex items-baseline gap-4">
                <span className="font-mono text-[0.68rem] font-medium tracking-[0.2em] text-[var(--pub-muted)]">
                  {step.step}
                </span>
                <h3 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.03em] text-[var(--pub-fg)]">
                  {step.title}
                </h3>
              </div>
              <p className="mt-3 max-w-2xl text-[0.92rem] leading-[1.65] text-[var(--pub-muted)]">
                {step.copy}
              </p>
              <ul className="mt-5 space-y-3">
                {step.details.map((detail) => (
                  <li key={detail} className="flex gap-3 text-[0.88rem] leading-[1.6] text-[var(--pub-muted)]">
                    <span className="mt-2.5 h-px w-4 shrink-0 bg-[var(--pub-border)]" aria-hidden />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </PublicSectionCard>

      {/* Decision filters */}
      <div className="mt-4 border-t border-[var(--pub-border)] pt-10">
        <p className="font-mono text-[0.66rem] font-medium uppercase tracking-[0.28em] text-[var(--pub-muted)]">
          Decision Filters
        </p>
        <h2 className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-[clamp(1.4rem,2.8vw,2.2rem)] font-bold leading-[1.1] tracking-[-0.03em] text-[var(--pub-fg)]">
          Three questions before real money moves.
        </h2>
        <ol className="mt-8 divide-y divide-[var(--pub-border)]">
          {decisionFilters.map((filter, i) => (
            <li key={filter} className="flex gap-4 py-5">
              <span className="font-mono text-[0.7rem] font-medium text-[var(--pub-muted)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-[0.92rem] leading-[1.6] text-[var(--pub-fg)]">{filter}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* Navigation */}
      <div className="mt-12 border-t border-[var(--pub-border)] pt-8">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/platform"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--pub-fg)] px-7 text-[0.88rem] font-medium text-[var(--pub-bg)] transition-transform duration-200 hover:-translate-y-0.5"
          >
            Review platform
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/"
            className="inline-flex h-12 items-center gap-1.5 px-2 text-[0.88rem] font-medium text-[var(--pub-muted)] transition-colors duration-200 hover:text-[var(--pub-fg)]"
          >
            Back home
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </PublicSiteShell>
  );
}
