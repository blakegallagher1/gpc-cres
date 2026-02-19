"use client";

import { useEffect, useRef, useMemo, useState } from "react";
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
import { getLeafletStreetTileUrl, getSatelliteTileUrl } from "./tileUrls";
import {
  STATUS_COLORS,
  DEFAULT_STATUS_COLOR,
  getZoningColor,
  getFloodColor,
  geoJsonToPositions,
} from "./mapStyles";
import { MeasureTool } from "./MeasureTool";
import { CompSaleLayer } from "./CompSaleLayer";
import { HeatmapLayer } from "./HeatmapLayer";
import { IsochroneControl } from "./IsochroneControl";
import { MapLibreParcelMap } from "./MapLibreParcelMap";

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
  geometryLookupKey?: string | null;
  acreage?: number | null;
}

interface ParcelMapProps {
  parcels: MapParcel[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  onParcelClick?: (id: string) => void;
  showLayers?: boolean;
  /** Enable analytical tools (measure, comps, heatmap, isochrone) */
  showTools?: boolean;
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

/** Auto-fits map bounds to parcel positions when the visible set changes. */
function FitBounds({ parcels }: { parcels: MapParcel[] }) {
  const map = useMap();
  const lastFitKey = useRef("");

  useEffect(() => {
    if (parcels.length === 0) return;

    const fitKey = parcels
      .map((parcel) => `${parcel.id}:${parcel.lat}:${parcel.lng}`)
      .join("|");
    if (fitKey === lastFitKey.current) return;

    const bounds = L.latLngBounds(parcels.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    lastFitKey.current = fitKey;
  }, [map, parcels]);

  return null;
}

/** Persists layer control choices to localStorage. */
function LayerPersistence({
  onBaseLayerChange,
}: {
  onBaseLayerChange: (name: string) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const onBaseChange = (e: L.LayersControlEvent) => {
      onBaseLayerChange(e.name);
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
  }, [map, onBaseLayerChange]);

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
  showTools = false,
}: ParcelMapProps) {
  const mapRenderer = process.env.NEXT_PUBLIC_MAP_RENDERER;
  if (mapRenderer === "maplibre") {
    return (
      <MapLibreParcelMap
        parcels={parcels}
        center={center}
        zoom={zoom}
        height={height}
        onParcelClick={onParcelClick}
        showLayers={showLayers}
        showTools={showTools}
      />
    );
  }

  // Fetch GeoJSON polygon geometries for enriched parcels
  const { geometries } = useParcelGeometry(parcels);

  // Analytical tool visibility state
  const [showComps, setShowComps] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showIsochrone, setShowIsochrone] = useState(false);
  const [baseLayer, setBaseLayer] = useState("Streets");

  // Compute center from parcels for comp search
  const parcelCenter = useMemo(() => {
    if (parcels.length === 0) return null;
    const avgLat = parcels.reduce((s, p) => s + p.lat, 0) / parcels.length;
    const avgLng = parcels.reduce((s, p) => s + p.lng, 0) / parcels.length;
    return { lat: avgLat, lng: avgLng };
  }, [parcels]);

  // Read saved layer preferences (client-only, safe because component is "use client")
  const savedBase = useMemo(() => getSavedBaseLayer(), []);
  const savedOverlays = useMemo(() => getSavedOverlays(), []);

  useEffect(() => {
    setBaseLayer(savedBase);
  }, [savedBase]);

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
          url={getLeafletStreetTileUrl()}
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
      <LayerPersistence onBaseLayerChange={setBaseLayer} />

      <LayersControl position="topright">
        {/* ---- Base Layers ---- */}
        <LayersControl.BaseLayer
          checked={baseLayer !== "Satellite"}
          name="Streets"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url={getLeafletStreetTileUrl()}
          />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer
          checked={baseLayer === "Satellite"}
          name="Satellite"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.esri.com">Esri</a>'
            url={getSatelliteTileUrl()}
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

      {/* ---- Analytical Tools ---- */}
      {showTools && (
        <>
          <MeasureTool />
          <AnalyticalToolbar
            showComps={showComps}
            setShowComps={setShowComps}
            showHeatmap={showHeatmap}
            setShowHeatmap={setShowHeatmap}
            showIsochrone={showIsochrone}
            setShowIsochrone={setShowIsochrone}
          />
          <CompSaleLayer
            visible={showComps}
            centerLat={parcelCenter?.lat}
            centerLng={parcelCenter?.lng}
          />
          <HeatmapLayer parcels={parcels} visible={showHeatmap} />
          <IsochroneControl parcels={parcels} visible={showIsochrone} />
        </>
      )}
    </MapContainer>
  );
}

// ---------------------------------------------------------------------------
// Analytical Toolbar (toggle buttons for tools)
// ---------------------------------------------------------------------------

function AnalyticalToolbar({
  showComps,
  setShowComps,
  showHeatmap,
  setShowHeatmap,
  showIsochrone,
  setShowIsochrone,
}: {
  showComps: boolean;
  setShowComps: (v: boolean) => void;
  showHeatmap: boolean;
  setShowHeatmap: (v: boolean) => void;
  showIsochrone: boolean;
  setShowIsochrone: (v: boolean) => void;
}) {
  return (
    <div className="leaflet-top leaflet-left" style={{ marginTop: 150 }}>
      <div className="leaflet-control leaflet-bar flex flex-col">
        <button
          title="Comparable Sales"
          onClick={() => setShowComps(!showComps)}
          className={`flex h-8 w-8 items-center justify-center text-xs font-bold ${
            showComps ? "bg-green-500 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
          }`}
          style={{ borderBottom: "1px solid #ccc" }}
        >
          $
        </button>
        <button
          title="Price Heatmap"
          onClick={() => setShowHeatmap(!showHeatmap)}
          className={`flex h-8 w-8 items-center justify-center ${
            showHeatmap ? "bg-orange-500 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
          }`}
          style={{ borderBottom: "1px solid #ccc" }}
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
            <circle cx="8" cy="8" r="6" opacity="0.6" />
            <circle cx="8" cy="8" r="3" />
          </svg>
        </button>
        <button
          title="Drive Time Isochrone"
          onClick={() => setShowIsochrone(!showIsochrone)}
          className={`flex h-8 w-8 items-center justify-center ${
            showIsochrone ? "bg-purple-500 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
          }`}
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6" />
            <path d="M8 4v4l2.5 2.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
