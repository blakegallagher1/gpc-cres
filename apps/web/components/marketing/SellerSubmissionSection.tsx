"use client";

import { FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type SellerSubmissionPayload = {
  name: string;
  email: string;
  propertyAddress: string;
  details: string;
  company: string;
};

type SubmissionState = "idle" | "submitting" | "success" | "error";
type FailureReasonCode = "request_failed" | "network_error";

function createSessionId(): string {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `seller-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function recordSellerSubmissionEvent(eventName: string, metadata?: Record<string, unknown>) {
  const payload = {
    events: [
      {
        kind: "navigation",
        occurredAt: new Date().toISOString(),
        route: "/",
        viewId: "seller-submission",
        sessionId: createSessionId(),
        level: "info",
        message: eventName,
        metadata,
      },
    ],
  };

  try {
    await fetch("/api/observability/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-observability-skip": "1",
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Best effort telemetry.
  }
}

export function SellerSubmissionSection() {
  const [form, setForm] = useState<SellerSubmissionPayload>({
    name: "",
    email: "",
    propertyAddress: "",
    details: "",
    company: "",
  });
  const [status, setStatus] = useState<SubmissionState>("idle");

  const canSubmit = useMemo(
    () => form.name.trim().length > 0 && form.email.trim().length > 0 && form.propertyAddress.trim().length > 0,
    [form.email, form.name, form.propertyAddress],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setStatus("submitting");
    await recordSellerSubmissionEvent("seller_submission_started");

    try {
      const response = await fetch("/api/seller-submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const reasonCode: FailureReasonCode = "request_failed";
        setStatus("error");
        await recordSellerSubmissionEvent("seller_submission_failed", { reasonCode, status: response.status });
        return;
      }

      setStatus("success");
      await recordSellerSubmissionEvent("seller_submission_succeeded");
      setForm({ name: "", email: "", propertyAddress: "", details: "", company: "" });
    } catch {
      const reasonCode: FailureReasonCode = "network_error";
      setStatus("error");
      await recordSellerSubmissionEvent("seller_submission_failed", { reasonCode });
    }
  }

  return (
    <section className="mt-8 border-t border-white/14 pt-8">
      <div className="max-w-2xl space-y-3">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-white/46">Seller Intake</p>
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Selling a site in Louisiana?</h2>
        <p className="text-sm leading-6 text-white/64 sm:text-base">
          Send the headline facts and we will review fit for acquisition.
        </p>
      </div>

      <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
        <label className="space-y-2 text-sm text-white/82">
          Name
          <input
            className="w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-white"
            name="name"
            onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
            required
            value={form.name}
          />
        </label>

        <label className="space-y-2 text-sm text-white/82">
          Email
          <input
            className="w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-white"
            name="email"
            onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
            required
            type="email"
            value={form.email}
          />
        </label>

        <label className="space-y-2 text-sm text-white/82 md:col-span-2">
          Property address
          <input
            className="w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-white"
            name="propertyAddress"
            onChange={(e) => setForm((current) => ({ ...current, propertyAddress: e.target.value }))}
            required
            value={form.propertyAddress}
          />
        </label>

        <label className="space-y-2 text-sm text-white/82 md:col-span-2">
          Details (optional)
          <textarea
            className="min-h-28 w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-white"
            name="details"
            onChange={(e) => setForm((current) => ({ ...current, details: e.target.value }))}
            value={form.details}
          />
        </label>

        <label aria-hidden className="hidden">
          Company
          <input
            autoComplete="off"
            name="company"
            onChange={(e) => setForm((current) => ({ ...current, company: e.target.value }))}
            tabIndex={-1}
            value={form.company}
          />
        </label>

        <div className="md:col-span-2 flex items-center gap-4">
          <Button type="submit" disabled={!canSubmit || status === "submitting"}>
            {status === "submitting" ? "Submitting..." : "Submit Seller Intake"}
          </Button>
          {status === "success" ? <p className="text-sm text-emerald-300">Submission received.</p> : null}
          {status === "error" ? (
            <p className="text-sm text-rose-300">Submission failed. Please try again.</p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
