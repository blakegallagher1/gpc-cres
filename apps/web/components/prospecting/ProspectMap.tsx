"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  useMap,
  LayersControl,
  CircleMarker,
  Polygon,
  Popup,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Pencil, Trash2, X } from "lucide-react";
import type { ProspectParcel } from "./ProspectResults";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProspectMapProps {
  parcels: ProspectParcel[];
  polygon: number[][][] | null;
  onPolygonDrawn: (coordinates: number[][][]) => void;
  onClear: () => void;
  selectedIds: Set<string>;
}

// ---------------------------------------------------------------------------
// Draw tool
// ---------------------------------------------------------------------------

function DrawControl({
  onPolygonDrawn,
  onClear,
  hasPolygon,
}: {
  onPolygonDrawn: (coords: number[][][]) => void;
  onClear: () => void;
  hasPolygon: boolean;
}) {
  const map = useMap();
  const [drawing, setDrawing] = useState(false);
  const pointsRef = useRef<L.LatLng[]>([]);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const lineRef = useRef<L.Polyline | null>(null);

  const clearDrawing = useCallback(() => {
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    lineRef.current?.remove();
    lineRef.current = null;
    pointsRef.current = [];
  }, []);

  const finishDrawing = useCallback(() => {
    const pts = pointsRef.current;
    if (pts.length < 3) {
      clearDrawing();
      setDrawing(false);
      map.getContainer().style.cursor = "";
      return;
    }

    // Convert to GeoJSON [lng, lat] format
    const ring = pts.map((p) => [p.lng, p.lat]);
    ring.push(ring[0]); // Close the ring
    const coordinates = [ring];

    clearDrawing();
    setDrawing(false);
    map.getContainer().style.cursor = "";
    onPolygonDrawn(coordinates);
  }, [map, clearDrawing, onPolygonDrawn]);

  const handleMapClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      if (!drawing) return;

      pointsRef.current.push(e.latlng);

      // Add vertex marker
      const marker = L.circleMarker(e.latlng, {
        radius: 5,
        color: "#7c3aed",
        fillColor: "#ffffff",
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);
      markersRef.current.push(marker);

      // Update preview line
      const latlngs = pointsRef.current;
      if (lineRef.current) {
        lineRef.current.setLatLngs([...latlngs, latlngs[0]]);
      } else if (latlngs.length >= 2) {
        lineRef.current = L.polyline([...latlngs, latlngs[0]], {
          color: "#7c3aed",
          weight: 2,
          dashArray: "6 4",
          fillColor: "#7c3aed",
          fillOpacity: 0.05,
        }).addTo(map);
      }
    },
    [map, drawing]
  );

  const handleDblClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      if (!drawing) return;
      L.DomEvent.stopPropagation(e as unknown as Event);
      L.DomEvent.preventDefault(e as unknown as Event);
      finishDrawing();
    },
    [drawing, finishDrawing]
  );

  useEffect(() => {
    if (drawing) {
      map.getContainer().style.cursor = "crosshair";
      map.doubleClickZoom.disable();
      map.on("click", handleMapClick);
      map.on("dblclick", handleDblClick);
    }
    return () => {
      map.off("click", handleMapClick);
      map.off("dblclick", handleDblClick);
    };
  }, [map, drawing, handleMapClick, handleDblClick]);

  return (
    <div className="leaflet-top leaflet-left" style={{ marginTop: 10 }}>
      <div className="leaflet-control leaflet-bar flex flex-col">
        {!hasPolygon ? (
          <button
            title="Draw prospecting area"
            onClick={() => {
              if (drawing) {
                finishDrawing();
              } else {
                clearDrawing();
                setDrawing(true);
              }
            }}
            className={`flex h-8 w-8 items-center justify-center ${
              drawing
                ? "bg-purple-500 text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Pencil className="h-4 w-4" />
          </button>
        ) : (
          <button
            title="Clear area"
            onClick={() => {
              clearDrawing();
              map.doubleClickZoom.enable();
              onClear();
            }}
            className="flex h-8 w-8 items-center justify-center bg-white text-red-500 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        {drawing && (
          <>
            <button
              title="Finish drawing (or double-click)"
              onClick={finishDrawing}
              className="flex h-8 w-8 items-center justify-center bg-green-500 text-white hover:bg-green-600"
              style={{ borderTop: "1px solid #ccc" }}
            >
              <svg
                viewBox="0 0 16 16"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M2 8l4 4 8-8" />
              </svg>
            </button>
            <button
              title="Cancel drawing"
              onClick={() => {
                clearDrawing();
                setDrawing(false);
                map.getContainer().style.cursor = "";
                map.doubleClickZoom.enable();
              }}
              className="flex h-8 w-8 items-center justify-center bg-white text-gray-500 hover:bg-gray-100"
              style={{ borderTop: "1px solid #ccc" }}
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
      {drawing && (
        <div className="leaflet-control mt-1 rounded bg-purple-600/90 px-2 py-1 text-[10px] text-white shadow">
          Click to add points, double-click to finish
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FitBounds
// ---------------------------------------------------------------------------

function FitBounds({ parcels }: { parcels: ProspectParcel[] }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (parcels.length === 0) {
      fitted.current = false;
      return;
    }
    if (fitted.current) return;
    const bounds = L.latLngBounds(parcels.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    fitted.current = true;
  }, [map, parcels]);

  return null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProspectMap({
  parcels,
  polygon,
  onPolygonDrawn,
  onClear,
  selectedIds,
}: ProspectMapProps) {
  // Convert GeoJSON polygon [lng, lat] to Leaflet [lat, lng]
  const polygonPositions = polygon
    ? polygon[0].map(([lng, lat]) => [lat, lng] as [number, number])
    : null;

  return (
    <MapContainer
      center={[30.4515, -91.1871]}
      zoom={11}
      style={{ height: "500px", width: "100%" }}
      className="rounded-lg border"
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Streets">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite">
          <TileLayer
            attribution='&copy; <a href="https://www.esri.com">Esri</a>'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <DrawControl
        onPolygonDrawn={onPolygonDrawn}
        onClear={onClear}
        hasPolygon={!!polygon}
      />

      {parcels.length > 0 && <FitBounds parcels={parcels} />}

      {/* Drawn polygon overlay */}
      {polygonPositions && (
        <Polygon
          positions={polygonPositions}
          pathOptions={{
            color: "#7c3aed",
            weight: 2,
            opacity: 0.7,
            fillColor: "#7c3aed",
            fillOpacity: 0.08,
            dashArray: "6 4",
          }}
        />
      )}

      {/* Parcel markers */}
      {parcels.map((parcel) => {
        const isSelected = selectedIds.has(parcel.id);
        return (
          <CircleMarker
            key={parcel.id}
            center={[parcel.lat, parcel.lng]}
            radius={isSelected ? 9 : 6}
            pathOptions={{
              color: isSelected ? "#7c3aed" : "#3b82f6",
              fillColor: isSelected ? "#7c3aed" : "#3b82f6",
              fillOpacity: isSelected ? 0.8 : 0.5,
              weight: isSelected ? 3 : 2,
            }}
          >
            <Popup>
              <div style={{ fontSize: "13px", lineHeight: 1.5 }}>
                <div style={{ fontWeight: 600 }}>{parcel.address}</div>
                {parcel.owner && (
                  <div style={{ fontSize: "11px", color: "#6b7280" }}>
                    {parcel.owner}
                  </div>
                )}
                {parcel.acreage != null && (
                  <div style={{ fontSize: "11px" }}>
                    {parcel.acreage.toFixed(2)} acres
                  </div>
                )}
                {parcel.zoning && (
                  <div style={{ fontSize: "11px" }}>Zoning: {parcel.zoning}</div>
                )}
                {parcel.floodZone && (
                  <div style={{ fontSize: "11px" }}>
                    Flood: {parcel.floodZone}
                  </div>
                )}
                {parcel.assessedValue != null && (
                  <div style={{ fontSize: "11px" }}>
                    Assessed: $
                    {parcel.assessedValue.toLocaleString()}
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
