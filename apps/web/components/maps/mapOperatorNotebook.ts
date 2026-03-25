import type { MapParcel } from "./types";

/**
 * Local storage key for the `/map` operator notebook.
 */
export const MAP_OPERATOR_NOTEBOOK_STORAGE_KEY = "map-operator-notebook:v1";

/**
 * Supported task states for tracked map parcels.
 */
export const MAP_TRACKED_PARCEL_STATUSES = [
  "to_analyze",
  "active",
  "blocked",
  "complete",
] as const;

/**
 * Task-state union for tracked map parcels.
 */
export type MapTrackedParcelStatus = (typeof MAP_TRACKED_PARCEL_STATUSES)[number];

/**
 * Saved operator note and task metadata for a parcel boundary that should remain highlighted.
 */
export interface MapTrackedParcel {
  parcelId: string;
  address: string;
  lat: number;
  lng: number;
  currentZoning?: string | null;
  acreage?: number | null;
  floodZone?: string | null;
  note: string;
  task: string;
  status: MapTrackedParcelStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Draft payload collected from the operator console before parcels are pinned.
 */
export interface MapTrackedParcelDraft {
  note: string;
  task: string;
  status: MapTrackedParcelStatus;
}

/**
 * Roll-up counts used by the operator console and status strip.
 */
export interface MapTrackedParcelSummary {
  totalCount: number;
  openCount: number;
  blockedCount: number;
  activeCount: number;
  completeCount: number;
}

const TRACKED_STATUSES = new Set<MapTrackedParcelStatus>(MAP_TRACKED_PARCEL_STATUSES);

function isTrackedParcel(value: unknown): value is MapTrackedParcel {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<MapTrackedParcel>;
  return (
    typeof candidate.parcelId === "string" &&
    typeof candidate.address === "string" &&
    typeof candidate.lat === "number" &&
    Number.isFinite(candidate.lat) &&
    typeof candidate.lng === "number" &&
    Number.isFinite(candidate.lng) &&
    typeof candidate.note === "string" &&
    typeof candidate.task === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.status === "string" &&
    TRACKED_STATUSES.has(candidate.status as MapTrackedParcelStatus)
  );
}

function normalizeTrackedParcels(value: unknown): MapTrackedParcel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isTrackedParcel)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Safely reads tracked parcel notes from browser storage.
 */
