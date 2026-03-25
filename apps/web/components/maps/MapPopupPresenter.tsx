"use client";

import { createRoot } from "react-dom/client";
import maplibregl from "maplibre-gl";
import type { SyntheticEvent } from "react";
import type { MapParcel } from "./types";

type PopupTone = "primary" | "warning" | "secondary";

/**
 * Supported parcel actions exposed from map popups.
 */
export type MapPopupAction =
  | {
      type: "create_deal";
      parcelId: string;
      triage?: boolean;
    }
  | {
      type: "open_comps";
      parcelId: string;
      lat: number;
      lng: number;
      address?: string;
    };

type MapPopupValueRow = {
  label: string;
  value: string;
};

type MapPopupLink = {
  label: string;
  href: string;
};

type MapPopupActionDescriptor = {
  label: string;
  tone: PopupTone;
  action: MapPopupAction;
};

/**
 * Normalized presenter model for map popups rendered inside MapLibre.
 */
export interface MapPopupViewModel {
  title: string;
  subtitle?: string | null;
  rows: MapPopupValueRow[];
  links: MapPopupLink[];
  actions: MapPopupActionDescriptor[];
}

/**
 * Builds the typed popup view model for a mapped parcel record.
 */
export function buildParcelPopupViewModel(parcel: MapParcel): MapPopupViewModel {
  const coordinates = `${parcel.lat.toFixed(6)},${parcel.lng.toFixed(6)}`;
  const streetViewUrl = `https://www.google.com/maps/@${coordinates},3a,75y,0h,90t/data=!3m6!1e1`;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${coordinates}`;

  return {
    title: parcel.address,
    subtitle: parcel.dealName ?? null,
    rows: [
      parcel.acreage != null
        ? { label: "Acreage", value: `${Number(parcel.acreage).toFixed(2)} acres` }
        : null,
      parcel.dealStatus
        ? { label: "Status", value: parcel.dealStatus.replace(/_/g, " ") }
        : null,
      parcel.currentZoning
        ? { label: "Zoning", value: parcel.currentZoning }
        : null,
      parcel.floodZone
        ? { label: "Flood", value: parcel.floodZone }
        : null,
    ].filter((row): row is MapPopupValueRow => Boolean(row)),
    links: [
      { label: "Street View", href: streetViewUrl },
      { label: "Google Maps", href: googleMapsUrl },
    ],
    actions: [
      {
        label: "+ Deal",
        tone: "primary",
        action: { type: "create_deal", parcelId: parcel.id },
      },
      {
        label: "Triage",
        tone: "warning",
        action: { type: "create_deal", parcelId: parcel.id, triage: true },
      },
      {
        label: "Comps",
        tone: "secondary",
        action: {
          type: "open_comps",
          parcelId: parcel.id,
          lat: parcel.lat,
          lng: parcel.lng,
          address: parcel.address,
        },
      },
    ],
  };
}

/**
 * Builds the typed popup view model for a vector-tile parcel feature.
 */
export function buildTileParcelPopupViewModel(
  props: Record<string, unknown>,
): MapPopupViewModel {
  const address = props.address ? String(props.address) : "Unknown address";
  const parcelId = props.parcel_id ? String(props.parcel_id) : null;
  const owner = props.owner ? String(props.owner) : null;
  const areaSqft = typeof props.area_sqft === "number" ? props.area_sqft : null;
  const assessed = typeof props.assessed_value === "number" ? props.assessed_value : null;
  const acreage = areaSqft ? (areaSqft / 43560).toFixed(2) : null;
  const latRaw =
    typeof props.lat === "number"
      ? props.lat
      : typeof props.latitude === "number"
        ? props.latitude
        : null;
  const lngRaw =
    typeof props.lng === "number"
      ? props.lng
      : typeof props.longitude === "number"
        ? props.longitude
        : null;
  const links =
    latRaw != null && lngRaw != null
      ? [
          {
            label: "Street View",
            href: `https://www.google.com/maps/@${latRaw.toFixed(6)},${lngRaw.toFixed(6)},3a,75y,0h,90t/data=!3m6!1e1`,
          },
        ]
      : [];

  return {
    title: address,
    subtitle: parcelId ? `Parcel ${parcelId}` : null,
    rows: [
      owner ? { label: "Owner", value: owner } : null,
      acreage && areaSqft != null
        ? { label: "Area", value: `${acreage} acres (${areaSqft.toLocaleString()} sqft)` }
        : null,
      assessed != null
        ? { label: "Assessed", value: `$${assessed.toLocaleString()}` }
        : null,
    ].filter((row): row is MapPopupValueRow => Boolean(row)),
    links,
    actions: [],
  };
}

