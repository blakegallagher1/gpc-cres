"use client";

import { type ParcelColorMode } from "./parcelColorExpressions";

const MODES: Array<{ value: ParcelColorMode; label: string }> = [
  { value: "zoning", label: "Zoning" },
  { value: "flood", label: "Flood" },
  { value: "acreage", label: "Size" },
];

interface ParcelColorModeControlProps {
  value: ParcelColorMode;
  onChange: (mode: ParcelColorMode) => void;
}

export function ParcelColorModeControl({ value, onChange }: ParcelColorModeControlProps) {
  return (
    <div className="flex items-center rounded-md border border-border bg-background text-xs">
      {MODES.map((mode) => (
        <button
          key={mode.value}
          type="button"
          onClick={() => onChange(mode.value)}
          className={`px-2.5 py-1 transition-colors first:rounded-l-md last:rounded-r-md ${
            value === mode.value
              ? "bg-primary text-primary-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
