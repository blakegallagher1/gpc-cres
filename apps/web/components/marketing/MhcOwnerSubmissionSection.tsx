"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SubmissionState = "idle" | "submitting" | "success" | "error";

const SIMULATED_SUBMIT_DELAY_MS = 900;
const sellerNotes = [
  "Direct review by the acquisitions desk.",
  "Confidential first pass with no broker theater.",
  "Fast read on site, operations, and timing.",
] as const;

export function MhcOwnerSubmissionSection() {
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const ownerName = String(formData.get("ownerName") ?? "").trim();
    const ownerEmail = String(formData.get("ownerEmail") ?? "").trim();
    const communityName = String(formData.get("communityName") ?? "").trim();
    const propertyAddress = String(formData.get("propertyAddress") ?? "").trim();
    const propertyCity = String(formData.get("propertyCity") ?? "").trim();
    const propertyState = String(formData.get("propertyState") ?? "").trim();

    if (!ownerName || !ownerEmail || !communityName || !propertyAddress || !propertyCity || !propertyState) {
      setSubmissionState("error");
      setErrorMessage("Please complete all required fields before submitting.");
      return;
    }

    setSubmissionState("submitting");
    setErrorMessage(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, SIMULATED_SUBMIT_DELAY_MS));
      setSubmissionState("success");
      form.reset();
    } catch {
      setSubmissionState("error");
      setErrorMessage("We could not submit your information. Please try again.");
    }
  }

  return (
    <section className="border-t border-white/14 bg-zinc-950 px-6 py-16 md:px-10 lg:px-16" id="owner-submission">
      <div className="mx-auto grid w-full max-w-6xl gap-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-12">
        <div className="space-y-5">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-white/46">Acquisition desk</p>
          <h2 className="max-w-[10ch] text-2xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">Send the asset.</h2>
          <p className="max-w-md text-sm leading-6 text-white/64 sm:text-base">
            If a community is in play, send the facts. We review the site, the operating posture, and the timing directly.
          </p>
          <div className="space-y-3 border-t border-white/10 pt-5">
            {sellerNotes.map((note) => (
              <p className="border-t border-white/8 pt-3 text-sm leading-6 text-white/56 first:border-t-0 first:pt-0" key={note}>
                {note}
              </p>
            ))}
          </div>
        </div>

        <form className="space-y-5 border-t border-white/10 pt-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="ownerName">Owner name</Label>
              <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="ownerName" name="ownerName" required />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="ownerEmail">Email</Label>
              <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="ownerEmail" name="ownerEmail" required type="email" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="ownerPhone">Phone</Label>
              <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="ownerPhone" name="ownerPhone" type="tel" />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="communityName">Community name</Label>
              <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="communityName" name="communityName" required />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="propertyAddress">Property address</Label>
              <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="propertyAddress" name="propertyAddress" required />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="propertyCity">City</Label>
              <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="propertyCity" name="propertyCity" required />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="propertyState">State</Label>
              <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="propertyState" name="propertyState" required />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="siteCount">Site count (optional)</Label>
              <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="siteCount" min={0} name="siteCount" type="number" />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="occupancy">Occupancy (optional)</Label>
              <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="occupancy" name="occupancy" placeholder="e.g. 92%" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="askingPrice">Asking price or guidance (optional)</Label>
            <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="askingPrice" name="askingPrice" placeholder="e.g. $12,500,000" />
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="notes">Additional notes</Label>
            <Textarea className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="notes" name="notes" placeholder="Tell us anything relevant about operations, timing, or tenancy." rows={5} />
          </div>

          <div className="space-y-3 border-t border-white/14 pt-4">
            <p className="text-xs text-white/60">Information is used for acquisition review only.</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={submissionState === "submitting"} type="submit">
                {submissionState === "submitting" ? "Submitting..." : "Submit property"}
              </Button>
              {submissionState === "success" ? (
                <p className="text-sm text-emerald-300">Submission received. Our team will follow up shortly.</p>
              ) : null}
              {submissionState === "error" ? (
                <p className="text-sm text-red-300">{errorMessage}</p>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
