"use client";

import { useEffect, useRef, useCallback } from "react";
import { useControl } from "@vis.gl/react-maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer } from "@deck.gl/core";

interface DeckOverlayProviderProps {
  layers: Layer[];
  interleaved?: boolean;
}

/**
 * Provides a deck.gl overlay rendered into MapLibre's WebGL context.
 * Uses interleaved mode by default for proper z-ordering with native layers.
 */
export function DeckOverlayProvider({
  layers,
  interleaved = true,
}: DeckOverlayProviderProps) {
  const overlayRef = useRef<MapboxOverlay | null>(null);

  const onCreateOverlay = useCallback(() => {
    const overlay = new MapboxOverlay({ interleaved, layers });
    overlayRef.current = overlay;
    return overlay;
  }, [interleaved]);

  useControl(onCreateOverlay);

  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setProps({ layers });
    }
  }, [layers]);

  return null;
}
