"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { Ruler, Trash2, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MeasureMode = "off" | "distance" | "area";

interface MeasurePoint {
  latlng: L.LatLng;
  marker: L.CircleMarker;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDistance(meters: number): string {
  const feet = meters * 3.28084;
  if (feet < 5280) return `${Math.round(feet).toLocaleString()} ft`;
  const miles = feet / 5280;
  return `${miles.toFixed(2)} mi`;
}

function formatArea(sqMeters: number): string {
  const sqFeet = sqMeters * 10.7639;
  if (sqFeet < 43560) return `${Math.round(sqFeet).toLocaleString()} sq ft`;
  const acres = sqFeet / 43560;
  return `${acres.toFixed(2)} acres`;
}

function computePolygonArea(points: L.LatLng[]): number {
  if (points.length < 3) return 0;
  // Shoelace formula on projected coordinates
  const polygon = L.polygon(points);
  // Use Leaflet's geodesicArea via L.GeometryUtil if available,
  // otherwise approximate using the polygon's projected area
  const latlngs = polygon.getLatLngs()[0] as L.LatLng[];
  let area = 0;
  for (let i = 0; i < latlngs.length; i++) {
    const j = (i + 1) % latlngs.length;
    // Use the Earth's radius for a rough geodesic calculation
    const p1 = L.CRS.EPSG3857.project(latlngs[i]);
    const p2 = L.CRS.EPSG3857.project(latlngs[j]);
    area += p1.x * p2.y - p2.x * p1.y;
  }
  // Convert from projected square units to square meters (approximate at this latitude)
  const centerLat = latlngs.reduce((s, p) => s + p.lat, 0) / latlngs.length;
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  // At EPSG:3857, 1 unit ≈ 1 meter at equator, scale by cos(lat) for y
  const rawArea = Math.abs(area) / 2;
  // EPSG:3857 area needs correction: divide by cos(lat) for the y-axis stretch
  return rawArea * cosLat * cosLat;
}

// ---------------------------------------------------------------------------
// Measure Tool Component
// ---------------------------------------------------------------------------

export function MeasureTool() {
  const map = useMap();
  const [mode, setMode] = useState<MeasureMode>("off");
  const [totalDistance, setTotalDistance] = useState(0);
  const [totalArea, setTotalArea] = useState(0);
  const pointsRef = useRef<MeasurePoint[]>([]);
  const lineRef = useRef<L.Polyline | null>(null);
  const polygonRef = useRef<L.Polygon | null>(null);
  const labelsRef = useRef<L.Tooltip[]>([]);
  const summaryRef = useRef<L.Tooltip | null>(null);

  const clearMeasurements = useCallback(() => {
    for (const pt of pointsRef.current) {
      pt.marker.remove();
    }
    pointsRef.current = [];
    lineRef.current?.remove();
    lineRef.current = null;
    polygonRef.current?.remove();
    polygonRef.current = null;
    for (const label of labelsRef.current) {
      label.remove();
    }
    labelsRef.current = [];
    summaryRef.current?.remove();
    summaryRef.current = null;
    setTotalDistance(0);
    setTotalArea(0);
  }, []);

  const updateLine = useCallback(() => {
    const latlngs = pointsRef.current.map((p) => p.latlng);
    if (latlngs.length < 2) return;

    if (mode === "distance") {
      if (lineRef.current) {
        lineRef.current.setLatLngs(latlngs);
      } else {
        lineRef.current = L.polyline(latlngs, {
          color: "#3b82f6",
          weight: 3,
          dashArray: "8 4",
        }).addTo(map);
      }

      // Calculate total distance
      let total = 0;
      for (let i = 1; i < latlngs.length; i++) {
        total += latlngs[i - 1].distanceTo(latlngs[i]);
      }
      setTotalDistance(total);

      // Add segment labels
      for (const l of labelsRef.current) l.remove();
      labelsRef.current = [];
      for (let i = 1; i < latlngs.length; i++) {
        const seg = latlngs[i - 1].distanceTo(latlngs[i]);
        const mid = L.latLng(
          (latlngs[i - 1].lat + latlngs[i].lat) / 2,
          (latlngs[i - 1].lng + latlngs[i].lng) / 2
        );
        const tooltip = L.tooltip({
          permanent: true,
          direction: "center",
          className: "measure-label",
        })
          .setLatLng(mid)
          .setContent(formatDistance(seg))
          .addTo(map);
        labelsRef.current.push(tooltip);
      }
    } else if (mode === "area") {
      if (polygonRef.current) {
        polygonRef.current.setLatLngs(latlngs);
      } else if (latlngs.length >= 3) {
        polygonRef.current = L.polygon(latlngs, {
          color: "#3b82f6",
          weight: 2,
          fillColor: "#3b82f6",
          fillOpacity: 0.15,
          dashArray: "6 3",
        }).addTo(map);
      }

      if (latlngs.length >= 3) {
        const area = computePolygonArea(latlngs);
        setTotalArea(area);

        // Place area label at centroid
        summaryRef.current?.remove();
        const centroid = (polygonRef.current as L.Polygon)?.getBounds().getCenter();
        if (centroid) {
          summaryRef.current = L.tooltip({
            permanent: true,
            direction: "center",
            className: "measure-label measure-area-label",
          })
            .setLatLng(centroid)
            .setContent(formatArea(area))
            .addTo(map);
        }
      }
    }
  }, [map, mode]);

  const handleMapClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      const marker = L.circleMarker(e.latlng, {
        radius: 5,
        color: "#3b82f6",
        fillColor: "#ffffff",
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);

      pointsRef.current.push({ latlng: e.latlng, marker });
      updateLine();
    },
    [map, updateLine]
  );

