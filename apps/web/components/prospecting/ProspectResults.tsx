"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  ChevronUp,
  ChevronDown,
  Briefcase,
  Play,
  Save,
} from "lucide-react";
import {
  formatOperatorAcreage,
  formatOperatorCurrency,
} from "@/lib/formatters/operatorFormatters";
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
                <Badge variant="secondary" className="px-2 py-0.5 text-[9px]">
                  {selectedIds.size} selected
                </Badge>
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
        <Separator className="mb-4" />
        <ScrollArea className="max-h-[26rem]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-11">
                  <Checkbox
                    checked={selectedIds.size === parcels.length && parcels.length > 0}
                    onCheckedChange={toggleAll}
                    aria-label={
                      selectedIds.size === parcels.length
                        ? "Deselect all prospect parcels"
                        : "Select all prospect parcels"
                    }
                  />
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort("address")}
                    aria-label="Sort by address"
                  >
                    <span>Address</span>
                    <SortIcon field="address" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort("owner")}
                    aria-label="Sort by owner"
                  >
                    <span>Owner</span>
                    <SortIcon field="owner" />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    className="ml-auto inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort("acreage")}
                    aria-label="Sort by acreage"
                  >
                    <span>Acres</span>
                    <SortIcon field="acreage" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort("zoning")}
                    aria-label="Sort by zoning"
                  >
                    <span>Zoning</span>
                    <SortIcon field="zoning" />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    className="ml-auto inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort("assessedValue")}
                    aria-label="Sort by assessed value"
                  >
                    <span>Assessed Value</span>
                    <SortIcon field="assessedValue" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort("floodZone")}
                    aria-label="Sort by flood zone"
                  >
                    <span>Flood Zone</span>
                    <SortIcon field="floodZone" />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((parcel) => (
                <TableRow
                  key={parcel.id}
                  data-state={selectedIds.has(parcel.id) ? "selected" : undefined}
                >
                  <TableCell className="w-11">
                    <Checkbox
                      checked={selectedIds.has(parcel.id)}
                      onCheckedChange={() => toggleOne(parcel.id)}
                      aria-label={
                        selectedIds.has(parcel.id)
                          ? `Deselect ${parcel.address}`
                          : `Select ${parcel.address}`
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="block max-w-[18rem] truncate">{parcel.address}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="block max-w-[14rem] truncate">{parcel.owner}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {parcel.acreage != null
                      ? formatOperatorAcreage(parcel.acreage, {
                          includeUnit: false,
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {parcel.zoning ? (
                      <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
                        {parcel.zoning}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {parcel.assessedValue != null
                      ? formatOperatorCurrency(parcel.assessedValue, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="px-2 py-0.5 text-[9px]">
                      {parcel.floodZone || "N/A"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
