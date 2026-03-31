"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { MapFeature } from "@/lib/chat/mapActionTypes";
import { Map as MapIcon, Check } from "lucide-react";

type MapLibreModule = typeof import("maplibre-gl");

interface MiniMapMessageProps {
  features: MapFeature[];
  height?: number;
  className?: string;
  /** Called when a parcel button is clicked, with parcel location info */
  onParcelClick?: (info: { parcelId: string; lat: number; lng: number }) => void;
  /** Called when "View on Map" is clicked, with all parcels for navigation */
  onViewOnMap?: (parcels: Array<{ parcelId: string; lat: number; lng: number }>) => void;
  /** Set of parcel IDs currently selected on the main map, for sync display */
  selectedParcelIds?: Set<string>;
}

function deriveBounds(
  maplibre: MapLibreModule,
  features: MapFeature[],
): InstanceType<MapLibreModule["LngLatBounds"]> | null {
  const bounds = new maplibre.LngLatBounds();
  let hasCoordinates = false;

  const collect = (value: unknown): void => {
    if (!Array.isArray(value)) return;

    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      bounds.extend([value[0], value[1]]);
      hasCoordinates = true;
      return;
    }

    for (const item of value) {
      collect(item);
    }
  };

  for (const feature of features) {
    if (feature.center) {
      bounds.extend([feature.center.lng, feature.center.lat]);
      hasCoordinates = true;
    }

    if (feature.geometry) {
      collect((feature.geometry as { coordinates?: unknown }).coordinates);
    }
  }

  return hasCoordinates ? bounds : null;
}

/** Truncate address to maxLen characters with ellipsis */
function truncateAddress(text: string, maxLen = 28): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).trimEnd() + "\u2026";
}

/** Check if all mini-map parcel IDs match the main map selection */
function computeSyncState(
  features: MapFeature[],
  selectedParcelIds: Set<string> | undefined,
): boolean {
  if (!selectedParcelIds || selectedParcelIds.size === 0) return false;
  if (features.length === 0) return false;
  const featureIds = new Set(features.map((f) => f.parcelId));
  if (featureIds.size !== selectedParcelIds.size) return false;
  for (const id of featureIds) {
    if (!selectedParcelIds.has(id)) return false;
  }
  return true;
}

export const MiniMapMessage = memo(function MiniMapMessage({
  features,
  height = 180,
  className,
  onParcelClick,
  onViewOnMap,
  selectedParcelIds,
}: MiniMapMessageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const [activeParcelId, setActiveParcelId] = useState<string | null>(null);

  const isSynced = computeSyncState(features, selectedParcelIds);

  useEffect(() => {
    if (!containerRef.current || features.length === 0) return;

    let cancelled = false;

    const renderMap = async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      const bounds = deriveBounds(maplibre, features);
      if (!bounds) return;

      const map = new maplibre.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "&copy; OpenStreetMap",
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        attributionControl: false,
        interactive: false,
      });

      map.on("load", () => {
        if (cancelled) return;

        map.fitBounds(bounds, {
          padding: 26,
          maxZoom: 17,
          duration: 0,
        });

        const polygonFeatures = features
          .filter((feature) => feature.geometry)
          .map((feature) => {
            const isSelected = selectedParcelIds?.has(feature.parcelId) ?? false;
            return {
              type: "Feature" as const,
              geometry: feature.geometry!,
              properties: {
                parcelId: feature.parcelId,
                label: feature.label ?? feature.address ?? feature.parcelId,
                selected: isSelected ? 1 : 0,
              },
            };
          });

        if (polygonFeatures.length > 0) {
          map.addSource("message-parcels", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: polygonFeatures,
            },
          });
          map.addLayer({
            id: "message-parcels-fill",
            type: "fill",
            source: "message-parcels",
            paint: {
              "fill-color": [
                "case",
                ["==", ["get", "selected"], 1],
                "#3b82f6", // blue for selected
                "#f97316", // orange default
              ],
              "fill-opacity": 0.24,
            },
          });
          map.addLayer({
            id: "message-parcels-line",
            type: "line",
            source: "message-parcels",
            paint: {
              "line-color": [
                "case",
                ["==", ["get", "selected"], 1],
                "#60a5fa", // blue outline for selected
                "#fb923c", // orange default
              ],
              "line-width": 2,
            },
          });
        }

        for (const feature of features) {
          if (!feature.geometry && feature.center) {
            const isSelected = selectedParcelIds?.has(feature.parcelId) ?? false;
            new maplibre.Marker({ color: isSelected ? "#3b82f6" : "#f97316" })
              .setLngLat([feature.center.lng, feature.center.lat])
              .addTo(map);
          }
        }
      });

      mapRef.current = map;
    };

    void renderMap();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [features, selectedParcelIds]);

  if (features.length === 0) return null;

  const parcelsWithCenter = features
    .filter((f) => f.center)
    .map((f) => ({
      parcelId: f.parcelId,
      lat: f.center!.lat,
      lng: f.center!.lng,
    }));

  return (
    <Card className={`mt-3 overflow-hidden border-border/70 bg-background/80 ${className ?? ""}`}>
      <CardHeader className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Map Preview
            </span>
            {isSynced && (
              <Badge
                variant="outline"
                className="inline-flex items-center gap-1 rounded-full border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[9px] text-emerald-400"
              >
                <Check className="h-2.5 w-2.5" />
                Synced
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
              {features.length} parcel{features.length === 1 ? "" : "s"}
            </Badge>
            {onViewOnMap && parcelsWithCenter.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onViewOnMap(parcelsWithCenter)}
                className="h-6 gap-1 rounded-full px-2 text-[10px]"
              >
                <MapIcon className="h-3 w-3" />
                View on Map
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <Separator />
      <div
        ref={containerRef}
        data-testid="message-mini-map"
        style={{ height, width: "100%" }}
      />
      <Separator />
      <CardContent className="flex flex-wrap gap-2 px-3 py-2.5">
        {features.slice(0, 3).map((feature) => {
          const isActive = activeParcelId === feature.parcelId;
          const isSelected = selectedParcelIds?.has(feature.parcelId) ?? false;
          const displayLabel = truncateAddress(
            feature.label ?? feature.address ?? feature.parcelId,
          );
          const center = feature.center;

          return (
            <Button
              key={feature.parcelId}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveParcelId(feature.parcelId);
                if (center) {
                  onParcelClick?.({
                    parcelId: feature.parcelId,
                    lat: center.lat,
                    lng: center.lng,
                  });
                }
              }}
              className={`h-auto min-h-[1.75rem] flex-col items-start gap-0 rounded-full px-2.5 py-1 text-left transition-all ${
                isActive
                  ? "border-orange-400 bg-orange-500/10 text-orange-300 ring-1 ring-orange-400/50"
                  : isSelected
                    ? "border-blue-400/60 bg-blue-500/10 text-blue-300"
                    : ""
              }`}
            >
              <span className="truncate text-[11px] leading-tight">{displayLabel}</span>
              <span className="truncate text-[9px] leading-tight text-muted-foreground">
                {feature.parcelId}
              </span>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
});
