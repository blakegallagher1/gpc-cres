"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getMartinParcelTileUrl,
  getStreetTileUrls,
  getSatelliteTileUrl,
} from "./tileUrls";
import { getZoningFillColor as getZoningColor } from "./config/zoningColors";

interface SplitMapCompareProps {
  open: boolean;
  onClose: () => void;
  center?: [number, number]; // [lng, lat]
  zoom?: number;
  /** Label for left pane */
  leftLabel?: string;
  /** Label for right pane */
  rightLabel?: string;
  /** Left map layers: which overlays to show */
  leftLayers?: ("parcels" | "zoning" | "flood")[];
  /** Right map layers: which overlays to show */
  rightLayers?: ("parcels" | "zoning" | "flood")[];
}

const DEFAULT_CENTER: [number, number] = [-91.1871, 30.4515]; // Baton Rouge
const DEFAULT_ZOOM = 13;

function buildStyle(baseTiles: string[]) {
  return {
    version: 8 as const,
    sources: {
      base: {
        type: "raster" as const,
        tiles: baseTiles,
        tileSize: 256,
      },
    },
    layers: [
      {
        id: "base-layer",
        type: "raster" as const,
        source: "base",
      },
    ],
  };
}

function addOverlayLayers(
  map: maplibregl.Map,
  layers: ("parcels" | "zoning" | "flood")[],
) {
  if (layers.includes("parcels")) {
    map.addSource("parcels-src", {
      type: "vector",
      tiles: [getMartinParcelTileUrl("ebr_parcels")],
      minzoom: 10,
      maxzoom: 22,
    });
    map.addLayer({
      id: "parcels-fill",
      type: "fill",
      source: "parcels-src",
      "source-layer": "ebr_parcels",
      paint: {
        "fill-color": "#facc15",
        "fill-opacity": 0.06,
        "fill-outline-color": "#facc15",
      },
    });
    map.addLayer({
      id: "parcels-line",
      type: "line",
      source: "parcels-src",
      "source-layer": "ebr_parcels",
      paint: { "line-color": "#facc15", "line-width": 1, "line-opacity": 0.7 },
    });
  }

  if (layers.includes("zoning")) {
    map.addSource("zoning-src", {
      type: "vector",
      tiles: [getMartinParcelTileUrl("ebr_parcels")],
      minzoom: 10,
      maxzoom: 22,
    });
    map.addLayer({
      id: "zoning-fill",
      type: "fill",
      source: "zoning-src",
      "source-layer": "ebr_parcels",
      paint: {
        "fill-color": [
          "match",
          ["coalesce", ["get", "zoning_type"], ""],
          "M1", "#f97316",
          "M2", "#ea580c",
          "M3", "#c2410c",
          "C1", "#8b5cf6",
          "C2", "#7c3aed",
          "C3", "#6d28d9",
          "C4", "#5b21b6",
          "C5", "#4c1d95",
          "A1", "#22c55e",
          "A2", "#16a34a",
          "A3", "#15803d",
          "A4", "#166534",
          "A5", "#14532d",
          "#6b7280",
        ] as maplibregl.ExpressionSpecification,
        "fill-opacity": 0.45,
      },
    });
  }

  if (layers.includes("flood")) {
    map.addSource("flood-src", {
      type: "vector",
      tiles: [getMartinParcelTileUrl("fema_flood")],
      minzoom: 8,
      maxzoom: 22,
    });
    map.addLayer({
      id: "flood-fill",
      type: "fill",
      source: "flood-src",
      "source-layer": "fema_flood",
      paint: {
        "fill-color": [
          "match",
          ["coalesce", ["get", "flood_zone"], ""],
          "V", "#dc2626",
          "VE", "#dc2626",
          "A", "#2563eb",
          "AE", "#2563eb",
          "AH", "#3b82f6",
          "AO", "#60a5fa",
          "#9ca3af",
        ] as maplibregl.ExpressionSpecification,
        "fill-opacity": 0.35,
      },
    });
  }
}

/**
 * Side-by-side map comparison view for before/after analysis.
 * Both maps are synced in center/zoom/pitch/bearing.
 * Default: left = current parcels, right = zoning overlay.
 */
export function SplitMapCompare({
  open,
  onClose,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  leftLabel = "Current View",
  rightLabel = "Zoning Overlay",
  leftLayers = ["parcels"],
  rightLayers = ["parcels", "zoning"],
}: SplitMapCompareProps) {
  const leftContainerRef = useRef<HTMLDivElement>(null);
  const rightContainerRef = useRef<HTMLDivElement>(null);
  const leftMapRef = useRef<maplibregl.Map | null>(null);
  const rightMapRef = useRef<maplibregl.Map | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (!leftContainerRef.current || !rightContainerRef.current) return;

    const streetTiles = getStreetTileUrls();
    const satTile = getSatelliteTileUrl();

    // Left map: satellite base
    const leftMap = new maplibregl.Map({
      container: leftContainerRef.current,
      style: buildStyle([satTile]),
      center,
      zoom,
      attributionControl: false,
    });

    // Right map: street base
    const rightMap = new maplibregl.Map({
      container: rightContainerRef.current,
      style: buildStyle(streetTiles),
      center,
      zoom,
      attributionControl: false,
    });

    leftMapRef.current = leftMap;
    rightMapRef.current = rightMap;

    // Add overlay layers once maps load
    leftMap.on("load", () => addOverlayLayers(leftMap, leftLayers));
    rightMap.on("load", () => addOverlayLayers(rightMap, rightLayers));

    // Sync viewports bidirectionally
    function syncFrom(source: maplibregl.Map, target: maplibregl.Map) {
      const handler = () => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        target.jumpTo({
          center: source.getCenter(),
          zoom: source.getZoom(),
          bearing: source.getBearing(),
          pitch: source.getPitch(),
        });
        syncingRef.current = false;
      };
      source.on("move", handler);
      return () => source.off("move", handler);
    }

    const unsyncLeft = syncFrom(leftMap, rightMap);
    const unsyncRight = syncFrom(rightMap, leftMap);

    // Add nav controls
    leftMap.addControl(new maplibregl.NavigationControl(), "bottom-left");
    rightMap.addControl(new maplibregl.NavigationControl(), "bottom-right");

    return () => {
      unsyncLeft();
      unsyncRight();
      leftMap.remove();
      rightMap.remove();
      leftMapRef.current = null;
      rightMapRef.current = null;
    };
  }, [open, center, zoom, leftLayers, rightLayers]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4">
        <span className="text-xs font-medium text-neutral-300">
          Split Map Comparison
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-7 w-7 p-0 text-neutral-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Maps */}
      <div className="flex flex-1">
        {/* Left pane */}
        <div className="relative flex-1 border-r border-neutral-800">
          <div ref={leftContainerRef} className="h-full w-full" />
          <div className="absolute left-3 top-3 rounded-lg bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
            {leftLabel}
          </div>
        </div>

        {/* Divider line */}
        <div className="w-px bg-neutral-600" />

        {/* Right pane */}
        <div className="relative flex-1">
          <div ref={rightContainerRef} className="h-full w-full" />
          <div className="absolute right-3 top-3 rounded-lg bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
            {rightLabel}
          </div>
        </div>
      </div>
    </div>
  );
}
