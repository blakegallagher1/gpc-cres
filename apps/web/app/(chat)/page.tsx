import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  PublicSectionCard,
  PublicSiteShell,
  PublicStatList,
} from "@/components/marketing/PublicSiteShell";
import { BuildingIllustration } from "@/components/marketing/illustrations";

const sectionLinks = [
  {
    href: "/focus",
    eyebrow: "01",
    title: "Investment Focus",
    body: "Two lanes — manufactured housing and infill industrial — selected because both reward site-level operating judgment.",
  },
  {
    href: "/strategy",
    eyebrow: "02",
    title: "Execution Strategy",
    body: "Buy, build, and manage as one connected sequence. Each phase preserves the logic of the one before it.",
  },
  {
    href: "/platform",
    eyebrow: "03",
    title: "Operating Platform",
    body: "Internal system for mapping, diligence, approvals, evidence, and hold-stage operating memory.",
  },
] as const;

const overviewMetrics = [
  {
    label: "Investment lanes",
    value: "Manufactured Housing + Infill Industrial",
    detail: "Manufactured communities and infill industrial under 50K SF.",
  },
  {
    label: "Execution model",
    value: "Buy \u2192 Build \u2192 Manage",
    detail: "One connected system from screen to hold.",
  },
] as const;

export const metadata: Metadata = {
  title: "Gallagher Property Company | Real Estate Investment & Development",
  description:
    "Gallagher Property Company acquires and develops manufactured housing communities and infill industrial assets with disciplined basis, approvals-first development, and durable operations.",
};

export default function HomePage() {
  return (
    <PublicSiteShell
      eyebrow="Real Estate Investment & Development"
      title="Basis-driven acquisitions. Practical development judgment."
      description="Gallagher Property Company acquires, builds, and manages manufactured housing communities and small-format industrial assets. One operating discipline: basis before story, approvals before spend, operations before optics."
      illustration={<BuildingIllustration className="h-full w-full max-h-[28rem] opacity-80" />}
    >
      {/* Metrics strip */}
      <div className="mb-12">
        <PublicStatList items={overviewMetrics} />
      </div>

      {/* Section navigation — editorial, not card-grid */}
      <PublicSectionCard
        eyebrow="The business"
        title="Review the company by section"
        body="Each core section has its own page. The structure matches the way the business operates: focus first, then strategy, then the platform that keeps it executable."
      >
        <div className="mt-2 divide-y divide-[var(--pub-border)]">
          {sectionLinks.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group flex items-start justify-between gap-6 py-6 transition-colors first:pt-0"
            >
              <div className="min-w-0">
                <p className="font-mono text-[0.64rem] font-medium uppercase tracking-[0.24em] text-[var(--pub-muted)]">
                  {section.eyebrow}
                </p>
                <h3 className="mt-2 font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.02em] text-[var(--pub-fg)]">
                  {section.title}
                </h3>
                <p className="mt-1.5 max-w-xl text-[0.88rem] leading-[1.6] text-[var(--pub-muted)]">
                  {section.body}
                </p>
              </div>
              <ArrowRight className="mt-7 h-4 w-4 shrink-0 text-[var(--pub-muted)] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[var(--pub-fg)]" />
            </Link>
          ))}
        </div>
      </PublicSectionCard>

      {/* Access CTA */}
      <div className="mt-12 border-t border-[var(--pub-border)] pt-10">
        <p className="font-mono text-[0.66rem] font-medium uppercase tracking-[0.28em] text-[var(--pub-muted)]">
          Access
        </p>
        <h2 className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-[clamp(1.4rem,2.8vw,2.2rem)] font-bold leading-[1.1] tracking-[-0.03em] text-[var(--pub-fg)]">
          Enter the workspace when the public brief is not enough.
        </h2>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Link
            href="/login"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--pub-fg)] px-7 text-[0.88rem] font-medium text-[var(--pub-bg)] transition-transform duration-200 hover:-translate-y-0.5"
          >
            Enter the platform
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/focus"
            className="inline-flex h-12 items-center gap-1.5 px-2 text-[0.88rem] font-medium text-[var(--pub-muted)] transition-colors duration-200 hover:text-[var(--pub-fg)]"
          >
            Start with focus
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </PublicSiteShell>
  );
}