export function readMapTrackedParcels(
  storage: Storage | null | undefined,
): MapTrackedParcel[] {
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(MAP_OPERATOR_NOTEBOOK_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    return normalizeTrackedParcels(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * Writes tracked parcel notes back to browser storage.
 */
export function writeMapTrackedParcels(
  storage: Storage | null | undefined,
  trackedParcels: MapTrackedParcel[],
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      MAP_OPERATOR_NOTEBOOK_STORAGE_KEY,
      JSON.stringify(trackedParcels),
    );
  } catch {
    // Ignore storage quota / private-mode failures and keep the in-memory notebook alive.
  }
}

/**
 * Upserts tracked parcel notes for the current selection while preserving existing note content when
 * the new draft omits it.
 */
export function upsertTrackedParcels(
  existing: MapTrackedParcel[],
  parcels: MapParcel[],
  draft: MapTrackedParcelDraft,
  now: Date = new Date(),
): MapTrackedParcel[] {
  if (parcels.length === 0) {
    return existing;
  }

  const note = draft.note.trim();
  const task = draft.task.trim();
  const timestamp = now.toISOString();
  const existingById = new Map(existing.map((entry) => [entry.parcelId, entry]));
  let changed = false;

  for (const parcel of parcels) {
    const prior = existingById.get(parcel.id);
    const next: MapTrackedParcel = {
      parcelId: parcel.id,
      address: parcel.address,
      lat: parcel.lat,
      lng: parcel.lng,
      currentZoning: parcel.currentZoning ?? null,
      acreage: parcel.acreage ?? null,
      floodZone: parcel.floodZone ?? null,
      note: note || prior?.note || "",
      task: task || prior?.task || "",
      status: draft.status,
      createdAt: prior?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    if (!prior && next.note.length === 0 && next.task.length === 0) {
      continue;
    }

    existingById.set(parcel.id, next);
    changed = true;
  }

  if (!changed) {
    return existing;
  }

  return Array.from(existingById.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

/**
 * Syncs tracked parcel metadata with the latest visible parcel payloads without overwriting notes/tasks.
 */
export function syncTrackedParcelsWithVisible(
  existing: MapTrackedParcel[],
  visibleParcels: MapParcel[],
): MapTrackedParcel[] {
  if (existing.length === 0 || visibleParcels.length === 0) {
    return existing;
  }

  const visibleById = new Map(visibleParcels.map((parcel) => [parcel.id, parcel]));
  let changed = false;

  const next = existing.map((entry) => {
    const parcel = visibleById.get(entry.parcelId);
    if (!parcel) {
      return entry;
    }

    if (
      entry.address === parcel.address &&
      entry.lat === parcel.lat &&
      entry.lng === parcel.lng &&
      entry.currentZoning === (parcel.currentZoning ?? null) &&
      entry.acreage === (parcel.acreage ?? null) &&
      entry.floodZone === (parcel.floodZone ?? null)
    ) {
      return entry;
    }

    changed = true;
    return {
      ...entry,
      address: parcel.address,
      lat: parcel.lat,
      lng: parcel.lng,
      currentZoning: parcel.currentZoning ?? null,
      acreage: parcel.acreage ?? null,
      floodZone: parcel.floodZone ?? null,
    };
  });

  return changed ? next : existing;
}

/**
 * Updates a tracked parcel entry in-place by ID and refreshes its `updatedAt` timestamp.
 */
export function updateTrackedParcel(
  existing: MapTrackedParcel[],
  parcelId: string,
  updates: Partial<Pick<MapTrackedParcel, "note" | "task" | "status">>,
  now: Date = new Date(),
): MapTrackedParcel[] {
  let changed = false;

  const next = existing.map((entry) => {
    if (entry.parcelId !== parcelId) {
      return entry;
    }

    changed = true;
    return {
      ...entry,
      note:
        typeof updates.note === "string"
          ? updates.note.trim()
          : entry.note,
      task:
        typeof updates.task === "string"
          ? updates.task.trim()
          : entry.task,
      status: updates.status ?? entry.status,
      updatedAt: now.toISOString(),
    };
  });

  if (!changed) {
    return existing;
  }

  return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Removes a tracked parcel from the notebook.
 */
export function removeTrackedParcel(
  existing: MapTrackedParcel[],
  parcelId: string,
): MapTrackedParcel[] {
  if (!existing.some((entry) => entry.parcelId === parcelId)) {
    return existing;
  }

  return existing.filter((entry) => entry.parcelId !== parcelId);
}

/**
 * Produces operator-facing counts for tracked parcel follow-up work.
 */
export function summarizeTrackedParcels(
  trackedParcels: MapTrackedParcel[],
): MapTrackedParcelSummary {
  return trackedParcels.reduce<MapTrackedParcelSummary>(
    (summary, entry) => {
      summary.totalCount += 1;
      if (entry.status !== "complete") {
        summary.openCount += 1;
      }
      if (entry.status === "blocked") {
        summary.blockedCount += 1;
      }
      if (entry.status === "active") {
        summary.activeCount += 1;
      }
      if (entry.status === "complete") {
        summary.completeCount += 1;
      }
      return summary;
    },
    {
      totalCount: 0,
      openCount: 0,
      blockedCount: 0,
      activeCount: 0,
      completeCount: 0,
    },
  );
}

/**
 * Converts a stored status into concise operator copy.
 */
export function mapTrackedParcelStatusLabel(
  status: MapTrackedParcelStatus,
): string {
  switch (status) {
    case "to_analyze":
      return "To analyze";
    case "active":
      return "Active";
    case "blocked":
      return "Blocked";
    case "complete":
      return "Complete";
  }
}
