import type { Metadata } from "next";
import Link from "next/link";
import {
  PublicSectionCard,
  PublicSiteShell,
  PublicStatList,
} from "@/components/marketing/PublicSiteShell";

const workflowColumns = [
  {
    title: "Origination",
    heading: "Community and industrial opportunity intake",
    body:
      "Markets, parcels, ownership, and operating context gathered in one place before capital is committed.",
    points: [
      "Site context and parcel history stay attached to the opportunity.",
      "The initial screen is built around access, utilities, and local friction.",
      "Origination remains tied to real asset context rather than disconnected notes.",
    ],
  },
  {
    title: "Execution",
    heading: "Entitlements, diligence, and development sequencing",
    body:
      "Approvals, constraints, and evidence organized into an executable chain rather than scattered notes.",
    points: [
      "Approvals and diligence move as a sequence instead of a checklist graveyard.",
      "Artifacts, decisions, and next steps remain visible inside the live workspace.",
      "The execution chain reflects what the site can actually support.",
    ],
  },
  {
    title: "Hold",
    heading: "Durable operating memory for owned assets",
    body:
      "The platform preserves what was learned so operating judgment compounds instead of resetting on each deal.",
    points: [
      "Hold-stage knowledge survives beyond the original acquisition team.",
      "Stewardship notes remain connected to the basis and thesis that justified the purchase.",
      "The system compounds learning instead of recreating the file each cycle.",
    ],
  },
] as const;

const platformSignals = [
  {
    label: "Surface area",
    value: "Maps + workflows + evidence",
    detail: "The internal workspace reflects the actual operating surface of the business rather than a narrow CRM view.",
  },
  {
    label: "Execution rule",
    value: "One working file",
    detail: "Parcel context, diligence, approvals, and decision history should stay inside one environment.",
  },
  {
    label: "Business benefit",
    value: "Compounding memory",
    detail: "The platform exists so the next operator starts from context instead of rebuilding it.",
  },
] as const;

const platformOutcomes = [
  "Origination remains connected to the actual parcel and market context.",
  "Development sequencing is visible before cost and scope begin to drift.",
  "Evidence and decisions remain attached to the live deal as it moves forward.",
  "Hold-stage operations inherit the working record instead of a stripped summary.",
] as const;

export const metadata: Metadata = {
  title: "Operating Platform | Gallagher Property Company",
  description:
    "Gallagher Property Company uses an internal operating platform for mapping, diligence, approvals, evidence, and execution.",
};

export default function PlatformPage() {
  return (
    <PublicSiteShell
      aside={
        <div className="space-y-6">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-muted-foreground">
              Platform brief
            </p>
            <p className="mt-5 text-2xl font-semibold tracking-[-0.04em]">
              The public site states the strategy. The internal system keeps it executable.
            </p>
          </div>
          <div className="space-y-4 border-t border-border/50 pt-6 text-sm leading-6 text-muted-foreground">
            {platformOutcomes.map((outcome) => (
              <p key={outcome}>{outcome}</p>
            ))}
          </div>
        </div>
      }
      description="The website should reflect the actual business: acquisition, development, and operating work anchored to real assets. The live platform extends that discipline into mapping, diligence, workflows, approvals, and evidence."
      eyebrow="Operating Platform"
      intro={<PublicStatList items={platformSignals} />}
      title="Internal workflow, market visibility, and execution in one working environment."
    >
      <div className="grid gap-6">
        <PublicSectionCard
          body="The internal operating platform is organized around the same sequence the business uses in practice: origination, execution, and hold."
          eyebrow="Investment Workflow"
          title="Three stages that keep the opportunity grounded to the site"
        >
          <div className="grid gap-px overflow-hidden rounded-[1.6rem] border border-border/60 bg-border/60 md:grid-cols-3">
            {workflowColumns.map((column) => (
              <div key={column.title} className="bg-background/88 p-5">
                <p className="font-mono text-[0.66rem] uppercase tracking-[0.22em] text-muted-foreground">
                  {column.title}
                </p>
                <h2 className="mt-3 text-lg font-semibold tracking-[-0.03em]">
                  {column.heading}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {column.body}
                </p>
                <ul className="mt-4 grid gap-3 text-sm leading-6 text-muted-foreground">
                  {column.points.map((point) => (
                    <li key={point} className="rounded-2xl border border-border/50 bg-background/92 px-4 py-3">
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </PublicSectionCard>

        <PublicSectionCard
          body="The platform matters because it prevents the operating record from fragmenting as the opportunity progresses."
          eyebrow="Why it exists"
          title="The system is there to preserve context, not to decorate the work"
        >
          <div className="grid gap-4 md:grid-cols-2">
            {platformOutcomes.map((outcome) => (
              <div
                key={outcome}
                className="rounded-[1.4rem] border border-border/55 bg-background/80 p-5 text-sm leading-6 text-muted-foreground"
              >
                {outcome}
              </div>
            ))}
          </div>
        </PublicSectionCard>

        <PublicSectionCard
          body="The public homepage now acts as the front door, while the section pages carry the deeper explanation of focus, strategy, and platform."
          eyebrow="Navigate"
          title="Move between the public sections"
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-border bg-background/80 px-6 text-sm font-medium transition-colors hover:bg-background"
            >
              Back to overview
            </Link>
            <Link
              href="/focus"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-border bg-background/80 px-6 text-sm font-medium transition-colors hover:bg-background"
            >
              Review focus
            </Link>
            <Link
              href="/strategy"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-border bg-background/80 px-6 text-sm font-medium transition-colors hover:bg-background"
            >
              Review strategy
            </Link>
          </div>
        </PublicSectionCard>
      </div>
    </PublicSiteShell>
  );
}
