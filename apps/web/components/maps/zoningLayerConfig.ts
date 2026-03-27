import type { FillLayerSpecification, VectorSourceSpecification } from "maplibre-gl";

import { ZONING_DISTRICT_COLORS } from "./mapStyles";
import {
  getMartinMetadataUrl,
  getMartinVectorTileUrl,
  getZoningProxyTileUrl,
} from "./tileUrls";

export const ZONING_TILE_SOURCE_KEY = "zoning-tiles";
export const ZONING_TILE_LAYER_ID = "zoning-tiles-fill";
export const ZONING_TILE_INSERT_BEFORE_LAYER_ID = "parcels-flood-layer";

const DIRECT_ZONING_TILE_SOURCE_ID = "get_zoning_mvt";
const DIRECT_ZONING_TILE_SOURCE_LAYER = "zoning";
const DEFAULT_ZONING_TILE_PROPERTY_NAME = "zoning_type";
const PROXY_ZONING_TILE_SOURCE_ID = "get_parcel_mvt_proxy";
const PROXY_ZONING_TILE_SOURCE_LAYER = "parcels";

const LEGACY_ZONING_TILE_SOURCE_ID = "ebr_parcels";
const LEGACY_ZONING_TILE_SOURCE_LAYER = "ebr_parcels";

type TileJsonVectorLayer = {
  id?: string;
  fields?: Record<string, string>;
};

type TileJsonResponse = {
  vector_layers?: TileJsonVectorLayer[];
};

type ZoningFillPaint = NonNullable<FillLayerSpecification["paint"]>;

/**
 * Runtime zoning tile source contract for Martin-backed zoning overlays.
 */
export interface ZoningTileContract {
  sourceId: string;
  sourceLayer: string;
  propertyName: string;
  metadataUrl: string | null;
  tileUrl: string;
}

/**
 * Reads a non-empty zoning tile environment override if present.
 */
function readEnvOverride(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

/**
 * Builds the preferred zoning tile contract from client env overrides.
 */
export function getPreferredZoningTileContract(): ZoningTileContract {
  const sourceId = readEnvOverride("NEXT_PUBLIC_ZONING_TILE_SOURCE_ID");
  const sourceLayer = readEnvOverride("NEXT_PUBLIC_ZONING_TILE_SOURCE_LAYER");
  const propertyName =
    readEnvOverride("NEXT_PUBLIC_ZONING_TILE_PROPERTY_NAME") ??
    DEFAULT_ZONING_TILE_PROPERTY_NAME;

  if (sourceId || sourceLayer) {
    const resolvedSourceId = sourceId ?? DIRECT_ZONING_TILE_SOURCE_ID;
    const resolvedSourceLayer = sourceLayer ?? DIRECT_ZONING_TILE_SOURCE_LAYER;

    return {
      sourceId: resolvedSourceId,
      sourceLayer: resolvedSourceLayer,
      propertyName,
      metadataUrl: getMartinMetadataUrl(resolvedSourceId),
      tileUrl: getMartinVectorTileUrl(resolvedSourceId),
    };
  }

  return {
    sourceId: PROXY_ZONING_TILE_SOURCE_ID,
    sourceLayer: PROXY_ZONING_TILE_SOURCE_LAYER,
    propertyName,
    metadataUrl: null,
    tileUrl: getZoningProxyTileUrl(),
  };
}

/**
 * Returns the legacy parcel-table zoning contract when no dedicated source is
 * available yet.
 */
export function getLegacyZoningTileContract(): ZoningTileContract {
  return {
    sourceId: LEGACY_ZONING_TILE_SOURCE_ID,
    sourceLayer: LEGACY_ZONING_TILE_SOURCE_LAYER,
    propertyName: DEFAULT_ZONING_TILE_PROPERTY_NAME,
    metadataUrl: getMartinMetadataUrl(LEGACY_ZONING_TILE_SOURCE_ID),
    tileUrl: getMartinVectorTileUrl(LEGACY_ZONING_TILE_SOURCE_ID),
  };
}

/**
 * Returns true when TileJSON metadata confirms the requested property exists on
 * the configured source layer.
 */
export function tileJsonHasProperty(
  tileJson: TileJsonResponse,
  sourceLayer: string,
  propertyName: string,
): boolean {
  const vectorLayers = Array.isArray(tileJson.vector_layers) ? tileJson.vector_layers : [];
  if (vectorLayers.length === 0) {
    return true;
  }

  const matchingLayer = vectorLayers.find((layer) => layer.id === sourceLayer);
  if (!matchingLayer) {
    return false;
  }

  return Object.prototype.hasOwnProperty.call(matchingLayer.fields ?? {}, propertyName);
}

/**
 * Probes Martin metadata to determine whether a zoning tile contract is safe to
 * use from the browser.
 */
export async function probeZoningTileContract(
  contract: ZoningTileContract,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!contract.metadataUrl) {
    return true;
  }

  const response = await fetchImpl(contract.metadataUrl);
  if (!response.ok) {
    return false;
  }

  let tileJson: TileJsonResponse;
  try {
    tileJson = (await response.json()) as TileJsonResponse;
  } catch {
    return false;
  }

  return tileJsonHasProperty(tileJson, contract.sourceLayer, contract.propertyName);
}

