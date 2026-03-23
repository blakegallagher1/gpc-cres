import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  ParcelSetService,
  deserializeParcelSetDefinition,
  deserializeParcelSetMaterialization,
  resetParcelSetStore,
  serializeParcelSetDefinition,
  serializeParcelSetMaterialization,
} from "@gpc/server/services/parcel-set.service";

describe("ParcelSetService", () => {
  const service = new ParcelSetService();

  beforeEach(() => {
    resetParcelSetStore();
  });

  it("creates and retrieves a selection parcel set with an implicit materialization", async () => {
    const created = await service.createParcelSet({
      orgId: "org-1",
      label: "Focused site shortlist",
      origin: {
        kind: "selection",
        parcelIds: ["parcel-1", "parcel-2"],
        source: "map",
      },
      metadata: {
        workflow: "map-chat",
      },
    });

    expect(created.definition.orgId).toBe("org-1");
    expect(created.definition.label).toBe("Focused site shortlist");
    expect(created.materialization?.memberIds).toEqual(["parcel-1", "parcel-2"]);
    expect(created.materialization?.count).toBe(2);

    const retrieved = await service.getParcelSetById("org-1", created.definition.id);

    expect(retrieved).toEqual(created);
  });

  it("rejects invalid viewport bounds", async () => {
    await expect(
      service.createParcelSet({
        orgId: "org-1",
        origin: {
          kind: "viewport",
          spatial: {
            kind: "bbox",
            bounds: [-91.1, 30.5, -91.2, 30.4],
          },
        },
      }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("rejects invalid polygon geometry", async () => {
    await expect(
      service.createParcelSet({
        orgId: "org-1",
        origin: {
          kind: "spatial",
          spatial: {
            kind: "polygon",
            coordinates: [[
              [-91.2, 30.4],
              [-91.1, 30.4],
              [-91.1, 30.5],
              [-91.2, 30.5],
            ]],
          },
        },
      }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("enforces org scoping on retrieval", async () => {
    const created = await service.createParcelSet({
      orgId: "org-1",
      origin: {
        kind: "selection",
        parcelIds: ["parcel-1"],
        source: "agent",
      },
    });

    const retrieved = await service.getParcelSetById("org-2", created.definition.id);

    expect(retrieved).toBeNull();
  });

  it("round-trips serialized definitions and materializations", () => {
    const definition = service.createDefinition({
      orgId: "org-1",
      id: "set-1",
      label: "Persistent shortlist",
      origin: {
        kind: "selection",
        parcelIds: ["parcel-1"],
        source: "deal",
      },
      lifecycle: {
        kind: "persistent",
        persistedId: "saved-set-1",
      },
      createdAt: "2026-03-23T06:00:00.000Z",
      metadata: {
        owner: "test",
      },
      status: "materialized",
    });

    const materialization = service.createMaterialization(definition, {
      memberIds: ["parcel-1"],
      facts: [
        {
          parcelId: "parcel-1",
          address: "123 Main St",
          owner: "Owner",
          acres: 2.5,
          zoningType: "C2",
          center: [-91.1871, 30.4515],
          parish: "East Baton Rouge",
          assessedValue: 450000,
        },
      ],
      provenance: {
        sourceKind: "database",
        authoritative: true,
        freshness: "fresh",
        resolvedAt: "2026-03-23T06:05:00.000Z",
      },
      materializedAt: "2026-03-23T06:05:00.000Z",
    });

    expect(deserializeParcelSetDefinition(serializeParcelSetDefinition(definition))).toEqual(
      definition,
    );
    expect(
      deserializeParcelSetMaterialization(serializeParcelSetMaterialization(materialization)),
    ).toEqual(materialization);
  });
});
