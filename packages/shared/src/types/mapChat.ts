export type MapContextGeometry = {
  type: string;
  coordinates?: unknown;
  geometries?: unknown;
};

export type MapContextBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type MapContextReferencedFeature = {
  parcelId: string;
  address?: string;
  zoning?: string;
  owner?: string;
  acres?: number;
  label?: string;
  center?: { lat: number; lng: number };
  geometry?: MapContextGeometry;
};

export type MapContextSpatialSelection = {
  kind: "polygon";
  coordinates: number[][][];
  parcelIds?: string[];
  bbox?: MapContextBounds;
  label?: string;
};

export type MapContextInput = {
  center?: { lat: number; lng: number } | null;
  zoom?: number;
  viewportBounds?: MapContextBounds;
  selectedParcelIds?: string[];
  selectedParcels?: MapContextReferencedFeature[];
  viewportLabel?: string;
  referencedFeatures?: MapContextReferencedFeature[];
  spatialSelection?: MapContextSpatialSelection | null;
};
