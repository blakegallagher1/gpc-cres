"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SubmissionState = "idle" | "submitting" | "success" | "error";

const SIMULATED_SUBMIT_DELAY_MS = 900;

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
    <section className="border-t border-white/14 bg-black px-6 py-12 md:px-10 lg:px-16" id="owner-submission">
      <div className="mx-auto grid w-full max-w-6xl gap-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-12">
        <div className="space-y-4">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-white/46">For sellers</p>
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Submit a community for review</h2>
          <p className="max-w-md text-sm leading-6 text-white/64 sm:text-base">
            If you are considering a sale of a manufactured housing community, share the core details below.
            Our acquisitions team reviews each submission directly.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ownerName">Owner name</Label>
              <Input id="ownerName" name="ownerName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownerEmail">Email</Label>
              <Input id="ownerEmail" name="ownerEmail" required type="email" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ownerPhone">Phone</Label>
              <Input id="ownerPhone" name="ownerPhone" type="tel" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="communityName">Community name</Label>
              <Input id="communityName" name="communityName" required />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="propertyAddress">Property address</Label>
              <Input id="propertyAddress" name="propertyAddress" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="propertyCity">City</Label>
              <Input id="propertyCity" name="propertyCity" required />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="propertyState">State</Label>
              <Input id="propertyState" name="propertyState" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="siteCount">Site count (optional)</Label>
              <Input id="siteCount" min={0} name="siteCount" type="number" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="occupancy">Occupancy (optional)</Label>
              <Input id="occupancy" name="occupancy" placeholder="e.g. 92%" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="askingPrice">Asking price or guidance (optional)</Label>
            <Input id="askingPrice" name="askingPrice" placeholder="e.g. $12,500,000" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Additional notes</Label>
            <Textarea id="notes" name="notes" placeholder="Tell us anything relevant about operations, timing, or tenancy." rows={5} />
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
