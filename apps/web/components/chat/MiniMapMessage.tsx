"use client";

import { memo, useEffect, useRef } from "react";
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
    <div
      className={`mt-3 overflow-hidden rounded-xl border border-[#2a2f3e] bg-[#11141d] ${className ?? ""}`}
    >
      <div className="flex items-center justify-between border-b border-[#2a2f3e] px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
          Map Preview
        </span>
        <span className="text-[11px] text-slate-400">
          {features.length} parcel{features.length === 1 ? "" : "s"}
        </span>
      </div>
      <div
        ref={containerRef}
        data-testid="message-mini-map"
        style={{ height, width: "100%" }}
      />
      <div className="flex flex-wrap gap-2 border-t border-[#2a2f3e] px-3 py-2">
        {features.slice(0, 3).map((feature) => (
          <button
            key={feature.parcelId}
            type="button"
            onClick={() => onParcelClick?.(feature.parcelId)}
            className="rounded-full border border-[#334155] bg-[#18202c] px-2.5 py-1 text-[11px] text-slate-300 transition-colors hover:border-[#fb923c] hover:text-white"
          >
            {feature.label ?? feature.address ?? feature.parcelId}
          </button>
        ))}
      </div>
    </div>
  );
});
