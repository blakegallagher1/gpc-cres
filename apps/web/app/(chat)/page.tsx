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
  },
  {
    label: "Infill Industrial Under 50,000 SF",
    detail:
      "Target small-bay industrial and flex-warehouse assets in infill locations where local access and functionality matter more than scale.",
  },
] as const;

const sectionLinks = [
  {
    href: "/focus",
    eyebrow: "Focus",
    title: "Where the company stays narrow on purpose",
    body:
      "A dedicated page for the two public investment lanes, the asset profile, and the operating principles that keep both lanes in scope.",
  },
  {
    href: "/strategy",
    eyebrow: "Strategy",
    title: "How opportunities move from screen to hold",
    body:
      "A standalone view of the buy, build, and manage sequence with the decision filters that keep development judgment grounded.",
  },
  {
    href: "/platform",
    eyebrow: "Platform",
    title: "What the internal system actually does",
    body:
      "A routed explanation of the live operating environment used for mapping, diligence, approvals, evidence, and execution.",
  },
] as const;

const overviewSignals = [
  {
    label: "Public structure",
    value: "Homepage + 3 section pages",
    detail: "The root page is now a front door. The deeper explanation sits on dedicated routes instead of one long scroll.",
  },
  {
    label: "Investment lanes",
    value: "Housing + infill industrial",
    detail: "The company stays focused on property types where site-level operating judgment still matters.",
  },
  {
    label: "Operating frame",
    value: "Basis -> approvals -> operations",
    detail: "The business is described in the same order it should be executed.",
  },
] as const;

const platformProof = [
  "Parcel and market context visible before capital is committed.",
  "Approvals, diligence, and evidence tied to the live opportunity.",
  "Execution history preserved into hold-stage operating memory.",
] as const;

export const metadata: Metadata = {
  title: "Gallagher Property Company | Real Estate Investment & Development",
  description:
    "Gallagher Property Company acquires and develops manufactured housing communities and infill industrial assets under 50,000 SF, with dedicated public pages for focus, strategy, and platform.",
};

export default function HomePage() {
  return (
    <PublicSiteShell
      aside={
        <div className="space-y-6">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-muted-foreground">
              Focus snapshot
            </p>
            <p className="mt-5 text-2xl font-semibold tracking-[-0.04em]">
              Two lanes selected because both reward real operational work.
            </p>
          </div>
          <div className="space-y-5 border-t border-border/50 pt-6">
            {investmentFocus.map((item) => (
              <div key={item.label}>
                <p className="text-sm font-semibold tracking-[-0.02em]">
                  {item.label}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      }
      description="Gallagher Property Company acquires, builds, and manages manufactured housing communities and small-format industrial assets through one operating discipline: basis before story, approvals before spend, operations before optics."
      eyebrow="Manufactured Housing + Flex Industrial"
      intro={<PublicStatList items={overviewSignals} />}
      title="Gallagher Property Company"
    >
      <div className="grid gap-6">
        <PublicSectionCard
          body="The public site should explain the business clearly without forcing every section into one continuous page. Each core section now has its own route."
          eyebrow="Site Structure"
          title="Review the business by section"
        >
          <div className="grid gap-4 lg:grid-cols-3">
            {sectionLinks.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="rounded-[1.5rem] border border-border/55 bg-background/80 p-5 transition-colors hover:bg-background"
              >
                <p className="font-mono text-[0.66rem] uppercase tracking-[0.24em] text-muted-foreground">
                  {section.eyebrow}
                </p>
                <h2 className="mt-4 text-xl font-semibold tracking-[-0.03em]">
                  {section.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {section.body}
                </p>
                <p className="mt-6 text-sm font-medium">Open section</p>
              </Link>
            ))}
          </div>
        </PublicSectionCard>

        <PublicSectionCard
          body="The public narrative is still tied to the live operating system behind the work. The difference is that the explanation is now split into smaller, clearer pages."
          eyebrow="Operating System"
          title="The underlying business is not a brochure"
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div className="rounded-[1.5rem] border border-border/55 bg-background/80 p-5">
              <p className="font-mono text-[0.66rem] uppercase tracking-[0.24em] text-muted-foreground">
                Internal platform
              </p>
              <p className="mt-4 text-lg font-semibold tracking-[-0.03em]">
                See the site before the story gets expensive.
              </p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                The internal workspace extends the public strategy into mapping, diligence, approvals, evidence, and hold-stage memory.
              </p>
            </div>
            <ul className="grid gap-3 text-sm leading-6 text-muted-foreground">
              {platformProof.map((item) => (
                <li key={item} className="rounded-2xl border border-border/50 bg-background/90 px-4 py-3">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </PublicSectionCard>

        <PublicSectionCard
          body="Looking at a manufactured housing or small-format industrial opportunity? The public pages establish the frame. The internal workspace is where opportunities are reviewed, mapped, diligenced, and moved into execution."
          eyebrow="Access"
          title="Enter the live workspace when the public brief is not enough"
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-foreground bg-foreground px-6 text-sm font-medium text-background transition-transform duration-200 hover:-translate-y-0.5"
            >
              Enter the platform
            </Link>
            <Link
              href="/strategy"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-border bg-background/80 px-6 text-sm font-medium transition-colors hover:bg-background"
            >
              Start with strategy
            </Link>
          </div>
        </PublicSectionCard>
      </div>
    </PublicSiteShell>
  );
}
