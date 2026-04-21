import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PublicSiteShell, PublicStatList } from "@/components/marketing/PublicSiteShell";
import { BuildingIllustration } from "@/components/marketing/illustrations";

const overviewMetrics = [
  {
    label: "Investment lanes",
    value: "Manufactured Housing + Infill Industrial",
    detail: "",
  },
  {
    label: "Execution model",
    value: "Buy \u2192 Build \u2192 Manage",
    detail: "",
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
      description="Gallagher Property Company acquires, builds, and manages manufactured housing communities and small-format industrial assets."
      illustration={<BuildingIllustration className="h-full w-full max-h-[28rem] opacity-80" />}
    >
      {/* Metrics strip */}
      <div className="mb-12">
        <PublicStatList items={overviewMetrics} />
      </div>

      {/* Access CTA */}
      <div className="border-t border-[var(--pub-border)] pt-10">
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
