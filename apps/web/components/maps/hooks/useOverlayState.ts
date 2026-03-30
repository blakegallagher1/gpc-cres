"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

interface OverlayState {
  showParcelBoundaries: boolean;
  showZoning: boolean;
  showFlood: boolean;
  showSoils: boolean;
  showWetlands: boolean;
  showEpa: boolean;
  showHeatmap: boolean;
  showTerrain: boolean;
}

const STORAGE_KEY = "map-overlay-prefs-v2";

function loadSavedState(): Partial<OverlayState> {
  if (typeof window === "undefined") return {};
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

const DEFAULTS: OverlayState = {
  showParcelBoundaries: true,
  showZoning: false,
  showFlood: false,
  showSoils: false,
  showWetlands: false,
  showEpa: false,
  showHeatmap: false,
  showTerrain: false,
};

export function useOverlayState() {
  const [state, setState] = useState<OverlayState>(() => ({
    ...DEFAULTS,
    ...loadSavedState(),
  }));

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const toggle = useCallback((key: keyof OverlayState) => {
    setState((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const activeCount = useMemo(
    () => Object.values(state).filter(Boolean).length,
    [state]
  );

  return { ...state, toggle, activeCount };
}
