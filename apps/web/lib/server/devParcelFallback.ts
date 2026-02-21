export type DevFallbackParcel = {
  id: string;
  address: string;
  owner: string;
  acreage: number;
  zoning: string;
  floodZone: string;
  lat: number;
  lng: number;
  parish: string;
  parcelUid: string;
  propertyDbId: string;
};

const DEV_PARCEL_SEED: DevFallbackParcel[] = [
  { id: "dev-1", address: "1201 Government St, Baton Rouge, LA", owner: "Dev Owner 1", acreage: 0.42, zoning: "C2", floodZone: "X", lat: 30.4451, lng: -91.1782, parish: "East Baton Rouge", parcelUid: "dev-uid-1", propertyDbId: "dev-uid-1" },
  { id: "dev-2", address: "2500 Florida Blvd, Baton Rouge, LA", owner: "Dev Owner 2", acreage: 0.67, zoning: "C1", floodZone: "X", lat: 30.4492, lng: -91.1615, parish: "East Baton Rouge", parcelUid: "dev-uid-2", propertyDbId: "dev-uid-2" },
  { id: "dev-3", address: "4512 Highland Rd, Baton Rouge, LA", owner: "Dev Owner 3", acreage: 1.12, zoning: "A1", floodZone: "AE", lat: 30.4026, lng: -91.1567, parish: "East Baton Rouge", parcelUid: "dev-uid-3", propertyDbId: "dev-uid-3" },
  { id: "dev-4", address: "8700 Perkins Rd, Baton Rouge, LA", owner: "Dev Owner 4", acreage: 0.58, zoning: "C2", floodZone: "X", lat: 30.3894, lng: -91.0754, parish: "East Baton Rouge", parcelUid: "dev-uid-4", propertyDbId: "dev-uid-4" },
  { id: "dev-5", address: "300 Main St, Baton Rouge, LA", owner: "Dev Owner 5", acreage: 0.31, zoning: "CBD", floodZone: "X", lat: 30.4514, lng: -91.1861, parish: "East Baton Rouge", parcelUid: "dev-uid-5", propertyDbId: "dev-uid-5" },
  { id: "dev-6", address: "10100 Airline Hwy, Baton Rouge, LA", owner: "Dev Owner 6", acreage: 1.44, zoning: "C3", floodZone: "X", lat: 30.3791, lng: -91.0458, parish: "East Baton Rouge", parcelUid: "dev-uid-6", propertyDbId: "dev-uid-6" },
  { id: "dev-7", address: "6400 Bluebonnet Blvd, Baton Rouge, LA", owner: "Dev Owner 7", acreage: 0.93, zoning: "C2", floodZone: "X", lat: 30.4027, lng: -91.1023, parish: "East Baton Rouge", parcelUid: "dev-uid-7", propertyDbId: "dev-uid-7" },
  { id: "dev-8", address: "15000 Coursey Blvd, Baton Rouge, LA", owner: "Dev Owner 8", acreage: 0.77, zoning: "C1", floodZone: "X", lat: 30.4132, lng: -91.0231, parish: "East Baton Rouge", parcelUid: "dev-uid-8", propertyDbId: "dev-uid-8" },
  { id: "dev-9", address: "900 Scenic Hwy, Baton Rouge, LA", owner: "Dev Owner 9", acreage: 0.86, zoning: "I1", floodZone: "AE", lat: 30.4915, lng: -91.1642, parish: "East Baton Rouge", parcelUid: "dev-uid-9", propertyDbId: "dev-uid-9" },
  { id: "dev-10", address: "11500 Old Hammond Hwy, Baton Rouge, LA", owner: "Dev Owner 10", acreage: 1.01, zoning: "C2", floodZone: "X", lat: 30.4447, lng: -91.0581, parish: "East Baton Rouge", parcelUid: "dev-uid-10", propertyDbId: "dev-uid-10" },
];

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Always false — parcels and geometry always use DB / Property DB / real GIS polygons. */
export function isDevParcelFallbackEnabled(): boolean {
  return false;
}

export function getDevFallbackParcels(searchText?: string): DevFallbackParcel[] {
  const query = normalize(searchText ?? "");
  if (!query || query === "*") {
    return DEV_PARCEL_SEED;
  }

  return DEV_PARCEL_SEED.filter((parcel) => {
    const haystack = normalize(
      `${parcel.address} ${parcel.owner} ${parcel.zoning} ${parcel.floodZone} ${parcel.propertyDbId}`,
    );
    return haystack.includes(query);
  });
}

export function getDevFallbackParcelByPropertyDbId(
  propertyDbId: string,
): DevFallbackParcel | null {
  const target = normalize(propertyDbId);
  if (!target) return null;

  return (
    DEV_PARCEL_SEED.find(
      (parcel) =>
        normalize(parcel.propertyDbId) === target ||
        normalize(parcel.parcelUid) === target,
    ) ?? null
  );
}

export function isPrismaConnectivityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("PrismaClientInitializationError") ||
    message.includes("Can't reach database server") ||
    message.includes("ECONNREFUSED")
  );
}
