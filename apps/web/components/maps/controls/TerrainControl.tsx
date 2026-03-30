"use client";

import { useEffect } from "react";
import { Source, useMap } from "@vis.gl/react-maplibre";
import {
  TERRAIN_DEM_URL,
  TERRAIN_SOURCE_ID,
  TERRAIN_ENCODING,
  DEFAULT_EXAGGERATION,
} from "../config/terrainConfig";

interface TerrainControlProps {
  enabled: boolean;
  exaggeration?: number;
}

/**
 * Adds 3D terrain to the map using AWS Terrarium DEM tiles.
 * Renders as a raster-DEM source + setTerrain() call.
 */
export function TerrainControl({
  enabled,
  exaggeration = DEFAULT_EXAGGERATION,
}: TerrainControlProps) {
  const { current: map } = useMap();

  useEffect(() => {
    if (!map) return;

    if (enabled) {
      map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration });
    } else {
      map.setTerrain(null);
    }

    return () => {
      try {
        map.setTerrain(null);
      } catch {}
    };
  }, [map, enabled, exaggeration]);

  return (
    <Source
      id={TERRAIN_SOURCE_ID}
      type="raster-dem"
      tiles={[TERRAIN_DEM_URL]}
      encoding={TERRAIN_ENCODING}
      tileSize={256}
    />
  );
}
