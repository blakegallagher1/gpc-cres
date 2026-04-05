import type { Metadata } from "next";
import Link from "next/link";
import {
  PublicSectionCard,
  PublicSiteShell,
  PublicStatList,
} from "@/components/marketing/PublicSiteShell";

const investmentFocus = [
  {
    label: "Manufactured Housing Communities",
    detail:
      "Acquire and develop communities where basis discipline, site control, and execution speed create durable housing supply.",
    body: "The lane rewards operators who can underwrite access, utilities, local friction, and resident practicality before the story gets polished.",
    bullets: [
      "Buy where durable demand and fragmented ownership create room for disciplined basis.",
      "Favor sites where infrastructure judgment and entitlement sequencing can unlock the next step.",
      "Keep the operating reality visible from first screen through hold.",
    ],
  },
  {
    label: "Infill Industrial Under 50,000 SF",
    detail:
      "Target small-bay industrial and flex-warehouse assets in infill locations where local access and functionality matter more than scale.",
    body: "The work is not abstract market exposure. It is practical industrial space where layout, circulation, and scarcity matter more than presentation polish.",
    bullets: [
      "Prioritize usable bay depth, access, loading, and replacement-cost awareness.",
      "Prefer local scarcity and operating utility over speculative rent narratives.",
      "Underwrite small-format industrial as working product, not generic inventory.",
    ],
  },
] as const;

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
] as const;

const focusMetrics = [
  {
    label: "Target lanes",
    value: "2",
    detail: "Manufactured housing communities and small-format industrial remain the core public investment lanes.",
  },
  {
    label: "Industrial profile",
    value: "<50K SF",
    detail: "The industrial lane stays concentrated on infill flex and warehouse product that rewards functional judgment.",
  },
  {
    label: "Operating frame",
    value: "Basis-led",
    detail: "Every lane is screened against site reality, approvals, and hold-stage operating usefulness.",
  },
] as const;

export const metadata: Metadata = {
  title: "Investment Focus | Gallagher Property Company",
  description:
    "Gallagher Property Company focuses on manufactured housing communities and infill industrial assets under 50,000 SF.",
};

export default function FocusPage() {
  return (
    <PublicSiteShell
      aside={
        <div className="space-y-6">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-muted-foreground">
              Lane filter
            </p>
            <p className="mt-5 text-2xl font-semibold tracking-[-0.04em]">
              Two lanes selected because both reward site-level operating judgment.
            </p>
          </div>
          <div className="space-y-5 border-t border-border/50 pt-6 text-sm text-muted-foreground">
            <p>Housing where resident practicality and supply durability matter.</p>
            <p>Industrial where access, layout, and scarcity matter more than scale.</p>
          </div>
        </div>
      }
      description="Gallagher Property Company is intentionally narrow on the public side. The focus stays on property types where local knowledge, site sequencing, and operating discipline can materially improve the outcome."
      eyebrow="Investment Focus"
      intro={<PublicStatList items={focusMetrics} />}
      title="Two lanes. One operating discipline."
    >
      <div className="grid gap-6">
        {investmentFocus.map((lane) => (
          <PublicSectionCard
            key={lane.label}
            body={lane.body}
            eyebrow="Focus Lane"
            title={lane.label}
          >
            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <p className="text-sm leading-6 text-muted-foreground">
                {lane.detail}
              </p>
              <ul className="grid gap-3 text-sm leading-6 text-muted-foreground">
                {lane.bullets.map((bullet) => (
                  <li key={bullet} className="rounded-2xl border border-border/50 bg-background/80 px-4 py-3">
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
          </PublicSectionCard>
        ))}

        <PublicSectionCard
          body="The investment focus is governed by three rules that keep the public story tethered to execution reality."
          eyebrow="Operating Principles"
          title="What determines whether a lane stays in scope"
        >
          <div className="grid gap-4 md:grid-cols-3">
            {operatingPrinciples.map((principle) => (
              <div
                key={principle.title}
                className="rounded-[1.4rem] border border-border/55 bg-background/80 p-5"
              >
                <h2 className="text-lg font-semibold tracking-[-0.03em]">
                  {principle.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {principle.detail}
                </p>
              </div>
            ))}
          </div>
        </PublicSectionCard>

        <PublicSectionCard
          body="The next step after lane selection is execution logic: how opportunities move from screen to site control, approvals, and hold-stage operating memory."
          eyebrow="Continue"
          title="Review the operating sequence behind the focus"
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/strategy"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-border bg-background/80 px-6 text-sm font-medium transition-colors hover:bg-background"
            >
              Review strategy
            </Link>
            <Link
              href="/platform"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-border bg-background/80 px-6 text-sm font-medium transition-colors hover:bg-background"
            >
              Review platform
            </Link>
          </div>
        </PublicSectionCard>
      </div>
    </PublicSiteShell>
  );
}
