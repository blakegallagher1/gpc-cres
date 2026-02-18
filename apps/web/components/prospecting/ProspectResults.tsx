"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  ChevronUp,
  ChevronDown,
  Briefcase,
  Play,
  Save,
  CheckSquare,
  Square,
} from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProspectParcel {
  id: string;
  address: string;
  owner: string;
  acreage: number | null;
  zoning: string;
  assessedValue: number | null;
  floodZone: string;
  lat: number;
  lng: number;
  parish: string;
  parcelUid: string;
  propertyDbId?: string;
}

type SortField =
  | "address"
  | "acreage"
  | "zoning"
  | "assessedValue"
  | "floodZone"
  | "owner";

interface ProspectResultsProps {
  parcels: ProspectParcel[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  polygon: number[][][] | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProspectResults({
  parcels,
  selectedIds,
  onSelectionChange,
  polygon,
}: ProspectResultsProps) {
  const router = useRouter();
  const [sortField, setSortField] = useState<SortField>("acreage");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [creating, setCreating] = useState(false);
  const [triaging, setTriaging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);

  const sorted = useMemo(() => {
    return [...parcels].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "address":
          cmp = a.address.localeCompare(b.address);
          break;
        case "owner":
          cmp = a.owner.localeCompare(b.owner);
          break;
        case "acreage":
          cmp = (a.acreage ?? 0) - (b.acreage ?? 0);
          break;
        case "zoning":
          cmp = a.zoning.localeCompare(b.zoning);
          break;
        case "assessedValue":
          cmp = (a.assessedValue ?? 0) - (b.assessedValue ?? 0);
          break;
        case "floodZone":
          cmp = a.floodZone.localeCompare(b.floodZone);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [parcels, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const toggleAll = () => {
    if (selectedIds.size === parcels.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(parcels.map((p) => p.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const handleCreateDeals = async () => {
    const selected = parcels.filter((p) => selectedIds.has(p.id));
    if (selected.length === 0) {
      toast.error("Select at least one parcel");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/map/prospect", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-deals", parcels: selected }),
      });
      if (!res.ok) throw new Error("Failed to create deals");
      const data = await res.json();
      toast.success(`Created ${data.count} deal${data.count > 1 ? "s" : ""}`);
      if (data.count === 1 && data.created?.[0]) {
        router.push(`/deals/${data.created[0]}`);
      } else {
        router.push("/deals");
      }
    } catch {
      toast.error("Failed to create deals");
    } finally {
      setCreating(false);
    }
  };

  const handleBatchTriage = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      toast.error("Select at least one parcel");
      return;
    }
    setTriaging(true);
    try {
      const res = await fetch("/api/map/prospect", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "batch-triage", parcelIds: ids }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      toast.success(data.message);
    } catch {
      toast.error("Failed to queue triage");
    } finally {
      setTriaging(false);
    }
  };

  const handleSaveArea = async () => {
    if (!saveName.trim() || !polygon) return;
    setSaving(true);
    try {
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName.trim(),
          criteria: {
            polygon: { type: "Polygon", coordinates: polygon },
          },
          alertEnabled: true,
          alertFrequency: "DAILY",
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Prospecting area saved");
      setShowSave(false);
      setSaveName("");
    } catch {
      toast.error("Failed to save area");
    } finally {
      setSaving(false);
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="inline h-3 w-3" />
    ) : (
      <ChevronDown className="inline h-3 w-3" />
    );
  };

  if (parcels.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No parcels found in the drawn area. Try a larger area or adjust filters.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">
              Results ({parcels.length} parcels)
            </CardTitle>
            <CardDescription>
              {selectedIds.size > 0 && (
                <span className="font-medium text-purple-600">
                  {selectedIds.size} selected
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {/* Save area */}
            {polygon && (
              <>
                {showSave ? (
                  <div className="flex gap-1">
                    <Input
                      placeholder="Area name"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      className="h-8 w-40 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveArea();
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving || !saveName.trim()}
                      onClick={handleSaveArea}
                      className="h-8 gap-1 text-xs"
                    >
                      {saving ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="h-3 w-3" />
                      )}
                      Save
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowSave(true)}
                    className="h-8 gap-1 text-xs"
                  >
                    <Save className="h-3 w-3" />
                    Save Area
                  </Button>
                )}
              </>
            )}

            {/* Bulk actions */}
            <Button
              size="sm"
              variant="outline"
              disabled={selectedIds.size === 0 || triaging}
              onClick={handleBatchTriage}
              className="h-8 gap-1 text-xs"
            >
              {triaging ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              Batch Triage
            </Button>
            <Button
              size="sm"
              disabled={selectedIds.size === 0 || creating}
              onClick={handleCreateDeals}
              className="h-8 gap-1 text-xs"
            >
              {creating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Briefcase className="h-3 w-3" />
              )}
              Create Deals ({selectedIds.size})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-2">
                  <button onClick={toggleAll} className="hover:text-foreground">
                    {selectedIds.size === parcels.length ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <th
                  className="cursor-pointer pb-2 pr-4 hover:text-foreground"
                  onClick={() => toggleSort("address")}
                >
                  Address <SortIcon field="address" />
                </th>
                <th
                  className="cursor-pointer pb-2 pr-4 hover:text-foreground"
                  onClick={() => toggleSort("owner")}
                >
                  Owner <SortIcon field="owner" />
                </th>
                <th
                  className="cursor-pointer pb-2 pr-4 text-right hover:text-foreground"
                  onClick={() => toggleSort("acreage")}
                >
                  Acres <SortIcon field="acreage" />
                </th>
                <th
                  className="cursor-pointer pb-2 pr-4 hover:text-foreground"
                  onClick={() => toggleSort("zoning")}
                >
                  Zoning <SortIcon field="zoning" />
                </th>
                <th
                  className="cursor-pointer pb-2 pr-4 text-right hover:text-foreground"
                  onClick={() => toggleSort("assessedValue")}
                >
                  Assessed Value <SortIcon field="assessedValue" />
                </th>
                <th
                  className="cursor-pointer pb-2 pr-4 hover:text-foreground"
                  onClick={() => toggleSort("floodZone")}
                >
                  Flood Zone <SortIcon field="floodZone" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b last:border-0 hover:bg-muted/50 ${
                    selectedIds.has(p.id) ? "bg-purple-50" : ""
                  }`}
                >
                  <td className="py-2 pr-2">
                    <button onClick={() => toggleOne(p.id)}>
                      {selectedIds.has(p.id) ? (
                        <CheckSquare className="h-4 w-4 text-purple-600" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </td>
                  <td className="py-2 pr-4 font-medium">{p.address}</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {p.owner}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {p.acreage != null ? p.acreage.toFixed(2) : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {p.zoning ? (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium">
                        {p.zoning}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {p.assessedValue != null
                      ? `$${p.assessedValue.toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="py-2 pr-4 text-xs">{p.floodZone || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
