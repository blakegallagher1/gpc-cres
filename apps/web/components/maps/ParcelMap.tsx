"use client";

import { useEffect, useRef, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Popup,
  useMap,
  LayersControl,
  LayerGroup,
  CircleMarker,
  Polygon,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { useParcelGeometry } from "./useParcelGeometry";
import {
  STATUS_COLORS,
  DEFAULT_STATUS_COLOR,
  getZoningColor,
  getFloodColor,
  geoJsonToPositions,
} from "./mapStyles";

// Fix default marker icons for webpack/next.js
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MapParcel {
  id: string;
  address: string;
  lat: number;
  lng: number;
  dealId?: string;
  dealName?: string;
  dealStatus?: string;
  floodZone?: string | null;
  currentZoning?: string | null;
  propertyDbId?: string | null;
  acreage?: number | null;
}

interface ParcelMapProps {
  parcels: MapParcel[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  onParcelClick?: (id: string) => void;
  showLayers?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSavedBaseLayer(): string {
  try {
    return localStorage.getItem("map-base-layer") || "Streets";
  } catch {
    return "Streets";
  }
}

function getSavedOverlays(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem("map-overlay-prefs");
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Auto-fits map bounds to parcel positions on first render. */
function FitBounds({ parcels }: { parcels: MapParcel[] }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (parcels.length === 0 || fitted.current) return;
    const bounds = L.latLngBounds(parcels.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    fitted.current = true;
  }, [map, parcels]);

  return null;
}

/** Persists layer control choices to localStorage. */
function LayerPersistence() {
  const map = useMap();

  useEffect(() => {
    const onBaseChange = (e: L.LayersControlEvent) => {
      try {
        localStorage.setItem("map-base-layer", e.name);
      } catch {}
    };
    const onOverlayAdd = (e: L.LayersControlEvent) => {
      try {
        const prefs = JSON.parse(
          localStorage.getItem("map-overlay-prefs") || "{}"
        );
        prefs[e.name] = true;
        localStorage.setItem("map-overlay-prefs", JSON.stringify(prefs));
      } catch {}
    };
    const onOverlayRemove = (e: L.LayersControlEvent) => {
      try {
        const prefs = JSON.parse(
          localStorage.getItem("map-overlay-prefs") || "{}"
        );
        prefs[e.name] = false;
        localStorage.setItem("map-overlay-prefs", JSON.stringify(prefs));
      } catch {}
    };

    map.on("baselayerchange", onBaseChange);
    map.on("overlayadd", onOverlayAdd);
    map.on("overlayremove", onOverlayRemove);

    return () => {
      map.off("baselayerchange", onBaseChange);
      map.off("overlayadd", onOverlayAdd);
      map.off("overlayremove", onOverlayRemove);
    };
  }, [map]);

  return null;
}

// ---------------------------------------------------------------------------
// Popup content builder
// ---------------------------------------------------------------------------

function ParcelPopup({
  parcel,
}: {
  parcel: MapParcel;
}) {
  return (
    <Popup>
      <div style={{ fontSize: "13px", lineHeight: 1.4 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{parcel.address}</div>
        {parcel.dealName && (
          <div style={{ color: "#6b7280", fontSize: "11px" }}>
            {parcel.dealName}
          </div>
        )}
        {parcel.acreage && (
          <div style={{ fontSize: "11px" }}>{Number(parcel.acreage).toFixed(2)} acres</div>
        )}
        {parcel.dealStatus && (
          <div style={{ fontSize: "11px" }}>
            Status: {parcel.dealStatus.replace(/_/g, " ")}
          </div>
        )}
        {parcel.currentZoning && (
          <div style={{ fontSize: "11px" }}>Zoning: {parcel.currentZoning}</div>
        )}
        {parcel.floodZone && (
          <div style={{ fontSize: "11px" }}>Flood: {parcel.floodZone}</div>
        )}
      </div>
    </Popup>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ParcelMap({
  parcels,
  center = [30.4515, -91.1871],
  zoom = 11,
  height = "400px",
  onParcelClick,
  showLayers = true,
}: ParcelMapProps) {
  // Fetch GeoJSON polygon geometries for enriched parcels
  const { geometries } = useParcelGeometry(parcels);

  // Read saved layer preferences (client-only, safe because component is "use client")
  const savedBase = useMemo(() => getSavedBaseLayer(), []);
  const savedOverlays = useMemo(() => getSavedOverlays(), []);

  // Split parcels by geometry availability
  const parcelsWithGeometry = useMemo(
    () => parcels.filter((p) => geometries.has(p.id)),
    [parcels, geometries]
  );
  const parcelsWithoutGeometry = useMemo(
    () => parcels.filter((p) => !geometries.has(p.id)),
    [parcels, geometries]
  );

  // Parcels with zoning data + geometry (for zoning overlay)
  const parcelsWithZoning = useMemo(
    () => parcelsWithGeometry.filter((p) => p.currentZoning),
    [parcelsWithGeometry]
  );

  // Parcels with flood data + geometry (for flood overlay, excluding transparent zones)
  const parcelsWithFlood = useMemo(
    () =>
      parcelsWithGeometry.filter(
        (p) => p.floodZone && getFloodColor(p.floodZone) !== "transparent"
      ),
    [parcelsWithGeometry]
  );

  if (!showLayers) {
    // Simple mode: just markers with street tiles (no layers control)
    return (
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height, width: "100%" }}
        className="rounded-lg border"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {parcels.length > 0 && <FitBounds parcels={parcels} />}
        {parcels.map((parcel) => (
          <CircleMarker
            key={parcel.id}
            center={[parcel.lat, parcel.lng]}
            radius={7}
            pathOptions={{
              color: STATUS_COLORS[parcel.dealStatus || ""] || DEFAULT_STATUS_COLOR,
              fillColor: STATUS_COLORS[parcel.dealStatus || ""] || DEFAULT_STATUS_COLOR,
              fillOpacity: 0.6,
              weight: 2,
            }}
            eventHandlers={{ click: () => onParcelClick?.(parcel.id) }}
          >
            <ParcelPopup parcel={parcel} />
          </CircleMarker>
        ))}
      </MapContainer>
    );
  }

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height, width: "100%" }}
      className="rounded-lg border"
    >
      {parcels.length > 0 && <FitBounds parcels={parcels} />}
      <LayerPersistence />

      <LayersControl position="topright">
        {/* ---- Base Layers ---- */}
        <LayersControl.BaseLayer
          checked={savedBase !== "Satellite"}
          name="Streets"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer
          checked={savedBase === "Satellite"}
          name="Satellite"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.esri.com">Esri</a>'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>

        {/* ---- Overlay: Parcel Boundaries ---- */}
        <LayersControl.Overlay
          checked={savedOverlays["Parcel Boundaries"] !== false}
          name="Parcel Boundaries"
        >
          <LayerGroup>
            {/* GeoJSON polygons for enriched parcels */}
            {parcelsWithGeometry.flatMap((parcel) => {
              const positions = geoJsonToPositions(
                geometries.get(parcel.id)!.geometry
              );
              const color =
                STATUS_COLORS[parcel.dealStatus || ""] || DEFAULT_STATUS_COLOR;
              return positions.map((pos, idx) => (
                <Polygon
                  key={`b-${parcel.id}-${idx}`}
                  positions={pos}
                  pathOptions={{
                    color,
                    weight: 2,
                    opacity: 0.8,
                    fillColor: color,
                    fillOpacity: 0.15,
                  }}
                  eventHandlers={{ click: () => onParcelClick?.(parcel.id) }}
                >
                  <ParcelPopup parcel={parcel} />
                </Polygon>
              ));
            })}

            {/* Circle markers for parcels without geometry */}
            {parcelsWithoutGeometry.map((parcel) => {
              const color =
                STATUS_COLORS[parcel.dealStatus || ""] || DEFAULT_STATUS_COLOR;
              return (
                <CircleMarker
                  key={`m-${parcel.id}`}
                  center={[parcel.lat, parcel.lng]}
                  radius={8}
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: 0.6,
                    weight: 2,
                  }}
                  eventHandlers={{ click: () => onParcelClick?.(parcel.id) }}
                >
                  <ParcelPopup parcel={parcel} />
                </CircleMarker>
              );
            })}
          </LayerGroup>
        </LayersControl.Overlay>

        {/* ---- Overlay: Zoning ---- */}
        <LayersControl.Overlay
          checked={savedOverlays["Zoning Overlay"] === true}
          name="Zoning Overlay"
        >
          <LayerGroup>
            {parcelsWithZoning.flatMap((parcel) => {
              const positions = geoJsonToPositions(
                geometries.get(parcel.id)!.geometry
              );
              const color = getZoningColor(parcel.currentZoning);
              return positions.map((pos, idx) => (
                <Polygon
                  key={`z-${parcel.id}-${idx}`}
                  positions={pos}
                  pathOptions={{
                    color,
                    weight: 1.5,
                    opacity: 0.7,
                    fillColor: color,
                    fillOpacity: 0.25,
                  }}
                >
                  <Popup>
                    <div style={{ fontSize: "13px" }}>
                      <div style={{ fontWeight: 600 }}>{parcel.address}</div>
                      <div style={{ fontSize: "11px" }}>
                        Zoning: {parcel.currentZoning}
                      </div>
                    </div>
                  </Popup>
                </Polygon>
              ));
            })}
          </LayerGroup>
        </LayersControl.Overlay>

        {/* ---- Overlay: Flood Zones ---- */}
        <LayersControl.Overlay
          checked={savedOverlays["Flood Zones"] === true}
          name="Flood Zones"
        >
          <LayerGroup>
            {parcelsWithFlood.flatMap((parcel) => {
              const positions = geoJsonToPositions(
                geometries.get(parcel.id)!.geometry
              );
              const fillColor = getFloodColor(parcel.floodZone);
              return positions.map((pos, idx) => (
                <Polygon
                  key={`f-${parcel.id}-${idx}`}
                  positions={pos}
                  pathOptions={{
                    color: fillColor,
                    weight: 1,
                    opacity: 0.5,
                    fillColor,
                    fillOpacity: 0.35,
                  }}
                >
                  <Popup>
                    <div style={{ fontSize: "13px" }}>
                      <div style={{ fontWeight: 600 }}>{parcel.address}</div>
                      <div style={{ fontSize: "11px" }}>
                        Flood Zone: {parcel.floodZone}
                      </div>
                    </div>
                  </Popup>
                </Polygon>
              ));
            })}
          </LayerGroup>
        </LayersControl.Overlay>
      </LayersControl>
    </MapContainer>
  );
}
