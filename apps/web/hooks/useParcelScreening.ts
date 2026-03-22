"use client";

import useSWR from "swr";

export type ScreeningSummary = {
  parcel_id: string;
  address: string | null;
  in_sfha: boolean;
  flood_zone_count: number;
  has_hydric: boolean;
  soil_unit_count: number;
  has_wetlands: boolean;
  wetland_count: number;
  epa_facility_count: number;
  has_environmental_constraints: boolean;
  has_nearby_epa_facilities: boolean;
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Screening fetch failed: ${res.status}`);
  const json = (await res.json()) as { ok: boolean; data?: ScreeningSummary };
  return json.data as ScreeningSummary;
};

export function useParcelScreening(parcelId: string | null) {
  const { data, error, isLoading } = useSWR(
    parcelId ? `/api/parcels/${encodeURIComponent(parcelId)}/screening` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  return { screening: data ?? null, error, isLoading };
}
