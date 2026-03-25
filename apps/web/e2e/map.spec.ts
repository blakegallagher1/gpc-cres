import { expect, test } from "@playwright/test";
import { ensureCopilotClosed } from "./_helpers/ui";

const BASE_PARCEL = {
  id: "parcel-1",
  address: "123 Main St",
  lat: 30.45,
  lng: -91.18,
  acreage: 1.5,
  floodZone: "X",
  zoning: "C2",
  propertyDbId: "parcel-1",
};

const PROSPECT_RESPONSE = {
  parcels: [BASE_PARCEL],
  total: 1,
};
const MAP_READY_TIMEOUT_MS = 20_000;

function geometryResponse() {
  return {
    ok: true,
    data: {
      geom_simplified: {
        type: "Polygon",
        coordinates: [[
          [-91.1804, 30.4496],
          [-91.1796, 30.4496],
          [-91.1796, 30.4504],
          [-91.1804, 30.4504],
          [-91.1804, 30.4496],
        ]],
      },
      bbox: [-91.1804, 30.4496, -91.1796, 30.4504],
      area_sqft: 43560,
    },
  };
}

async function mockMapData(page: import("@playwright/test").Page) {
  await page.route("**/api/parcels?hasCoords=true", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        parcels: [
          {
            id: "parcel-1",
            address: "123 Main St",
            lat: 30.45,
            lng: -91.18,
            acreage: 1.5,
            floodZone: "X",
            currentZoning: "C2",
            propertyDbId: "parcel-1",
            geometryLookupKey: "parcel-1",
            deal: null,
          },
        ],
        source: "org",
      }),
    });
  });

  await page.route("**/api/map/prospect", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PROSPECT_RESPONSE),
    });
  });

  await page.route("**/api/parcels/parcel-1/geometry?detail_level=low", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(geometryResponse()),
    });
  });
}

test.describe("Map route", () => {
  test("routes parcel popup actions through React-managed buttons", async ({ page }) => {
    await mockMapData(page);

    await page.goto("/map?lat=30.45&lng=-91.18&z=17", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);

    await expect(
      page.getByRole("heading", { name: "Search and refine the working parcel set." }),
    ).toBeVisible({ timeout: MAP_READY_TIMEOUT_MS });

    const canvas = page.locator(".maplibregl-canvas");
    await expect(canvas).toBeVisible({ timeout: MAP_READY_TIMEOUT_MS });
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2);
    await expect(page.getByRole("button", { name: "Triage" })).toBeVisible();

    await Promise.all([
      page.waitForURL(/\/deals\/new\?parcelId=parcel-1&step=triage/),
      page.getByRole("button", { name: "Triage" }).click(),
    ]);
  });

  test("refreshes viewport parcels after the map moves", async ({ page }) => {
    const prospectBodies: string[] = [];
    await mockMapData(page);

    page.on("request", (request) => {
      if (request.url().includes("/api/map/prospect") && request.method() === "POST") {
        prospectBodies.push(request.postData() ?? "");
      }
    });

    await page.goto("/map?lat=30.45&lng=-91.18&z=17", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);

    await expect(
      page.getByRole("heading", { name: "Search and refine the working parcel set." }),
    ).toBeVisible({ timeout: MAP_READY_TIMEOUT_MS });

    const canvas = page.locator(".maplibregl-canvas");
    await expect(canvas).toBeVisible({ timeout: MAP_READY_TIMEOUT_MS });
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await expect.poll(() => prospectBodies.length).toBeGreaterThan(0);

    const centerX = (box?.x ?? 0) + (box?.width ?? 0) / 2;
    const centerY = (box?.y ?? 0) + (box?.height ?? 0) / 2;

    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 140, centerY, { steps: 12 });
    await page.mouse.up();

    await expect.poll(() => prospectBodies.length).toBeGreaterThan(1);
    expect(prospectBodies.at(-1)).toContain("\"polygon\"");
    expect(prospectBodies.at(-1)).toContain("\"searchText\":\"*\"");
  });
});