/**
 * Mounts a React popup presenter into a MapLibre popup and cleans it up when
 * the popup closes.
 */
export function presentMapPopup(params: {
  map: maplibregl.Map;
  popupRef: React.MutableRefObject<maplibregl.Popup | null>;
  lngLat: [number, number];
  viewModel: MapPopupViewModel;
  onAction?: ((action: MapPopupAction) => void) | undefined;
}): void {
  params.popupRef.current?.remove();

  const container = document.createElement("div");
  const root = createRoot(container);
  let unmounted = false;

  const popup = new maplibregl.Popup({ closeOnClick: true })
    .setLngLat(params.lngLat)
    .setDOMContent(container)
    .addTo(params.map);

  const cleanup = () => {
    if (unmounted) {
      return;
    }
    unmounted = true;
    root.unmount();
    if (params.popupRef.current === popup) {
      params.popupRef.current = null;
    }
  };

  popup.on("close", cleanup);

  root.render(
    <MapPopupContent
      viewModel={params.viewModel}
      onAction={(action) => {
        params.onAction?.(action);
        popup.remove();
      }}
    />,
  );

  params.popupRef.current = popup;
}

function getActionClassName(tone: PopupTone): string {
  switch (tone) {
    case "primary":
      return "border-map-accent bg-map-accent text-white";
    case "warning":
      return "border-amber-500 bg-amber-500 text-slate-950";
    case "secondary":
      return "border-sky-500 bg-sky-500 text-white";
  }
}

function MapPopupContent(params: {
  viewModel: MapPopupViewModel;
  onAction?: ((action: MapPopupAction) => void) | undefined;
}) {
  const { viewModel } = params;
  const stopPropagation = (event: SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className="min-w-[220px] space-y-3 px-1 py-0.5 text-[13px] leading-5 text-map-text-primary"
      onClick={stopPropagation}
      onMouseDown={stopPropagation}
      onPointerDown={stopPropagation}
    >
      <div className="space-y-1">
        <div className="font-semibold text-map-text-primary">{viewModel.title}</div>
        {viewModel.subtitle ? (
          <div className="text-[11px] text-map-text-muted">{viewModel.subtitle}</div>
        ) : null}
      </div>

      {viewModel.rows.length > 0 ? (
        <div className="space-y-1.5">
          {viewModel.rows.map((row) => (
            <div key={`${row.label}:${row.value}`} className="flex gap-2 text-[11px]">
              <span className="min-w-[44px] text-map-text-muted">{row.label}</span>
              <span className="text-map-text-secondary">{row.value}</span>
            </div>
          ))}
        </div>
      ) : null}

      {viewModel.links.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-map-border pt-2 text-[11px]">
          {viewModel.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-map-accent hover:text-map-accent/80"
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {link.label}
            </a>
          ))}
        </div>
      ) : null}

      {viewModel.actions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {viewModel.actions.map((descriptor) => (
            <button
              key={`${descriptor.label}:${descriptor.action.type}`}
              type="button"
              onClick={(event) => {
                stopPropagation(event);
                params.onAction?.(descriptor.action);
              }}
              onMouseDown={stopPropagation}
              className={`rounded border px-2 py-1 text-[11px] font-medium transition-colors hover:opacity-90 ${getActionClassName(descriptor.tone)}`}
            >
              {descriptor.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
