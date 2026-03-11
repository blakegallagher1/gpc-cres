export type MapContextReferencedFeature = {
  parcelId: string;
  address?: string;
  zoning?: string;
};

export type MapContextInput = {
  center?: { lat: number; lng: number } | null;
  zoom?: number;
  selectedParcelIds?: string[];
  viewportLabel?: string;
  referencedFeatures?: MapContextReferencedFeature[];
};
