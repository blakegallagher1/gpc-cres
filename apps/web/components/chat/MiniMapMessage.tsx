"use client";

import { memo, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { MapFeature } from "@/lib/chat/mapActionTypes";

type MapLibreModule = typeof import("maplibre-gl");

interface MiniMapMessageProps {
  features: MapFeature[];
  height?: number;
  className?: string;
  onParcelClick?: (parcelId: string) => void;
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

export const MiniMapMessage = memo(function MiniMapMessage({
  features,
  height = 180,
  className,
  onParcelClick,
}: MiniMapMessageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);

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
          .map((feature) => ({
            type: "Feature" as const,
            geometry: feature.geometry!,
            properties: {
              parcelId: feature.parcelId,
              label: feature.label ?? feature.address ?? feature.parcelId,
            },
          }));

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
              "fill-color": "#f97316",
              "fill-opacity": 0.24,
            },
          });
          map.addLayer({
            id: "message-parcels-line",
            type: "line",
            source: "message-parcels",
            paint: {
              "line-color": "#fb923c",
              "line-width": 2,
            },
          });
        }

        for (const feature of features) {
          if (!feature.geometry && feature.center) {
            new maplibre.Marker({ color: "#f97316" })
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
  }, [features]);

  if (features.length === 0) return null;

  return (
    <Card className={`mt-3 overflow-hidden border-border/70 bg-background/80 ${className ?? ""}`}>
      <CardHeader className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Map Preview
          </span>
          <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
            {features.length} parcel{features.length === 1 ? "" : "s"}
          </Badge>
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
        {features.slice(0, 3).map((feature) => (
          <Button
            key={feature.parcelId}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onParcelClick?.(feature.parcelId)}
            className="h-7 rounded-full px-2.5 text-[11px]"
          >
            {feature.label ?? feature.address ?? feature.parcelId}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
});
