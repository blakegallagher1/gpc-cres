export const DATA_AGENT_RETRIEVAL_LIMIT = 6;

const PROPERTY_DATA_HINT_RE =
  /\b(?:comp|comps|sale|sales|sold|sold for|price|prices|noi|cap rate|cap-rate|lender|tour|correction|corrections|listing|offer|asking|bought|purchased|rent|rental|valuation|cap|value)\b/i;
const PROPERTY_ADDRESS_RE =
  /\b\d{1,6}\s+[a-z0-9.'"-]+(?:\s+[a-z0-9.'"-]+){0,6}\s+(?:st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|ct|court|pl|place|pkwy|parkway|hwy|highway|trl|trail|way|terr|terrace|cir|circle|ct\.|st\.|ave\.|blvd\.|rd\.|dr\.|ln\.|pl\.|hwy\.)\b/i;
const PROPERTY_NUMERIC_FACT_RE =
  /\$[\d][\d,.]*\s*(?:[kKmM]|million|thousand)?\b|\b\d+(?:\.\d+)?\s*%/;
const PROPERTY_DATA_TABLE_RE =
  /\n\s*(?:\||\*|[-+•])[\s\S]*?(?:\$|%|\b\d+\s*(?:acres?|units?|b\s*dr))[\s\S]*?(?:\n|$)/i;
const PROPERTY_DATA_HEADER_RE =
  /\b(?:here are|here's|input|ingest|storing|table of)\b.*\b(?:comps?|sales?|properties?|parcels?)\b/i;
const PROPERTY_RECALL_QUERY_RE =
  /\b(?:tell me about|what do we know about|what do you know about|anything on|anything about|details on|details about|history on|history about|profile for|profile on|what's on file for|what was (?:the )?(?:sale price|price|cap rate|noi|rent|value)\b|what is (?:the )?(?:sale price|price|cap rate|noi|rent|value)\b|what's (?:the )?(?:sale price|price|cap rate|noi|rent|value)\b)\b/i;
const PROPERTY_MEMORY_INGESTION_RE =
  /\b(?:store|save|remember|record|learn)\b[\s\S]*\b(?:future recall|future reference|for later|on file|knowledge base|build knowledge)\b/i;
const KNOWLEDGE_MEMORY_INGESTION_RE =
  /\b(?:store|save|remember|record|capture|learn)\b[\s\S]*\b(?:knowledge entry|reasoning trace|analysis pattern|institutional knowledge|knowledge base|future reference|for later)\b/i;
const PROPERTY_ANALYSIS_REQUEST_RE =
  /\b(?:analy[sz]e|underwrite|assess|evaluate|recommend|compare|screen|triage|what do you think|should we|summari[sz]e)\b/i;
const ADDRESS_SIGNATURE_RE =
  /\b(\d{1,6})\s+([a-z0-9.'"\-\s]+?)\s+(street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|court|ct|place|pl|parkway|pkwy|highway|hwy|trail|trl|way|terrace|terr|circle|cir)\b/i;
const PARISH_SCOPED_REQUEST_RE = /\b([a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,3})\s+parish\b/gi;
const ADDRESS_SUFFIX_CANONICAL: Record<string, string> = {
  st: "street",
  street: "street",
  ave: "avenue",
  avenue: "avenue",
  blvd: "boulevard",
  boulevard: "boulevard",
  rd: "road",
  road: "road",
  dr: "drive",
  drive: "drive",
  ln: "lane",
  lane: "lane",
  ct: "court",
  court: "court",
  pl: "place",
  place: "place",
  pkwy: "parkway",
  parkway: "parkway",
  hwy: "highway",
  highway: "highway",
  trl: "trail",
  trail: "trail",
  way: "way",
  terr: "terrace",
  terrace: "terrace",
  cir: "circle",
  circle: "circle",
};

export const MISSING_PARISH_DIMENSION_CODE = "MISSING_PARISH_DIMENSION";
export const PARISH_VERIFIED_ROWS_EMPTY_CODE = "PARISH_VERIFIED_ROWS_EMPTY";

export function shouldRequireStoreMemory(firstUserInput: unknown): boolean {
  if (typeof firstUserInput !== "string") return false;
  const text = firstUserInput.trim();
  if (text.length < 8) return false;
  if (PROPERTY_RECALL_QUERY_RE.test(text)) return false;
  const hasPropertyDataHint = PROPERTY_DATA_HINT_RE.test(text);
  const hasAddress = PROPERTY_ADDRESS_RE.test(text);
  const hasNumericFact = PROPERTY_NUMERIC_FACT_RE.test(text);
  const hasDataTable = PROPERTY_DATA_TABLE_RE.test(text);
  const hasDataHeader = PROPERTY_DATA_HEADER_RE.test(text.toLowerCase());
  return hasDataHeader || ((hasPropertyDataHint && (hasAddress || hasNumericFact || hasDataTable)));
}

export function shouldRequireAddressMemoryLookup(firstUserInput: unknown): boolean {
  if (typeof firstUserInput !== "string") return false;
  const text = firstUserInput.trim();
  if (text.length < 8) return false;
  if (shouldRequireStoreMemory(text)) return false;
  return PROPERTY_ADDRESS_RE.test(text) && PROPERTY_RECALL_QUERY_RE.test(text);
}

export function shouldTreatAsMemoryIngestionOnly(firstUserInput: unknown): boolean {
  if (typeof firstUserInput !== "string") return false;
  const text = firstUserInput.trim();
  if (text.length < 8) return false;
  if (!shouldRequireStoreMemory(text)) return false;
  if (!PROPERTY_MEMORY_INGESTION_RE.test(text)) return false;
  return !PROPERTY_ANALYSIS_REQUEST_RE.test(text);
}

export function shouldTreatAsKnowledgeIngestionOnly(firstUserInput: unknown): boolean {
  if (typeof firstUserInput !== "string") return false;
  const text = firstUserInput.trim();
  if (text.length < 8) return false;
  if (shouldRequireStoreMemory(text)) return false;
  if (!KNOWLEDGE_MEMORY_INGESTION_RE.test(text)) return false;
  return !PROPERTY_ANALYSIS_REQUEST_RE.test(text);
}

export function normalizeAddressComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractAddressSignature(address: string): string | null {
  const normalized = normalizeAddressComparable(address);
  const match = normalized.match(ADDRESS_SIGNATURE_RE);
  if (!match) return null;
  const houseNumber = match[1]?.trim();
  const streetName = match[2]?.replace(/['"]/g, " ").replace(/\s+/g, " ").trim();
  const suffixRaw = match[3]?.replace(/\./g, "").trim();
  const suffix = suffixRaw ? ADDRESS_SUFFIX_CANONICAL[suffixRaw] : undefined;
  if (!houseNumber || !streetName || !suffix) return null;
  return `${houseNumber} ${streetName} ${suffix}`;
}

export function isMaterialAddressMismatch(requestedAddress: string, returnedAddress: string): boolean {
  const requestedSignature = extractAddressSignature(requestedAddress);
  const returnedSignature = extractAddressSignature(returnedAddress);
  if (requestedSignature && returnedSignature) {
    return requestedSignature !== returnedSignature;
  }

  const requested = normalizeAddressComparable(requestedAddress);
  const returned = normalizeAddressComparable(returnedAddress);
  if (requested.length === 0 || returned.length === 0) return false;
  return !requested.includes(returned) && !returned.includes(requested);
}

export function normalizeOpenAiConversationId(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("conv") ? value : undefined;
}

export function extractRequestedParish(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const matches = [...value.matchAll(PARISH_SCOPED_REQUEST_RE)];
  const match = matches.at(-1);
  const candidate = match?.[1]?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
  if (!candidate) return null;
  const stopTokens = new Set(["in", "for", "of", "near", "at", "around", "inside"]);
  const parts = candidate.split(" ");
  let startIndex = 0;
  for (let index = 0; index < parts.length; index += 1) {
    if (stopTokens.has(parts[index])) {
      startIndex = index + 1;
    }
  }
  const parish = parts.slice(startIndex).join(" ").trim();
  const normalized = parish.length > 0 ? parish : candidate;
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isParishScopedParcelRequest(
  firstUserInput: unknown,
  queryIntent: string | null | undefined,
): boolean {
  if (queryIntent !== "land_search") return false;
  return extractRequestedParish(firstUserInput) !== null;
}
