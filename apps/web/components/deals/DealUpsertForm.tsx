"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type DealAssetClass,
  type DealStrategy,
  type SkuType,
  type WorkflowTemplateKey,
} from "@entitlement-os/shared";
import { ArrowLeft, Loader2, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AddressAutocomplete,
  type AddressSuggestion,
} from "@/components/ui/address-autocomplete";
import {
  DEAL_ASSET_CLASS_OPTIONS,
  DEAL_STRATEGY_OPTIONS,
  ENTITLEMENT_FORM_DEFAULTS,
  resolveWorkflowTemplateDefault,
  SKU_OPTIONS,
  WORKFLOW_TEMPLATE_OPTIONS,
} from "@/components/deals/dealFormOptions";

interface JurisdictionOption {
  id: string;
  name: string;
}

type DealUpsertFormProps = {
  mode: "create" | "edit";
  dealId?: string;
  prefillAddress?: string;
  prefillParish?: string;
};

type FormState = {
  name: string;
  sku: SkuType | "";
  jurisdictionId: string;
  parcelAddress: string;
  apn: string;
  assetClass: DealAssetClass;
  strategy: DealStrategy;
  workflowTemplateKey: WorkflowTemplateKey;
  targetCloseDate: string;
  notes: string;
};

type DealResponse = {
  id: string;
  name: string;
  sku: SkuType;
  jurisdiction?: { id: string; name: string } | null;
  assetClass?: DealAssetClass | null;
  strategy?: DealStrategy | null;
  workflowTemplateKey?: WorkflowTemplateKey | null;
  targetCloseDate?: string | null;
  notes?: string | null;
  parcels?: Array<{ address: string; apn?: string | null }>;
};

const FALLBACK_JURISDICTIONS: JurisdictionOption[] = [
  { id: "ebr", name: "East Baton Rouge" },
  { id: "ascension", name: "Ascension" },
  { id: "livingston", name: "Livingston" },
];

function buildInitialState(prefillAddress: string): FormState {
  return {
    name: "",
    sku: "",
    jurisdictionId: "",
    parcelAddress: prefillAddress,
    apn: "",
    assetClass: ENTITLEMENT_FORM_DEFAULTS.assetClass,
    strategy: ENTITLEMENT_FORM_DEFAULTS.strategy,
    workflowTemplateKey: ENTITLEMENT_FORM_DEFAULTS.workflowTemplateKey,
    targetCloseDate: "",
    notes: "",
  };
}

function getStreetName(address: string): string {
  return address.split(",")[0]?.trim() ?? "";
}

function normalizeDealToFormState(deal: DealResponse): FormState {
  const firstParcel = deal.parcels?.[0];

  return {
    name: deal.name,
    sku: deal.sku,
    jurisdictionId: deal.jurisdiction?.id ?? "",
    parcelAddress: firstParcel?.address ?? "",
    apn: firstParcel?.apn ?? "",
    assetClass: deal.assetClass ?? ENTITLEMENT_FORM_DEFAULTS.assetClass,
    strategy: deal.strategy ?? ENTITLEMENT_FORM_DEFAULTS.strategy,
    workflowTemplateKey:
      deal.workflowTemplateKey ?? ENTITLEMENT_FORM_DEFAULTS.workflowTemplateKey,
    targetCloseDate: deal.targetCloseDate?.slice(0, 10) ?? "",
    notes: deal.notes ?? "",
  };
}

