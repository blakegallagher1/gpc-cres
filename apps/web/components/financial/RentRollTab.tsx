"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TenantRecord = {
  id: string;
  dealId: string;
  orgId: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TenantLeaseRecord = {
  id: string;
  dealId: string;
  orgId: string;
  tenantId: string;
  tenantName: string;
  leaseName: string | null;
  startDate: string;
  endDate: string;
  rentedAreaSf: number;
  rentPerSf: number;
  annualEscalationPct: number;
  createdAt: string;
  updatedAt: string;
};

type RentRollTabProps = {
  dealId: string;
  tenants: TenantRecord[];
  tenantLeases: TenantLeaseRecord[];
  weightedAverageLeaseTermYears: number;
  onDataChange: (payload: {
    tenants: TenantRecord[];
    tenantLeases: TenantLeaseRecord[];
  }) => void;
};

type TenantDraft = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  notes: string;
};

type LeaseDraft = {
  tenantId: string;
  leaseName: string;
  startDate: string;
  endDate: string;
  rentedAreaSf: string;
  rentPerSf: string;
  annualEscalationPct: string;
};

function tenantToDraft(tenant: TenantRecord): TenantDraft {
  return {
    name: tenant.name,
    contactName: tenant.contactName ?? "",
    email: tenant.email ?? "",
    phone: tenant.phone ?? "",
    notes: tenant.notes ?? "",
  };
}

