"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { EntitlementOsPreviewPanel } from "@/components/marketing/EntitlementOsPreviewPanel";
import {
  Body,
  ButtonGroup,
  Container,
  Divider,
  Eyebrow,
  Headline,
  PageShell,
  Section,
  SectionIntro,
  SiteFooter,
  StepItem,
  Subhead,
  SurfaceCard,
} from "@/components/marketing/HomepagePrimitives";
import { Button } from "@/components/ui/button";

const REVEAL_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const PUBLIC_SITE_DISCLAIMER = process.env.NEXT_PUBLIC_PUBLIC_SITE_DISCLAIMER;
const PUBLIC_SITE_CONTACT_EMAIL = process.env.NEXT_PUBLIC_PUBLIC_SITE_CONTACT_EMAIL;

const heroProof = [
  "Basis before story",
  "Approvals before spend",
  "Operations before optics",
] as const;

const focusLanes = [
  {
    title: "Manufactured housing communities",
    summary: "Target communities where demand durability, local friction, and basis discipline create room for real operational work.",
    bullets: [
      "Basis discipline ahead of brochure-quality narratives",
      "Site control anchored in access, utilities, and resident practicality",
      "Execution speed shaped by local knowledge and approval sequence",
      "Operational depth that carries beyond acquisition",
    ],
  },
  {
    title: "Infill industrial under 50,000 SF",
    summary: "Pursue small-format industrial and flex where usability, replacement cost awareness, and local scarcity drive resilient performance.",
    bullets: [
      "Functional layouts with clear access and durable tenant utility",
      "Local scarcity over speculative rent stories",
      "Replacement cost awareness embedded in every acquisition screen",
      "Straightforward stewardship that respects the real work on site",
    ],
  },
] as const;

const doctrine = [
  {
    index: "01",
    title: "Basis before story",
    body: "Start with what the dirt, access, utilities, and local market will actually support. Narrative follows the basis, not the reverse.",
  },
  {
    index: "02",
    title: "Approvals before spend",
    body: "Map the political and technical path before consultants, drawings, and optimism start consuming capital.",
  },
  {
    index: "03",
    title: "Operations before optics",
    body: "Underwrite the handoff into day-two stewardship so the operating truth remains stronger than presentation polish.",
  },
] as const;

const strategySteps = [
  {
    index: "1",
    title: "Buy",
    body: "Acquire where basis is defensible, access is real, and replacement cost discipline still matters more than momentum.",
    bullets: ["Parcel context stays attached to the underwriting file.", "Scarcity and functionality outrank vanity comps."],
  },
  {
    index: "2",
    title: "Build",
    body: "Sequence entitlement, utilities, and execution dependencies before scope expands. Capital follows clarity.",
    bullets: ["Approvals are treated as a working system, not a presentation appendix.", "Site control and sequencing stay visible to partners and operators."],
  },
  {
    index: "3",
    title: "Manage",
    body: "Operate for collections, tenant or resident usefulness, and durable learning. Memory compounds alongside the asset.",
    bullets: ["Execution history survives handoff into hold.", "Operating decisions stay tied to the original basis."],
  },
] as const;

const workflowColumns = [
  {
    title: "Origination",
    body: "Parcel context, market friction, and access constraints are visible before an opportunity becomes a narrative.",
    points: ["Mapping and parcel context", "Site constraints and adjacency", "Basis screen with local reality in view"],
  },
  {
    title: "Execution",
    body: "Diligence, approvals, and evidence stay inside one working environment so every next step is tied to the actual site.",
    points: ["Diligence workflow", "Approvals and evidence chain", "Decision record attached to the live deal"],
  },
  {
    title: "Hold",
    body: "The operating record remains usable after close, preserving why the asset was bought and how it should be run.",
    points: ["Operating memory", "Stewardship notes and recurring workflows", "Partner-ready context without rebuilding the file"],
  },
] as const;

