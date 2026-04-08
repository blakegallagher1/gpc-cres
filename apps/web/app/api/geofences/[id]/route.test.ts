import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  deleteGeofenceMock,
  GeofenceNotFoundErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  deleteGeofenceMock: vi.fn(),
  GeofenceNotFoundErrorMock: class GeofenceNotFoundError extends Error {},
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  deleteGeofence: deleteGeofenceMock,
  GeofenceNotFoundError: GeofenceNotFoundErrorMock,
}));

import { DELETE } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const GEOFENCE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("DELETE /api/geofences/[id]", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    deleteGeofenceMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const req = new NextRequest(`http://localhost/api/geofences/${GEOFENCE_ID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: GEOFENCE_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(deleteGeofenceMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the geofence is not found for org", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    deleteGeofenceMock.mockRejectedValue(new GeofenceNotFoundErrorMock("Geofence not found"));

    const req = new NextRequest(`http://localhost/api/geofences/${GEOFENCE_ID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: GEOFENCE_ID }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Not found" });
    expect(deleteGeofenceMock).toHaveBeenCalledTimes(1);
  });

  it("returns ok when geofence is deleted", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    deleteGeofenceMock.mockResolvedValue(undefined);

    const req = new NextRequest(`http://localhost/api/geofences/${GEOFENCE_ID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: GEOFENCE_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(deleteGeofenceMock).toHaveBeenCalledTimes(1);
  });
});
