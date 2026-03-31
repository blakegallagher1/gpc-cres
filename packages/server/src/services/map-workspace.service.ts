import { randomUUID } from "node:crypto";
import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import { z } from "zod";
import {
  CompSnapshotInputSchema,
  CreateMapWorkspaceOutreachLogRequestSchema,
  CreateMapWorkspaceRequestSchema,
  MapWorkspaceCompQuerySchema,
  MapWorkspaceContextSchema,
  MapWorkspaceUpsertSchema,
  ParcelTrackedStatusSchema,
  PolygonCoordinatesSchema,
  TrackedParcelInputSchema,
  UpdateMapWorkspaceRequestSchema,
  UpsertMapWorkspaceContactsRequestSchema,
  WorkspaceStatusSchema,
  type CompQuery,
  type MapWorkspaceContext,
  type WorkspaceWriteInput,
} from "./map-workspace.schemas";
import {
  buildAdjacencyEdges,
  buildAssemblageSuggestions,
  buildResourceStatus,
  decimalToNumber,
  formatCurrency,
  formatDateLabel,
  mapHoldoutRiskToSnapshot,
  median,
  monthsSince,
  parseAdjustmentNotes,
  parseAiOutputs,
  parseMarketOverlayState,
  parseOutreachChannel,
  parseOutreachStatus,
  parseOverlaySelections,
  parsePolygonCoordinates,
  parsePortfolioCount,
  parseSkipTraceProvider,
  readSelectedParcelIds,
  roundNumber,
  sumNumbers,
  toDecimal,
  toInputJson,
  weightedAverage,
} from "./map-workspace.utils";

export {
  CreateMapWorkspaceOutreachLogRequestSchema,
  CreateMapWorkspaceRequestSchema,
  MapWorkspaceCompQuerySchema,
  MapWorkspaceContextSchema,
  MapWorkspaceUpsertSchema,
  UpdateMapWorkspaceRequestSchema,
  UpsertMapWorkspaceContactsRequestSchema,
} from "./map-workspace.schemas";

const workspaceInclude = {
  parcels: true,
  contacts: true,
  outreachLogs: {
    include: { contact: true },
    orderBy: { happenedAt: "desc" },
  },
  comps: {
    orderBy: { saleDate: "desc" },
  },
} satisfies Prisma.MapWorkspaceInclude;

type WorkspaceWithRelations = Prisma.MapWorkspaceGetPayload<{
  include: typeof workspaceInclude;
}>;

const MARKET_OVERLAYS = [
  { key: "permits", label: "Permits" },
  { key: "deliveries", label: "Deliveries" },
  { key: "absorption", label: "Absorption" },
  { key: "rent_comps", label: "Rent comps" },
  { key: "sale_comps", label: "Sale comps" },
  { key: "household_growth", label: "Household growth" },
  { key: "income_growth", label: "Income growth" },
  { key: "traffic_counts", label: "Traffic counts" },
  { key: "utilities", label: "Utilities" },
  { key: "flood_history", label: "Flood history" },
  { key: "topography", label: "Topography" },
  { key: "road_frontage", label: "Road frontage" },
] as const;

export function parseMapWorkspaceContext(searchParams: URLSearchParams): MapWorkspaceContext {
  const polygonRaw = searchParams.get("polygon");
  let polygon: number[][][] | null = null;
  if (polygonRaw) {
    try {
      const parsed = JSON.parse(polygonRaw) as unknown;
      polygon = PolygonCoordinatesSchema.parse(parsed);
    } catch {
      polygon = null;
    }
  }

  return MapWorkspaceContextSchema.parse({
    parcelIds: searchParams.getAll("parcelId"),
    polygon,
  });
}

export class MapWorkspaceServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "MapWorkspaceServiceError";
  }
}

export class MapWorkspaceService {
  async listWorkspaces(orgId: string) {
    const workspaces = await prisma.mapWorkspace.findMany({
      where: { orgId },
      orderBy: { updatedAt: "desc" },
      include: workspaceInclude,
    });
    return { workspaces: workspaces.map((workspace) => this.toWorkspaceRecord(workspace)) };
  }

  async createWorkspace(params: {
    orgId: string;
    userId: string;
    input: z.infer<typeof CreateMapWorkspaceRequestSchema>;
  }) {
    const input = CreateMapWorkspaceRequestSchema.parse(params.input);
    const prepared = this.prepareWorkspaceWrite(input);

    const workspace = await prisma.$transaction(async (tx) => {
      const created = await tx.mapWorkspace.create({
        data: {
          orgId: params.orgId,
          dealId: input.dealId ?? null,
          name: input.name,
          status: input.status ?? "active",
          createdBy: params.userId,
          updatedBy: params.userId,
          summary: input.summary ?? null,
          notes: input.notes ?? null,
          selectedParcelIds: prepared.selectedParcelIds,
          ...(prepared.polygonCoordinates === null
            ? {}
            : { polygon: toInputJson(prepared.polygonCoordinates) }),
          parcelSetDefinition: toInputJson(input.parcelSetDefinition ?? {}),
          parcelSetMaterialization: toInputJson(input.parcelSetMaterialization ?? {}),
          overlayState: toInputJson(prepared.overlayState),
          aiOutputs: toInputJson(prepared.aiOutputs),
          marketState: toInputJson(prepared.marketState),
        },
      });

      await this.replaceParcels(tx, params.orgId, created.id, prepared.parcels);
      await this.replaceComps(tx, params.orgId, created.id, prepared.comps);

      return tx.mapWorkspace.findUniqueOrThrow({
        where: { id: created.id },
        include: workspaceInclude,
      });
    });

    return this.toWorkspaceRecord(workspace);
  }