/**
 * Resolves the first browser-safe zoning tile contract. It prefers the
 * authenticated app-level zoning proxy and falls back to browser-direct Martin
 * metadata only when explicit overrides are configured.
 */
export async function resolveAvailableZoningTileContract(
  fetchImpl: typeof fetch = fetch,
): Promise<ZoningTileContract | null> {
  const preferredContract = getPreferredZoningTileContract();
  if (await probeZoningTileContract(preferredContract, fetchImpl)) {
    return preferredContract;
  }

  const legacyContract = getLegacyZoningTileContract();
  if (await probeZoningTileContract(legacyContract, fetchImpl)) {
    return legacyContract;
  }

  return null;
}

/**
 * Builds the vector source specification for a resolved zoning tile contract.
 */
export function buildZoningTileSource(
  contract: ZoningTileContract,
): VectorSourceSpecification {
  return {
    type: "vector",
    tiles: [contract.tileUrl],
    minzoom: 10,
    maxzoom: 22,
  };
}

/**
 * Builds the color expression used by vector zoning fills.
 */
export function buildZoningTileColorExpression(
  propertyName: string,
): ZoningFillPaint["fill-color"] {
  return [
    "match",
    ["get", propertyName],
    ...Object.entries(ZONING_DISTRICT_COLORS).flatMap(([district, color]) => [district, color]),
    [
      "case",
      [
        "any",
        ["==", ["slice", ["get", propertyName], 0, 2], "M1"],
        ["==", ["slice", ["get", propertyName], 0, 2], "M2"],
      ],
      "#9333ea",
      ["==", ["slice", ["get", propertyName], 0, 1], "I"],
      "#c026d3",
      [
        "any",
        ["==", ["slice", ["get", propertyName], 0, 2], "C1"],
        ["==", ["slice", ["get", propertyName], 0, 2], "C2"],
        ["==", ["slice", ["get", propertyName], 0, 2], "C5"],
        ["==", ["slice", ["get", propertyName], 0, 2], "CG"],
        ["==", ["slice", ["get", propertyName], 0, 2], "CN"],
        ["==", ["slice", ["get", propertyName], 0, 2], "CW"],
      ],
      "#2563eb",
      ["any", ["==", ["slice", ["get", propertyName], 0, 1], "C"]],
      "#6366f1",
      [
        "any",
        ["==", ["slice", ["get", propertyName], 0, 2], "B1"],
        ["==", ["slice", ["get", propertyName], 0, 2], "BP"],
        ["==", ["slice", ["get", propertyName], 0, 1], "B"],
      ],
      "#4f46e5",
      [
        "any",
        ["==", ["slice", ["get", propertyName], 0, 3], "PUD"],
        ["==", ["slice", ["get", propertyName], 0, 4], "SPUD"],
        ["==", ["slice", ["get", propertyName], 0, 5], "ISPUD"],
      ],
      "#ea580c",
      [
        "any",
        ["==", ["slice", ["get", propertyName], 0, 3], "TND"],
        ["==", ["slice", ["get", propertyName], 0, 2], "UC"],
        ["==", ["slice", ["get", propertyName], 0, 2], "NC"],
      ],
      "#d97706",
      [
        "any",
        ["==", ["slice", ["get", propertyName], 0, 3], "HC1"],
        ["==", ["slice", ["get", propertyName], 0, 3], "HC2"],
      ],
      "#dc2626",
      [
        "any",
        ["==", ["slice", ["get", propertyName], 0, 2], "GA"],
        ["==", ["slice", ["get", propertyName], 0, 2], "GO"],
        ["==", ["slice", ["get", propertyName], 0, 2], "GU"],
      ],
      "#92400e",
      ["any", ["==", ["slice", ["get", propertyName], 0, 2], "LC"]],
      "#0369a1",
      ["==", ["slice", ["get", propertyName], 0, 2], "RS"],
      "#65a30d",
      ["==", ["slice", ["get", propertyName], 0, 2], "RE"],
      "#84cc16",
      ["==", ["slice", ["get", propertyName], 0, 2], "RU"],
      "#4d7c0f",
      ["==", ["slice", ["get", propertyName], 0, 1], "R"],
      "#15803d",
      ["==", ["slice", ["get", propertyName], 0, 1], "A"],
      "#22c55e",
      "#9ca3af",
    ],
  ] as unknown as ZoningFillPaint["fill-color"];
}

/**
 * Builds the MapLibre fill layer used for Martin-backed zoning overlays.
 */
export function buildZoningTileLayer(
  contract: ZoningTileContract,
  visible: boolean,
): FillLayerSpecification {
  return {
    id: ZONING_TILE_LAYER_ID,
    type: "fill",
    source: ZONING_TILE_SOURCE_KEY,
    "source-layer": contract.sourceLayer,
    filter: ["has", contract.propertyName],
    layout: {
      visibility: visible ? "visible" : "none",
    },
    paint: {
      "fill-color": buildZoningTileColorExpression(contract.propertyName),
      "fill-opacity": [
        "interpolate", ["linear"], ["zoom"],
        10, 0.55,
        13, 0.45,
        16, 0.35,
      ],
      "fill-outline-color": buildZoningTileColorExpression(contract.propertyName),
    },
  };
}
