import { ExpressionSpecification } from "maplibre-gl";

export type ParcelColorMode = "zoning" | "flood" | "acreage";

/**
 * Get the fill color expression for a given parcel color mode.
 * Uses data-driven styling based on parcel properties in the tile.
 */
export function getParcelFillColor(
  mode: ParcelColorMode
): ExpressionSpecification {
  if (mode === "zoning") {
    return [
      "match",
      ["coalesce", ["get", "zoning_type"], ""],
      "M1",
      "#6366f1",
      "M2",
      "#6366f1",
      "M3",
      "#6366f1",
      "C1",
      "#f59e0b",
      "C2",
      "#f59e0b",
      "C3",
      "#f59e0b",
      "C4",
      "#f59e0b",
      "C5",
      "#f59e0b",
      "A1",
      "#10b981",
      "A2",
      "#10b981",
      "A3",
      "#10b981",
      "A4",
      "#10b981",
      "A5",
      "#10b981",
      "RE",
      "#10b981",
      "B1",
      "#9ca3af",
      "PUD",
      "#8b5cf6",
      "#d4d4d4",
    ] as ExpressionSpecification;
  }

  if (mode === "flood") {
    return [
      "match",
      ["coalesce", ["get", "flood_zone"], ""],
      "X",
      "#10b981",
      "X500",
      "#f59e0b",
      "AE",
      "#ef4444",
      "A",
      "#ef4444",
      "AO",
      "#ef4444",
      "AH",
      "#ef4444",
      "VE",
      "#dc2626",
      "V",
      "#dc2626",
      "#d4d4d4",
    ] as ExpressionSpecification;
  }

  // acreage mode
  return [
    "interpolate",
    ["linear"],
    ["coalesce", ["get", "area_sqft"], 0],
    0,
    "#dbeafe",
    10890,
    "#93c5fd",
    43560,
    "#3b82f6",
    217800,
    "#1d4ed8",
    435600,
    "#1e3a8a",
  ] as ExpressionSpecification;
}

/**
 * Get the fill opacity expression with zoom-dependent interpolation.
 */
export function getParcelFillOpacity(): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    10,
    0.1,
    13,
    0.18,
    16,
    0.25,
  ] as ExpressionSpecification;
}

/**
 * Get the line width expression with zoom-dependent interpolation.
 */
export function getParcelLineWidth(): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    10,
    0.5,
    13,
    1,
    16,
    1.5,
  ] as ExpressionSpecification;
}

/**
 * Get the line opacity expression with zoom-dependent interpolation.
 */
export function getParcelLineOpacity(): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    10,
    0.3,
    13,
    0.6,
    16,
    0.8,
  ] as ExpressionSpecification;
}

/**
 * Get the line color expression for a given parcel color mode.
 * Returns the same color as the fill color for consistency.
 */
export function getParcelLineColor(
  mode: ParcelColorMode
): ExpressionSpecification {
  return getParcelFillColor(mode);
}

/**
 * Get legend items for a given color mode.
 * Used to display the color scheme in the UI.
 */
export function getParcelLegendItems(
  mode: ParcelColorMode
): Array<{ label: string; color: string }> {
  if (mode === "zoning") {
    return [
      { label: "Industrial (M1, M2, M3)", color: "#6366f1" },
      { label: "Commercial (C1-C5)", color: "#f59e0b" },
      { label: "Residential (A1-A5, RE)", color: "#10b981" },
      { label: "Buffer (B1)", color: "#9ca3af" },
      { label: "Planned Unit Dev (PUD)", color: "#8b5cf6" },
      { label: "Unknown", color: "#d4d4d4" },
    ];
  }

  if (mode === "flood") {
    return [
      { label: "Minimal Risk (X)", color: "#10b981" },
      { label: "Moderate (X500)", color: "#f59e0b" },
      { label: "High (AE, A, AO, AH)", color: "#ef4444" },
      { label: "Coastal (VE, V)", color: "#dc2626" },
      { label: "Unknown", color: "#d4d4d4" },
    ];
  }

  // acreage mode
  return [
    { label: "< 0.25 ac", color: "#dbeafe" },
    { label: "0.25 - 1 ac", color: "#93c5fd" },
    { label: "1 - 5 ac", color: "#3b82f6" },
    { label: "5 - 10 ac", color: "#1d4ed8" },
    { label: "> 10 ac", color: "#1e3a8a" },
  ];
}
