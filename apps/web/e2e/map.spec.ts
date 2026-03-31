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
const SEARCH_PARCEL = {
  id: "parcel-3154",
  address: "3154 College Drive",
  lat: 30.4125,
  lng: -91.1412,
  acreage: 0.9,
  floodZone: "AE",
  zoning: "C1",
  propertyDbId: "parcel-3154",
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
  await page.route("**/api/parcels?**", async (route) => {
    const url = new URL(route.request().url());
    const search = url.searchParams.get("search");

    if (search) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          parcels: [
            {
              id: SEARCH_PARCEL.id,
              address: SEARCH_PARCEL.address,
              lat: SEARCH_PARCEL.lat,
              lng: SEARCH_PARCEL.lng,
              acreage: SEARCH_PARCEL.acreage,
              floodZone: SEARCH_PARCEL.floodZone,
              currentZoning: SEARCH_PARCEL.zoning,
              propertyDbId: SEARCH_PARCEL.propertyDbId,
              geometryLookupKey: SEARCH_PARCEL.propertyDbId,
              deal: null,
            },
          ],
          source: "org",
        }),
      });
      return;
    }

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

  await page.route("**/api/parcels/suggest?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        suggestions: [
          {
            id: SEARCH_PARCEL.id,
            address: SEARCH_PARCEL.address,
            lat: SEARCH_PARCEL.lat,
            lng: SEARCH_PARCEL.lng,
            propertyDbId: SEARCH_PARCEL.propertyDbId,
          },
        ],
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

  await page.route("**/api/parcels/parcel-3154/geometry?detail_level=low", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          geom_simplified: {
            type: "Polygon",
            coordinates: [[
              [-91.1416, 30.4121],
              [-91.1408, 30.4121],
              [-91.1408, 30.4129],
              [-91.1416, 30.4129],
              [-91.1416, 30.4121],
            ]],
          },
          bbox: [-91.1416, 30.4121, -91.1408, 30.4129],
          area_sqft: 39204,
        },
      }),
    });
  });
}

test.describe("Map route", () => {
  test("routes parcel popup actions through React-managed buttons", async ({ page }) => {
    await mockMapData(page);

    await page.goto("/map?lat=30.45&lng=-91.18&z=17", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);

    await expect(page.getByRole("button", { name: "Open map workbench" })).toBeVisible({
      timeout: MAP_READY_TIMEOUT_MS,
    });

    const canvas = page.locator(".maplibregl-canvas");
    await expect(canvas).toBeVisible({ timeout: MAP_READY_TIMEOUT_MS });
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.click(
      (box?.x ?? 0) + (box?.width ?? 0) / 2,
      (box?.y ?? 0) + (box?.height ?? 0) / 2,
    );
    const parcelCard = page.getByRole("dialog", { name: /123 Main St details/i });
    await expect(parcelCard).toBeVisible();
    await parcelCard.getByRole("tab", { name: "Deals" }).click();
    await expect(parcelCard.getByRole("button", { name: "Create Deal" })).toBeVisible();

    await Promise.all([
      page.waitForURL(/\/deals\/new\?parcelId=parcel-1/),
      parcelCard.getByRole("button", { name: "Create Deal" }).click(),
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

    await expect(page.getByRole("button", { name: "Open map workbench" })).toBeVisible({
      timeout: MAP_READY_TIMEOUT_MS,
    });

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

  test("keeps parcel lookup separate from map copilot analysis", async ({
    page,
  }) => {
    await mockMapData(page);

    await page.goto("/map?lat=30.45&lng=-91.18&z=17", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);

    await expect(page.locator('[data-route-id="map"]')).toHaveAttribute("data-route-path", "/map");
    const geocoderInput = page.getByPlaceholder("Search address, parcel, or owner");
    await expect(geocoderInput).toBeVisible({ timeout: MAP_READY_TIMEOUT_MS });
    const mapCopilotButton = page.getByRole("button", { name: "Map copilot" });
    if (!(await mapCopilotButton.isVisible().catch(() => false))) {
      const openConsoleButton = page.getByRole("button", { name: "Open console" });
      await expect(openConsoleButton).toBeVisible({ timeout: MAP_READY_TIMEOUT_MS });
      await openConsoleButton.click();
    }
    await expect(mapCopilotButton).toBeVisible({ timeout: MAP_READY_TIMEOUT_MS });
    await expect(page.getByRole("button", { name: "Prospecting scan" })).toBeVisible();

    await geocoderInput.fill("3154 College Drive");
    await expect(geocoderInput).toHaveValue("3154 College Drive");

    await mapCopilotButton.click();
    const analysisInput = page.getByPlaceholder(
      "Ask for screening, comparison, or a next move...",
    );
    await expect(analysisInput).toBeVisible({ timeout: MAP_READY_TIMEOUT_MS });
    await analysisInput.fill("Summarize flood exposure around the selected parcel");
    await expect(analysisInput).toHaveValue(
      "Summarize flood exposure around the selected parcel",
    );
    await expect(geocoderInput).toHaveValue("3154 College Drive");
  });
});