function leaseToDraft(lease: TenantLeaseRecord): LeaseDraft {
  return {
    tenantId: lease.tenantId,
    leaseName: lease.leaseName ?? "",
    startDate: lease.startDate.slice(0, 10),
    endDate: lease.endDate.slice(0, 10),
    rentedAreaSf: String(lease.rentedAreaSf),
    rentPerSf: String(lease.rentPerSf),
    annualEscalationPct: String(lease.annualEscalationPct),
  };
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function RentRollTab({
  dealId,
  tenants,
  tenantLeases,
  weightedAverageLeaseTermYears,
  onDataChange,
}: RentRollTabProps) {
  const [tenantDrafts, setTenantDrafts] = useState<Record<string, TenantDraft>>({});
  const [leaseDrafts, setLeaseDrafts] = useState<Record<string, LeaseDraft>>({});

  const [newTenant, setNewTenant] = useState<TenantDraft>({
    name: "",
    contactName: "",
    email: "",
    phone: "",
    notes: "",
  });

  const [newLease, setNewLease] = useState<LeaseDraft>({
    tenantId: "",
    leaseName: "",
    startDate: "",
    endDate: "",
    rentedAreaSf: "",
    rentPerSf: "",
    annualEscalationPct: "0",
  });

  const [busyTenantId, setBusyTenantId] = useState<string | null>(null);
  const [busyLeaseId, setBusyLeaseId] = useState<string | null>(null);
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [creatingLease, setCreatingLease] = useState(false);

  useEffect(() => {
    setTenantDrafts(
      Object.fromEntries(tenants.map((tenant) => [tenant.id, tenantToDraft(tenant)])),
    );
  }, [tenants]);

  useEffect(() => {
    setLeaseDrafts(
      Object.fromEntries(tenantLeases.map((lease) => [lease.id, leaseToDraft(lease)])),
    );
  }, [tenantLeases]);

  const totalAnnualBaseRent = useMemo(
    () =>
      tenantLeases.reduce(
        (sum, lease) => sum + lease.rentedAreaSf * lease.rentPerSf,
        0,
      ),
    [tenantLeases],
  );

  async function createTenant(): Promise<void> {
    if (!newTenant.name.trim()) {
      toast.error("Tenant name is required");
      return;
    }

    setCreatingTenant(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/financial-model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "tenant",
          payload: {
            name: newTenant.name.trim(),
            contactName: emptyToUndefined(newTenant.contactName),
            email: emptyToUndefined(newTenant.email),
            phone: emptyToUndefined(newTenant.phone),
            notes: emptyToUndefined(newTenant.notes),
          },
        }),
      });

      if (!res.ok) throw new Error("Failed to create tenant");
      const data = (await res.json()) as { tenant: TenantRecord };
      onDataChange({
        tenants: [...tenants, data.tenant],
        tenantLeases,
      });
      setNewTenant({ name: "", contactName: "", email: "", phone: "", notes: "" });
      toast.success("Tenant added");
    } catch {
      toast.error("Failed to add tenant");
    } finally {
      setCreatingTenant(false);
    }
  }

  async function saveTenant(tenantId: string): Promise<void> {
    const draft = tenantDrafts[tenantId];
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error("Tenant name is required");
      return;
    }

    setBusyTenantId(tenantId);
    try {
      const res = await fetch(`/api/deals/${dealId}/financial-model`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "tenant",
          payload: {
            id: tenantId,
            name: draft.name.trim(),
            contactName: emptyToUndefined(draft.contactName),
            email: emptyToUndefined(draft.email),
            phone: emptyToUndefined(draft.phone),
            notes: emptyToUndefined(draft.notes),
          },
        }),
      });

      if (!res.ok) throw new Error("Failed to update tenant");
      const data = (await res.json()) as { tenant: TenantRecord };
      onDataChange({
        tenants: tenants.map((tenant) =>
          tenant.id === tenantId ? data.tenant : tenant,
        ),
        tenantLeases,
      });
      toast.success("Tenant updated");
    } catch {
      toast.error("Failed to update tenant");
    } finally {
      setBusyTenantId(null);
    }
  }

  async function deleteTenant(tenantId: string): Promise<void> {
    setBusyTenantId(tenantId);
    try {
      const res = await fetch(`/api/deals/${dealId}/financial-model`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "tenant",
          payload: { id: tenantId },
        }),
      });

      if (!res.ok) throw new Error("Failed to delete tenant");
      onDataChange({
        tenants: tenants.filter((tenant) => tenant.id !== tenantId),
        tenantLeases: tenantLeases.filter((lease) => lease.tenantId !== tenantId),
      });
      toast.success("Tenant deleted");
    } catch {
      toast.error("Failed to delete tenant");
    } finally {
      setBusyTenantId(null);
    }
  }

  async function createLease(): Promise<void> {
    if (!newLease.tenantId || !newLease.startDate || !newLease.endDate) {
      toast.error("Tenant, start date, and end date are required");
      return;
    }

    setCreatingLease(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/financial-model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "lease",
          payload: {
            tenantId: newLease.tenantId,
            leaseName: emptyToUndefined(newLease.leaseName),
            startDate: newLease.startDate,
            endDate: newLease.endDate,
            rentedAreaSf: Number.parseFloat(newLease.rentedAreaSf),
            rentPerSf: Number.parseFloat(newLease.rentPerSf),
            annualEscalationPct:
              Number.parseFloat(newLease.annualEscalationPct || "0") || 0,
          },
        }),
      });

      if (!res.ok) throw new Error("Failed to create lease");
      const data = (await res.json()) as { tenantLease: TenantLeaseRecord };
      onDataChange({
        tenants,
        tenantLeases: [...tenantLeases, data.tenantLease],
      });
      setNewLease({
        tenantId: "",
        leaseName: "",
        startDate: "",
        endDate: "",
        rentedAreaSf: "",
        rentPerSf: "",
        annualEscalationPct: "0",
      });
      toast.success("Lease added");
    } catch {
      toast.error("Failed to add lease");
    } finally {
      setCreatingLease(false);
    }
  }

  async function saveLease(leaseId: string): Promise<void> {
    const draft = leaseDrafts[leaseId];
    if (!draft) return;

    if (!draft.tenantId || !draft.startDate || !draft.endDate) {
      toast.error("Tenant, start date, and end date are required");
      return;
    }

    setBusyLeaseId(leaseId);
    try {
      const res = await fetch(`/api/deals/${dealId}/financial-model`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "lease",
          payload: {
            id: leaseId,
            tenantId: draft.tenantId,
            leaseName: emptyToUndefined(draft.leaseName),
            startDate: draft.startDate,
            endDate: draft.endDate,
            rentedAreaSf: Number.parseFloat(draft.rentedAreaSf),
            rentPerSf: Number.parseFloat(draft.rentPerSf),
            annualEscalationPct: Number.parseFloat(draft.annualEscalationPct || "0") || 0,
          },
        }),
      });

      if (!res.ok) throw new Error("Failed to update lease");
      const data = (await res.json()) as { tenantLease: TenantLeaseRecord };
      onDataChange({
        tenants,
        tenantLeases: tenantLeases.map((lease) =>
          lease.id === leaseId ? data.tenantLease : lease,
        ),
      });
      toast.success("Lease updated");
    } catch {
      toast.error("Failed to update lease");
    } finally {
      setBusyLeaseId(null);
    }
  }

  async function deleteLease(leaseId: string): Promise<void> {
    setBusyLeaseId(leaseId);
    try {
      const res = await fetch(`/api/deals/${dealId}/financial-model`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "lease",
          payload: { id: leaseId },
        }),
      });

      if (!res.ok) throw new Error("Failed to delete lease");
      onDataChange({
        tenants,
        tenantLeases: tenantLeases.filter((lease) => lease.id !== leaseId),
      });
      toast.success("Lease deleted");
    } catch {
      toast.error("Failed to delete lease");
    } finally {
      setBusyLeaseId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Tenants</p>
            <p className="text-xl font-bold tabular-nums">{tenants.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Leases</p>
            <p className="text-xl font-bold tabular-nums">{tenantLeases.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">WALT</p>
            <p className="text-xl font-bold tabular-nums">
              {weightedAverageLeaseTermYears.toFixed(2)} yrs
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Tenants</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tenants.map((tenant) => {
            const draft = tenantDrafts[tenant.id] ?? tenantToDraft(tenant);
            const busy = busyTenantId === tenant.id;
            return (
              <div key={tenant.id} className="rounded-md border p-3 space-y-2">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <Input
                    value={draft.name}
                    onChange={(event) =>
                      setTenantDrafts((current) => ({
                        ...current,
                        [tenant.id]: { ...draft, name: event.target.value },
                      }))
                    }
                    placeholder="Tenant name"
                  />
                  <Input
                    value={draft.contactName}
                    onChange={(event) =>
                      setTenantDrafts((current) => ({
                        ...current,
                        [tenant.id]: { ...draft, contactName: event.target.value },
                      }))
                    }
                    placeholder="Contact"
                  />
                  <Input
                    value={draft.email}
                    onChange={(event) =>
                      setTenantDrafts((current) => ({
                        ...current,
                        [tenant.id]: { ...draft, email: event.target.value },
                      }))
                    }
                    placeholder="Email"
                  />
                  <Input
                    value={draft.phone}
                    onChange={(event) =>
                      setTenantDrafts((current) => ({
                        ...current,
                        [tenant.id]: { ...draft, phone: event.target.value },
                      }))
                    }
                    placeholder="Phone"
                  />
                </div>
                <Input
                  value={draft.notes}
                  onChange={(event) =>
                    setTenantDrafts((current) => ({
                      ...current,
                      [tenant.id]: { ...draft, notes: event.target.value },
                    }))
                  }
                  placeholder="Notes"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => saveTenant(tenant.id)}
                  >
                    <Save className="h-3.5 w-3.5 mr-1" />
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => deleteTenant(tenant.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}

          <div className="rounded-md border border-dashed p-3 space-y-2">
            <Label className="text-xs text-muted-foreground">Add Tenant</Label>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <Input
                value={newTenant.name}
                onChange={(event) =>
                  setNewTenant((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Tenant name"
              />
              <Input
                value={newTenant.contactName}
                onChange={(event) =>
                  setNewTenant((current) => ({ ...current, contactName: event.target.value }))
                }
                placeholder="Contact"
              />
              <Input
                value={newTenant.email}
                onChange={(event) =>
                  setNewTenant((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="Email"
              />
              <Input
                value={newTenant.phone}
                onChange={(event) =>
                  setNewTenant((current) => ({ ...current, phone: event.target.value }))
                }
                placeholder="Phone"
              />
            </div>
            <Input
              value={newTenant.notes}
              onChange={(event) =>
                setNewTenant((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="Notes"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={creatingTenant}
              onClick={() => {
                createTenant();
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Tenant
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Leases</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tenantLeases.map((lease) => {
            const draft = leaseDrafts[lease.id] ?? leaseToDraft(lease);
            const busy = busyLeaseId === lease.id;
            return (
              <div key={lease.id} className="rounded-md border p-3 space-y-2">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={draft.tenantId}
                    onChange={(event) =>
                      setLeaseDrafts((current) => ({
                        ...current,
                        [lease.id]: { ...draft, tenantId: event.target.value },
                      }))
                    }
                  >
                    <option value="">Select tenant</option>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={draft.leaseName}
                    onChange={(event) =>
                      setLeaseDrafts((current) => ({
                        ...current,
                        [lease.id]: { ...draft, leaseName: event.target.value },
                      }))
                    }
                    placeholder="Lease name"
                  />
                  <Input
                    type="date"
                    value={draft.startDate}
                    onChange={(event) =>
                      setLeaseDrafts((current) => ({
                        ...current,
                        [lease.id]: { ...draft, startDate: event.target.value },
                      }))
                    }
                  />
                  <Input
                    type="date"
                    value={draft.endDate}
                    onChange={(event) =>
                      setLeaseDrafts((current) => ({
                        ...current,
                        [lease.id]: { ...draft, endDate: event.target.value },
                      }))
                    }
                  />
                  <Input
                    type="number"
                    value={draft.rentedAreaSf}
                    onChange={(event) =>
                      setLeaseDrafts((current) => ({
                        ...current,
                        [lease.id]: { ...draft, rentedAreaSf: event.target.value },
                      }))
                    }
                    placeholder="SF"
                  />
                  <Input
                    type="number"
                    value={draft.rentPerSf}
                    onChange={(event) =>
                      setLeaseDrafts((current) => ({
                        ...current,
                        [lease.id]: { ...draft, rentPerSf: event.target.value },
                      }))
                    }
                    placeholder="Rent / SF"
                  />
                  <Input
                    type="number"
                    value={draft.annualEscalationPct}
                    onChange={(event) =>
                      setLeaseDrafts((current) => ({
                        ...current,
                        [lease.id]: { ...draft, annualEscalationPct: event.target.value },
                      }))
                    }
                    placeholder="Escalation %"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => saveLease(lease.id)}
                  >
                    <Save className="h-3.5 w-3.5 mr-1" />
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => deleteLease(lease.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}

          <div className="rounded-md border border-dashed p-3 space-y-2">
            <Label className="text-xs text-muted-foreground">Add Lease</Label>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={newLease.tenantId}
                onChange={(event) =>
                  setNewLease((current) => ({ ...current, tenantId: event.target.value }))
                }
              >
                <option value="">Select tenant</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
              <Input
                value={newLease.leaseName}
                onChange={(event) =>
                  setNewLease((current) => ({ ...current, leaseName: event.target.value }))
                }
                placeholder="Lease name"
              />
              <Input
                type="date"
                value={newLease.startDate}
                onChange={(event) =>
                  setNewLease((current) => ({ ...current, startDate: event.target.value }))
                }
              />
              <Input
                type="date"
                value={newLease.endDate}
                onChange={(event) =>
                  setNewLease((current) => ({ ...current, endDate: event.target.value }))
                }
              />
              <Input
                type="number"
                value={newLease.rentedAreaSf}
                onChange={(event) =>
                  setNewLease((current) => ({ ...current, rentedAreaSf: event.target.value }))
                }
                placeholder="SF"
              />
              <Input
                type="number"
                value={newLease.rentPerSf}
                onChange={(event) =>
                  setNewLease((current) => ({ ...current, rentPerSf: event.target.value }))
                }
                placeholder="Rent / SF"
              />
              <Input
                type="number"
                value={newLease.annualEscalationPct}
                onChange={(event) =>
                  setNewLease((current) => ({ ...current, annualEscalationPct: event.target.value }))
                }
                placeholder="Escalation %"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={creatingLease}
              onClick={() => {
                createLease();
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Lease
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Total annual base rent: {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(totalAnnualBaseRent)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