  async getWorkspace(orgId: string, workspaceId: string) {
    return this.toWorkspaceRecord(await this.requireWorkspace(orgId, workspaceId));
  }

  async updateWorkspace(params: {
    orgId: string;
    userId: string;
    workspaceId: string;
    input: z.infer<typeof UpdateMapWorkspaceRequestSchema>;
  }) {
    const input = UpdateMapWorkspaceRequestSchema.parse(params.input);
    const existing = await this.requireWorkspace(params.orgId, params.workspaceId);
    const prepared = this.prepareWorkspaceWrite(input, existing);

    const workspace = await prisma.$transaction(async (tx) => {
      await tx.mapWorkspace.update({
        where: { id: params.workspaceId },
        data: {
          name: input.name ?? undefined,
          dealId: input.dealId === undefined ? undefined : input.dealId,
          summary: input.summary === undefined ? undefined : input.summary,
          notes: input.notes === undefined ? undefined : input.notes,
          status: input.status ?? undefined,
          updatedBy: params.userId,
          selectedParcelIds:
            input.selectedParcelIds === undefined ? undefined : prepared.selectedParcelIds,
          polygon:
            input.polygonCoordinates === undefined
              ? undefined
              : prepared.polygonCoordinates === null
                ? undefined
                : toInputJson(prepared.polygonCoordinates),
          parcelSetDefinition:
            input.parcelSetDefinition === undefined
              ? undefined
              : toInputJson(input.parcelSetDefinition),
          parcelSetMaterialization:
            input.parcelSetMaterialization === undefined
              ? undefined
              : toInputJson(input.parcelSetMaterialization),
          overlayState:
            input.overlays === undefined ? undefined : toInputJson(prepared.overlayState),
          aiOutputs:
            input.aiOutputs === undefined ? undefined : toInputJson(prepared.aiOutputs),
          marketState:
            input.marketState === undefined ? undefined : toInputJson(prepared.marketState),
        },
      });

      if (input.parcels !== undefined || input.trackedParcels !== undefined) {
        await this.replaceParcels(tx, params.orgId, params.workspaceId, prepared.parcels);
      }
      if (input.compSnapshots !== undefined) {
        await this.replaceComps(tx, params.orgId, params.workspaceId, prepared.comps);
      }

      return tx.mapWorkspace.findUniqueOrThrow({
        where: { id: params.workspaceId },
        include: workspaceInclude,
      });
    });

    return this.toWorkspaceRecord(workspace);
  }

  async upsertContacts(params: {
    orgId: string;
    workspaceId: string;
    contacts: z.infer<typeof UpsertMapWorkspaceContactsRequestSchema>["contacts"];
  }) {
    const input = UpsertMapWorkspaceContactsRequestSchema.parse({ contacts: params.contacts });
    await this.requireWorkspace(params.orgId, params.workspaceId);

    await prisma.$transaction(async (tx) => {
      await tx.mapWorkspaceContact.deleteMany({
        where: { workspaceId: params.workspaceId, orgId: params.orgId },
      });

      if (input.contacts.length > 0) {
        await tx.mapWorkspaceContact.createMany({
          data: input.contacts.map((contact) => ({
            id: contact.id ?? undefined,
            workspaceId: params.workspaceId,
            orgId: params.orgId,
            parcelId: contact.parcelId ?? null,
            ownerName: contact.ownerName,
            entityName: contact.entityName ?? null,
            mailingAddress: contact.mailingAddress ?? null,
            mailingCity: contact.mailingCity ?? null,
            mailingState: contact.mailingState ?? null,
            mailingZip: contact.mailingZip ?? null,
            portfolioContext: toInputJson(contact.portfolioContext ?? {}),
            skipTraceState: toInputJson(contact.skipTraceState ?? {}),
            brokerNotes: contact.brokerNotes ?? null,
          })),
        });
      }
    });

    return this.getOwnershipContract(params.orgId, params.workspaceId);
  }

  async createOutreachLog(params: {
    orgId: string;
    workspaceId: string;
    input: z.infer<typeof CreateMapWorkspaceOutreachLogRequestSchema>;
  }) {
    const input = CreateMapWorkspaceOutreachLogRequestSchema.parse(params.input);
    await this.requireWorkspace(params.orgId, params.workspaceId);

    if (input.contactId) {
      const contact = await prisma.mapWorkspaceContact.findFirst({
        where: { id: input.contactId, workspaceId: params.workspaceId, orgId: params.orgId },
        select: { id: true },
      });
      if (!contact) {
        throw new MapWorkspaceServiceError("Contact not found", "NOT_FOUND", 404);
      }
    }

    await prisma.mapWorkspaceOutreachLog.create({
      data: {
        workspaceId: params.workspaceId,
        orgId: params.orgId,
        contactId: input.contactId ?? null,
        channel: input.channel,
        direction: input.direction ?? null,
        status: input.status,
        happenedAt: input.happenedAt ? new Date(input.happenedAt) : new Date(),
        nextContactAt: input.nextContactAt ? new Date(input.nextContactAt) : null,
        brokerName: input.brokerName ?? null,
        brokerCompany: input.brokerCompany ?? null,
        summary: input.summary ?? null,
        notes: input.notes ?? null,
      },
    });

    return this.getOwnershipContract(params.orgId, params.workspaceId);
  }

