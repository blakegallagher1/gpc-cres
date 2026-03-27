"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useRef, useState } from "react";
import { EntitlementOsPreviewPanel } from "@/components/marketing/EntitlementOsPreviewPanel";
import { MhcOwnerSubmissionSection } from "@/components/marketing/MhcOwnerSubmissionSection";
import { Button } from "@/components/ui/button";

const HERO_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const HOME_HERO_POSTER = "/images/gpc-home-hero-poster.webp";
const HOME_HERO_VIDEO = "/video/gpc-home-hero-video.mp4";
const HERO_REVEAL = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.72, ease: HERO_EASE },
  },
};

const companyModel = [
  {
    title: "Buy",
    label: "Basis before story",
    items: [
      "Read frontage, drainage, access, and adjacency before the first call gets comfortable.",
      "Only chase upside the parcel can physically and politically carry.",
      "If the basis needs optimism to work, leave it.",
    ],
  },
  {
    title: "Build",
    label: "Approvals before spend",
    items: [
      "Sequence zoning, utilities, process friction, and precedent before spend compounds.",
      "Tie scope to the real site and the real jurisdiction, not to slideware.",
      "Keep one execution thread from first pass through delivery.",
    ],
  },
  {
    title: "Manage",
    label: "Operations before optics",
    items: [
      "Run for durable collections, resident experience, and defensible capex.",
      "Let operating truth beat reporting theater every time.",
      "Preserve the learning so the next acquisition starts armed.",
    ],
  },
] as const;

const heroProofLanes = [
  {
    label: "Basis before story",
    detail: "Read dirt, access, and utilities before the narrative gets expensive.",
  },
  {
    label: "Path before spend",
    detail: "Sequence zoning and utilities before capital and consultants stack up.",
  },
  {
    label: "Operations before optics",
    detail: "Keep evidence, decisions, and operating memory attached after close.",
  },
] as const;

const homePreviewSignals = [
  {
    label: "Parcel truth",
    detail: "Boundary, frontage, utilities, and adjacency stay pinned to the live opportunity.",
    state: "attached",
  },
  {
    label: "Approval sequence",
    detail: "Zoning posture, precedent, and utility friction remain visible before outside spend begins.",
    state: "sequenced",
  },
  {
    label: "Evidence chain",
    detail: "Artifacts, diligence notes, and decisions stay inside the same working pass.",
    state: "current",
  },
  {
    label: "Run history",
    detail: "Operator memory survives handoff so the next pass starts from the real site, not recollection.",
    state: "retained",
  },
] as const;

const homePreviewMemory = [
  {
    label: "Parcel scan",
    detail: "Frontage only fits the buy box if drainage and access clear in the same read.",
  },
  {
    label: "Jurisdiction",
    detail: "The approval path stays next to the parcel instead of becoming a detached memo exercise.",
  },
  {
    label: "Execution",
    detail: "Evidence, runs, and operator notes persist once the deal leaves the first analyst.",
  },
] as const;

const underwritingStillNotes = [
  "Field conditions stay beside the underwriting thread.",
  "Approvals and utilities are sequenced before outside spend compounds.",
  "Evidence survives handoff into execution and operations.",
] as const;

const systemChain = [
  {
    label: "Parcel read",
    detail: "Boundary, access, utilities, adjacency, and site friction stay in frame while the deal moves.",
    support: "Keep the dirt story attached to the price, not in a separate memo.",
  },
  {
    label: "Approval sequence",
    detail: "Zoning posture, process order, and precedent stay beside the live opportunity.",
    support: "Show what has to clear, in what order, before spend compounds.",
  },
  {
    label: "Evidence chain",
    detail: "Artifacts, decisions, workflows, and run history stay attached when execution leaves the first analyst.",
    support: "Preserve the working record instead of rebuilding diligence at every handoff.",
  },
] as const;

type CompanyModelRowProps = {
  entry: (typeof companyModel)[number];
  prefersReducedMotion: boolean;
};

