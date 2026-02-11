"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMap, Polygon, Popup } from "react-leaflet";
import L from "leaflet";
import { Clock, X, Loader2 } from "lucide-react";
import type { MapParcel } from "./ParcelMap";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IsochroneResult {
  polygon: [number, number][];
  center: [number, number];
  minutes: number;
  parcelCount: number;
}

// ---------------------------------------------------------------------------
// IsochroneControl Component
// ---------------------------------------------------------------------------

interface IsochroneControlProps {
  parcels: MapParcel[];
  visible: boolean;
}

const DRIVE_TIMES = [5, 10, 15, 30] as const;

export function IsochroneControl({ parcels, visible }: IsochroneControlProps) {
  const map = useMap();
  const [active, setActive] = useState(false);
  const [selectedMinutes, setSelectedMinutes] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IsochroneResult | null>(null);
  const [clickMode, setClickMode] = useState(false);
  const markerRef = useRef<L.CircleMarker | null>(null);

  const clearResult = useCallback(() => {
    setResult(null);
    markerRef.current?.remove();
    markerRef.current = null;
  }, []);

  const fetchIsochrone = useCallback(
    async (lat: number, lng: number, minutes: number) => {
      setLoading(true);
      clearResult();

      try {
        const res = await fetch("/api/map/isochrone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng, minutes }),
        });
        if (!res.ok) return;
        const data = await res.json();

        if (data.polygon) {
          // Count parcels within the isochrone polygon
          const isoPolygon = L.polygon(
            data.polygon.map(([pLat, pLng]: [number, number]) => L.latLng(pLat, pLng))
          );
          const bounds = isoPolygon.getBounds();
          const count = parcels.filter((p) => bounds.contains(L.latLng(p.lat, p.lng))).length;

          const isoResult: IsochroneResult = {
            polygon: data.polygon,
            center: [lat, lng],
            minutes,
            parcelCount: count,
          };
          setResult(isoResult);

          // Fit map to isochrone bounds
          map.fitBounds(bounds, { padding: [40, 40] });
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    },
    [map, parcels, clearResult]
  );

  const handleMapClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      if (!clickMode) return;

      // Place marker
      markerRef.current?.remove();
      markerRef.current = L.circleMarker(e.latlng, {
        radius: 7,
        color: "#7c3aed",
        fillColor: "#7c3aed",
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);

      fetchIsochrone(e.latlng.lat, e.latlng.lng, selectedMinutes);
      setClickMode(false);
      map.getContainer().style.cursor = "";
    },
    [map, clickMode, selectedMinutes, fetchIsochrone]
  );

  // Bind click handler
  useEffect(() => {
    if (clickMode) {
      map.getContainer().style.cursor = "crosshair";
      map.on("click", handleMapClick);
    }
    return () => {
      map.off("click", handleMapClick);
      if (!clickMode) {
        map.getContainer().style.cursor = "";
      }
    };
  }, [map, clickMode, handleMapClick]);

  // Cleanup on unmount or hide
  useEffect(() => {
    if (!visible) {
      clearResult();
      setActive(false);
      setClickMode(false);
      map.getContainer().style.cursor = "";
    }
  }, [visible, clearResult, map]);

  if (!visible) return null;

  return (
    <>
      {/* Control panel */}
      <div className="leaflet-bottom leaflet-right" style={{ marginBottom: 10, marginRight: 10 }}>
        <div className="leaflet-control rounded-lg bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm" style={{ minWidth: 200 }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase">
              <Clock className="h-3 w-3" />
              Drive Time
            </div>
            {(result || clickMode) && (
              <button
                onClick={() => {
                  clearResult();
                  setClickMode(false);
                  map.getContainer().style.cursor = "";
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Time selector */}
          <div className="mt-1.5 flex gap-1">
            {DRIVE_TIMES.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedMinutes(t)}
                className={`flex-1 rounded px-1.5 py-1 text-xs font-medium ${
                  selectedMinutes === t
                    ? "bg-purple-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t}m
              </button>
            ))}
          </div>

          {/* Click to place */}
          <button
            onClick={() => {
              setClickMode(true);
              setActive(true);
            }}
            disabled={loading}
            className="mt-1.5 w-full rounded bg-purple-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-purple-600 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Computing...
              </span>
            ) : clickMode ? (
              "Click map to set center"
            ) : (
              "Click map to analyze"
            )}
          </button>

          {/* Result summary */}
          {result && (
            <div className="mt-1.5 rounded bg-purple-50 px-2 py-1.5 text-xs">
              <div className="font-semibold text-purple-800">
                {result.minutes}-min drive area
              </div>
              <div className="text-purple-600">
                {result.parcelCount} parcel{result.parcelCount !== 1 ? "s" : ""} in range
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Isochrone polygon */}
      {result && (
        <Polygon
          positions={result.polygon}
          pathOptions={{
            color: "#7c3aed",
            weight: 2,
            opacity: 0.7,
            fillColor: "#7c3aed",
            fillOpacity: 0.12,
          }}
        >
          <Popup>
            <div style={{ fontSize: "13px" }}>
              <div style={{ fontWeight: 600 }}>
                {result.minutes}-minute drive time
              </div>
              <div style={{ fontSize: "11px", color: "#6b7280" }}>
                {result.parcelCount} parcels within this area
              </div>
            </div>
          </Popup>
        </Polygon>
      )}
    </>
  );
}
