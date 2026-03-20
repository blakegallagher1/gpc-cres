import type { MapParcel } from "@/components/maps/ParcelMap";

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

/**
 * Suggestion payload surfaced by the parcel-search combobox.
 */
export interface ParcelSearchSuggestion {
  id: string;
  address: string;
  lat: number | null;
  lng: number | null;
  propertyDbId: string | null;
}

function hasFiniteCoordinate(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
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
    parcel.currentZoning,
    parcel.floodZone,
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
  return suggestion.address.trim();
}

/**
 * Resolves a suggestion back to the parcel object rendered on the map.
 */
export function resolveSuggestionParcel(
  suggestion: ParcelSearchSuggestion,
  parcels: readonly MapParcel[],
): MapParcel | null {
  const propertyDbId = suggestion.propertyDbId?.trim() ?? "";
  if (propertyDbId) {
    const propertyDbMatch = parcels.find(
      (parcel) => parcel.propertyDbId?.trim() === propertyDbId,
    );
    if (propertyDbMatch) return propertyDbMatch;
  }

  const suggestionId = suggestion.id.trim();
  if (suggestionId) {
    const idMatch = parcels.find((parcel) => parcel.id === suggestionId);
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