export function DealUpsertForm({
  mode,
  dealId,
  prefillAddress = "",
  prefillParish = "",
}: DealUpsertFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(mode === "edit");
  const [jurisdictions, setJurisdictions] = useState<JurisdictionOption[]>([]);
  const [form, setForm] = useState<FormState>(() => buildInitialState(prefillAddress));

  const pageTitle = mode === "create" ? "New Deal" : "Edit Deal";
  const cardTitle = mode === "create" ? "Deal Details" : "Update Deal";
  const submitLabel = mode === "create" ? "Create Deal" : "Save Changes";
  const pageDescription =
    mode === "create"
      ? "Create a new deal and choose the workflow template that matches the opportunity."
      : "Update the generalized deal profile without changing the existing entitlement workflow contracts.";
  const cardDescription =
    mode === "create"
      ? "Fill in the basic information to create your deal."
      : "Adjust classification, workflow, and compatibility fields for this deal.";

  useEffect(() => {
    let active = true;

    fetch("/api/jurisdictions")
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const availableJurisdictions = (data.jurisdictions ?? []) as JurisdictionOption[];
        setJurisdictions(availableJurisdictions);

        if (mode === "create" && prefillParish && !form.jurisdictionId) {
          const match = availableJurisdictions.find((jurisdiction) =>
            jurisdiction.name.toLowerCase().includes(prefillParish.toLowerCase()),
          );
          if (match) {
            setForm((previous) => ({
              ...previous,
              jurisdictionId: match.id,
            }));
          }
        }
      })
      .catch(() => {
        if (!active) return;
        setJurisdictions(FALLBACK_JURISDICTIONS);
        if (mode === "create" && prefillParish) {
          const match = FALLBACK_JURISDICTIONS.find((jurisdiction) =>
            jurisdiction.name.toLowerCase().includes(prefillParish.toLowerCase()),
          );
          if (match) {
            setForm((previous) =>
              previous.jurisdictionId
                ? previous
                : {
                    ...previous,
                    jurisdictionId: match.id,
                  },
            );
          }
        }
      });

    return () => {
      active = false;
    };
  }, [mode, prefillParish]);

  useEffect(() => {
    if (mode !== "create" || !prefillAddress) {
      return;
    }

    const streetName = getStreetName(prefillAddress);
    if (!streetName) {
      return;
    }

    setForm((previous) =>
      previous.name
        ? previous
        : {
            ...previous,
            name: streetName,
          },
    );
  }, [mode, prefillAddress]);

  useEffect(() => {
    if (mode !== "edit" || !dealId) {
      return;
    }

    let active = true;
    setLoadingInitial(true);

    fetch(`/api/deals/${dealId}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to load deal");
        }

        return (await res.json()) as { deal: DealResponse };
      })
      .then((data) => {
        if (!active) return;
        setForm(normalizeDealToFormState(data.deal));
      })
      .catch((error) => {
        console.error("Failed to load deal:", error);
        toast.error("Failed to load deal");
      })
      .finally(() => {
        if (active) {
          setLoadingInitial(false);
        }
      });

    return () => {
      active = false;
    };
  }, [dealId, mode]);

  const backHref = mode === "create" ? "/deals" : `/deals/${dealId}`;
  const submitEndpoint = mode === "create" ? "/api/deals" : `/api/deals/${dealId}`;
  const submitMethod = mode === "create" ? "POST" : "PATCH";

  const canSubmit = useMemo(
    () =>
      form.name.trim().length > 0 &&
      form.sku.length > 0 &&
      form.jurisdictionId.length > 0 &&
      form.assetClass.length > 0 &&
      form.strategy.length > 0 &&
      form.workflowTemplateKey.length > 0,
    [form],
  );

  const handleStrategyChange = (strategy: DealStrategy) => {
    const nextTemplateKey = resolveWorkflowTemplateDefault(strategy);

    setForm((previous) => ({
      ...previous,
      strategy,
      assetClass:
        strategy === "ENTITLEMENT"
          ? ENTITLEMENT_FORM_DEFAULTS.assetClass
          : previous.assetClass,
      workflowTemplateKey: nextTemplateKey ?? previous.workflowTemplateKey,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!canSubmit) {
      toast.error("Complete the required deal fields before saving.");
      return;
    }

    setSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        sku: form.sku,
        jurisdictionId: form.jurisdictionId,
        assetClass: form.assetClass,
        strategy: form.strategy,
        workflowTemplateKey: form.workflowTemplateKey,
        targetCloseDate: form.targetCloseDate || null,
        notes: form.notes.trim() || null,
      };

      if (mode === "create") {
        body.parcelAddress = form.parcelAddress.trim() || undefined;
        body.apn = form.apn.trim() || undefined;
      }

      const res = await fetch(submitEndpoint, {
        method: submitMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(
          err && typeof err === "object" && "error" in err
            ? String(err.error)
            : mode === "create"
              ? "Failed to create deal"
              : "Failed to update deal",
        );
      }

      const data = (await res.json()) as { deal: { id: string } };
      toast.success(mode === "create" ? "Deal created" : "Deal updated");
      router.push(`/deals/${data.deal.id}`);
      router.refresh();
    } catch (error) {
      console.error("Failed to save deal:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : mode === "create"
            ? "Failed to create deal"
            : "Failed to update deal",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInitial) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{pageTitle}</h1>
            <p className="text-sm text-muted-foreground">{pageDescription}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {mode === "edit" ? <PencilLine className="h-4 w-4" /> : null}
              {cardTitle}
            </CardTitle>
            <CardDescription>{cardDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Deal Name *</label>
                <Input
                  value={form.name}
                  onChange={(e) =>
                    setForm((previous) => ({
                      ...previous,
                      name: e.target.value,
                    }))
                  }
                  placeholder="e.g. Airline Hwy Flex Park"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">SKU *</label>
                  <Select
                    value={form.sku}
                    onValueChange={(value) =>
                      setForm((previous) => ({
                        ...previous,
                        sku: value as SkuType,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product type" />
                    </SelectTrigger>
                    <SelectContent>
                      {SKU_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Jurisdiction *</label>
                  <Select
                    value={form.jurisdictionId}
                    onValueChange={(value) =>
                      setForm((previous) => ({
                        ...previous,
                        jurisdictionId: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select jurisdiction" />
                    </SelectTrigger>
                    <SelectContent>
                      {jurisdictions.map((jurisdiction) => (
                        <SelectItem key={jurisdiction.id} value={jurisdiction.id}>
                          {jurisdiction.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Asset Class *</label>
                  <Select
                    value={form.assetClass}
                    onValueChange={(value) =>
                      setForm((previous) => ({
                        ...previous,
                        assetClass: value as DealAssetClass,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select asset class" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEAL_ASSET_CLASS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Strategy *</label>
                  <Select value={form.strategy} onValueChange={handleStrategyChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select strategy" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEAL_STRATEGY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Workflow Template *</label>
                  <Select
                    value={form.workflowTemplateKey}
                    onValueChange={(value) =>
                      setForm((previous) => ({
                        ...previous,
                        workflowTemplateKey: value as WorkflowTemplateKey,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select workflow template" />
                    </SelectTrigger>
                    <SelectContent>
                      {WORKFLOW_TEMPLATE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {mode === "create" ? (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Parcel Address</label>
                    <AddressAutocomplete
                      value={form.parcelAddress}
                      onChange={(value) =>
                        setForm((previous) => ({
                          ...previous,
                          parcelAddress: value,
                        }))
                      }
                      onSelect={(suggestion: AddressSuggestion) => {
                        setForm((previous) => ({
                          ...previous,
                          parcelAddress: suggestion.description,
                          name:
                            previous.name || getStreetName(suggestion.description),
                        }));
                      }}
                      placeholder="Start typing an address..."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">APN (optional)</label>
                    <Input
                      value={form.apn}
                      onChange={(e) =>
                        setForm((previous) => ({
                          ...previous,
                          apn: e.target.value,
                        }))
                      }
                      placeholder="e.g. 0123456789"
                    />
                  </div>
                </>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Target Close Date</label>
                  <Input
                    type="date"
                    value={form.targetCloseDate}
                    onChange={(e) =>
                      setForm((previous) => ({
                        ...previous,
                        targetCloseDate: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notes (optional)</label>
                <Textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((previous) => ({
                      ...previous,
                      notes: e.target.value,
                    }))
                  }
                  placeholder="Any additional context about this deal..."
                  rows={4}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" type="button" asChild>
                  <Link href={backHref}>Cancel</Link>
                </Button>
                <Button type="submit" disabled={submitting || !canSubmit} className="gap-2">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {submitLabel}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
