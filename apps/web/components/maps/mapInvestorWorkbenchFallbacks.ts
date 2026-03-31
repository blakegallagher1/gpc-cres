import {
  summarizeTrackedParcels,
  type MapTrackedParcel,
} from "./mapOperatorNotebook";
import type { MapHudState, MapParcel } from "./types";
import type {
  MapAssemblageSnapshot,
  MapCompsSnapshot,
  MapInvestorWorkbench,
  MapMarketOverlaySnapshot,
  MapOwnershipSnapshot,
  MapWorkbenchResourceKind,
  MapWorkbenchResourceStatus,
  MapWorkspaceSnapshot,
} from "./mapInvestorWorkbench.types";

export function buildResourceStatus(
  kind: MapWorkbenchResourceKind,
  source: "api" | "fallback" | "empty",
  title: string,
  detail: string,
): MapWorkbenchResourceStatus {
  return { kind, source, title, detail };
}

function formatNumber(value: number | null): string {
  if (value == null || Number.isNaN(value)) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatAcreage(value: number | null): string {
  return value == null ? "Acreage pending" : `${formatNumber(value)} ac`;
}

function formatDateLabel(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "Unscheduled";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function normalizeOwner(owner: string | null | undefined): string {
  const value = owner?.trim();
  return value && value.length > 0 ? value : "Owner entity not resolved";
}

function distanceMiles(a: MapParcel, b: MapParcel): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function buildEmptyWorkspaceSnapshot(): MapWorkspaceSnapshot {
  return {
    status: buildResourceStatus(
      "empty",
      "empty",
      "No workspace yet",
      "Select parcels or draw a geography to start a shared workspace record.",
    ),
    recordId: null,
    name: "No active workspace",
    selectedCount: 0,
    trackedCount: 0,
    geofenceCount: 0,
    noteCount: 0,
    taskCount: 0,
    compCount: 0,
    aiInsightCount: 0,
    lastUpdatedLabel: "Not saved",
  };
}

export function buildFallbackWorkspaceSnapshot(args: {
  trackedParcels: MapTrackedParcel[];
  selectedParcels: MapParcel[];
  polygon: number[][][] | null;
  resultCount: number;
}): MapWorkspaceSnapshot {
  const trackedSummary = summarizeTrackedParcels(args.trackedParcels);
  const noteCount = args.trackedParcels.filter((entry) => entry.note.trim().length > 0).length;
  const taskCount = args.trackedParcels.filter((entry) => entry.task.trim().length > 0).length;
  const latestTouched = args.trackedParcels[0]?.updatedAt ?? null;

  return {
    status: buildResourceStatus(
      "fallback",
      "fallback",
      "Workspace contract is scaffolded",
      "This console is using a typed client fallback until the org-scoped map workspace API is wired.",
    ),
    recordId: null,
    name:
      args.selectedParcels.length > 0
        ? `${args.selectedParcels.length} selected parcel${args.selectedParcels.length === 1 ? "" : "s"}`
        : "Map workspace draft",
    selectedCount: args.selectedParcels.length,
    trackedCount: trackedSummary.totalCount,
    geofenceCount: args.polygon ? 1 : 0,
    noteCount,
    taskCount,
    compCount: 0,
    aiInsightCount: args.resultCount,
    lastUpdatedLabel: latestTouched ? formatDateLabel(latestTouched) : "Unsaved",
  };
}

export function buildEmptyAssemblageSnapshot(): MapAssemblageSnapshot {
  return {
    status: buildResourceStatus(
      "empty",
      "empty",
      "Assemblage needs a working set",
      "Select or save at least two parcels to score adjacency, owner concentration, and holdout risk.",
    ),
    adjacencyEdgeCount: 0,
    ownerGroups: [],
    bestCandidate: null,
    candidates: [],
  };
}

export function buildFallbackAssemblageSnapshot(
  contextParcels: MapParcel[],
): MapAssemblageSnapshot {
  const adjacencyThresholdMiles = 0.18;
  const adjacencyEdges = new Set<string>();
  const ownerGroupsMap = new Map<
    string,
    { ownerName: string; parcelIds: string[]; combinedAcreage: number | null }
  >();

  for (const parcel of contextParcels) {
    const ownerName = normalizeOwner(parcel.owner);
    const group = ownerGroupsMap.get(ownerName) ?? {
      ownerName,
      parcelIds: [],
      combinedAcreage: 0,
    };

    group.parcelIds.push(parcel.id);
    group.combinedAcreage =
      group.combinedAcreage == null
        ? parcel.acreage ?? null
        : group.combinedAcreage + (parcel.acreage ?? 0);
    ownerGroupsMap.set(ownerName, group);
  }

  for (let index = 0; index < contextParcels.length; index += 1) {
    const source = contextParcels[index];
    for (
      let targetIndex = index + 1;
      targetIndex < contextParcels.length;
      targetIndex += 1
    ) {
      const target = contextParcels[targetIndex];
      if (distanceMiles(source, target) <= adjacencyThresholdMiles) {
        adjacencyEdges.add(`${source.id}:${target.id}`);
      }
    }
  }

  const candidates = Array.from(ownerGroupsMap.values())
    .filter((group) => group.parcelIds.length > 0)
    .map((group) => {
      const ownerCount =
        group.ownerName === "Owner entity not resolved" ? group.parcelIds.length : 1;
      const holdoutRisk =
        group.parcelIds.length >= 3 ? "low" : group.parcelIds.length === 2 ? "medium" : "high";

      return {
        id: group.ownerName,
        label: group.ownerName,
        parcelIds: group.parcelIds,
        parcelCount: group.parcelIds.length,
        combinedAcreage: group.combinedAcreage,
        frontageFeet: null,
        ownerCount,
        holdoutRisk,
        rationale: [
          `${group.parcelIds.length} parcel${group.parcelIds.length === 1 ? "" : "s"} under the same owner rollup.`,
          "Frontage and geometry need the dedicated assemblage service before they can be trusted.",
        ],
      } satisfies MapAssemblageSnapshot["candidates"][number];
    })
    .sort((left, right) => {
      const rightAcreage = right.combinedAcreage ?? 0;
      const leftAcreage = left.combinedAcreage ?? 0;
      return rightAcreage - leftAcreage || right.parcelCount - left.parcelCount;
    });

  return {
    status: buildResourceStatus(
      "fallback",
      "fallback",
      "Assemblage panel is in fallback mode",
      "Owner grouping and adjacency are estimated from the current map context until the dedicated analysis endpoint is available.",
    ),
    adjacencyEdgeCount: adjacencyEdges.size,
    ownerGroups: Array.from(ownerGroupsMap.values())
      .map((group) => ({
        ownerName: group.ownerName,
        parcelCount: group.parcelIds.length,
        combinedAcreage: group.combinedAcreage,
      }))
      .sort((left, right) => right.parcelCount - left.parcelCount),
    bestCandidate: candidates[0] ?? null,
    candidates,
  };
}

function buildEmptyOwnershipSnapshot(): MapOwnershipSnapshot {
  return {
    status: buildResourceStatus(
      "empty",
      "empty",
      "Ownership lane is waiting on a parcel set",
      "Save or select a parcel before opening owner rollup, broker notes, and outreach tasks.",
    ),
    ownerRollup: [],
    brokerNotes: [],
    contactLog: [],
    nextContactTask: null,
    skipTraceStatus: "pending",
  };
}

function buildFallbackOwnershipSnapshot(
  contextParcels: MapParcel[],
  trackedParcels: MapTrackedParcel[],
): MapOwnershipSnapshot {
  const groupedOwners = new Map<string, MapParcel[]>();

  for (const parcel of contextParcels) {
    const ownerName = normalizeOwner(parcel.owner);
    const ownerParcels = groupedOwners.get(ownerName) ?? [];
    ownerParcels.push(parcel);
    groupedOwners.set(ownerName, ownerParcels);
  }

  const brokerNotes = trackedParcels
    .map((entry) => entry.note.trim())
    .filter((note) => note.length > 0)
    .slice(0, 3);
  const nextTask =
    trackedParcels.find((entry) => entry.task.trim().length > 0)?.task ?? null;

  return {
    status: buildResourceStatus(
      "fallback",
      "fallback",
      "Ownership data is partially scaffolded",
      "Owner rollup is built from the current parcel payload. Mailing addresses, portfolio context, and skip trace remain contract placeholders.",
    ),
    ownerRollup: Array.from(groupedOwners.entries()).map(([ownerName, parcels]) => ({
      ownerName,
      parcelCount: parcels.length,
      combinedAcreage: parcels.reduce((sum, parcel) => sum + (parcel.acreage ?? 0), 0),
      mailingAddress: null,
      portfolioContext:
        parcels.length > 1 ? "Multiple parcels already in the working set." : null,
    })),
    brokerNotes,
    contactLog: trackedParcels
      .filter((entry) => entry.task.trim().length > 0 || entry.note.trim().length > 0)
      .slice(0, 4)
      .map((entry) => ({
        id: entry.parcelId,
        label: entry.address,
        outcome: entry.status === "blocked" ? "Blocked" : "Pending outreach review",
        nextAction: entry.task.trim().length > 0 ? entry.task : "Define next-contact task",
      })),
    nextContactTask: nextTask,
    skipTraceStatus: "pending",
  };
}

function buildEmptyCompsSnapshot(): MapCompsSnapshot {
  return {
    status: buildResourceStatus(
      "empty",
      "empty",
      "Comp intelligence needs a subject parcel",
      "Select a parcel or workspace set to seed adjusted comps and underwriting assumptions.",
    ),
    filterSummary: [],
    underwritingSummary: [],
    adjustments: [],
    rows: [],
  };
}

function buildFallbackCompsSnapshot(
  contextParcels: MapParcel[],
  selectedParcels: MapParcel[],
): MapCompsSnapshot {
  const subject = selectedParcels[0] ?? contextParcels[0] ?? null;
  const zoningLabel = subject?.currentZoning ?? "Current zoning pending";
  const floodLabel = subject?.floodZone ? `Flood ${subject.floodZone}` : "Flood context pending";

  return {
    status: buildResourceStatus(
      "fallback",
      "fallback",
      "Enhanced comps are scaffolded",
      "The grid, adjustment summary, and underwriting tie-ins are ready, but live adjusted comp rows will appear once the server contract is wired.",
    ),
    filterSummary: [
      "Land use matched to subject",
      "12-month recency bias",
      "Distance weighted to the selected set",
    ],
    underwritingSummary: [
      `Subject frame: ${zoningLabel}`,
      `Risk carry: ${floodLabel}`,
      `Scale anchor: ${subject ? formatAcreage(subject.acreage ?? null) : "Selection pending"}`,
    ],
    adjustments: [
      { label: "Location bias", value: "Distance-weighted placeholder" },
      { label: "Land use fit", value: "Subject zoning mapped to comp filter" },
      { label: "Timing", value: "12-month recency weighting scaffolded" },
    ],
    rows: [],
  };
}

function buildEmptyMarketOverlaySnapshot(): MapMarketOverlaySnapshot {
  return {
    status: buildResourceStatus(
      "empty",
      "empty",
      "Market overlays are idle",
      "Select a parcel set to review permits, growth, utilities, frontage, and risk overlays.",
    ),
    cards: [],
  };
}

function buildFallbackMarketOverlaySnapshot(
  hudState: MapHudState,
  contextParcels: MapParcel[],
): MapMarketOverlaySnapshot {
  const floodExposureCount = contextParcels.filter((parcel) => parcel.floodZone).length;

  return {
    status: buildResourceStatus(
      "fallback",
      "fallback",
      "Developer overlay panel is scaffolded",
      "Only native map context is available right now. Each card below is typed so the live overlay feeds can drop in without UI surgery.",
    ),
    cards: [
      {
        id: "permits",
        label: "Permits & deliveries",
        availability: "fallback",
        detail: "Awaiting market monitor feed for live permit and delivery activity.",
        active: hudState.activeOverlays.includes("zoning"),
      },
      {
        id: "absorption",
        label: "Absorption & rent/sale comps",
        availability: "fallback",
        detail: "Comp panel is wired, but market-series ingestion is not attached yet.",
        active: hudState.activeOverlays.includes("epa"),
      },
      {
        id: "growth",
        label: "Household and income growth",
        availability: "unavailable",
        detail: "No census or third-party growth series attached to the map workspace contract yet.",
        active: false,
      },
      {
        id: "traffic",
        label: "Traffic counts and access",
        availability: "fallback",
        detail: "Road frontage and drive-time remain directional until access overlays are connected.",
        active: hudState.activeOverlays.includes("parcelBoundaries"),
      },
      {
        id: "utilities",
        label: "Utilities and infrastructure",
        availability: "unavailable",
        detail: "Utility serviceability needs a dedicated feed; this panel is reserving the slot.",
        active: false,
      },
      {
        id: "risk",
        label: "Flood history and slope",
        availability: "fallback",
        detail:
          floodExposureCount > 0
            ? `${floodExposureCount} parcel${floodExposureCount === 1 ? "" : "s"} in the current set already carry a flood designation.`
            : "No flood designation in the visible set; slope and topo await terrain analysis wiring.",
        active: hudState.activeOverlays.includes("flood"),
      },
    ],
  };
}

export function buildLoadingBundle(): MapInvestorWorkbench {
  const loadingStatus = buildResourceStatus(
    "loading",
    "fallback",
    "Loading map workspace",
    "Requesting the next server contract and holding the console shell steady.",
  );

  return {
    workspace: {
      ...buildEmptyWorkspaceSnapshot(),
      status: loadingStatus,
    },
    assemblage: {
      ...buildEmptyAssemblageSnapshot(),
      status: loadingStatus,
    },
    ownership: {
      ...buildEmptyOwnershipSnapshot(),
      status: loadingStatus,
    },
    comps: {
      ...buildEmptyCompsSnapshot(),
      status: loadingStatus,
    },
    marketOverlays: {
      ...buildEmptyMarketOverlaySnapshot(),
      status: loadingStatus,
    },
  };
}

export function resolveWorkbenchSnapshots(args: {
  hasContext: boolean;
  contextParcels: MapParcel[];
  selectedParcels: MapParcel[];
  trackedParcels: MapTrackedParcel[];
  polygon: number[][][] | null;
  resultCount: number;
  hudState: MapHudState;
  workspaceData: MapWorkspaceSnapshot | null | undefined;
  assemblageData: MapAssemblageSnapshot | null | undefined;
  ownershipData: MapOwnershipSnapshot | null | undefined;
  compsData: MapCompsSnapshot | null | undefined;
  marketOverlayData: MapMarketOverlaySnapshot | null | undefined;
  isLoading: boolean;
}): MapInvestorWorkbench {
  if (args.isLoading) {
    return buildLoadingBundle();
  }

  return {
    workspace:
      args.workspaceData ??
      (args.hasContext
        ? buildFallbackWorkspaceSnapshot({
            trackedParcels: args.trackedParcels,
            selectedParcels: args.selectedParcels,
            polygon: args.polygon,
            resultCount: args.resultCount,
          })
        : buildEmptyWorkspaceSnapshot()),
    assemblage:
      args.assemblageData ??
      (args.contextParcels.length > 1
        ? buildFallbackAssemblageSnapshot(args.contextParcels)
        : buildEmptyAssemblageSnapshot()),
    ownership:
      args.ownershipData ??
      (args.contextParcels.length > 0
        ? buildFallbackOwnershipSnapshot(args.contextParcels, args.trackedParcels)
        : buildEmptyOwnershipSnapshot()),
    comps:
      args.compsData ??
      (args.contextParcels.length > 0
        ? buildFallbackCompsSnapshot(args.contextParcels, args.selectedParcels)
        : buildEmptyCompsSnapshot()),
    marketOverlays:
      args.marketOverlayData ??
      (args.hasContext
        ? buildFallbackMarketOverlaySnapshot(args.hudState, args.contextParcels)
        : buildEmptyMarketOverlaySnapshot()),
  };
}