const previewSignals = [
  {
    label: "Parcel context",
    detail: "Boundary, access, utilities, and local friction remain readable beside the live opportunity.",
    state: "mapped",
  },
  {
    label: "Workflow control",
    detail: "Diligence, approval sequencing, and operator tasks move through one working environment.",
    state: "active",
  },
  {
    label: "Evidence chain",
    detail: "Artifacts, decisions, and site history stay connected as the deal advances.",
    state: "retained",
  },
] as const;

const previewMemory = [
  {
    label: "Origination",
    detail: "Site facts survive past the first underwriting pass instead of being rewritten in downstream decks and memos.",
  },
  {
    label: "Execution",
    detail: "Approvals and diligence notes remain attached to the deal while scope and cost decisions evolve.",
  },
  {
    label: "Hold",
    detail: "Operating memory compounds into the next decision cycle rather than disappearing after close.",
  },
] as const;

function BackgroundGrid() {
  return (
    <>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(120,140,165,0.18),transparent_38%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.78),transparent)]" />
      <div className="absolute inset-y-0 right-0 w-[44rem] bg-[radial-gradient(circle_at_center,rgba(148,163,184,0.12),transparent_62%)]" />
    </>
  );
}

function FieldContour() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-10 hidden h-[28rem] opacity-50 lg:block"
    >
      <svg className="h-full w-full" fill="none" viewBox="0 0 1200 520">
        <path d="M48 410C156 351 218 358 326 312C449 260 457 160 598 149C724 139 792 220 915 210C1029 201 1095 113 1160 80" stroke="rgba(226,232,240,0.18)" strokeWidth="1.2" />
        <path d="M58 446C173 388 235 392 337 352C449 308 494 217 627 209C748 202 814 286 927 279C1033 272 1091 189 1152 158" stroke="rgba(226,232,240,0.16)" strokeWidth="1.2" />
        <path d="M68 482C189 427 263 430 362 393C471 353 537 276 662 269C781 262 847 345 948 342C1042 339 1090 262 1146 234" stroke="rgba(226,232,240,0.14)" strokeWidth="1.2" />
        <circle cx="880" cy="210" fill="rgba(248,250,252,0.75)" r="3" />
        <circle cx="945" cy="279" fill="rgba(248,250,252,0.58)" r="3" />
        <circle cx="663" cy="269" fill="rgba(248,250,252,0.5)" r="3" />
      </svg>
    </div>
  );
}

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="text-sm text-white/60 transition hover:text-white" href={href}>
      {label}
    </Link>
  );
}

/**
 * Public homepage for Gallagher Property Company.
 * Designed to present the company as an institutional operator with a real operating platform behind the work.
 */
