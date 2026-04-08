import { addMarketDataPoint } from "./market-monitor.service";

const CITY_TO_PARISH: Record<string, string> = {
  "baton rouge": "East Baton Rouge",
  baker: "East Baton Rouge",
  zachary: "East Baton Rouge",
  central: "East Baton Rouge",
  "greenwell springs": "East Baton Rouge",
  pride: "East Baton Rouge",
  gonzales: "Ascension",
  prairieville: "Ascension",
  donaldsonville: "Ascension",
  sorrento: "Ascension",
  geismar: "Ascension",
  dutchtown: "Ascension",
  "denham springs": "Livingston",
  walker: "Livingston",
  watson: "Livingston",
  livingston: "Livingston",
  albany: "Livingston",
  springfield: "Livingston",
  "port allen": "West Baton Rouge",
  addis: "West Baton Rouge",
  brusly: "West Baton Rouge",
  plaquemine: "Iberville",
  "white castle": "Iberville",
  "st. gabriel": "Iberville",
  "saint gabriel": "Iberville",
  "new roads": "Pointe Coupee",
  hammond: "Tangipahoa",
  ponchatoula: "Tangipahoa",
  amite: "Tangipahoa",
  covington: "St. Tammany",
  mandeville: "St. Tammany",
  slidell: "St. Tammany",
  "new orleans": "Orleans",
  metairie: "Jefferson",
  kenner: "Jefferson",
  laplace: "St. John the Baptist",
  thibodaux: "Lafourche",
  houma: "Terrebonne",
  lafayette: "Lafayette",
  "lake charles": "Calcasieu",
  shreveport: "Caddo",
  monroe: "Ouachita",
  alexandria: "Rapides",
};

const ZIP_PREFIX_TO_PARISH: Record<string, string> = {
  "708": "East Baton Rouge",
  "707": "Ascension",
  "704": "Livingston",
  "706": "West Baton Rouge",
  "703": "Iberville",
};

interface CompPayload {
  sale_price?: number | null;
  price_per_unit?: number | null;
  cap_rate?: number | null;
  noi?: number | null;
  pad_count?: number | null;
  property_type?: string | null;
  market?: string | null;
  sale_date?: string | null;
  source_url?: string | null;
  buyer?: string | null;
  seller?: string | null;
  address?: string | null;
}

interface StructuredMemoryWrite {
  fact_type: string;
  source_type?: string;
  payload?: Record<string, unknown>;
}

export function extractParishFromAddress(
  address: string | null | undefined,
): string | null {
  if (!address) return null;

  const cityStateMatch = address.match(
    /,\s*([A-Za-z .'-]+?)\s*,\s*(?:LA|Louisiana)\b/i,
  );
  if (cityStateMatch) {
    const city = cityStateMatch[1].trim().toLowerCase();
    const parish = CITY_TO_PARISH[city];
    if (parish) return parish;
  }

  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipMatch) {
    const prefix = zipMatch[1].slice(0, 3);
    const parish = ZIP_PREFIX_TO_PARISH[prefix];
    if (parish) return parish;
  }

  return null;
}

export function bridgeCompToMarket(
  structuredWrite: StructuredMemoryWrite,
  effectiveAddress: string | null | undefined,
): void {
  if (structuredWrite.fact_type !== "comp") return;

  const payload = (structuredWrite.payload ?? {}) as CompPayload;
  const parish =
    extractParishFromAddress(effectiveAddress) ??
    extractParishFromAddress(payload.address) ??
    (typeof payload.market === "string" ? payload.market : null) ??
    "East Baton Rouge";

  const data: Record<string, unknown> = {
    address: effectiveAddress ?? payload.address ?? null,
    sale_price: payload.sale_price ?? null,
    price_psf: payload.price_per_unit ?? null,
    cap_rate: payload.cap_rate ?? null,
    noi: payload.noi ?? null,
    property_type: payload.property_type ?? null,
    buyer: payload.buyer ?? null,
    seller: payload.seller ?? null,
    source_url: payload.source_url ?? null,
    pad_count: payload.pad_count ?? null,
  };

  const observedAt = payload.sale_date ? new Date(payload.sale_date) : undefined;
  const source = `memory:${structuredWrite.source_type ?? "user"}`;

  addMarketDataPoint(parish, "comp_sale", source, data, observedAt).catch(
    () => {},
  );
}
