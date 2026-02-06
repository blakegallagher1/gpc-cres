"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

const SKU_OPTIONS = [
  { value: "SMALL_BAY_FLEX", label: "Small Bay Flex" },
  { value: "OUTDOOR_STORAGE", label: "Outdoor Storage" },
  { value: "TRUCK_PARKING", label: "Truck Parking" },
];

interface JurisdictionOption {
  id: string;
  name: string;
}

export default function NewDealPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [jurisdictions, setJurisdictions] = useState<JurisdictionOption[]>([]);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [jurisdictionId, setJurisdictionId] = useState("");
  const [parcelAddress, setParcelAddress] = useState("");
  const [apn, setApn] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetch("/api/jurisdictions")
      .then((res) => res.json())
      .then((data) => setJurisdictions(data.jurisdictions ?? []))
      .catch(() => {
        // Jurisdictions API may not exist yet; use fallback
        setJurisdictions([
          { id: "ebr", name: "East Baton Rouge" },
          { id: "ascension", name: "Ascension" },
          { id: "livingston", name: "Livingston" },
        ]);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Deal name is required");
      return;
    }
    if (!sku) {
      toast.error("Please select a SKU");
      return;
    }
    if (!jurisdictionId) {
      toast.error("Please select a jurisdiction");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          sku,
          jurisdictionId,
          parcelAddress: parcelAddress.trim() || undefined,
          apn: apn.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create deal");
      }

      const data = await res.json();
      toast.success("Deal created");
      router.push(`/deals/${data.deal.id}`);
    } catch (error) {
      console.error("Failed to create deal:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create deal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/deals">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">New Deal</h1>
            <p className="text-sm text-muted-foreground">
              Create a new entitlement deal to track through the pipeline.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Deal Details</CardTitle>
            <CardDescription>
              Fill in the basic information to create your deal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Deal Name *</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Airline Hwy Flex Park"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">SKU *</label>
                  <Select value={sku} onValueChange={setSku}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select product type" />
                    </SelectTrigger>
                    <SelectContent>
                      {SKU_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Jurisdiction *</label>
                  <Select value={jurisdictionId} onValueChange={setJurisdictionId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select jurisdiction" />
                    </SelectTrigger>
                    <SelectContent>
                      {jurisdictions.map((j) => (
                        <SelectItem key={j.id} value={j.id}>
                          {j.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Parcel Address</label>
                <Input
                  value={parcelAddress}
                  onChange={(e) => setParcelAddress(e.target.value)}
                  placeholder="e.g. 12345 Airline Hwy, Baton Rouge, LA 70817"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">APN (optional)</label>
                <Input
                  value={apn}
                  onChange={(e) => setApn(e.target.value)}
                  placeholder="e.g. 0123456789"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notes (optional)</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional context about this deal..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" type="button" asChild>
                  <Link href="/deals">Cancel</Link>
                </Button>
                <Button type="submit" disabled={submitting} className="gap-2">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create Deal
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
