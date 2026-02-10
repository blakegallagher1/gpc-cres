"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

const PARISHES = [
  "East Baton Rouge",
  "Ascension",
  "Livingston",
  "West Baton Rouge",
  "Iberville",
];

const ZONING_CODES = [
  "M1",
  "M2",
  "M3",
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "B1",
];

interface SavedSearchBuilderProps {
  onCreated?: () => void;
  trigger?: React.ReactNode;
}

export function SavedSearchBuilder({
  onCreated,
  trigger,
}: SavedSearchBuilderProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [selectedParishes, setSelectedParishes] = useState<string[]>([]);
  const [selectedZoning, setSelectedZoning] = useState<string[]>([]);
  const [minAcreage, setMinAcreage] = useState("");
  const [maxAcreage, setMaxAcreage] = useState("");
  const [searchText, setSearchText] = useState("");
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertFrequency, setAlertFrequency] = useState("DAILY");

  const toggleParish = (parish: string) => {
    setSelectedParishes((prev) =>
      prev.includes(parish)
        ? prev.filter((p) => p !== parish)
        : [...prev, parish]
    );
  };

  const toggleZoning = (code: string) => {
    setSelectedZoning((prev) =>
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code]
    );
  };

  const reset = () => {
    setName("");
    setSelectedParishes([]);
    setSelectedZoning([]);
    setMinAcreage("");
    setMaxAcreage("");
    setSearchText("");
    setAlertEnabled(false);
    setAlertFrequency("DAILY");
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Search name is required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          criteria: {
            ...(selectedParishes.length > 0 && {
              parishes: selectedParishes,
            }),
            ...(selectedZoning.length > 0 && {
              zoningCodes: selectedZoning,
            }),
            ...(minAcreage && { minAcreage: parseFloat(minAcreage) }),
            ...(maxAcreage && { maxAcreage: parseFloat(maxAcreage) }),
            ...(searchText.trim() && { searchText: searchText.trim() }),
          },
          alertEnabled,
          alertFrequency,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save search");
      }

      toast.success("Saved search created");
      reset();
      setOpen(false);
      onCreated?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save search"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Search
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Saved Search</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Search Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Large EBR Industrial Parcels"
            />
          </div>

          {/* Keyword */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Address / Owner Keyword
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="e.g. Airline Hwy, Gallagher"
                className="pl-9"
              />
            </div>
          </div>

          {/* Parishes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Parishes</label>
            <div className="flex flex-wrap gap-2">
              {PARISHES.map((parish) => (
                <button
                  key={parish}
                  type="button"
                  onClick={() => toggleParish(parish)}
                  className="flex items-center gap-1.5"
                >
                  <Checkbox
                    checked={selectedParishes.includes(parish)}
                    className="pointer-events-none"
                  />
                  <span className="text-sm">{parish}</span>
                </button>
              ))}
            </div>
            {selectedParishes.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {selectedParishes.map((p) => (
                  <Badge key={p} variant="secondary" className="gap-1 text-xs">
                    {p}
                    <button
                      type="button"
                      onClick={() => toggleParish(p)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Zoning Codes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Zoning Codes</label>
            <div className="flex flex-wrap gap-1.5">
              {ZONING_CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleZoning(code)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    selectedZoning.includes(code)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>

          {/* Acreage Range */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Acreage Range</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={minAcreage}
                onChange={(e) => setMinAcreage(e.target.value)}
                placeholder="Min"
                min={0}
                step={0.1}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="number"
                value={maxAcreage}
                onChange={(e) => setMaxAcreage(e.target.value)}
                placeholder="Max"
                min={0}
                step={0.1}
              />
            </div>
          </div>

          {/* Alert Settings */}
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Enable Alerts</p>
                <p className="text-xs text-muted-foreground">
                  Get notified when new matches are found
                </p>
              </div>
              <Switch
                checked={alertEnabled}
                onCheckedChange={setAlertEnabled}
              />
            </div>
            {alertEnabled && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Frequency
                </label>
                <Select
                  value={alertFrequency}
                  onValueChange={setAlertFrequency}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REALTIME">Real-time</SelectItem>
                    <SelectItem value="DAILY">Daily digest</SelectItem>
                    <SelectItem value="WEEKLY">Weekly digest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Search
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
