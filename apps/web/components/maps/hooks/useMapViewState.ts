"use client";

import { useState, useCallback, useEffect } from "react";

interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
}

const DEFAULT_VIEW: ViewState = {
  longitude: -91.187,
  latitude: 30.451,
  zoom: 11,
};

function getInitialViewState(fallback: ViewState): ViewState {
  if (typeof window === "undefined") return fallback;

  const params = new URLSearchParams(window.location.search);
  const lat = parseFloat(params.get("lat") ?? "");
  const lng = parseFloat(params.get("lng") ?? "");
  const z = parseFloat(params.get("z") ?? "");

  return {
    latitude: Number.isFinite(lat) ? lat : fallback.latitude,
    longitude: Number.isFinite(lng) ? lng : fallback.longitude,
    zoom: Number.isFinite(z) ? z : fallback.zoom,
  };
}

export function useMapViewState(initialCenter?: [number, number], initialZoom?: number) {
  const fallback: ViewState = {
    longitude: initialCenter?.[1] ?? DEFAULT_VIEW.longitude,
    latitude: initialCenter?.[0] ?? DEFAULT_VIEW.latitude,
    zoom: initialZoom ?? DEFAULT_VIEW.zoom,
  };
  const [viewState, setViewState] = useState<ViewState>(() => getInitialViewState(fallback));

  const onMove = useCallback((evt: { viewState: ViewState }) => {
    setViewState(evt.viewState);
  }, []);

  // Sync URL params on view change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      url.searchParams.set("lat", viewState.latitude.toFixed(6));
      url.searchParams.set("lng", viewState.longitude.toFixed(6));
      url.searchParams.set("z", viewState.zoom.toFixed(2));
      window.history.replaceState(null, "", url.toString());
    }, 500);
    return () => clearTimeout(timer);
  }, [viewState.latitude, viewState.longitude, viewState.zoom]);

  return { viewState, onMove };
}
