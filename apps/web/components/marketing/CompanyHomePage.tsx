"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MhcOwnerSubmissionSection } from "@/components/marketing/MhcOwnerSubmissionSection";

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

const operatorLanes = [
  {
    step: "01",
    label: "Basis before story",
    detail: "Do not pay for a story the dirt, access, and utilities cannot carry.",
  },
  {
    step: "02",
    label: "Path before spend",
    detail: "Read entitlement friction and sequence before capital and consultants stack up.",
  },
  {
    step: "03",
    label: "Operations before optics",
    detail: "Keep evidence, decisions, and operating memory attached after close.",
  },
] as const;

const systemChain = [
  {
    label: "Parcel read",
    detail: "Boundary, access, utilities, adjacency, and site friction stay in frame while the deal moves.",
  },
  {
    label: "Approval sequence",
    detail: "Zoning posture, process order, and precedent stay beside the live opportunity.",
  },
  {
    label: "Evidence chain",
    detail: "Artifacts, decisions, workflows, and run history stay attached when execution leaves the first analyst.",
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
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-white/44">
          {entry.label}
        </p>
        <h2 className="text-[clamp(2.4rem,8vw,5.8rem)] font-semibold tracking-[-0.08em] text-white">
          {entry.title}
        </h2>
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
              className="grid flex-1 gap-3 py-3 lg:grid-cols-[minmax(0,1.12fr)_minmax(16rem,0.8fr)] lg:items-end lg:gap-6 lg:py-4"
              initial="hidden"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.08, delayChildren: 0.12 } },
              }}
            >
              <div className="max-w-3xl space-y-5">
                <motion.div className="space-y-2" variants={HERO_REVEAL}>
                  <p className="font-mono text-[0.72rem] uppercase tracking-[0.3em] text-white/58">
                    Basis. Approvals. Control.
                  </p>
                  <h1 className="max-w-[11ch] text-[clamp(3.4rem,7.2vw,6.8rem)] font-semibold tracking-[-0.09em] text-white">
                    Gallagher
                    <span className="block">Property Company</span>
                  </h1>
                  <p className="max-w-[15ch] text-[clamp(1.18rem,2vw,1.95rem)] font-medium leading-[0.98] tracking-[-0.06em] text-white/95">
                    Manufactured housing with land discipline.
                  </p>
                  <p className="max-w-md text-sm leading-6 text-white/72 sm:text-base">
                    We buy, entitle, build, and operate with parcel truth, approval sequence, and operating memory visible from the first pass.
                  </p>
                </motion.div>

                <motion.div className="flex flex-wrap items-center gap-3" variants={HERO_REVEAL}>
                  <Button asChild className="h-12 bg-white px-5 text-sm font-semibold text-black hover:bg-white/90" size="lg">
                    <Link href="/login">
                      Enter Entitlement OS
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <p className="max-w-xs text-sm leading-5 text-white/56">
                    Parcel truth and operator memory on one working chain.
                  </p>
                </motion.div>
              </div>

              <motion.div className="space-y-4 border-t border-white/14 pt-4" variants={HERO_REVEAL}>
                <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-white/56">
                  Operating posture
                </p>
                <div className="space-y-3">
                  {operatorLanes.map((lane) => (
                    <motion.div
                      className="grid gap-2 border-t border-white/10 pt-3 md:grid-cols-[auto_1fr]"
                      key={lane.label}
                      transition={{ duration: 0.2 }}
                      whileHover={prefersReducedMotion ? undefined : { x: 6 }}
                    >
                      <p className="font-mono text-[0.74rem] uppercase tracking-[0.28em] text-white/40">{lane.step}</p>
                      <div>
                        <h2 className="text-lg font-semibold tracking-[-0.03em] text-white/96">{lane.label}</h2>
                        <p className="mt-2 text-sm leading-6 text-white/62">{lane.detail}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        <section className="border-t border-white/10 bg-black px-6 py-20 md:px-10 lg:px-16">
          <div className="mx-auto max-w-6xl">
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
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/64">
                Basis before story. Approvals before spend. Operations before optics.
              </p>
            </motion.div>

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
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
            <motion.div
              initial="hidden"
              variants={HERO_REVEAL}
              viewport={{ once: true, amount: 0.35 }}
              whileInView="visible"
            >
              <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-white/56">Chain of custody</p>
              <h2 className="mt-3 max-w-[12ch] text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl">
                The desk never loses the parcel.
              </h2>
            </motion.div>

            <motion.div
              className="space-y-5"
              initial="hidden"
              variants={HERO_REVEAL}
              viewport={{ once: true, amount: 0.35 }}
              whileInView="visible"
            >
              <p className="max-w-2xl text-base leading-7 text-white/68">
                Entitlement OS keeps site context, approvals, evidence, workflows, and run history in one working chain. No blind handoffs. No rebuilt diligence.
              </p>
              <div className="space-y-4 border-t border-white/10 pt-5">
                {systemChain.map((item) => (
                  <div className="border-t border-white/10 pt-4 first:border-t-0 first:pt-0" key={item.label}>
                    <h3 className="text-lg font-semibold tracking-[-0.03em] text-white/95">{item.label}</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-white/62">{item.detail}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-white/10 pt-5">
                <Button asChild className="h-11 bg-white px-5 text-sm font-semibold text-black hover:bg-white/90">
                  <Link href="/login">
                    Enter the operating system
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>

        <MhcOwnerSubmissionSection />
      </main>
    </div>
  );
}
