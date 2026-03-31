import type { MapParcel } from "@/components/maps/types";
import { normalizeParcelId } from "@/lib/maps/parcelIdentity";

const STREET_SUFFIX_CANONICAL: Array<[RegExp, string]> = [
  [/\bct\b/g, "court"],
  [/\bdr\b/g, "drive"],
  [/\bst\b/g, "street"],
  [/\brd\b/g, "road"],
  [/\bave\b/g, "avenue"],
  [/\bblvd\b/g, "boulevard"],
  [/\bhwy\b/g, "highway"],
  [/\bln\b/g, "lane"],
];
const COORDINATE_MATCH_TOLERANCE = 0.0001;
const PARCEL_ID_PATTERN = /^\d{3}-\d{3,}$/;
const ADDRESS_NUMBER_PATTERN = /^\d+\s+[\w#]/;
const STREET_SUFFIX_PATTERN =
  /\b(street|st|road|rd|drive|dr|lane|ln|avenue|ave|boulevard|blvd|court|ct|highway|hwy|way|parkway|pkwy)\b/;
const ANALYSIS_PREFIX_PATTERNS = [
  /^(how many|count|total|average|show me|find|identify|list|compare|what|which|where|tell me|who owns)/,
  /^within\s+\d+/,
];
const ANALYSIS_TERM_PATTERN =
  /\b(within|near|between|around|minute|mile|radius|flood|wetland|epa|zoned|greater than|less than|at least|more than|acres|acreage|industrial|commercial|residential|owner|assessed|compare)\b/;

/**
 * Suggestion payload surfaced by the parcel-search combobox.
 */
export interface ParcelSearchSuggestion {
  id: string;
  parcelId?: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  propertyDbId: string | null;
  hasGeometry?: boolean;
  owner?: string | null;
}

function hasFiniteCoordinate(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Returns true when the query looks like a direct parcel lookup rather than
 * an analytical prompt.
 */
export function isLikelyParcelLookupQuery(query: string): boolean {
  const normalized = canonicalizeParcelSearchText(query);
  if (!normalized) return false;

  if (PARCEL_ID_PATTERN.test(normalized)) {
    return true;
  }

  if (ADDRESS_NUMBER_PATTERN.test(normalized)) {
    return true;
  }

  return STREET_SUFFIX_PATTERN.test(normalized) && !ANALYSIS_TERM_PATTERN.test(normalized);
}

/**
 * Returns true when the query reads like an analytical map prompt.
 */
export function isLikelyMapAnalysisQuery(query: string): boolean {
  const normalized = canonicalizeParcelSearchText(query);
  if (!normalized) return false;
  if (isLikelyParcelLookupQuery(normalized)) return false;
  return (
    ANALYSIS_PREFIX_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    ANALYSIS_TERM_PATTERN.test(normalized)
  );
}

/**
 * Normalizes address-like search text so street suffix variants compare consistently.
 */
export function canonicalizeParcelSearchText(value: string): string {
  let text = value
    .toLowerCase()
    .replace(/[^\w\s#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, replacement] of STREET_SUFFIX_CANONICAL) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Returns true when a parcel should be included in a free-form parcel search.
 */
export function parcelMatchesSearch(parcel: MapParcel, query: string): boolean {
  const normalizedQuery = canonicalizeParcelSearchText(query);
  if (!normalizedQuery) return true;

  return [
    parcel.address,
    parcel.owner,
    parcel.currentZoning,
    parcel.floodZone,
    parcel.parcelId,
    parcel.propertyDbId,
  ].some((value) => {
    if (!value) return false;
    return canonicalizeParcelSearchText(String(value)).includes(normalizedQuery);
  });
}

/**
 * Returns the strongest parcel lookup key for a selected suggestion.
 */
export function buildSuggestionLookupText(suggestion: ParcelSearchSuggestion): string {
  const propertyDbId = suggestion.propertyDbId?.trim();
  if (propertyDbId) return propertyDbId;

  const parcelId = normalizeParcelId(suggestion.parcelId);
  if (parcelId) return parcelId;
  return suggestion.address.trim();
}

/**
 * Resolves a suggestion back to the parcel object rendered on the map.
 */
export function resolveSuggestionParcel(
  suggestion: ParcelSearchSuggestion,
  parcels: readonly MapParcel[],
): MapParcel | null {
  const propertyDbId = suggestion.propertyDbId?.trim().toLowerCase();
  if (propertyDbId) {
    const propertyMatch = parcels.find(
      (parcel) => parcel.propertyDbId?.trim().toLowerCase() === propertyDbId,
    );
    if (propertyMatch) return propertyMatch;
  }

  const parcelId = normalizeParcelId(suggestion.parcelId);
  if (parcelId) {
    const parcelIdMatch = parcels.find(
      (parcel) => normalizeParcelId(parcel.parcelId ?? parcel.propertyDbId ?? parcel.id) === parcelId,
    );
    if (parcelIdMatch) return parcelIdMatch;
  }

  const suggestionId = normalizeParcelId(suggestion.id);
  if (suggestionId) {
    const idMatch = parcels.find(
      (parcel) => normalizeParcelId(parcel.id) === suggestionId,
    );
    if (idMatch) return idMatch;
  }

  const normalizedAddress = canonicalizeParcelSearchText(suggestion.address);
  if (normalizedAddress) {
    const addressMatch = parcels.find(
      (parcel) =>
        canonicalizeParcelSearchText(parcel.address) === normalizedAddress,
    );
    if (addressMatch) return addressMatch;
  }

  if (
    hasFiniteCoordinate(suggestion.lat) &&
    hasFiniteCoordinate(suggestion.lng)
  ) {
    const suggestionLat = suggestion.lat;
    const suggestionLng = suggestion.lng;
    const coordinateMatch = parcels.find(
      (parcel) =>
        Math.abs(parcel.lat - suggestionLat) <= COORDINATE_MATCH_TOLERANCE &&
        Math.abs(parcel.lng - suggestionLng) <= COORDINATE_MATCH_TOLERANCE,
    );
    if (coordinateMatch) return coordinateMatch;
  }

  return null;
}