  async getCompIntelligence(orgId: string, workspaceId: string, query: CompQuery) {
    const workspace = await this.requireWorkspace(orgId, workspaceId);
    return this.buildCompContract(workspace, MapWorkspaceCompQuerySchema.parse(query));
  }

  async getMarketOverlayContract(orgId: string, workspaceId: string) {
    const workspace = await this.requireWorkspace(orgId, workspaceId);
    return this.buildMarketOverlayContract(workspace);
  }

  async getOwnershipContract(orgId: string, workspaceId: string) {
    const workspace = await this.requireWorkspace(orgId, workspaceId);
    return this.buildOwnershipContract(workspace);
  }

  async getAssemblageAnalysis(orgId: string, workspaceId: string) {
    const workspace = await this.requireWorkspace(orgId, workspaceId);
    return this.buildAssemblageContract(workspace);
  }

  async getActiveWorkspace(orgId: string, context: MapWorkspaceContext) {
    const workspaces = await prisma.mapWorkspace.findMany({
      where: { orgId },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: workspaceInclude,
    });
    if (workspaces.length === 0) {
      return null;
    }

    if (context.parcelIds.length === 0 && !context.polygon) {
      return workspaces[0] ?? null;
    }

    const selected = workspaces
      .map((workspace) => ({
        workspace,
        score: scoreWorkspace(workspace, context),
      }))
      .sort((left, right) => right.score - left.score);

    return selected[0]?.score && selected[0].score > 0
      ? selected[0].workspace
      : (workspaces[0] ?? null);
  }

  async saveWorkspace(
    orgId: string,
    userId: string,
    payload: z.infer<typeof MapWorkspaceUpsertSchema>,
  ) {
    const input = MapWorkspaceUpsertSchema.parse(payload);
    const overlays = Object.entries(input.overlayState).map(([key, enabled]) => ({
      key,
      enabled,
      status: enabled ? ("available" as const) : ("fallback" as const),
    }));
    const upsertInput = {
      name:
        input.workspaceParcels[0]?.address
          ? `${input.workspaceParcels[0].address} workspace`
          : `Map workspace ${new Date().toLocaleDateString("en-US")}`,
      selectedParcelIds: input.selectedParcelIds,
      polygonCoordinates: input.polygon ?? null,
      parcels: input.workspaceParcels.map((parcel) => ({
        parcelId: parcel.parcelId,
        address: parcel.address,
        ownerName: parcel.owner ?? null,
        mailingAddress: null,
        acreage: parcel.acreage ?? null,
        zoningCode: parcel.currentZoning ?? null,
        floodZone: parcel.floodZone ?? null,
        lat: parcel.lat,
        lng: parcel.lng,
        metadata: {},
      })),
      trackedParcels: input.trackedParcels.map((parcel) => ({
        parcelId: parcel.parcelId,
        status: parcel.status,
        task: parcel.task,
        note: parcel.note,
        updatedAt: parcel.updatedAt,
      })),
      aiOutputs: input.aiOutputs,
      overlays,
      summary:
        input.selectedParcelIds.length > 0
          ? `${input.selectedParcelIds.length} parcel workspace`
          : "Map workspace",
    };

    if (input.workspaceId) {
      const record = await this.updateWorkspace({
        orgId,
        userId,
        workspaceId: input.workspaceId,
        input: upsertInput,
      });
      return this.requireWorkspace(record.orgId, record.id);
    }

    const record = await this.createWorkspace({
      orgId,
      userId,
      input: upsertInput,
    });
    return this.requireWorkspace(record.orgId, record.id);
  }

  buildWorkspaceBridgeRecord(workspace: WorkspaceWithRelations) {
    const record = this.toWorkspaceRecord(workspace);
    return {
      id: record.id,
      name: record.name,
      opportunityLabel: record.dealId ? `Deal ${record.dealId}` : null,
      trackedParcels: record.parcels.map((parcel) => {
        const tracked = record.trackedParcels.find((entry) => entry.parcelId === parcel.parcelId);
        return {
          parcelId: parcel.parcelId,
          address: parcel.address,
          lat: parcel.lat ?? 0,
          lng: parcel.lng ?? 0,
          currentZoning: parcel.zoningCode ?? null,
          acreage: parcel.acreage ?? null,
          floodZone: parcel.floodZone ?? null,
          note: tracked?.note ?? "",
          task: tracked?.task ?? "",
          status: tracked?.status ?? "to_analyze",
          createdAt: workspace.createdAt.toISOString(),
          updatedAt: tracked?.updatedAt ?? workspace.updatedAt.toISOString(),
        };
      }),
      polygon: record.polygonCoordinates,
      selectedParcelIds: record.selectedParcelIds,
      notesCount: record.trackedParcels.filter((entry) => entry.note).length,
      compCount: record.compSnapshots.length,
      aiOutputCount: record.aiOutputs.length,
      updatedAt: record.updatedAt,
      syncState: "connected" as const,
    };
  }

