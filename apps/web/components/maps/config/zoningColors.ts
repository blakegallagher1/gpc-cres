import { ZONING_DISTRICT_COLORS } from "../mapStyles";

// Convert hex to [r, g, b, a] for deck.gl
function hexToRgba(
  hex: string,
  alpha = 180
): [number, number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b, alpha];
}

const ZONING_RGBA_MAP: Record<string, [number, number, number, number]> = {};
for (const [code, hex] of Object.entries(ZONING_DISTRICT_COLORS)) {
  ZONING_RGBA_MAP[code] = hexToRgba(hex);
}

// Prefix-based fallback colors
const PREFIX_COLORS: [string, [number, number, number, number]][] = [
  ["M1", [147, 51, 234, 180]], // purple
  ["M2", [147, 51, 234, 180]], // purple
  ["I", [192, 38, 211, 180]], // magenta
  ["C", [99, 102, 241, 180]], // indigo
  ["B", [79, 70, 229, 180]], // dark indigo
  ["R", [21, 128, 61, 180]], // green
  ["A", [34, 197, 94, 180]], // light green
];

const DEFAULT_COLOR: [number, number, number, number] = [
  156, 163, 175, 120,
]; // gray

export function getZoningFillColor(
  zoningType: string | undefined | null
): [number, number, number, number] {
  if (!zoningType) return DEFAULT_COLOR;

  // Exact match first
  const exact = ZONING_RGBA_MAP[zoningType];
  if (exact) return exact;

  // Prefix match
  for (const [prefix, color] of PREFIX_COLORS) {
    if (zoningType.startsWith(prefix)) return color;
  }

  return DEFAULT_COLOR;
}

export { ZONING_RGBA_MAP, DEFAULT_COLOR };
