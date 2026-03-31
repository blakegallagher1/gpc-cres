"use client";

import {
  Building2,
  Compass,
  GitMerge,
  Layers3,
  Mail,
  RadioTower,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  MapAssemblageSnapshot,
  MapCompsSnapshot,
  MapMarketOverlaySnapshot,
  MapOwnershipSnapshot,
  MapWorkspaceSnapshot,
} from "./mapInvestorWorkbench.types";
import {
  holdoutRiskStatusKind,
  overlayAvailabilityClasses,
  SectionFrame,
  SectionLabel,
  statusClasses,
} from "./mapInvestorPanelPrimitives";

type MapInvestorPanelsProps = {
  workspace: MapWorkspaceSnapshot;
  assemblage: MapAssemblageSnapshot;
  ownership: MapOwnershipSnapshot;
  comps: MapCompsSnapshot;
  marketOverlays: MapMarketOverlaySnapshot;
};

export function MapInvestorPanels({
  workspace,
  assemblage,
  ownership,
  comps,
  marketOverlays,
}: MapInvestorPanelsProps) {
  return (
    <div className="space-y-5">
      <SectionLabel>Workspace</SectionLabel>
      <SectionFrame
        icon={<Building2 className="h-4 w-4" />}
        title={workspace.name}
        description="Org-scoped workspace shell for parcel selections, geofences, notes, comp snapshots, and AI outputs."
        status={workspace.status}
      >
        <div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-3">
          <div className="rounded-lg border border-map-border bg-map-surface px-2.5 py-2">
            <div className="map-stat-label">Selected</div>
            <div className="map-stat-value">{workspace.selectedCount}</div>
          </div>
          <div className="rounded-lg border border-map-border bg-map-surface px-2.5 py-2">
            <div className="map-stat-label">Tracked</div>
            <div className="map-stat-value">{workspace.trackedCount}</div>
          </div>
          <div className="rounded-lg border border-map-border bg-map-surface px-2.5 py-2">
            <div className="map-stat-label">Geofences</div>
            <div className="map-stat-value">{workspace.geofenceCount}</div>
          </div>
          <div className="rounded-lg border border-map-border bg-map-surface px-2.5 py-2">
            <div className="map-stat-label">Notes</div>
            <div className="map-stat-value">{workspace.noteCount}</div>
          </div>
          <div className="rounded-lg border border-map-border bg-map-surface px-2.5 py-2">
            <div className="map-stat-label">Tasks</div>
            <div className="map-stat-value">{workspace.taskCount}</div>
          </div>
          <div className="rounded-lg border border-map-border bg-map-surface px-2.5 py-2">
            <div className="map-stat-label">AI outputs</div>
            <div className="map-stat-value">{workspace.aiInsightCount}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
            Record {workspace.recordId ?? "pending"}
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
            Last touch {workspace.lastUpdatedLabel}
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
            Comp snapshots {workspace.compCount}
          </Badge>
        </div>
      </SectionFrame>

      <SectionLabel>Assemblage</SectionLabel>
      <SectionFrame
        icon={<GitMerge className="h-4 w-4" />}
        title="Assemblage analysis"
        description="Adjacency, owner concentration, combined acreage, and holdout pressure."
        status={assemblage.status}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-map-border bg-map-surface px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-map-text-muted">Best candidate</p>
            {assemblage.bestCandidate ? (
              <div className="mt-2 space-y-2">
                <p className="text-[11px] font-medium text-map-text-primary">
                  {assemblage.bestCandidate.label}
                </p>
                <p className="text-[10px] leading-5 text-map-text-secondary">
                  {assemblage.bestCandidate.parcelCount} parcels ·{" "}
                  {assemblage.bestCandidate.combinedAcreage != null
                    ? `${assemblage.bestCandidate.combinedAcreage.toFixed(2)} ac`
                    : "Acreage pending"}
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    "px-2 py-0.5 text-[9px]",
                    statusClasses({
                      ...assemblage.status,
                      kind: holdoutRiskStatusKind(assemblage.bestCandidate.holdoutRisk),
                    }),
                  )}
                >
                  Holdout risk {assemblage.bestCandidate.holdoutRisk}
                </Badge>
                <div className="space-y-1">
                  {assemblage.bestCandidate.rationale.map((item) => (
                    <p key={item} className="text-[10px] leading-5 text-map-text-muted">
                      {item}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[10px] leading-5 text-map-text-muted">
                No assemblage candidate yet.
              </p>
            )}
          </div>
          <div className="rounded-lg border border-map-border bg-map-surface px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-map-text-muted">Signals</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <div className="map-stat-label">Adjacency</div>
                <div className="map-stat-value">{assemblage.adjacencyEdgeCount}</div>
              </div>
              <div>
                <div className="map-stat-label">Owner groups</div>
                <div className="map-stat-value">{assemblage.ownerGroups.length}</div>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              {assemblage.ownerGroups.length > 0 ? (
                assemblage.ownerGroups.slice(0, 4).map((group) => (
                  <div
                    key={group.ownerName}
                    className="flex items-center justify-between gap-2 rounded-md border border-map-border/80 px-2 py-1.5 text-[10px]"
                  >
                    <span className="truncate text-map-text-secondary">{group.ownerName}</span>
                    <span className="shrink-0 text-map-text-primary">
                      {group.parcelCount} ·{" "}
                      {group.combinedAcreage != null
                        ? `${group.combinedAcreage.toFixed(2)} ac`
                        : "Acreage pending"}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[10px] leading-5 text-map-text-muted">
                  Owner grouping appears here once the parcel set is large enough.
                </p>
              )}
            </div>
          </div>
        </div>
      </SectionFrame>

      <SectionLabel>Ownership</SectionLabel>
      <SectionFrame
        icon={<Mail className="h-4 w-4" />}
        title="Ownership and outreach"
        description="Owner rollup, broker notes, skip-trace status, contact history, and next-touch tasks."
        status={ownership.status}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
              Owners {ownership.ownerRollup.length}
            </Badge>
            <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
              Skip trace {ownership.skipTraceStatus}
            </Badge>
            {ownership.nextContactTask ? (
              <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
                Next task {ownership.nextContactTask}
              </Badge>
            ) : null}
          </div>
          <div className="space-y-1.5">
            {ownership.ownerRollup.length > 0 ? (
              ownership.ownerRollup.map((owner) => (
                <div
                  key={owner.ownerName}
                  className="rounded-lg border border-map-border bg-map-surface px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-map-text-primary">
                      {owner.ownerName}
                    </p>
                    <p className="text-[10px] text-map-text-secondary">
                      {owner.parcelCount} parcels
                    </p>
                  </div>
                  <p className="mt-1 text-[10px] leading-5 text-map-text-muted">
                    {owner.mailingAddress ?? "Mailing address pending"} ·{" "}
                    {owner.portfolioContext ?? "Portfolio context pending"}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-map-border bg-map-surface/30 px-3 py-3 text-[10px] leading-5 text-map-text-muted">
                Ownership records will populate once the workspace carries parcel context.
              </div>
            )}
          </div>
          {ownership.brokerNotes.length > 0 ? (
            <div className="rounded-lg border border-map-border bg-map-surface px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-map-text-muted">Broker notes</p>
              <div className="mt-2 space-y-1.5">
                {ownership.brokerNotes.map((note) => (
                  <p key={note} className="text-[10px] leading-5 text-map-text-secondary">
                    {note}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </SectionFrame>

      <SectionLabel>Comps</SectionLabel>
      <SectionFrame
        icon={<Compass className="h-4 w-4" />}
        title="Enhanced comp intelligence"
        description="Land-use filter stack, recency weighting, adjustment summary, and underwriting tie-in."
        status={comps.status}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {comps.filterSummary.map((item) => (
              <Badge key={item} variant="outline" className="px-2 py-0.5 text-[9px]">
                {item}
              </Badge>
            ))}
          </div>
          {comps.underwritingSummary.length > 0 ? (
            <div className="rounded-lg border border-map-border bg-map-surface px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-map-text-muted">Underwriting tie-in</p>
              <div className="mt-2 space-y-1.5">
                {comps.underwritingSummary.map((item) => (
                  <p key={item} className="text-[10px] leading-5 text-map-text-secondary">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-3">
            {comps.adjustments.map((adjustment) => (
              <div
                key={adjustment.label}
                className="rounded-lg border border-map-border bg-map-surface px-2.5 py-2"
              >
                <div className="map-stat-label">{adjustment.label}</div>
                <div className="mt-1 text-[10px] text-map-text-primary">{adjustment.value}</div>
              </div>
            ))}
          </div>
          {comps.rows.length > 0 ? (
            <div className="space-y-1.5">
              {comps.rows.map((row) => (
                <div
                  key={row.id}
                  className="grid gap-2 rounded-lg border border-map-border bg-map-surface px-3 py-2 text-[10px] text-map-text-secondary sm:grid-cols-[1.3fr_0.7fr_0.7fr]"
                >
                  <div>
                    <p className="font-medium text-map-text-primary">{row.address}</p>
                    <p className="mt-1">{row.landUse}</p>
                  </div>
                  <div>
                    <p>{row.saleDateLabel}</p>
                    <p className="mt-1">{row.distanceLabel}</p>
                  </div>
                  <div>
                    <p>{row.priceLabel}</p>
                    <p className="mt-1">{row.adjustedPriceLabel}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-map-border bg-map-surface/30 px-3 py-3 text-[10px] leading-5 text-map-text-muted">
              Adjusted comp rows will render here once the enhanced comps contract is available.
            </div>
          )}
        </div>
      </SectionFrame>

      <SectionLabel>Market overlays</SectionLabel>
      <SectionFrame
        icon={<Layers3 className="h-4 w-4" />}
        title="Developer market overlays"
        description="Permits, deliveries, growth, traffic, utilities, flood history, slope, and access context."
        status={marketOverlays.status}
      >
        <div className="space-y-1.5">
          {marketOverlays.cards.length > 0 ? (
            marketOverlays.cards.map((card) => (
              <div
                key={card.id}
                className="rounded-lg border border-map-border bg-map-surface px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <RadioTower className="h-3.5 w-3.5 text-map-text-muted" />
                    <p className="text-[11px] font-medium text-map-text-primary">{card.label}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {card.active ? (
                      <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
                        active
                      </Badge>
                    ) : null}
                    <Badge
                      variant="outline"
                      className={cn("px-2 py-0.5 text-[9px]", overlayAvailabilityClasses(card.availability))}
                    >
                      {card.availability}
                    </Badge>
                  </div>
                </div>
                <p className="mt-1.5 text-[10px] leading-5 text-map-text-muted">{card.detail}</p>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-map-border bg-map-surface/30 px-3 py-3 text-[10px] leading-5 text-map-text-muted">
              Overlay cards appear here once the workspace has parcel or polygon context.
            </div>
          )}
        </div>
      </SectionFrame>
    </div>
  );
}