  buildWorkspaceSnapshot(workspace: WorkspaceWithRelations) {
    const record = this.toWorkspaceRecord(workspace);
    const noteCount = record.trackedParcels.filter((entry) => entry.note).length;
    const taskCount = record.trackedParcels.filter((entry) => entry.task).length;

    return {
      status: buildResourceStatus(
        "ready",
        "api",
        "Shared workspace connected",
        "Selections, geofence, AI outputs, and tracked parcel tasks are persisted in an org-scoped workspace record.",
      ),
      recordId: record.id,
      name: record.name,
      selectedCount: record.selectedParcelIds.length,
      trackedCount: record.trackedParcels.length,
      geofenceCount: record.polygonCoordinates ? 1 : 0,
      noteCount,
      taskCount,
      compCount: record.compSnapshots.length,
      aiInsightCount: record.aiOutputs.length,
      lastUpdatedLabel: formatDateLabel(record.updatedAt),
    };
  }

  buildAssemblageSnapshot(workspace: WorkspaceWithRelations, _context: MapWorkspaceContext) {
    const contract = this.buildAssemblageContract(workspace);
    const candidates = contract.suggestions.map((suggestion) => ({
      id: suggestion.id,
      label: suggestion.label,
      parcelIds: suggestion.parcelIds,
      parcelCount: suggestion.parcelIds.length,
      combinedAcreage: suggestion.combinedAcreage,
      frontageFeet: null,
      ownerCount: suggestion.ownerCount,
        holdoutRisk: mapHoldoutRiskToSnapshot(suggestion.holdoutRisk),
      rationale: suggestion.rationale,
    }));

    return {
      status: buildResourceStatus(
        contract.availability === "available" ? "ready" : "fallback",
        "api",
        "Assemblage analysis ready",
        contract.fallbackReason ?? "Assemblage analysis is derived from the persisted workspace geometry and owner rollup.",
      ),
      adjacencyEdgeCount: contract.graph.edges.length,
      ownerGroups: contract.ownerClusters.map((owner) => ({
        ownerName: owner.ownerName,
        parcelCount: owner.parcelIds.length,
        combinedAcreage: owner.combinedAcreage,
      })),
      bestCandidate: candidates[0] ?? null,
      candidates,
    };
  }

  buildOwnershipSnapshot(workspace: WorkspaceWithRelations, _context: MapWorkspaceContext) {
    const contract = this.buildOwnershipContract(workspace);
    return {
      status: buildResourceStatus(
        contract.availability === "available" ? "ready" : "fallback",
        "api",
        "Ownership lane connected",
        contract.fallbackReason ?? "Owner rollup, skip-trace state, and outreach history are reading from the workspace contract.",
      ),
      ownerRollup: contract.owners.map((owner) => ({
        ownerName: owner.ownerName,
        parcelCount: owner.parcelIds.length,
        combinedAcreage: owner.combinedAcreage,
        mailingAddress: owner.mailingAddress,
        portfolioContext:
          owner.portfolioCount > 0 ? `${owner.portfolioCount} related holding(s)` : null,
      })),
      brokerNotes: workspace.contacts
        .map((contact) => contact.brokerNotes?.trim() ?? "")
        .filter((note) => note.length > 0),
      contactLog: contract.outreachLogs.map((log) => ({
        id: log.id,
        label: log.ownerName,
        outcome: log.status.replaceAll("_", " "),
        nextAction: log.nextContactAt
          ? `Next contact ${formatDateLabel(log.nextContactAt)}`
          : "Set next-contact task",
      })),
      nextContactTask:
        contract.outreachLogs.find((log) => log.nextContactAt)?.notes ?? null,
      skipTraceStatus:
        contract.skipTraceHook.status === "available"
          ? "available"
          : contract.skipTraceHook.status === "fallback"
            ? "pending"
            : "unavailable",
    };
  }

