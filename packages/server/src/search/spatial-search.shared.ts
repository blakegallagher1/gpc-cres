const BATON_ROUGE_BOUNDS = {
  minLat: 30.32,
  maxLat: 30.61,
  minLng: -91.32,
  maxLng: -90.98,
} as const;

const BATON_ROUGE_TERMS = [
  "baton rouge",
  "east baton rouge",
  "ebr",
  "highland rd",
  "government st",
  "airline hwy",
  "perkins rd",
  "siegen ln",
  "burbank dr",
  "segen",
  "ascension",
  "livingston",
  "gonzales",
  "denham springs",
  "prairieville",
  "zachary",
  "central",
  "walker",
  "port allen",
  "brusly",
] as const;

export const LOCATION_STOP_WORDS = new Set([
  "baton",
  "rouge",
  "louisiana",
  "la",
  "usa",
  "united",
  "states",
]);

export const STREET_SUFFIX_CANONICAL: Array<[RegExp, string]> = [
  [/\bct\b/g, "court"],
  [/\bdr\b/g, "drive"],
  [/\bst\b/g, "street"],
  [/\brd\b/g, "road"],
  [/\bave\b/g, "avenue"],
  [/\bblvd\b/g, "boulevard"],
  [/\bhwy\b/g, "highway"],
  [/\bln\b/g, "lane"],
];

export const STREET_SUFFIX_ABBREVIATED: Array<[RegExp, string]> = [
  [/\bdrive\b/g, "dr"],
  [/\bstreet\b/g, "st"],
  [/\broad\b/g, "rd"],
  [/\bavenue\b/g, "ave"],
  [/\bboulevard\b/g, "blvd"],
  [/\bhighway\b/g, "hwy"],
  [/\blane\b/g, "ln"],
];

export function sanitizeSearchInput(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .toLowerCase();
}

export function canonicalizeAddressLikeText(input: string): string {
  let value = sanitizeSearchInput(input);
  for (const [pattern, replacement] of STREET_SUFFIX_CANONICAL) {
    value = value.replace(pattern, replacement);
  }
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeParcelId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

export function isEastBatonRougeCoordinate(
  lat: number | null | undefined,
  lng: number | null | undefined,
): boolean {
  if (lat == null || lng == null) return false;
  return (
    lat >= BATON_ROUGE_BOUNDS.minLat &&
    lat <= BATON_ROUGE_BOUNDS.maxLat &&
    lng >= BATON_ROUGE_BOUNDS.minLng &&
    lng <= BATON_ROUGE_BOUNDS.maxLng
  );
}

export function isBatonRougeScopedText(value: string | null | undefined): boolean {
  const normalized = canonicalizeAddressLikeText(value ?? "");
  if (!normalized) return false;
  return BATON_ROUGE_TERMS.some((term) => normalized.includes(term));
}

export function isExplicitOutOfRegionQuery(value: string | null | undefined): boolean {
  const normalized = canonicalizeAddressLikeText(value ?? "");
  if (!normalized) return false;
  if (isBatonRougeScopedText(normalized)) return false;
  return /\b(colorado|texas|mississippi|alabama|arkansas|georgia|florida|california)\b/i.test(
    normalized,
  );
}

export function toFiniteNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.replace(",", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
