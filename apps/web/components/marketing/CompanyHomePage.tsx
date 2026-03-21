"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Building2 } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";

const heroEase: [number, number, number, number] = [0.22, 1, 0.36, 1];

const operatingDisciplines = [
  {
    eyebrow: "Development",
    title: "Source sites where the path matters as much as the dirt.",
    body: "We look for commercial real estate opportunities where site context, entitlement friction, and timing can be turned into an edge.",
  },
  {
    eyebrow: "Investment",
    title: "Commit capital after the real constraints are visible.",
    body: "Underwriting is tied to parcel reality, approval path, and execution risk before momentum or narrative carries the deal too far.",
  },
  {
    eyebrow: "Operating discipline",
    title: "Keep the deal thread intact from first read to active execution.",
    body: "Research, evidence, approvals, and decision gates stay attached to the opportunity instead of fragmenting across inboxes and meetings.",
  },
] as const;

const approachSteps = [
  {
    step: "01",
    title: "Read the parcel first",
    body: "Start with access, adjacency, surface risk, and site shape so the opportunity is grounded before anyone starts selling the story.",
  },
  {
    step: "02",
    title: "Model the entitlement path",
    body: "Bring jurisdiction posture, precedent, and process friction into the same pass before capital commitments are made.",
  },
  {
    step: "03",
    title: "Advance with evidence",
    body: "Move through approvals, diligence, counterparties, and workflow execution with live context instead of disconnected updates.",
  },
  {
    step: "04",
    title: "Protect downside early",
    body: "Gate decisions at the moments that actually expose money, time, and reputation rather than after the deal has already hardened.",
  },
] as const;

const sectionReveal = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.72, ease: heroEase },
  },
};

/**
 * Public homepage for Gallagher Property Company.
 * Presents the company as a CRE development and investment operator while preserving a clear path into the internal platform.
 */