  buildCompsSnapshot(workspace: WorkspaceWithRelations) {
    const contract = this.buildCompContract(workspace, {});
    return {
      status: buildResourceStatus(
        contract.availability === "available" ? "ready" : "fallback",
        "api",
        "Comp intelligence connected",
        contract.fallbackReason ?? "Stored comp rows are flowing into the operator grid and underwriting tie-in.",
      ),
      filterSummary: [
        contract.filters.landUse ? `Land use ${contract.filters.landUse}` : "All land uses",
        contract.filters.maxAgeMonths ? `${contract.filters.maxAgeMonths} month recency cap` : "All sale dates",
        `Comp count ${contract.summary.compCount}`,
      ],
      underwritingSummary: [
        contract.underwritingHandoff.message,
        contract.summary.weightedPricePerAcre != null
          ? `Weighted basis ${formatCurrency(contract.summary.weightedPricePerAcre)} / ac`
          : "Weighted basis pending",
      ],
      adjustments: [
        {
          label: "Median price / ac",
          value:
            contract.summary.medianPricePerAcre != null
              ? formatCurrency(contract.summary.medianPricePerAcre)
              : "Pending",
        },
        {
          label: "Weighted price / ac",
          value:
            contract.summary.weightedPricePerAcre != null
              ? formatCurrency(contract.summary.weightedPricePerAcre)
              : "Pending",
        },
        {
          label: "Export grid",
          value: `${contract.exportColumns.length} columns`,
        },
      ],
      rows: contract.comps.map((comp) => {
        const distanceMiles =
          typeof comp.distanceMiles === "number" ? comp.distanceMiles : null;
        const weightedScore =
          typeof comp.weightedScore === "number" ? comp.weightedScore : null;

        return {
          id: comp.id,
          address: comp.address,
          landUse: comp.landUse ?? "Land use pending",
          distanceLabel:
            distanceMiles != null ? `${distanceMiles.toFixed(2)} mi` : "Distance pending",
          saleDateLabel: comp.saleDate ? formatDateLabel(comp.saleDate) : "Sale date pending",
          weightingLabel:
            weightedScore != null ? `${weightedScore.toFixed(2)}x` : "Weight pending",
          priceLabel:
            comp.pricePerAcre != null
              ? `${formatCurrency(comp.pricePerAcre)} / ac`
              : "Price pending",
          adjustedPriceLabel:
            comp.adjustedPricePerAcre != null
              ? `${formatCurrency(comp.adjustedPricePerAcre)} / ac`
              : "Adjustment pending",
        };
      }),
    };
  }

  buildMarketOverlaySnapshot(workspace: WorkspaceWithRelations) {
    const contract = this.buildMarketOverlayContract(workspace);
    return {
      status: buildResourceStatus(
        "ready",
        "api",
        "Developer overlays connected",
        "Overlay cards reflect persisted map selections and typed fallback states for feeds that are not live yet.",
      ),
      cards: contract.overlays.map((overlay) => ({
        id: overlay.key,
        label: overlay.label,
        availability:
          overlay.status === "available"
            ? "live"
            : overlay.status === "fallback"
              ? "fallback"
              : "unavailable",
        detail: overlay.summary,
        active: Boolean(overlay.details.enabled),
      })),
    };
  }

  private async requireWorkspace(orgId: string, workspaceId: string): Promise<WorkspaceWithRelations> {
    const workspace = await prisma.mapWorkspace.findFirst({
      where: { id: workspaceId, orgId },
      include: workspaceInclude,
    });
    if (!workspace) {
      throw new MapWorkspaceServiceError("Workspace not found", "NOT_FOUND", 404);
    }
    return workspace;
  }

  private prepareWorkspaceWrite(input: WorkspaceWriteInput, existing?: WorkspaceWithRelations) {
    const trackedMap = new Map<string, z.infer<typeof TrackedParcelInputSchema>>();
    for (const trackedParcel of input.trackedParcels ?? []) {
      trackedMap.set(trackedParcel.parcelId, trackedParcel);
    }
    const existingSelectedParcelIds = readSelectedParcelIds(existing?.selectedParcelIds);

    const sourceParcels =
      input.parcels ??
      existing?.parcels.map((parcel) => ({
        parcelId: parcel.parcelId,
        address: parcel.address,
        ownerName: parcel.owner ?? null,
        mailingAddress: null,
        acreage: decimalToNumber(parcel.acreage),
        zoningCode: parcel.currentZoning ?? null,
        floodZone: parcel.floodZone ?? null,
        lat: decimalToNumber(parcel.lat),
        lng: decimalToNumber(parcel.lng),
        metadata: {},
      })) ??
      [];

    const parcels = sourceParcels.map((parcel) => {
      const tracked = trackedMap.get(parcel.parcelId);
      const existingParcel = existing?.parcels.find((candidate) => candidate.parcelId === parcel.parcelId);
      return {
        parcelId: parcel.parcelId,
        address: parcel.address,
        owner: parcel.ownerName ?? null,
        acreage: parcel.acreage ?? null,
        lat: parcel.lat ?? null,
        lng: parcel.lng ?? null,
        currentZoning: parcel.zoningCode ?? null,
        floodZone: parcel.floodZone ?? null,
        note: tracked?.note ?? existingParcel?.note ?? null,
        task: tracked?.task ?? existingParcel?.task ?? null,
        status: tracked?.status ?? existingParcel?.status ?? "to_analyze",
        selected:
          input.selectedParcelIds?.includes(parcel.parcelId) ??
          existingSelectedParcelIds.includes(parcel.parcelId) ??
          true,
      };
    });

    return {
      selectedParcelIds:
        input.selectedParcelIds ??
        existingSelectedParcelIds ??
        parcels.filter((parcel) => parcel.selected).map((parcel) => parcel.parcelId),
      polygonCoordinates:
        input.polygonCoordinates === undefined
          ? parsePolygonCoordinates(existing?.polygon)
          : input.polygonCoordinates,
      overlayState:
        input.overlays ?? parseOverlaySelections(existing?.overlayState),
      aiOutputs: (input.aiOutputs ?? parseAiOutputs(existing?.aiOutputs)).map((output) => ({
        id: output.id ?? randomUUID(),
        title: output.title,
        createdAt: output.createdAt ?? new Date().toISOString(),
        summary: output.summary,
        payload: output.payload,
      })),
      marketState: input.marketState ?? parseMarketOverlayState(existing?.marketState),
      parcels,
      comps:
        input.compSnapshots ??
        existing?.comps.map((comp) => ({
          id: comp.id,
          address: comp.address,
          landUse: comp.landUseFilter ?? comp.useType ?? null,
          saleDate: comp.saleDate?.toISOString().slice(0, 10) ?? null,
          salePrice: decimalToNumber(comp.salePrice),
          acreage: decimalToNumber(comp.acreage),
          pricePerAcre: decimalToNumber(comp.pricePerAcre),
          distanceMiles: null as number | null,
          adjustmentNotes: parseAdjustmentNotes(comp.adjustmentNotes),
          adjustedPricePerAcre: decimalToNumber(comp.adjustedPricePerAcre),
          weightedScore: decimalToNumber(comp.recencyWeight),
        })) ??
        [],
    };
  }

