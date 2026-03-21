"use client";

import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { SellerSubmissionSection } from "@/components/marketing/SellerSubmissionSection";

const HERO_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const HERO_REVEAL_DURATION_S = 0.72;
const HERO_BACKGROUND_START_OPACITY = 0.18;
const HERO_BACKGROUND_END_OPACITY = 0.42;
const HERO_BACKGROUND_SHIFT_PX = 48;

const companyModel = [
  {
    title: "BUY",
    label: "What we buy",
    items: [
      "Commercial sites with real access, shape, and frontage.",
      "Basis where entitlement work can create pricing edge.",
      "Opportunities where local context changes the outcome.",
    ],
  },
  {
    title: "BUILD",
    label: "What we build",
    items: [
      "Plans tied to the parcel instead of abstract assumptions.",
      "Execution paths grounded in approvals, infrastructure, and timing.",
      "Projects where capital discipline stays attached from first read to delivery.",
    ],
  },
  {
    title: "MANAGE",
    label: "What we manage",
    items: [
      "Communities where resident experience and operations stay aligned.",
      "Capital plans tied to long-term performance, not short-term noise.",
      "Execution that preserves quality while improving income durability.",
    ],
  },
] as const;

const heroSequence = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.06,
    },
  },
};

const sectionReveal = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: HERO_REVEAL_DURATION_S, ease: HERO_EASE },
  },
};

type CompanyModelRowProps = {
  entry: (typeof companyModel)[number];
  prefersReducedMotion: boolean;
};

function CompanyModelRow({ entry, prefersReducedMotion }: CompanyModelRowProps) {
  return (
    <motion.article
      className="grid gap-6 border-t border-white/14 py-8 first:border-t-0 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] md:items-end md:gap-10 lg:py-10"
      variants={sectionReveal}
    >
      <div>
        <h2 className="text-[clamp(4rem,14vw,11rem)] font-semibold leading-[0.82] tracking-[-0.09em] text-white">
          {entry.title}
        </h2>
      </div>

      <div className="max-w-md">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-white/46">{entry.label}</p>
        <ul className="mt-4 space-y-3 text-sm leading-6 text-white/72 sm:text-base">
          {entry.items.map((item) => (
            <motion.li
              className="border-b border-white/10 pb-3 last:border-b-0 last:pb-0"
              key={item}
              transition={{ duration: 0.2 }}
              whileHover={prefersReducedMotion ? undefined : { x: 4 }}
            >
              {item}
            </motion.li>
          ))}
        </ul>
      </div>
    </motion.article>
  );
}

/**
 * Public homepage for Gallagher Property Company.
 * Presents the company through a direct buy-build-manage operating frame while preserving access to the internal platform.
 */
export function CompanyHomePage() {
  const heroRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end end"],
  });

  const backgroundOpacity = useTransform(
    scrollYProgress,
    [0, 1],
    [HERO_BACKGROUND_START_OPACITY, prefersReducedMotion ? HERO_BACKGROUND_START_OPACITY : HERO_BACKGROUND_END_OPACITY],
  );
  const backgroundShift = useTransform(scrollYProgress, [0, 1], [0, prefersReducedMotion ? 0 : HERO_BACKGROUND_SHIFT_PX]);

  return (
    <div className="bg-black text-white" id="top">
      <main>
        <section className="relative isolate min-h-[100svh] overflow-hidden bg-black" ref={heroRef}>
          <motion.div
            className="absolute inset-0"
            style={{ opacity: backgroundOpacity, y: backgroundShift }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.1),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_28%)]" />
            <div className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:96px_96px]" />
          </motion.div>
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.24)_100%)]" />

          <div className="relative flex min-h-[100svh] flex-col px-6 py-6 md:px-10 md:py-8 lg:px-16">
            <motion.header
              animate="visible"
              className="flex flex-col gap-6 border-b border-white/14 pb-6 sm:flex-row sm:items-end sm:justify-between"
              initial="hidden"
              variants={heroSequence}
            >
              <motion.div className="space-y-3" variants={sectionReveal}>
                <p className="font-mono text-[0.72rem] uppercase tracking-[0.3em] text-white/52">Gallagher Property Company</p>
                <div className="space-y-1">
                  <p className="text-sm text-white/76">Baton Rouge, Louisiana</p>
                  <p className="text-sm text-white/56">Commercial real estate development and investment</p>
                </div>
              </motion.div>

              <motion.div className="flex items-center gap-4" variants={sectionReveal}>
                <p className="max-w-xs text-sm leading-6 text-white/54">
                  Direct language. Clear basis. Real estate decisions attached to the parcel.
                </p>
                <motion.div whileHover={prefersReducedMotion ? undefined : { x: 2 }}>
                  <Link className="inline-flex items-center gap-2 text-sm font-medium text-white/88 transition-colors hover:text-white" href="/login">
                    Operator access
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </motion.div>
              </motion.div>
            </motion.header>

            <motion.div
              animate="visible"
              className="flex flex-1 flex-col justify-center py-10 md:py-14"
              initial="hidden"
              variants={heroSequence}
            >
              <h1 className="sr-only">Buy, build, and manage Manufactured Home Communities.</h1>
              <motion.div className="border-b border-white/14" variants={sectionReveal}>
                <p className="max-w-lg text-base leading-7 text-white/62 sm:text-lg">
                  We buy, build, and manage Manufactured Home Communities.
                </p>
              </motion.div>

              <div className="mt-4">
                {companyModel.map((entry) => (
                  <CompanyModelRow
                    entry={entry}
                    key={entry.title}
                    prefersReducedMotion={prefersReducedMotion}
                  />
                ))}
              </div>
            </motion.div>

            <motion.footer
              animate="visible"
              className="border-t border-white/14 pt-6"
              initial="hidden"
              variants={heroSequence}
            >
              <motion.div
                className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"
                variants={sectionReveal}
              >
                <div className="max-w-md space-y-2">
                  <p className="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-white/46">Final CTA</p>
                  <p className="text-sm leading-6 text-white/64 sm:text-base">
                    The public front door stays simple. Active internal execution still runs through Entitlement OS.
                  </p>
                </div>

                <motion.div whileHover={prefersReducedMotion ? undefined : { y: -2 }}>
                  <Button asChild className="h-12 bg-white px-5 text-sm font-semibold text-black hover:bg-white/90" size="lg">
                    <Link href="/login">
                      Enter Entitlement OS
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </motion.div>
              </motion.div>

              <motion.div variants={sectionReveal}>
                <SellerSubmissionSection />
              </motion.div>
            </motion.footer>
          </div>
        </section>
      </main>
    </div>
  );
}
