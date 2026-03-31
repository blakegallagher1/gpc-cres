const PARCEL_ID_PUNCTUATION = /[^A-Z0-9]/g;
const LEADING_ZEROES = /^0+(?=\d)/;

const EXPLICIT_OUT_OF_REGION_TERMS = [
  "alabama",
  "arkansas",
  "colorado",
  "florida",
  "georgia",
  "houston",
  "mississippi",
  "new orleans",
  "park county",
  "texas",
  "denver",
  "dallas",
  "atlanta",
  "boulder",
] as const;

const BATON_ROUGE_TERMS = [
  "baton rouge",
  "east baton rouge",
  "ebr",
  "louisiana",
  " la ",
  ",la",
] as const;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeParcelId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = collapseWhitespace(value).toUpperCase().replace(PARCEL_ID_PUNCTUATION, "");
  if (!normalized) {
    return null;
  }

  return normalized.replace(LEADING_ZEROES, "");
}

export function isExplicitOutOfRegionQuery(value: string): boolean {
  const normalized = ` ${collapseWhitespace(value).toLowerCase()} `;
  return EXPLICIT_OUT_OF_REGION_TERMS.some((term) => normalized.includes(` ${term} `));
}

export function isBatonRougeScopedText(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = ` ${collapseWhitespace(value).toLowerCase()} `;
  return BATON_ROUGE_TERMS.some((term) => normalized.includes(term));
}

export function isEastBatonRougeCoordinate(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) {
    return false;
  }

  return lat >= 30.24 && lat <= 30.69 && lng >= -91.33 && lng <= -90.92;
}