export function CompanyHomePage() {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const year = new Date().getFullYear();
  const reveal = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.7, ease: REVEAL_EASE },
    },
  };

  return (
    <PageShell id="top">
      <div className="relative overflow-hidden">
        <BackgroundGrid />
        <FieldContour />

        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07111f]/82 backdrop-blur-xl">
          <Container className="flex h-16 items-center justify-between gap-6">
            <Link className="min-w-0" href="#top">
              <span className="block truncate font-mono text-[0.7rem] uppercase tracking-[0.28em] text-white/56">
                Gallagher Property Company
              </span>
              <span className="block truncate text-sm text-white/72">Functional real estate, run with systems.</span>
            </Link>

            <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
              <FooterLink href="#strategy" label="Strategy" />
              <FooterLink href="#doctrine" label="Doctrine" />
              <FooterLink href="#platform" label="Platform" />
              <FooterLink href="#contact" label="Contact" />
            </nav>

            <Button asChild className="h-10 bg-white px-4 text-sm font-semibold text-[#07111f] hover:bg-white/90">
              <Link href="/login">
                Enter the live workspace
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </Container>
        </header>

        <main>
          <Section className="overflow-hidden pb-12 pt-14 md:pb-16 md:pt-20">
            <Container className="grid gap-10 lg:grid-cols-[minmax(0,1.12fr)_minmax(20rem,0.88fr)] lg:items-end">
              <motion.div animate="visible" initial="hidden" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}>
                <div className="max-w-3xl space-y-6">
                  <motion.div variants={reveal}>
                    <Eyebrow>Manufactured housing communities + flex industrial</Eyebrow>
                  </motion.div>
                  <motion.div className="space-y-5" variants={reveal}>
                    <Headline>Institutional discipline for functional real estate.</Headline>
                    <Subhead>
                      Gallagher Property Company acquires, builds, and manages manufactured housing communities and small-format industrial assets through one operating discipline: basis before story, approvals before spend, operations before optics.
                    </Subhead>
                    <Body className="max-w-xl">
                      The public face is restrained by design. The underlying business is not. Every opportunity is screened, sequenced, and stewarded inside a live working environment built for real estate execution rather than marketing theater.
                    </Body>
                  </motion.div>

                  <motion.div variants={reveal}>
                    <ButtonGroup>
                      <Button asChild className="h-12 bg-white px-5 text-sm font-semibold text-[#07111f] hover:bg-white/90" size="lg">
                        <Link href="/login">
                          Enter the live workspace
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        asChild
                        className="h-12 border-white/18 bg-white/[0.04] px-5 text-sm font-semibold text-white hover:bg-white/[0.08] hover:text-white"
                        size="lg"
                        variant="outline"
                      >
                        <Link href="#strategy">Review strategy</Link>
                      </Button>
                    </ButtonGroup>
                  </motion.div>

                  <motion.div
                    className="grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-3"
                    variants={reveal}
                  >
                    {heroProof.map((item) => (
                      <div className="space-y-2" key={item}>
                        <p className="font-mono text-[0.66rem] uppercase tracking-[0.24em] text-white/44">Operating posture</p>
                        <p className="text-sm font-semibold tracking-[-0.03em] text-white/92">{item}</p>
                      </div>
                    ))}
                  </motion.div>
                </div>
              </motion.div>

              <motion.div
                animate="visible"
                className="relative"
                initial="hidden"
                variants={{ hidden: {}, visible: { transition: { delayChildren: 0.12, staggerChildren: 0.08 } } }}
              >
                <motion.div className="absolute -inset-12 hidden rounded-full bg-[radial-gradient(circle,rgba(148,163,184,0.14),transparent_64%)] blur-3xl lg:block" variants={reveal} />
                <motion.div className="relative" variants={reveal}>
                  <SurfaceCard className="space-y-6 rounded-[2rem] border-white/12 bg-[#0b1627]/88 p-5 md:p-7">
                    <div className="space-y-3">
                      <Eyebrow>Operating system</Eyebrow>
                      <h2 className="text-[1.7rem] font-semibold tracking-[-0.06em] text-white">
                        One platform behind origination, execution, and hold.
                      </h2>
                      <Body className="max-w-none">
                        The homepage stays quiet. The platform does the talking: parcel context, approvals, diligence, and operator memory remain in frame from first screen to active asset.
                      </Body>
                    </div>

                    <Divider />

                    <div className="grid gap-3">
                      {workflowColumns.map((column, index) => (
                        <div
                          className="grid gap-3 rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4 md:grid-cols-[auto_minmax(0,1fr)]"
                          key={column.title}
                        >
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] font-mono text-sm text-white/76">
                            {index + 1}
                          </span>
                          <div className="space-y-2">
                            <div>
                              <p className="text-base font-semibold tracking-[-0.03em] text-white">{column.title}</p>
                              <p className="mt-1 text-sm leading-6 text-white/60">{column.body}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {column.points.map((point) => (
                                <span
                                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/66"
                                  key={point}
                                >
                                  {point}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </SurfaceCard>
                </motion.div>
              </motion.div>
            </Container>
          </Section>

          <Section id="strategy" className="pt-8">
            <Container className="space-y-10">
              <SectionIntro
                body="Two lanes, one operating standard. Each strategy is selected for local scarcity, functional utility, and the ability to create value through disciplined execution rather than cosmetic storytelling."
                eyebrow="Focus snapshot"
                title="Communities and flex industrial, under one discipline."
              />

              <div className="grid gap-6 xl:grid-cols-2">
                {focusLanes.map((lane) => (
                  <SurfaceCard className="flex h-full flex-col gap-6 bg-white/[0.04]" key={lane.title}>
                    <div className="space-y-3">
                      <p className="font-mono text-[0.66rem] uppercase tracking-[0.24em] text-white/44">Focus lane</p>
                      <h3 className="text-[1.9rem] font-semibold tracking-[-0.06em] text-white">{lane.title}</h3>
                      <Body className="max-w-none">{lane.summary}</Body>
                    </div>

                    <Divider />

                    <ul className="grid gap-3">
                      {lane.bullets.map((bullet) => (
                        <li className="grid grid-cols-[0.55rem_minmax(0,1fr)] gap-3" key={bullet}>
                          <span className="mt-[0.52rem] h-2.5 w-2.5 rounded-full bg-white/72" />
                          <span className="text-sm leading-6 text-white/72">{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </SurfaceCard>
                ))}
              </div>
            </Container>
          </Section>

          <Section id="doctrine">
            <Container className="space-y-10">
              <SectionIntro
                body="These principles are the filter, not the tagline. They shape how opportunities are screened, how capital is deployed, and how the operating record is preserved."
                eyebrow="Operating doctrine"
                title="A simple framework that governs the entire cycle."
              />

              <div className="grid gap-5 lg:grid-cols-3">
                {doctrine.map((item) => (
                  <SurfaceCard className="space-y-5 bg-[#0b1627]/86" key={item.title}>
                    <div className="flex items-start justify-between gap-4">
                      <span className="font-mono text-sm text-white/46">{item.index}</span>
                      <span className="h-10 w-10 rounded-full border border-white/10 bg-[radial-gradient(circle,rgba(255,255,255,0.18),transparent_65%)]" />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-[1.45rem] font-semibold tracking-[-0.05em] text-white">{item.title}</h3>
                      <Body className="max-w-none">{item.body}</Body>
                    </div>
                  </SurfaceCard>
                ))}
              </div>
            </Container>
          </Section>

          <Section>
            <Container className="space-y-10">
              <SectionIntro
                body="The cycle is deliberate: buy with a defensible basis, build with approval discipline, and manage with the operating truth intact."
                eyebrow="Investment strategy"
                title="Buy, build, and manage without losing the thread."
              />

              <div className="grid gap-8 lg:grid-cols-3 lg:gap-10">
                {strategySteps.map((step) => (
                  <StepItem body={step.body} index={step.index} key={step.title} title={step.title}>
                    <ul className="grid gap-2">
                      {step.bullets.map((bullet) => (
                        <li className="text-sm leading-6 text-white/66" key={bullet}>
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  </StepItem>
                ))}
              </div>
            </Container>
          </Section>

          <Section id="platform">
            <Container className="grid gap-8 xl:grid-cols-[minmax(0,0.95fr)_minmax(22rem,1.05fr)] xl:items-start">
              <div className="space-y-10">
                <SectionIntro
                  body="The differentiator is not a slogan. It is a working environment that keeps parcel context, diligence, approvals, evidence, and operating memory connected across the lifecycle."
                  eyebrow="Operating platform"
                  title="A real working environment for real estate execution."
                />

                <div className="grid gap-5">
                  {workflowColumns.map((column) => (
                    <SurfaceCard className="space-y-4 bg-white/[0.04]" key={column.title}>
                      <div className="flex items-center justify-between gap-4">
                        <h3 className="text-xl font-semibold tracking-[-0.04em] text-white">{column.title}</h3>
                        <span className="font-mono text-[0.66rem] uppercase tracking-[0.24em] text-white/44">Workflow</span>
                      </div>
                      <Body className="max-w-none">{column.body}</Body>
                      <div className="flex flex-wrap gap-2">
                        {column.points.map((point) => (
                          <span
                            className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/64"
                            key={point}
                          >
                            {point}
                          </span>
                        ))}
                      </div>
                    </SurfaceCard>
                  ))}
                </div>
              </div>

              <EntitlementOsPreviewPanel
                className="bg-[#091321]/88"
                eyebrow="Platform view"
                memory={previewMemory}
                parcel={{
                  label: "Live opportunity",
                  value: "Functional real estate with basis, approvals, and operating memory in one frame",
                  detail:
                    "The system keeps context attached from first parcel pass through execution and hold, so the operating record remains useful instead of becoming a stack of disconnected deliverables.",
                }}
                signals={previewSignals}
                summary="An understated interface that keeps the real work visible."
                title="Origination, execution, and hold inside one operating chain"
              />
            </Container>
          </Section>

          <Section className="pb-14">
            <Container>
              <SurfaceCard className="overflow-hidden rounded-[2rem] border-white/12 bg-[linear-gradient(135deg,rgba(9,19,33,0.96),rgba(15,23,42,0.88))]">
                <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                  <div className="space-y-4">
                    <Eyebrow>Partner access</Eyebrow>
                    <h2 className="max-w-2xl text-[clamp(2rem,4.2vw,3.3rem)] font-semibold tracking-[-0.07em] text-white">
                      Enter the live workspace when you want to see how the system actually runs.
                    </h2>
                    <Body className="max-w-xl">
                      The public homepage is the first impression. The operating environment is where diligence, approvals, evidence, and execution remain visible.
                    </Body>
                  </div>

                  <ButtonGroup className="lg:justify-end">
                    <Button asChild className="h-12 bg-white px-5 text-sm font-semibold text-[#07111f] hover:bg-white/90" size="lg">
                      <Link href="/login">
                        Enter the live workspace
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      asChild
                      className="h-12 border-white/18 bg-white/[0.04] px-5 text-sm font-semibold text-white hover:bg-white/[0.08] hover:text-white"
                      size="lg"
                      variant="outline"
                    >
                      <Link href="#strategy">Review strategy</Link>
                    </Button>
                  </ButtonGroup>
                </div>
              </SurfaceCard>
            </Container>
          </Section>
        </main>

        <SiteFooter id="contact">
          <Container className="grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-3">
              <p className="font-mono text-[0.7rem] uppercase tracking-[0.28em] text-white/46">
                Gallagher Property Company
              </p>
              <p className="max-w-xl text-sm leading-6 text-white/58">
                Manufactured housing communities and small-format industrial/flex, executed with basis discipline and operating depth.
              </p>
              <div className="flex flex-wrap items-center gap-4 text-sm text-white/52">
                <span>{year}</span>
                {PUBLIC_SITE_CONTACT_EMAIL ? (
                  <Link className="transition hover:text-white" href={`mailto:${PUBLIC_SITE_CONTACT_EMAIL}`}>
                    {PUBLIC_SITE_CONTACT_EMAIL}
                  </Link>
                ) : (
                  <Link className="transition hover:text-white" href="/login">
                    Request access
                  </Link>
                )}
              </div>
              {PUBLIC_SITE_DISCLAIMER ? <p className="text-xs leading-5 text-white/38">{PUBLIC_SITE_DISCLAIMER}</p> : null}
            </div>

            <nav aria-label="Footer" className="flex flex-wrap items-center gap-5">
              <FooterLink href="/login" label="Login" />
              <FooterLink href="#strategy" label="Strategy" />
              <FooterLink href="#platform" label="Platform" />
              <FooterLink href="#top" label="Top" />
            </nav>
          </Container>
        </SiteFooter>
      </div>
    </PageShell>
  );
}