  // Bind/unbind click handler based on mode
  useEffect(() => {
    if (mode === "off") {
      map.off("click", handleMapClick);
      clearMeasurements();
      map.getContainer().style.cursor = "";
      return;
    }

    map.getContainer().style.cursor = "crosshair";
    map.on("click", handleMapClick);

    return () => {
      map.off("click", handleMapClick);
      map.getContainer().style.cursor = "";
    };
  }, [map, mode, handleMapClick, clearMeasurements]);

  const toggleMode = (newMode: MeasureMode) => {
    if (mode === newMode) {
      setMode("off");
    } else {
      clearMeasurements();
      setMode(newMode);
    }
  };

  return (
    <>
      {/* Inject CSS for measure labels */}
      <style>{`
        .measure-label {
          background: rgba(59, 130, 246, 0.9) !important;
          border: none !important;
          border-radius: 4px !important;
          color: white !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          padding: 2px 6px !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3) !important;
          white-space: nowrap !important;
        }
        .measure-label::before {
          display: none !important;
        }
        .measure-area-label {
          background: rgba(59, 130, 246, 0.95) !important;
          font-size: 13px !important;
          padding: 4px 8px !important;
        }
      `}</style>

      {/* Toolbar */}
      <div className="leaflet-top leaflet-left" style={{ marginTop: 80 }}>
        <div className="leaflet-control leaflet-bar flex flex-col">
          <button
            title="Measure distance"
            onClick={() => toggleMode("distance")}
            className={`flex h-8 w-8 items-center justify-center ${
              mode === "distance" ? "bg-blue-500 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
            style={{ borderBottom: "1px solid #ccc" }}
          >
            <Ruler className="h-4 w-4" />
          </button>
          <button
            title="Measure area"
            onClick={() => toggleMode("area")}
            className={`flex h-8 w-8 items-center justify-center text-xs font-bold ${
              mode === "area" ? "bg-blue-500 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
              <path d="M2 2h12v12H2V2zm1 1v10h10V3H3z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Results panel */}
      {mode !== "off" && (
        <div className="leaflet-bottom leaflet-left" style={{ marginBottom: 10, marginLeft: 10 }}>
          <div className="leaflet-control rounded-lg bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm" style={{ minWidth: 180 }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-600 uppercase">
                {mode === "distance" ? "Distance" : "Area"}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={clearMeasurements}
                  className="rounded p-0.5 text-gray-400 hover:text-gray-600"
                  title="Clear"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setMode("off")}
                  className="rounded p-0.5 text-gray-400 hover:text-gray-600"
                  title="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-1 text-lg font-bold text-gray-900">
              {mode === "distance"
                ? totalDistance > 0
                  ? formatDistance(totalDistance)
                  : "Click to start"
                : totalArea > 0
                  ? formatArea(totalArea)
                  : pointsRef.current.length < 3
                    ? `${pointsRef.current.length}/3 points`
                    : "Click to add points"}
            </div>
            <p className="mt-0.5 text-[10px] text-gray-400">
              {mode === "distance" ? "Click map to add waypoints" : "Click map to define area"}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
