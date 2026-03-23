import type { MapActionEvent, MapActionPayload } from "@/lib/chat/mapActionTypes";
import { parseToolResultMapAction, parseToolResultMapFeatures } from "@/lib/chat/toolResultWrapper";

/**
 * Derives all map_action events encoded in a tool result.
 */
export function buildMapActionEventsFromToolResult(
  toolName: string,
  result: unknown,
  toolCallId: string | null | undefined,
): MapActionEvent[] {
  const events: MapActionEvent[] = [];
  const features = parseToolResultMapFeatures(result) ?? [];

  const parcelIds = features
    .map((feature) => feature.parcelId)
    .filter((parcelId): parcelId is string => Boolean(parcelId));

  if (parcelIds.length > 0) {
    events.push({
      type: "map_action",
      payload: {
        action: "highlight",
        parcelIds,
        style: "pulse",
        durationMs: 0,
      } satisfies MapActionPayload,
      toolCallId: toolCallId ?? null,
    });
  }

  const firstWithCenter = features.find(
    (feature) =>
      feature.center &&
      typeof feature.center.lat === "number" &&
      typeof feature.center.lng === "number",
  );
  if (firstWithCenter?.center) {
    events.push({
      type: "map_action",
      payload: {
        action: "flyTo",
        center: [firstWithCenter.center.lng, firstWithCenter.center.lat],
        zoom: features.length === 1 ? 17 : 14,
        parcelId: firstWithCenter.parcelId,
      } satisfies MapActionPayload,
      toolCallId: toolCallId ?? null,
    });
  }

  const geoFeatures = features
    .filter((feature) => feature.geometry)
    .map((feature) => ({
      type: "Feature" as const,
      properties: {
        parcelId: feature.parcelId,
        address: feature.address,
        zoning: feature.zoningType,
        label: feature.label,
      },
      geometry: feature.geometry!,
    }));
  if (geoFeatures.length > 0) {
    events.push({
      type: "map_action",
      payload: {
        action: "addLayer",
        layerId: `tool-result-${toolCallId ?? Date.now()}`,
        geojson: {
          type: "FeatureCollection",
          features: geoFeatures,
        },
        label: `${toolName} results (${geoFeatures.length})`,
      } satisfies MapActionPayload,
      toolCallId: toolCallId ?? null,
    });
  }

  const explicitAction = parseToolResultMapAction(result);
  if (explicitAction) {
    events.push({
      type: "map_action",
      payload: explicitAction,
      toolCallId: toolCallId ?? null,
    });
  }

  return events;
}