  private async replaceParcels(
    tx: Prisma.TransactionClient,
    orgId: string,
    workspaceId: string,
    parcels: Array<{
      parcelId: string;
      address: string;
      owner: string | null;
      acreage: number | null;
      lat: number | null;
      lng: number | null;
      currentZoning: string | null;
      floodZone: string | null;
      note: string | null;
      task: string | null;
      status: string | null;
      selected: boolean;
    }>,
  ) {
    await tx.mapWorkspaceParcel.deleteMany({ where: { workspaceId, orgId } });
    if (parcels.length === 0) return;
    await tx.mapWorkspaceParcel.createMany({
      data: parcels.map((parcel) => ({
        workspaceId,
        orgId,
        parcelId: parcel.parcelId,
        address: parcel.address,
        owner: parcel.owner,
        acreage: toDecimal(parcel.acreage),
        lat: toDecimal(parcel.lat),
        lng: toDecimal(parcel.lng),
        currentZoning: parcel.currentZoning,
        floodZone: parcel.floodZone,
        note: parcel.note,
        task: parcel.task,
        status: parcel.status,
        selected: parcel.selected,
      })),
    });
  }

  private async replaceComps(
    tx: Prisma.TransactionClient,
    orgId: string,
    workspaceId: string,
    comps: z.infer<typeof CompSnapshotInputSchema>[],
  ) {
    await tx.mapWorkspaceComp.deleteMany({ where: { workspaceId, orgId } });
    if (comps.length === 0) return;
    await tx.mapWorkspaceComp.createMany({
      data: comps.map((comp) => ({
        id: comp.id ?? undefined,
        workspaceId,
        orgId,
        address: comp.address,
        useType: comp.landUse ?? null,
        landUseFilter: comp.landUse ?? null,
        saleDate: comp.saleDate ? new Date(comp.saleDate) : null,
        salePrice: toDecimal(comp.salePrice ?? null),
        acreage: toDecimal(comp.acreage ?? null),
        pricePerAcre: toDecimal(comp.pricePerAcre ?? null),
        pricePerSf:
          comp.salePrice && comp.acreage
            ? comp.salePrice / (comp.acreage * 43_560)
            : null,
        recencyWeight: toDecimal(comp.weightedScore ?? null),
        adjustmentFactor:
          comp.adjustedPricePerAcre && comp.pricePerAcre && comp.pricePerAcre !== 0
            ? comp.adjustedPricePerAcre / comp.pricePerAcre
            : null,
        adjustedPricePerAcre: toDecimal(comp.adjustedPricePerAcre ?? null),
        adjustmentNotes: toInputJson(comp.adjustmentNotes),
        exportGroup: null,
        selected: true,
      })),
    });
  }

  private getSelectedParcels(workspace: WorkspaceWithRelations) {
    const selectedIds = new Set(readSelectedParcelIds(workspace.selectedParcelIds));
    const selected = workspace.parcels.filter(
      (parcel) => parcel.selected || selectedIds.has(parcel.parcelId),
    );
    return selected.length > 0 ? selected : workspace.parcels;
  }

  private buildOwnerRollups(workspace: WorkspaceWithRelations) {
    const contactMap = new Map<string, WorkspaceWithRelations["contacts"][number][]>();
    for (const contact of workspace.contacts) {
      const bucket = contactMap.get(contact.ownerName) ?? [];
      bucket.push(contact);
      contactMap.set(contact.ownerName, bucket);
    }

    const parcelGroups = new Map<string, WorkspaceWithRelations["parcels"]>();
    for (const parcel of this.getSelectedParcels(workspace)) {
      const ownerName = parcel.owner?.trim() || "Unknown owner";
      const bucket = parcelGroups.get(ownerName) ?? [];
      bucket.push(parcel);
      parcelGroups.set(ownerName, bucket);
    }

    return Array.from(parcelGroups.entries())
      .map(([ownerName, parcels]) => {
        const contacts = contactMap.get(ownerName) ?? [];
        return {
          ownerName,
          parcelIds: parcels.map((parcel) => parcel.parcelId),
          mailingAddress:
            contacts.find((contact) => contact.mailingAddress)?.mailingAddress ?? null,
          portfolioCount: parsePortfolioCount(contacts),
          combinedAcreage: roundNumber(
            sumNumbers(parcels.map((parcel) => decimalToNumber(parcel.acreage) ?? 0)),
            4,
          ),
          contactCompleteness:
            contacts.length > 0 ? "available" : ownerName === "Unknown owner" ? "unavailable" : "fallback",
        } as const;
      })
      .sort((left, right) => right.combinedAcreage - left.combinedAcreage);
  }

