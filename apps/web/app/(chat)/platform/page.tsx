import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  PublicSectionCard,
  PublicSiteShell,
  PublicStatList,
} from "@/components/marketing/PublicSiteShell";
import { SystemIllustration } from "@/components/marketing/illustrations";

const stages = [
  {
    step: "01",
    title: "Origination",
    heading: "Opportunity intake and site context",
    body: "Markets, parcels, ownership, and operating context gathered in one place before capital is committed.",
    points: [
      "Site context and parcel history stay attached to the opportunity.",
      "The initial screen is built around access, utilities, and local friction.",
      "Origination remains tied to real asset context rather than disconnected notes.",
    ],
  },
  {
    step: "02",
    title: "Execution",
    heading: "Entitlements, diligence, and development sequencing",
    body: "Approvals, constraints, and evidence organized into an executable chain rather than scattered notes.",
    points: [
      "Approvals and diligence move as a sequence instead of a checklist graveyard.",
      "Artifacts, decisions, and next steps remain visible inside the live workspace.",
      "The execution chain reflects what the site can actually support.",
    ],
  },
  {
    step: "03",
    title: "Hold",
    heading: "Durable operating memory for owned assets",
    body: "The platform preserves what was learned so operating judgment compounds instead of resetting on each deal.",
    points: [
      "Hold-stage knowledge survives beyond the original acquisition team.",
      "Stewardship notes remain connected to the basis and thesis.",
      "The system compounds learning instead of recreating the file each cycle.",
    ],
  },
] as const;

const metrics = [
  { label: "Surface area", value: "Maps + Workflows + Evidence", detail: "The internal workspace reflects the actual operating surface of the business." },
  { label: "Execution rule", value: "One working file", detail: "Parcel context, diligence, approvals, and decision history in one environment." },
  { label: "Business benefit", value: "Compounding memory", detail: "The next operator starts from context instead of rebuilding it." },
] as const;

const outcomes = [
  "Origination remains connected to the actual parcel and market context.",
  "Development sequencing is visible before cost and scope begin to drift.",
  "Evidence and decisions remain attached to the live deal as it moves forward.",
  "Hold-stage operations inherit the working record instead of a stripped summary.",
] as const;

export const metadata: Metadata = {
  title: "Operating Platform | Gallagher Property Company",
  description: "Internal operating platform for mapping, diligence, approvals, evidence, and execution across the full investment lifecycle.",
};

export default function PlatformPage() {
  return (
    <PublicSiteShell
      eyebrow="Operating Platform"
      title="Internal workflow, market visibility, and execution in one environment."
      description="The public site states the strategy. The internal platform keeps it executable with mapping, diligence, workflows, approvals, and evidence tied to each opportunity."
      illustration={<SystemIllustration className="h-full w-full max-h-[28rem] opacity-80" />}
    >
      <div className="mb-12">
        <PublicStatList items={metrics} />
      </div>

      {/* Platform stages */}
      <PublicSectionCard
        eyebrow="Investment workflow"
        title="Three stages that keep the opportunity grounded to the site"
        body="The internal operating platform is organized around the same sequence the business uses in practice."
      >
        <div className="mt-2 divide-y divide-[var(--pub-border)]">
          {stages.map((stage) => (
            <div key={stage.title} className="py-8 first:pt-0 last:pb-0">
              <div className="flex items-baseline gap-4">
                <span className="font-mono text-[0.68rem] font-medium tracking-[0.2em] text-[var(--pub-muted)]">
                  {stage.step}
                </span>
                <div>
                  <h3 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.03em] text-[var(--pub-fg)]">
                    {stage.title}
                  </h3>
                  <p className="mt-1 text-[0.88rem] font-medium text-[var(--pub-muted)]">
                    {stage.heading}
                  </p>
                </div>
              </div>
              <p className="mt-3 max-w-2xl text-[0.92rem] leading-[1.65] text-[var(--pub-muted)]">
                {stage.body}
              </p>
              <ul className="mt-5 space-y-3">
                {stage.points.map((point) => (
                  <li key={point} className="flex gap-3 text-[0.88rem] leading-[1.6] text-[var(--pub-muted)]">
                    <span className="mt-2.5 h-px w-4 shrink-0 bg-[var(--pub-border)]" aria-hidden />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </PublicSectionCard>

      {/* Why it exists */}
      <div className="mt-4 border-t border-[var(--pub-border)] pt-10">
        <p className="font-mono text-[0.66rem] font-medium uppercase tracking-[0.28em] text-[var(--pub-muted)]">
          Why it exists
        </p>
        <h2 className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-[clamp(1.4rem,2.8vw,2.2rem)] font-bold leading-[1.1] tracking-[-0.03em] text-[var(--pub-fg)]">
          The system preserves context, not decorates the work.
        </h2>
        <ol className="mt-8 divide-y divide-[var(--pub-border)]">
          {outcomes.map((outcome, i) => (
            <li key={outcome} className="flex gap-4 py-5">
              <span className="font-mono text-[0.7rem] font-medium text-[var(--pub-muted)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-[0.92rem] leading-[1.6] text-[var(--pub-fg)]">{outcome}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* Navigation */}
      <div className="mt-12 border-t border-[var(--pub-border)] pt-8">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/login"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--pub-fg)] px-7 text-[0.88rem] font-medium text-[var(--pub-bg)] transition-transform duration-200 hover:-translate-y-0.5"
          >
            Enter the platform
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/"
            className="inline-flex h-12 items-center gap-1.5 px-2 text-[0.88rem] font-medium text-[var(--pub-muted)] transition-colors duration-200 hover:text-[var(--pub-fg)]"
          >
            Back to overview
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </PublicSiteShell>
  );
}
