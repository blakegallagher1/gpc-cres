"use client";

import { useEffect } from "react";
import useSWR from "swr";

// Client-side types matching the JSON response from GET /api/entities/lookup.
// Cannot import TruthView from truthViewService.ts — it uses "server-only".

interface TruthValue {
  value: unknown;
  source: string;
  verifiedAt: string;
  correctedBy?: string;
}

interface OpenConflict {
  key: string;
  values: unknown[];
  draftIds: string[];
}

interface CorrectionEntry {
  key: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
  correctedAt: string;
}

export interface ClientTruthView {
  currentValues: Record<string, TruthValue>;
  openConflicts: OpenConflict[];
  corrections: CorrectionEntry[];
}

interface EntityLookupResponse {
  found: boolean;
  entityId?: string;
  canonicalAddress?: string;
  parcelId?: string;
  truth?: ClientTruthView;
}

export interface UseParcelTruthParams {
  propertyDbId?: string | null;
  parcelId?: string;
  address?: string;
}

function buildLookupUrl(params: UseParcelTruthParams): string | null {
  if (params.propertyDbId) {
    return `/api/entities/lookup?parcel_id=${encodeURIComponent(params.propertyDbId)}`;
  }
  if (params.parcelId) {
    return `/api/entities/lookup?parcel_id=${encodeURIComponent(params.parcelId)}`;
  }
  if (params.address) {
    return `/api/entities/lookup?address=${encodeURIComponent(params.address)}`;
  }
  return null;
}

const fetcher = async (url: string): Promise<EntityLookupResponse> => {
  const res = await fetch(url);
  if (res.status === 401 || res.status === 403) return { found: false };
  if (!res.ok) throw new Error(`Entity lookup failed: ${res.status}`);
  return res.json();
};

export function useParcelTruth(params: UseParcelTruthParams | null) {
  const url = params ? buildLookupUrl(params) : null;

  const { data, error, isLoading, mutate } = useSWR<EntityLookupResponse>(
    url,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5_000,
    },
  );

  useEffect(() => {
    if (!url) return;
    const handler = () => {
      mutate();
    };
    window.addEventListener("gpc:memory-updated", handler);
    return () => window.removeEventListener("gpc:memory-updated", handler);
  }, [url, mutate]);

  const truth = data?.found ? data.truth ?? null : null;
  const entityId = data?.found ? data.entityId ?? null : null;

  return { truth, entityId, found: data?.found ?? false, error, isLoading };
}
