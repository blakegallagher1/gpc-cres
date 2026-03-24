"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { MhcOwnerSubmissionSection } from "@/components/marketing/MhcOwnerSubmissionSection";

const HERO_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
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
    label: "Acquire with basis discipline",
    items: [
      "Site shape, frontage, access, and context are readable before the first tour.",
      "Entitlement upside is pursued only where the parcel can actually carry it.",
      "Basis stays attached to the local process, not to generic market optimism.",
    ],
  },
  {
    title: "Build",
    label: "Execute against the parcel",
    items: [
      "Development paths are tied to approvals, utilities, timing, and precedent.",
      "Operating assumptions stay grounded in what the site can support.",
      "The same working thread runs from first scan through delivery.",
    ],
  },
  {
    title: "Manage",
    label: "Operate for durable performance",
    items: [
      "Communities are managed for resident experience and income durability.",
      "Capital plans are evaluated against operational reality, not reporting theater.",
      "Decisions compound because the operating memory stays attached to the asset.",
    ],
  },
] as const;

const operatorLanes = [
  {
    label: "Parcel intelligence",
    detail: "Boundaries, ownership, adjacency, utilities, and immediate site friction in one view.",
  },
  {
    label: "Entitlement path",
    detail: "Zoning posture, process sequence, and precedent attached to the real geography.",
  },
  {
    label: "Operating memory",
    detail: "Evidence, workflows, and decisions preserved so the next deal starts ahead.",
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
              alt="Manufactured housing community with surrounding streets and tree cover"
              className="object-cover object-center"
              fill
              priority
              sizes="100vw"
              src="/images/gpc-home-hero.png"
            />
          </motion.div>

          <motion.div
            className="absolute inset-0 bg-[linear-gradient(102deg,rgba(0,0,0,0.88)_0%,rgba(0,0,0,0.72)_32%,rgba(0,0,0,0.26)_58%,rgba(0,0,0,0.82)_100%)]"
            style={{ opacity: heroOverlayOpacity }}
          />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black via-black/56 to-transparent" />

          <div className="relative flex min-h-[100svh] flex-col px-6 py-6 md:px-10 md:py-8 lg:px-16">
            <motion.header
              animate="visible"
              className="flex items-center justify-between gap-4 border-b border-white/14 pb-5"
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
              className="grid min-h-[calc(100svh-7.5rem)] flex-1 gap-12 py-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)] lg:items-end lg:py-14"
              initial="hidden"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.08, delayChildren: 0.12 } },
              }}
            >
              <div className="max-w-3xl space-y-8">
                <motion.div className="space-y-3" variants={HERO_REVEAL}>
                  <p className="font-mono text-[0.72rem] uppercase tracking-[0.3em] text-white/58">
                    Buy. Build. Manage.
                  </p>
                  <h1 className="max-w-[9ch] text-[clamp(3.6rem,8vw,7.4rem)] font-semibold tracking-[-0.08em] text-white">
                    Gallagher Property Company
                  </h1>
                  <p className="max-w-[18ch] text-[clamp(1.5rem,3vw,2.8rem)] font-medium leading-tight tracking-[-0.05em] text-white/92">
                    Parcel-first real estate decisions with operating discipline.
                  </p>
                  <p className="max-w-xl text-base leading-7 text-white/72 sm:text-lg">
                    We acquire, entitle, develop, and operate manufactured housing communities with the site, the process, and the execution trail visible from the first pass.
                  </p>
                </motion.div>

                <motion.div className="flex flex-wrap items-center gap-3" variants={HERO_REVEAL}>
                  <Button asChild className="h-12 bg-white px-5 text-sm font-semibold text-black hover:bg-white/90" size="lg">
                    <Link href="/login">
                      Enter Entitlement OS
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <p className="max-w-sm text-sm leading-6 text-white/58">
                    Internal execution stays inside one operating system for parcel intelligence, workflows, evidence, and memory.
                  </p>
                </motion.div>
              </div>

              <motion.div className="space-y-5 border-t border-white/14 pt-5" variants={HERO_REVEAL}>
                <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-white/56">
                  Internal working lanes
                </p>
                <div className="space-y-4">
                  {operatorLanes.map((lane) => (
                    <motion.div
                      className="border-t border-white/10 pt-4"
                      key={lane.label}
                      transition={{ duration: 0.2 }}
                      whileHover={prefersReducedMotion ? undefined : { x: 4 }}
                    >
                      <h2 className="text-lg font-semibold tracking-[-0.03em] text-white/94">
                        {lane.label}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-white/64">{lane.detail}</p>
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
              <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-white/56">Operating model</p>
              <h2 className="mt-3 max-w-[14ch] text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl">
                One job per phase. One standard of discipline.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/64">
                The model is simple on purpose: acquire with basis discipline, execute against the parcel, and operate for durable performance.
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
              <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-white/56">Entitlement OS</p>
              <h2 className="mt-3 max-w-[12ch] text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl">
                The internal desk stays attached to the land.
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
                Entitlement OS keeps parcel context, approvals, evidence, workflows, and run history in the same operating thread so execution quality compounds instead of restarting.
              </p>
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
