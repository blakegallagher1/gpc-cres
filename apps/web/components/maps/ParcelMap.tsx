"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icons for webpack/next.js
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export interface MapParcel {
  id: string;
  address: string;
  lat: number;
  lng: number;
  dealId?: string;
  dealName?: string;
}

interface FitBoundsProps {
  parcels: MapParcel[];
}

function FitBounds({ parcels }: FitBoundsProps) {
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

interface ParcelMapProps {
  parcels: MapParcel[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  onParcelClick?: (id: string) => void;
}

export function ParcelMap({
  parcels,
  center = [30.4515, -91.1871],
  zoom = 11,
  height = "400px",
  onParcelClick,
}: ParcelMapProps) {
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
        <Marker
          key={parcel.id}
          position={[parcel.lat, parcel.lng]}
          eventHandlers={{
            click: () => onParcelClick?.(parcel.id),
          }}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-medium">{parcel.address}</p>
              {parcel.dealName && (
                <p className="text-xs text-gray-500">{parcel.dealName}</p>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