export function CompanyHomePage() {
  const heroRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const heroImageY = useTransform(scrollYProgress, [0, 1], [0, prefersReducedMotion ? 0 : 92]);
  const heroImageScale = useTransform(scrollYProgress, [0, 1], [1, prefersReducedMotion ? 1 : 1.06]);
  const heroOverlayOpacity = useTransform(scrollYProgress, [0, 1], [0.48, prefersReducedMotion ? 0.48 : 0.7]);

  return (
    <div className="bg-background text-foreground" id="top">
      <section className="relative isolate min-h-[100svh] overflow-hidden bg-black text-white" ref={heroRef}>
        <motion.div className="absolute inset-0" style={{ scale: heroImageScale, y: heroImageY }}>
          <Image
            alt="Commercial corridor with development land, industrial buildings, and road infrastructure at first light"
            className="object-cover object-center"
            fill
            priority
            sizes="100vw"
            src="/images/gpc-home-hero.png"
          />
        </motion.div>

        <motion.div
          className="absolute inset-0 bg-[linear-gradient(112deg,rgba(0,0,0,0.84)_0%,rgba(0,0,0,0.68)_28%,rgba(0,0,0,0.24)_62%,rgba(0,0,0,0.74)_100%)]"
          style={{ opacity: heroOverlayOpacity }}
        />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black via-black/38 to-transparent" />

        <div className="relative flex min-h-[100svh] items-end px-6 py-10 md:px-10 md:py-12 lg:px-16">
          <motion.div
            animate="visible"
            className="max-w-2xl space-y-8"
            initial="hidden"
            variants={{
              hidden: {},
              visible: {
                transition: {
                  staggerChildren: 0.1,
                  delayChildren: 0.08,
                },
              },
            }}
          >
            <motion.div className="flex items-center gap-4" variants={sectionReveal}>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,rgba(59,130,246,0.92),rgba(15,23,42,0.92))] shadow-[0_16px_40px_rgba(0,0,0,0.28)]">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-white/64">
                  Baton Rouge, Louisiana
                </p>
                <p className="mt-1 text-sm text-white/78">Commercial real estate development and investment</p>
              </div>
            </motion.div>

            <motion.div className="space-y-4" variants={sectionReveal}>
              <h1 className="max-w-[10ch] text-5xl font-semibold tracking-[-0.055em] text-balance sm:text-6xl lg:text-7xl">
                Gallagher Property Company
              </h1>
              <p className="max-w-[15ch] text-3xl font-medium leading-tight tracking-[-0.04em] text-white/92 sm:text-4xl">
                Development and investment built on parcel truth.
              </p>
              <p className="max-w-xl text-base leading-7 text-white/72 sm:text-lg">
                A commercial real estate company working where local context, entitlement discipline, and capital judgment create durable advantage.
              </p>
            </motion.div>

            <motion.div className="flex flex-col gap-3 sm:flex-row" variants={sectionReveal}>
              <motion.div whileHover={prefersReducedMotion ? undefined : { y: -2 }}>
                <Button asChild className="h-12 bg-white px-5 text-sm font-semibold text-black hover:bg-white/90" size="lg">
                  <Link href="#approach">
                    See our approach
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </motion.div>

              <motion.div whileHover={prefersReducedMotion ? undefined : { y: -2 }}>
                <Button
                  asChild
                  className="h-12 border-white/20 bg-white/6 px-5 text-sm font-semibold text-white hover:bg-white/12 hover:text-white"
                  size="lg"
                  variant="outline"
                >
                  <Link href="/login">Operator access</Link>
                </Button>
              </motion.div>
            </motion.div>

            <motion.p className="max-w-md text-sm leading-6 text-white/58" variants={sectionReveal}>
              The public front door is the company. Active internal work runs through Entitlement OS.
            </motion.p>
          </motion.div>
        </div>
      </section>

      <main>
        <section className="border-b border-border bg-background px-6 py-20 md:px-10 lg:px-16">
          <div className="mx-auto max-w-6xl">
            <motion.div
              className="max-w-2xl"
              initial="hidden"
              variants={sectionReveal}
              viewport={{ once: true, amount: 0.4 }}
              whileInView="visible"
            >
              <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-muted-foreground">Support</p>
              <h2 className="mt-3 max-w-[12ch] text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl">
                Development, investment, and deal control.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                One company view of the opportunity, from site read to capital discipline.
              </p>
            </motion.div>

            <div className="mt-12 grid divide-y divide-border border-y border-border md:grid-cols-3 md:divide-x md:divide-y-0">
              {operatingDisciplines.map((discipline, index) => (
                <motion.article
                  className="py-6 md:px-6 md:first:pl-0 md:last:pr-0"
                  initial="hidden"
                  key={discipline.title}
                  transition={{ delay: index * 0.08 }}
                  variants={sectionReveal}
                  viewport={{ once: true, amount: 0.45 }}
                  whileInView="visible"
                >
                  <p className="font-mono text-[0.7rem] uppercase tracking-[0.24em] text-muted-foreground">
                    {discipline.eyebrow}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em]">{discipline.title}</h3>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">{discipline.body}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section
          className="relative overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(15,23,42,0.04)_22%,rgba(255,255,255,0)_100%)] px-6 py-20 md:px-10 lg:px-16"
          id="approach"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-border" />
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start">
            <motion.div
              className="max-w-lg lg:sticky lg:top-12"
              initial="hidden"
              variants={sectionReveal}
              viewport={{ once: true, amount: 0.4 }}
              whileInView="visible"
            >
              <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-muted-foreground">Detail</p>
              <h2 className="mt-3 max-w-[11ch] text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl">
                From site context to capital commitment.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                The operating model stays simple: read what matters early, advance with evidence, and make the irreversible decisions only when the path is legible.
              </p>
            </motion.div>

            <div className="space-y-8">
              {approachSteps.map((step, index) => (
                <motion.article
                  className="grid gap-4 border-t border-border pt-5 md:grid-cols-[auto_1fr]"
                  initial="hidden"
                  key={step.step}
                  transition={{ delay: index * 0.06 }}
                  variants={sectionReveal}
                  viewport={{ once: true, amount: 0.25 }}
                  whileInView="visible"
                >
                  <p className="font-mono text-sm uppercase tracking-[0.26em] text-muted-foreground">{step.step}</p>
                  <div>
                    <h3 className="text-xl font-semibold tracking-[-0.03em]">{step.title}</h3>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{step.body}</p>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-black px-6 py-20 text-white md:px-10 lg:px-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0)_44%)]" />

          <div className="relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
            <motion.div
              initial="hidden"
              variants={sectionReveal}
              viewport={{ once: true, amount: 0.4 }}
              whileInView="visible"
            >
              <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-white/62">Final CTA</p>
              <h2 className="mt-3 max-w-[10ch] text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl">
                Enter the operating model.
              </h2>
              <p className="mt-4 max-w-lg text-base leading-7 text-white/68">
                Publicly, Gallagher Property Company leads with development and investment judgment. Internally, active projects run through Entitlement OS.
              </p>
            </motion.div>

            <motion.div
              className="space-y-5"
              initial="hidden"
              variants={sectionReveal}
              viewport={{ once: true, amount: 0.35 }}
              whileInView="visible"
            >
              <div className="flex flex-col gap-3 sm:flex-row">
                <motion.div whileHover={prefersReducedMotion ? undefined : { y: -2 }}>
                  <Button asChild className="h-12 bg-white px-5 text-sm font-semibold text-black hover:bg-white/90" size="lg">
                    <Link href="/login">
                      Enter Entitlement OS
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </motion.div>

                <motion.div whileHover={prefersReducedMotion ? undefined : { y: -2 }}>
                  <Button
                    asChild
                    className="h-12 border-white/20 bg-white/6 px-5 text-sm font-semibold text-white hover:bg-white/12 hover:text-white"
                    size="lg"
                    variant="outline"
                  >
                    <Link href="#top">Back to top</Link>
                  </Button>
                </motion.div>
              </div>

              <div className="border-t border-white/14 pt-5">
                <p className="font-mono text-[0.72rem] uppercase tracking-[0.26em] text-white/58">Gallagher Property Company</p>
                <p className="mt-2 text-sm leading-6 text-white/62">
                  Baton Rouge, Louisiana. Commercial real estate development, investment, and entitlement execution.
                </p>
              </div>
            </motion.div>
          </div>
        </section>
      </main>
    </div>
  );
}