  private buildAssemblageContract(workspace: WorkspaceWithRelations) {
    const parcels = this.getSelectedParcels(workspace);
    const nodes = parcels.map((parcel) => ({
      parcelId: parcel.parcelId,
      ownerName: parcel.owner ?? null,
      acreage: decimalToNumber(parcel.acreage),
      lat: decimalToNumber(parcel.lat),
      lng: decimalToNumber(parcel.lng),
    }));
    const edges = buildAdjacencyEdges(nodes);
    const ownerClusters = this.buildOwnerRollups(workspace);
    return {
      availability:
        parcels.length === 0 ? "unavailable" : edges.length === 0 ? "fallback" : "available",
      adjacencySource: edges.length === 0 ? "none" : "heuristic_distance",
      totalSelectedParcels: parcels.length,
      combinedAcreage: roundNumber(sumNumbers(nodes.map((node) => node.acreage ?? 0)), 4),
      ownerClusters,
      graph: { nodes, edges },
      suggestions: buildAssemblageSuggestions(ownerClusters, nodes),
      generatedAt: new Date().toISOString(),
      fallbackReason:
        parcels.length === 0
          ? "No selected parcels are stored in this workspace yet."
          : edges.length === 0
            ? "Adjacency is using a heuristic distance model and no parcel coordinates are close enough to form a graph."
            : null,
    };
  }

  private buildOwnershipContract(workspace: WorkspaceWithRelations) {
    const owners = this.buildOwnerRollups(workspace);
    const outreachLogs = workspace.outreachLogs.map((log) => ({
      id: log.id,
      workspaceId: log.workspaceId,
      ownerName: log.contact?.ownerName ?? "Unknown owner",
      contactName: log.contact?.entityName ?? null,
      channel: parseOutreachChannel(log.channel),
      status: parseOutreachStatus(log.status),
      notes: log.notes ?? log.summary ?? null,
      nextContactAt: log.nextContactAt?.toISOString() ?? null,
      createdAt: log.createdAt.toISOString(),
    }));
    const provider = workspace.contacts
      .map((contact) => parseSkipTraceProvider(contact.skipTraceState))
      .find((value) => value !== null);

    return {
      workspaceId: workspace.id,
      availability:
        workspace.contacts.length > 0 ? "available" : owners.length > 0 ? "fallback" : "unavailable",
      owners,
      outreachLogs,
      skipTraceHook: {
        status: provider ? "available" : owners.length > 0 ? "fallback" : "unavailable",
        provider,
        message: provider
          ? `Skip-trace provider ${provider} is attached to at least one owner record.`
          : owners.length > 0
            ? "Owner rollups are ready, but no live skip-trace provider is attached yet."
            : "No owner records are stored in this workspace yet.",
      },
      generatedAt: new Date().toISOString(),
      fallbackReason:
        workspace.contacts.length === 0 && owners.length > 0
          ? "Owner rollups are derived from tracked parcels because no contact records are stored yet."
          : owners.length === 0
            ? "No owner records are available for this workspace."
            : null,
    };
  }

  private buildCompContract(workspace: WorkspaceWithRelations, query: CompQuery) {
    const filters = MapWorkspaceCompQuerySchema.parse(query);
    const comps = workspace.comps
      .map((comp) => ({
        id: comp.id,
        address: comp.address,
        landUse: comp.landUseFilter ?? comp.useType ?? null,
        saleDate: comp.saleDate?.toISOString().slice(0, 10) ?? null,
        salePrice: decimalToNumber(comp.salePrice),
        acreage: decimalToNumber(comp.acreage),
        pricePerAcre: decimalToNumber(comp.pricePerAcre),
        distanceMiles: null as number | null,
        adjustmentNotes: parseAdjustmentNotes(comp.adjustmentNotes),
        adjustedPricePerAcre: decimalToNumber(comp.adjustedPricePerAcre),
        weightedScore: decimalToNumber(comp.recencyWeight),
      }))
      .filter((comp) => {
        const matchesLandUse =
          !filters.landUse || comp.landUse?.toLowerCase() === filters.landUse.toLowerCase();
        const matchesAge =
          !filters.maxAgeMonths ||
          !comp.saleDate ||
          monthsSince(comp.saleDate) <= filters.maxAgeMonths;
        return matchesLandUse && matchesAge;
      });

    const prices = comps
      .map((comp) => comp.adjustedPricePerAcre ?? comp.pricePerAcre)
      .filter((value): value is number => value !== null);
    const weighted = weightedAverage(
      comps
        .map((comp) => ({
          value: comp.adjustedPricePerAcre ?? comp.pricePerAcre,
          weight: comp.weightedScore ?? 1,
        }))
        .filter((entry): entry is { value: number; weight: number } => entry.value !== null),
    );

    return {
      workspaceId: workspace.id,
      availability: comps.length > 0 ? "available" : workspace.comps.length > 0 ? "fallback" : "unavailable",
      filters: {
        landUse: filters.landUse ?? null,
        maxAgeMonths: filters.maxAgeMonths ?? null,
      },
      summary: {
        compCount: comps.length,
        medianPricePerAcre: median(prices),
        weightedPricePerAcre: weighted,
      },
      exportColumns: [
        "address",
        "landUse",
        "saleDate",
        "salePrice",
        "acreage",
        "pricePerAcre",
        "adjustedPricePerAcre",
        "weightedScore",
      ],
      comps,
      underwritingHandoff: {
        status: weighted == null ? "fallback" : "available",
        assumptions: {
          weightedPricePerAcre: weighted,
          medianPricePerAcre: median(prices),
          compCount: comps.length,
          landUse: filters.landUse ?? null,
        },
        message:
          weighted == null
            ? "No weighted comp basis is available yet. Persist comp snapshots to enable underwriting handoff."
            : "Weighted comp basis is available for underwriting assumptions.",
      },
      generatedAt: new Date().toISOString(),
      fallbackReason:
        comps.length === 0 && workspace.comps.length > 0
          ? "Stored comps exist, but none match the current comp filters."
          : workspace.comps.length === 0
            ? "No comp snapshots are stored in this workspace yet."
            : null,
    };
  }

