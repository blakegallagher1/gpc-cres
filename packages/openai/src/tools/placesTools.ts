import { tool } from "@openai/agents";
import { z } from "zod";

/**
 * Google Places API Tools
 *
 * Searches for "gentrification indicator" businesses (specialty coffee,
 * boutique fitness, craft breweries, upscale grocers) in a target area.
 * Uses the Google Places API (New) Text Search endpoint.
 *
 * Environment:
 *   GOOGLE_MAPS_API_KEY – required
 *
 * Cost note: ~$0.032 per Text Search call. A single analysis covering
 * 3 zip codes × 4 indicator types = 12 calls ≈ $0.38.
 */

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

// ---------------------------------------------------------------------------
// Tool: searchNearbyPlaces
// ---------------------------------------------------------------------------

export const searchNearbyPlaces = tool({
  name: "search_nearby_places",
  description:
    "Searches Google Places for gentrification-indicator businesses " +
    "(specialty coffee shops, boutique fitness studios, craft breweries, " +
    "upscale grocers, co-working spaces) within a zip code. Returns name, " +
    "type, coordinates, and operational status for each result.",
  parameters: z.object({
    zipCode: z.string().describe("5-digit zip code to search within"),
    indicators: z
      .array(z.string())
      .describe(
        "Keywords to search, e.g. ['specialty coffee','pilates','craft brewery']"
      ),
    maxResultsPerIndicator: z
      .number()
      .nullable()
      .describe("Cap results per keyword (default 10)"),
  }),
  execute: async ({
    zipCode,
    indicators,
    maxResultsPerIndicator,
  }: {
    zipCode: string;
    indicators: string[];
    maxResultsPerIndicator: number | null;
  }): Promise<string> => {
    if (!GOOGLE_MAPS_API_KEY) {
      return JSON.stringify({ error: "GOOGLE_MAPS_API_KEY is not set" });
    }

    const cap = maxResultsPerIndicator ?? 10;
    const allFindings: Array<{
      name: string;
      type: string;
      lat: number;
      lng: number;
      address: string;
      rating: number | null;
    }> = [];

    for (const keyword of indicators) {
      try {
        const body = {
          textQuery: `${keyword} in ${zipCode}`,
          maxResultCount: cap,
        };

        const res = await fetch(PLACES_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask":
              "places.displayName,places.formattedAddress,places.location,places.rating",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
          allFindings.push({
            name: `[ERROR] ${keyword}`,
            type: keyword,
            lat: 0,
            lng: 0,
            address: `Google Places returned ${res.status}`,
            rating: null,
          });
          continue;
        }

        const data = (await res.json()) as {
          places?: Array<{
            displayName?: { text?: string };
            formattedAddress?: string;
            location?: { latitude?: number; longitude?: number };
            rating?: number;
          }>;
        };

        for (const place of data.places ?? []) {
          allFindings.push({
            name: place.displayName?.text ?? "Unknown",
            type: keyword,
            lat: place.location?.latitude ?? 0,
            lng: place.location?.longitude ?? 0,
            address: place.formattedAddress ?? "",
            rating: place.rating ?? null,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        allFindings.push({
          name: `[ERROR] ${keyword}`,
          type: keyword,
          lat: 0,
          lng: 0,
          address: msg,
          rating: null,
        });
      }
    }

    return JSON.stringify({
      success: true,
      zipCode,
      totalFindings: allFindings.length,
      findings: allFindings,
    });
  },
});
