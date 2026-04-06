import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  PublicSectionCard,
  PublicSiteShell,
  PublicStatList,
} from "@/components/marketing/PublicSiteShell";
import { DualPropertyIllustration } from "@/components/marketing/illustrations";

const lanes = [
  {
    label: "Manufactured Housing Communities",
    body: "Acquire and develop communities where basis discipline, site control, and execution speed create durable housing supply.",
    points: [
      "Buy where durable demand and fragmented ownership create room for disciplined basis.",
      "Favor sites where infrastructure judgment and entitlement sequencing can unlock the next step.",
      "Keep the operating reality visible from first screen through hold.",
    ],
  },
  {
    label: "Infill Industrial Under 50,000 SF",
    body: "Target small-bay industrial and flex-warehouse assets in infill locations where local access and functionality matter more than scale.",
    points: [
      "Prioritize usable bay depth, access, loading, and replacement-cost awareness.",
      "Prefer local scarcity and operating utility over speculative rent narratives.",
      "Underwrite small-format industrial as working product, not generic inventory.",
    ],
  },
] as const;

const principles = [
  { title: "Basis before story", detail: "Source assets where fragmented ownership, overlooked utility, and disciplined cost basis create the edge." },
  { title: "Approvals before spend", detail: "Sequence development and diligence around what can actually be entitled, serviced, and executed." },
  { title: "Operations before optics", detail: "Prioritize durable layouts, tenant usability, and repeatable demand over surface-level presentation." },
] as const;

const metrics = [
  { label: "Target lanes", value: "2", detail: "Manufactured housing communities and infill industrial remain the core public investment lanes." },
  { label: "Industrial profile", value: "<50K SF", detail: "Concentrated on infill flex and warehouse product that rewards functional judgment." },
  { label: "Operating frame", value: "Basis-led", detail: "Every lane is screened against site reality, approvals, and hold-stage operating usefulness." },
] as const;

export const metadata: Metadata = {
  title: "Investment Focus | Gallagher Property Company",
  description: "Two investment lanes — manufactured housing and infill industrial — selected because both reward site-level operating judgment.",
};

export default function FocusPage() {
  return (
    <PublicSiteShell
      eyebrow="Investment Focus"
      title="Two lanes. One operating discipline."
      description="The company is intentionally narrow. The focus stays on property types where local knowledge, site sequencing, and operating discipline can materially improve the outcome."
      illustration={<DualPropertyIllustration className="h-full w-full max-h-[28rem] opacity-80" />}
    >
      <div className="mb-12">
        <PublicStatList items={metrics} />
      </div>

      {/* Investment lanes */}
      {lanes.map((lane, idx) => (
        <PublicSectionCard
          key={lane.label}
          eyebrow={`Lane ${idx + 1}`}
          title={lane.label}
          body={lane.body}
        >
          <ul className="mt-2 divide-y divide-[var(--pub-border)]">
            {lane.points.map((point) => (
              <li key={point} className="py-4 text-[0.9rem] leading-[1.6] text-[var(--pub-muted)]">
                {point}
              </li>
            ))}
          </ul>
        </PublicSectionCard>
      ))}

      {/* Operating principles */}
      <div className="mt-4 border-t border-[var(--pub-border)] pt-10">
        <p className="font-mono text-[0.66rem] font-medium uppercase tracking-[0.28em] text-[var(--pub-muted)]">
          Operating Principles
        </p>
        <h2 className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-[clamp(1.4rem,2.8vw,2.2rem)] font-bold leading-[1.1] tracking-[-0.03em] text-[var(--pub-fg)]">
          What determines whether a lane stays in scope.
        </h2>
        <div className="mt-8 grid gap-0 divide-y divide-[var(--pub-border)] md:grid-cols-3 md:divide-x md:divide-y-0">
          {principles.map((p) => (
            <div key={p.title} className="py-5 md:px-6 md:py-0 md:first:pl-0 md:last:pr-0">
              <h3 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em] text-[var(--pub-fg)]">
                {p.title}
              </h3>
              <p className="mt-2 text-[0.88rem] leading-[1.6] text-[var(--pub-muted)]">
                {p.detail}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-12 border-t border-[var(--pub-border)] pt-8">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/strategy"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--pub-fg)] px-7 text-[0.88rem] font-medium text-[var(--pub-bg)] transition-transform duration-200 hover:-translate-y-0.5"
          >
            Review strategy
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/platform"
            className="inline-flex h-12 items-center gap-1.5 px-2 text-[0.88rem] font-medium text-[var(--pub-muted)] transition-colors duration-200 hover:text-[var(--pub-fg)]"
          >
            Review platform
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </PublicSiteShell>
  );
}
