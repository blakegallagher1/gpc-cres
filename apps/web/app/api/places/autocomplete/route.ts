import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getGatewayConfig } from "@/lib/gateway-proxy";
import { validateAddress } from "@/lib/server/googleMapsValidation";
import { getCloudflareAccessHeadersFromEnv } from "@/lib/server/propertyDbEnv";
import * as Sentry from "@sentry/nextjs";

// ---------------------------------------------------------------------------
// GET /api/places/autocomplete?q=<query>
//
// Two-tier address autocomplete:
//   1. Google Places Autocomplete (if GOOGLE_MAPS_API_KEY is set)
//   2. Internal parcel DB via FastAPI gateway (198K EBR parcels)
//
// Returns a unified response regardless of source so the frontend component
// doesn't care which provider resolved.
// ---------------------------------------------------------------------------

interface Suggestion {
  /** Display text (e.g. "12345 Airline Hwy, Baton Rouge, LA 70817") */
  description: string;
  /** Google Place ID or internal parcel ID — used for detail fetches */
  placeId: string;
  /** "google" | "parcel_db" — lets the frontend show a subtle badge */
  source: "google" | "parcel_db";
  /** Whether Google Address Validation verified the top suggestion */
  validated?: boolean;
  /** Validated Google Address Validation formatted address when available */
  formattedAddress?: string;
}

const GOOGLE_VALIDATION_ROUTE_RACE_MS = 2_000;

// ---------------------------------------------------------------------------
// Google Places Autocomplete (New API)
// ---------------------------------------------------------------------------

async function googleAutocomplete(
  query: string,
  apiKey: string,
): Promise<Suggestion[]> {
  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        body: JSON.stringify({
          input: query,
          includedPrimaryTypes: ["street_address", "premise", "subpremise", "route"],
          includedRegionCodes: ["us"],
          // Bias results toward Louisiana / Baton Rouge area
          locationBias: {
            circle: {
              center: { latitude: 30.45, longitude: -91.15 },
              radius: 80000, // ~50 miles
            },
          },
        }),
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!res.ok) {
      console.warn(`[places/autocomplete] Google API error: ${res.status}`);
      return [];
    }

    const data = (await res.json()) as {
      suggestions?: Array<{
        placePrediction?: {
          placeId: string;
          text?: { text: string };
          structuredFormat?: {
            mainText?: { text: string };
            secondaryText?: { text: string };
          };
        };
      }>;
    };

    if (!data.suggestions?.length) return [];

    return data.suggestions
      .filter((s) => s.placePrediction?.placeId)
      .map((s) => {
        const pp = s.placePrediction!;
        const description =
          pp.text?.text ??
          [
            pp.structuredFormat?.mainText?.text,
            pp.structuredFormat?.secondaryText?.text,
          ]
            .filter(Boolean)
            .join(", ") ??
          "";
        return {
          description,
          placeId: pp.placeId,
          source: "google" as const,
        };
      });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.places.autocomplete", method: "UNKNOWN" },
    });
    console.warn("[places/autocomplete] Google fetch failed:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Internal parcel DB search via FastAPI gateway
// ---------------------------------------------------------------------------

async function parcelDbAutocomplete(
  query: string,
  config: { url: string; key: string },
): Promise<Suggestion[]> {
  try {
    const res = await fetch(`${config.url}/tools/parcels.search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        apikey: config.key,
        "Content-Type": "application/json",
        ...getCloudflareAccessHeadersFromEnv(),
      },
      body: JSON.stringify({
        // Use the query as a free-text address match
        address_contains: query,
        limit: 8,
        sort: "address_asc",
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const rows: Array<Record<string, unknown>> = Array.isArray(data)
      ? data
      : Array.isArray(data?.rows)
        ? data.rows
        : [];

    return rows.map((row) => {
      const address = String(
        row.address ?? row.site_address ?? row.situs_address ?? "",
      );
      const parcelId = String(row.parcel_id ?? row.id ?? "");
      const zoning = row.zoning_type ? ` (${row.zoning_type})` : "";
      return {
        description: `${address}${zoning}`,
        placeId: parcelId,
        source: "parcel_db" as const,
      };
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.places.autocomplete", method: "UNKNOWN" },
    });
    console.warn("[places/autocomplete] parcel DB fetch failed:", err);
    return [];
  }
}

function waitForValidationRace(timeoutMs: number): Promise<null> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });
}

async function enrichTopGoogleSuggestion(
  suggestions: Suggestion[],
  apiKey: string | null,
): Promise<Suggestion[]> {
  if (!apiKey || suggestions.length === 0 || suggestions[0]?.source !== "google") {
    return suggestions;
  }

  const validationResult = await Promise.race([
    validateAddress(suggestions[0].description, apiKey),
    waitForValidationRace(GOOGLE_VALIDATION_ROUTE_RACE_MS),
  ]);

  if (!validationResult) {
    return suggestions;
  }

  return [
    {
      ...suggestions[0],
      ...(validationResult.formattedAddress
        ? { formattedAddress: validationResult.formattedAddress }
        : {}),
      validated: validationResult.isValid,
    },
    ...suggestions.slice(1),
  ];
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const auth = await resolveAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = req.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const googleKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  const gatewayConfig = getGatewayConfig();
  const parcelResultsPromise = gatewayConfig
    ? parcelDbAutocomplete(query, gatewayConfig)
    : Promise.resolve([]);
  const googleResultsPromise = googleKey
    ? googleAutocomplete(query, googleKey)
    : Promise.resolve([]);

  const googleResults = await googleResultsPromise;
  const enrichedGoogleResultsPromise = enrichTopGoogleSuggestion(
    googleResults,
    googleKey ?? null,
  );
  const parcelResults = await parcelResultsPromise;
  const enrichedGoogleResults = await enrichedGoogleResultsPromise;

  // Merge: Google first (better full-address quality), then parcel DB extras
  // De-dupe by normalized address substring
  const seen = new Set<string>();
  const merged: Suggestion[] = [];

  for (const s of [...enrichedGoogleResults, ...parcelResults]) {
    const key = s.description.toLowerCase().replace(/\s+/g, " ").slice(0, 40);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(s);
    }
  }

  return NextResponse.json(
    { suggestions: merged.slice(0, 8) },
    {
      headers: {
        // Cache for 5 minutes — addresses don't change often
        "Cache-Control": "private, max-age=300",
      },
    },
  );
}
