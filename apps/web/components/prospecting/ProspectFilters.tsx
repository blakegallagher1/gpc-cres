"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProspectFilterState {
  searchText: string;
  zoningCodes: string[];
  minAcreage: number | undefined;
  maxAcreage: number | undefined;
  minAssessedValue: number | undefined;
  maxAssessedValue: number | undefined;
  excludeFloodZone: boolean;
}

interface ProspectFiltersProps {
  filters: ProspectFilterState;
  onChange: (filters: ProspectFilterState) => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Common zoning codes for multi-select
// ---------------------------------------------------------------------------

const ZONING_OPTIONS = [
  { code: "A1", label: "A1 — Agricultural" },
  { code: "A2", label: "A2 — Rural Residential" },
  { code: "M1", label: "M1 — Light Industrial" },
  { code: "M2", label: "M2 — Heavy Industrial" },
  { code: "C1", label: "C1 — Neighborhood Commercial" },
  { code: "C2", label: "C2 — General Commercial" },
  { code: "C3", label: "C3 — Highway Commercial" },
  { code: "B1", label: "B1 — Buffer" },
  { code: "I1", label: "I1 — Light Industrial" },
  { code: "I2", label: "I2 — Heavy Industrial" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProspectFilters({
  filters,
  onChange,
  disabled,
}: ProspectFiltersProps) {
  const update = (partial: Partial<ProspectFilterState>) => {
    onChange({ ...filters, ...partial });
  };

  return (
    <Card className={disabled ? "opacity-60" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Filters</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Address / parcel text search */}
        <div className="space-y-1.5">
          <Label className="text-xs">Property Search</Label>
          <Input
            type="text"
            placeholder="Address, owner, or parcel id"
            disabled={disabled}
            value={filters.searchText}
            onChange={(e) => update({ searchText: e.target.value })}
            className="h-8 text-xs"
          />
        </div>

        {/* Zoning multi-select */}
        <div className="space-y-1.5">
          <Label className="text-xs">Zoning Codes</Label>
          <div className="flex flex-wrap gap-1">
            {ZONING_OPTIONS.map((opt) => {
              const active = filters.zoningCodes.includes(opt.code);
              return (
                <button
                  key={opt.code}
                  disabled={disabled}
                  onClick={() => {
                    const next = active
                      ? filters.zoningCodes.filter((c) => c !== opt.code)
                      : [...filters.zoningCodes, opt.code];
                    update({ zoningCodes: next });
                  }}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    active
                      ? "bg-purple-100 text-purple-700 ring-1 ring-purple-300"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                  title={opt.label}
                >
                  {opt.code}
                </button>
              );
            })}
          </div>
        </div>

        {/* Acreage range */}
        <div className="space-y-1.5">
          <Label className="text-xs">Acreage</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Min"
              disabled={disabled}
              value={filters.minAcreage ?? ""}
              onChange={(e) =>
                update({
                  minAcreage: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              className="h-8 text-xs"
            />
            <Input
              type="number"
              placeholder="Max"
              disabled={disabled}
              value={filters.maxAcreage ?? ""}
              onChange={(e) =>
                update({
                  maxAcreage: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Assessed value range */}
        <div className="space-y-1.5">
          <Label className="text-xs">Assessed Value ($)</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Min"
              disabled={disabled}
              value={filters.minAssessedValue ?? ""}
              onChange={(e) =>
                update({
                  minAssessedValue: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
              className="h-8 text-xs"
            />
            <Input
              type="number"
              placeholder="Max"
              disabled={disabled}
              value={filters.maxAssessedValue ?? ""}
              onChange={(e) =>
                update({
                  maxAssessedValue: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Flood zone exclusion */}
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Exclude flood zones</Label>
          <Switch
            disabled={disabled}
            checked={filters.excludeFloodZone}
            onCheckedChange={(checked) =>
              update({ excludeFloodZone: checked })
            }
          />
        </div>

        {disabled && (
          <p className="text-[10px] text-muted-foreground">
            Draw an area on the map to enable filters
          </p>
        )}
      </CardContent>
    </Card>
  );
}