function CompanyModelRow({ entry, prefersReducedMotion }: CompanyModelRowProps) {
  return (
    <motion.article
      className="grid gap-6 border-t border-white/12 py-8 md:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] md:items-start md:gap-10"
      variants={HERO_REVEAL}
      whileHover={prefersReducedMotion ? undefined : { x: 4 }}
    >
      <div className="space-y-2">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-white/44">{entry.label}</p>
        <h2 className="text-[clamp(2.4rem,8vw,5.8rem)] font-semibold tracking-[-0.08em] text-white">{entry.title}</h2>
      </div>

      <div className="space-y-3">
        {entry.items.map((item) => (
          <p className="border-t border-white/8 pt-3 text-sm leading-6 text-white/72 sm:text-base" key={item}>
            {item}
          </p>
        ))}
      </div>
    </motion.article>
  );
}

/**
 * Public homepage for Gallagher Property Company.
 * Presents the company as a parcel-first buy, build, and manage operator while preserving access to the internal operating system.
 */
export function CompanyHomePage() {
  const heroRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useReducedMotion() ?? false;
  const [heroVideoReady, setHeroVideoReady] = useState(false);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const heroImageScale = useTransform(scrollYProgress, [0, 1], [1, prefersReducedMotion ? 1 : 1.04]);
  const heroImageY = useTransform(scrollYProgress, [0, 1], [0, prefersReducedMotion ? 0 : 56]);
  const heroOverlayOpacity = useTransform(scrollYProgress, [0, 1], [0.46, prefersReducedMotion ? 0.46 : 0.68]);

  return (
    <div className="bg-black text-white" id="top">
      <main>
        <section className="relative isolate min-h-[100svh] overflow-hidden bg-black" ref={heroRef}>
          <motion.div className="absolute inset-0" style={{ scale: heroImageScale, y: heroImageY }}>
            <Image
              alt="Blue-hour aerial view of a Louisiana housing community beside wetlands and industrial lights"
              className="object-cover object-[68%_48%]"
              fill
              priority
              sizes="100vw"
              src={HOME_HERO_POSTER}
            />
            {prefersReducedMotion ? null : (
              <video
                aria-hidden="true"
                autoPlay
                className={`absolute inset-0 h-full w-full object-cover object-[68%_48%] transition-opacity duration-700 ${
                  heroVideoReady ? "opacity-100" : "opacity-0"
                }`}
                loop
                muted
                onCanPlay={() => setHeroVideoReady(true)}
                onLoadedData={() => setHeroVideoReady(true)}
                playsInline
                poster={HOME_HERO_POSTER}
              >
                <source src={HOME_HERO_VIDEO} type="video/mp4" />
              </video>
            )}
          </motion.div>

          <motion.div
            className="absolute inset-0 bg-[linear-gradient(96deg,rgba(2,6,23,0.96)_0%,rgba(2,6,23,0.78)_28%,rgba(2,6,23,0.26)_56%,rgba(2,6,23,0.82)_100%)]"
            style={{ opacity: heroOverlayOpacity }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_26%,rgba(255,255,255,0.12),transparent_26%)]" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black via-black/56 to-transparent" />

          <div className="relative flex min-h-[100svh] flex-col px-6 py-4 md:px-10 md:py-5 lg:px-16">
            <motion.header
              animate="visible"
              className="flex items-center justify-between gap-4 border-b border-white/14 pb-3"
              initial="hidden"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.08, delayChildren: 0.06 } },
              }}
            >
              <motion.div className="space-y-1" variants={HERO_REVEAL}>
                <p className="font-mono text-[0.72rem] uppercase tracking-[0.3em] text-white/56">
                  Gallagher Property Company
                </p>
                <p className="text-sm text-white/74">Baton Rouge, Louisiana</p>
              </motion.div>

              <motion.div variants={HERO_REVEAL}>
                <Button
                  asChild
                  className="h-10 border-white/18 bg-white/6 px-4 text-white hover:bg-white/12 hover:text-white"
                  variant="outline"
                >
                  <Link href="/login">
                    Operator access
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </motion.div>
            </motion.header>

            <motion.div
              animate="visible"
              className="grid flex-1 gap-6 py-5 lg:grid-cols-[minmax(0,1.06fr)_minmax(18rem,0.94fr)] lg:items-end lg:gap-8"
              initial="hidden"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.08, delayChildren: 0.12 } },
              }}
            >
              <div className="max-w-3xl space-y-5">
                <motion.div className="space-y-3" variants={HERO_REVEAL}>
                  <p className="font-mono text-[0.72rem] uppercase tracking-[0.3em] text-white/56">
                    Manufactured housing with land discipline.
                  </p>
                  <h1 className="max-w-[11ch] text-[clamp(3.4rem,7.2vw,6.8rem)] font-semibold tracking-[-0.09em] text-white">
                    Gallagher
                    <span className="block">Property Company</span>
                  </h1>
                  <p className="max-w-[13ch] text-[clamp(1.4rem,2.5vw,2.3rem)] font-medium leading-[0.98] tracking-[-0.06em] text-white/95">
                    See the site before the story gets expensive.
                  </p>
                  <p className="max-w-md text-sm leading-6 text-white/72 sm:text-base">
                    We buy, entitle, build, and operate with parcel truth, approval sequence, and operating memory visible from the first pass.
                  </p>
                </motion.div>

                <motion.div className="flex flex-wrap items-center gap-3" variants={HERO_REVEAL}>
                  <Button asChild className="h-12 bg-white px-5 text-sm font-semibold text-black hover:bg-white/90" size="lg">
                    <Link href="/login">
                      Enter the live workspace
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    className="h-12 border-white/20 bg-white/6 px-5 text-sm font-semibold text-white hover:bg-white/12 hover:text-white"
                    size="lg"
                    variant="outline"
                  >
                    <Link href="#owner-submission">Send a community for review</Link>
                  </Button>
                </motion.div>

                <motion.p className="max-w-sm text-sm leading-6 text-white/58" variants={HERO_REVEAL}>
                  Open live parcels, approvals, workflows, and evidence in one system.
                </motion.p>

                <motion.div
                  className="grid gap-4 border-t border-white/14 pt-4 sm:grid-cols-3"
                  variants={HERO_REVEAL}
                >
                  {heroProofLanes.map((lane) => (
                    <div className="space-y-2" key={lane.label}>
                      <h2 className="text-sm font-semibold tracking-[-0.02em] text-white/94">{lane.label}</h2>
                      <p className="text-sm leading-6 text-white/60">{lane.detail}</p>
                    </div>
                  ))}
                </motion.div>
              </div>

              <motion.div variants={HERO_REVEAL}>
                <EntitlementOsPreviewPanel
                  eyebrow="Entitlement OS"
                  memory={homePreviewMemory}
                  parcel={{
                    label: "Active parcel",
                    value: "Louisiana frontage with wetlands edge and utility friction visible",
                    detail:
                      "Land, approvals, evidence, and operating memory stay readable at the same time so the first pass does not break the second one.",
                  }}
                  signals={homePreviewSignals}
                  summary="One operating chain for parcel truth, approvals, evidence, and execution memory."
                  title="Underwrite what is real"
                />
              </motion.div>
            </motion.div>
          </div>
        </section>

        <section className="border-t border-white/10 bg-black px-6 py-20 md:px-10 lg:px-16">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)] lg:items-end">
              <motion.div
                className="max-w-2xl"
                initial="hidden"
                variants={HERO_REVEAL}
                viewport={{ once: true, amount: 0.35 }}
                whileInView="visible"
              >
                <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-white/56">Operating rules</p>
                <h2 className="mt-3 max-w-[14ch] text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl">
                  Nothing gets underwritten on faith.
                </h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-white/64">
                  Basis before story. Path before spend. Operations before optics.
                </p>
              </motion.div>

              <motion.figure
                className="relative min-h-[24rem] overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/80"
                initial="hidden"
                variants={HERO_REVEAL}
                viewport={{ once: true, amount: 0.25 }}
                whileInView="visible"
              >
                <Image
                  alt="Blue-hour aerial view of roads, water, and community pads across the Louisiana industrial edge"
                  className="object-cover object-center"
                  fill
                  sizes="(min-width: 1024px) 56vw, 100vw"
                  src="/images/gpc-home-hero.png"
                />
                <div className="absolute inset-0 bg-[linear-gradient(118deg,rgba(2,6,23,0.18)_0%,rgba(2,6,23,0.42)_36%,rgba(2,6,23,0.88)_100%)]" />
                <div className="absolute inset-x-0 bottom-0 space-y-5 p-6 md:p-8">
                  <div className="space-y-3">
                    <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/62">Field truth</p>
                    <h3 className="max-w-[12ch] text-2xl font-semibold tracking-[-0.05em] text-white sm:text-[2rem]">
                      Basis, approvals, and operating truth stay in one frame.
                    </h3>
                  </div>
                  <div className="grid gap-3 border-t border-white/12 pt-5 md:grid-cols-3">
                    {underwritingStillNotes.map((note) => (
                      <p className="text-sm leading-6 text-white/68" key={note}>
                        {note}
                      </p>
                    ))}
                  </div>
                </div>
              </motion.figure>
            </div>

            <motion.div
              className="mt-12"
              initial="hidden"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.08, delayChildren: 0.06 } },
              }}
              viewport={{ once: true, amount: 0.2 }}
              whileInView="visible"
            >
              {companyModel.map((entry) => (
                <CompanyModelRow entry={entry} key={entry.title} prefersReducedMotion={prefersReducedMotion} />
              ))}
            </motion.div>
          </div>
        </section>

        <section className="border-t border-white/10 bg-zinc-950 px-6 py-20 md:px-10 lg:px-16">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)] lg:items-start">
            <motion.div
              className="max-w-lg lg:sticky lg:top-12"
              initial="hidden"
              variants={HERO_REVEAL}
              viewport={{ once: true, amount: 0.35 }}
              whileInView="visible"
            >
              <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-white/56">Chain of custody</p>
              <h2 className="mt-3 max-w-[12ch] text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl">
                The desk never loses the parcel.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-white/68">
                Entitlement OS keeps site context, approvals, evidence, workflows, and run history in one working chain. No blind handoffs. No rebuilt diligence.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild className="h-11 bg-white px-5 text-sm font-semibold text-black hover:bg-white/90">
                  <Link href="/login">
                    Access Entitlement OS
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  className="h-11 border-white/20 bg-white/6 px-5 text-sm font-semibold text-white hover:bg-white/12 hover:text-white"
                  variant="outline"
                >
                  <Link href="#owner-submission">Share property details</Link>
                </Button>
              </div>
            </motion.div>

            <motion.div
              className="border-t border-white/10"
              initial="hidden"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
              }}
              viewport={{ once: true, amount: 0.15 }}
              whileInView="visible"
            >
              {systemChain.map((item, index) => (
                <motion.article
                  className="grid gap-4 border-t border-white/10 py-6 first:border-t-0 first:pt-0 md:grid-cols-[auto_minmax(0,1fr)]"
                  key={item.label}
                  variants={HERO_REVEAL}
                >
                  <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-white/40">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <div className="grid gap-4 md:grid-cols-[minmax(0,0.95fr)_minmax(14rem,0.8fr)] md:items-start">
                    <div>
                      <h3 className="text-lg font-semibold tracking-[-0.03em] text-white/95">{item.label}</h3>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/62">{item.detail}</p>
                    </div>
                    <p className="text-sm leading-6 text-white/46">{item.support}</p>
                  </div>
                </motion.article>
              ))}
            </motion.div>
          </div>
        </section>

        <MhcOwnerSubmissionSection />
      </main>
    </div>
  );
}