  private buildMarketOverlayContract(workspace: WorkspaceWithRelations) {
    const selectionMap = new Map(
      parseOverlaySelections(workspace.overlayState).map((overlay) => [overlay.key, overlay]),
    );
    const stateMap = new Map(
      parseMarketOverlayState(workspace.marketState).map((overlay) => [overlay.key, overlay]),
    );
    return {
      workspaceId: workspace.id,
      generatedAt: new Date().toISOString(),
      overlays: MARKET_OVERLAYS.map((definition) => {
        const selection = selectionMap.get(definition.key);
        const stored = stateMap.get(definition.key);
        return {
          key: definition.key,
          label: definition.label,
          status: stored?.status ?? (selection?.enabled ? selection.status : "fallback"),
          source: stored?.source ?? null,
          summary:
            stored?.summary ??
            (selection?.enabled
              ? "Overlay is selected, but no live market source is attached yet."
              : "Overlay is available for activation in this workspace."),
          details: {
            enabled: selection?.enabled ?? false,
            ...(stored?.details ?? {}),
          },
        };
      }),
    };
  }

  private toWorkspaceRecord(workspace: WorkspaceWithRelations) {
    return {
      id: workspace.id,
      orgId: workspace.orgId,
      dealId: workspace.dealId ?? null,
      name: workspace.name,
      summary: workspace.summary ?? null,
      status: WorkspaceStatusSchema.catch("active").parse(workspace.status),
      parcelCount: workspace.parcels.length,
      selectedParcelIds: readSelectedParcelIds(workspace.selectedParcelIds),
      polygonCoordinates: parsePolygonCoordinates(workspace.polygon),
      notes: workspace.notes ?? null,
      parcels: workspace.parcels.map((parcel) => ({
        parcelId: parcel.parcelId,
        address: parcel.address,
        ownerName: parcel.owner ?? null,
        mailingAddress: null,
        acreage: decimalToNumber(parcel.acreage),
        zoningCode: parcel.currentZoning ?? null,
        floodZone: parcel.floodZone ?? null,
        lat: decimalToNumber(parcel.lat),
        lng: decimalToNumber(parcel.lng),
        metadata: {},
      })),
      trackedParcels: workspace.parcels.map((parcel) => ({
        parcelId: parcel.parcelId,
        status: ParcelTrackedStatusSchema.catch("to_analyze").parse(
          parcel.status ?? "to_analyze",
        ),
        task: parcel.task ?? null,
        note: parcel.note ?? null,
        updatedAt: parcel.updatedAt.toISOString(),
      })),
      compSnapshots: workspace.comps.map((comp) => ({
        id: comp.id,
        address: comp.address,
        landUse: comp.landUseFilter ?? comp.useType ?? null,
        saleDate: comp.saleDate?.toISOString().slice(0, 10) ?? null,
        salePrice: decimalToNumber(comp.salePrice),
        acreage: decimalToNumber(comp.acreage),
        pricePerAcre: decimalToNumber(comp.pricePerAcre),
        distanceMiles: null as number | null,
        adjustmentNotes: parseAdjustmentNotes(comp.adjustmentNotes),
        adjustedPricePerAcre: decimalToNumber(comp.adjustedPricePerAcre),
        weightedScore: decimalToNumber(comp.recencyWeight),
      })),
      aiOutputs: parseAiOutputs(workspace.aiOutputs),
      overlays: parseOverlaySelections(workspace.overlayState),
      createdBy: workspace.createdBy,
      updatedBy: workspace.updatedBy ?? workspace.createdBy,
      createdAt: workspace.createdAt.toISOString(),
      updatedAt: workspace.updatedAt.toISOString(),
    };
  }
}

function scoreWorkspace(workspace: WorkspaceWithRelations, context: MapWorkspaceContext): number {
  const selectedIds = new Set(readSelectedParcelIds(workspace.selectedParcelIds));
  const parcelIds = new Set(workspace.parcels.map((parcel) => parcel.parcelId));
  const overlap = context.parcelIds.reduce(
    (count, parcelId) => count + (selectedIds.has(parcelId) || parcelIds.has(parcelId) ? 1 : 0),
    0,
  );
  const polygonScore = context.polygon && workspace.polygon ? 1 : 0;
  return overlap * 10 + polygonScore;
}
