"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SubmissionState = "idle" | "submitting" | "success" | "error";

const SIMULATED_SUBMIT_DELAY_MS = 900;

const sellerNotes = [
  {
    label: "Site read",
    detail: "We review parcel basics, access, utilities, and physical friction before the story gets stylized.",
  },
  {
    label: "Operating posture",
    detail: "We look at collections, occupancy, capex reality, and whether the community can carry the next operating step.",
  },
  {
    label: "Timing",
    detail: "We give a first-pass read on sequencing, diligence priority, and whether the desk should keep pressing.",
  },
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
    <section className="border-t border-white/14 bg-zinc-950 px-6 py-20 md:px-10 lg:px-16" id="owner-submission">
      <div className="mx-auto grid w-full max-w-6xl gap-10 md:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] md:items-start md:gap-12">
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-white/46">Acquisition desk</p>
            <h2 className="max-w-[12ch] text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
              Send a community for review.
            </h2>
            <p className="max-w-md text-sm leading-6 text-white/64 sm:text-base">
              Confidential first-pass review from the acquisitions desk. Send the facts and we read the site, the operating posture, and the timing directly.
            </p>
          </div>

          <div className="space-y-4 border-t border-white/10 pt-5">
            {sellerNotes.map((note) => (
              <div className="grid gap-2 border-t border-white/8 pt-4 first:border-t-0 first:pt-0" key={note.label}>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/48">{note.label}</p>
                <p className="text-sm leading-6 text-white/58">{note.detail}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 pt-5">
            <p className="max-w-md text-sm leading-6 text-white/52">
              Information is used for acquisition review only. No marketing blast, no broker theater, no public distribution.
            </p>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_28px_90px_rgba(2,6,23,0.3)] backdrop-blur-xl md:p-8">
          <div className="border-b border-white/10 pb-5">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/52">Property intake</p>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/62">
              Share the owner contact, the property basics, and anything material about operations or timing. Required fields are marked by the form.
            </p>
          </div>

          <form className="space-y-5 pt-6" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="ownerName">
                  Owner name
                </Label>
                <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="ownerName" name="ownerName" required />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="ownerEmail">
                  Email
                </Label>
                <Input
                  className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34"
                  id="ownerEmail"
                  name="ownerEmail"
                  required
                  type="email"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="ownerPhone">
                  Phone
                </Label>
                <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="ownerPhone" name="ownerPhone" type="tel" />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="communityName">
                  Community name
                </Label>
                <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="communityName" name="communityName" required />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="propertyAddress">
                  Property address
                </Label>
                <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="propertyAddress" name="propertyAddress" required />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="propertyCity">
                  City
                </Label>
                <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="propertyCity" name="propertyCity" required />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="propertyState">
                  State
                </Label>
                <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="propertyState" name="propertyState" required />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="siteCount">
                  Site count (optional)
                </Label>
                <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="siteCount" min={0} name="siteCount" type="number" />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="occupancy">
                  Occupancy (optional)
                </Label>
                <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="occupancy" name="occupancy" placeholder="e.g. 92%" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="askingPrice">
                Asking price or guidance (optional)
              </Label>
              <Input className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34" id="askingPrice" name="askingPrice" placeholder="e.g. $12,500,000" />
            </div>

            <div className="space-y-2">
              <Label className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-white/54" htmlFor="notes">
                Additional notes
              </Label>
              <Textarea
                className="border-white/14 bg-white/[0.03] text-white placeholder:text-white/34"
                id="notes"
                name="notes"
                placeholder="Tell us anything relevant about operations, timing, utilities, or tenancy."
                rows={5}
              />
            </div>

            <div className="space-y-3 border-t border-white/14 pt-5">
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={submissionState === "submitting"} type="submit">
                  {submissionState === "submitting" ? "Sending..." : "Send property for review"}
                </Button>
                {submissionState === "success" ? (
                  <p className="text-sm text-emerald-300">Submission received. Our acquisitions desk will follow up shortly.</p>
                ) : null}
                {submissionState === "error" ? <p className="text-sm text-red-300">{errorMessage}</p> : null}
              </div>
              <p className="text-xs text-white/54">Information is used for acquisition review only.</p>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
