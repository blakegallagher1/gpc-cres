import { expect, test } from "@playwright/test";
import { ensureCopilotClosed } from "./_helpers/ui";

const BASE_PARCEL = {
  id: "1612340",
  parcelId: "1612340",
  address: "4400 HEATH DR, Baton Rouge, LA",
  lat: 30.45,
  lng: -91.18,
  acreage: 1.5,
  floodZone: "X",
  zoning: "C2",
  propertyDbId: "1612340",
};
const SEARCH_PARCEL = {
  id: "739049",
  parcelId: "739049",
  address: "2774 HIGHLAND RD, Baton Rouge, LA",
  lat: 30.4228,
  lng: -91.179,
  acreage: 0.9,
  floodZone: "AE",
  zoning: "C1",
  propertyDbId: "739049",
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
              parcelId: SEARCH_PARCEL.parcelId,
              address: SEARCH_PARCEL.address,
              lat: SEARCH_PARCEL.lat,
              lng: SEARCH_PARCEL.lng,
              acreage: SEARCH_PARCEL.acreage,
              floodZone: SEARCH_PARCEL.floodZone,
              currentZoning: SEARCH_PARCEL.zoning,
              propertyDbId: SEARCH_PARCEL.propertyDbId,
              geometryLookupKey: SEARCH_PARCEL.parcelId,
              hasGeometry: true,
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
            id: BASE_PARCEL.id,
            parcelId: BASE_PARCEL.parcelId,
            address: BASE_PARCEL.address,
            lat: 30.45,
            lng: -91.18,
            acreage: 1.5,
            floodZone: "X",
            currentZoning: "C2",
            propertyDbId: BASE_PARCEL.propertyDbId,
            geometryLookupKey: BASE_PARCEL.parcelId,
            hasGeometry: true,
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
            parcelId: SEARCH_PARCEL.parcelId,
            address: SEARCH_PARCEL.address,
            lat: SEARCH_PARCEL.lat,
            lng: SEARCH_PARCEL.lng,
            propertyDbId: SEARCH_PARCEL.propertyDbId,
            hasGeometry: true,
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

  await page.route(`**/api/parcels/${BASE_PARCEL.id}/geometry?detail_level=low`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(geometryResponse()),
    });
  });

  await page.route(`**/api/parcels/${SEARCH_PARCEL.id}/geometry?detail_level=low`, async (route) => {
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
  test("renders the operator shell over the active map canvas", async ({ page }) => {
    await mockMapData(page);

    await page.goto("/map?lat=30.45&lng=-91.18&z=17", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);

    await expect(page.locator('[data-route-id="map"]')).toHaveAttribute("data-route-path", "/map");
    await expect(page.getByRole("textbox", { name: /Address, parcel id, owner/i })).toBeVisible({
      timeout: MAP_READY_TIMEOUT_MS,
    });
    await expect(page.getByRole("textbox", { name: /Ask the map/i })).toBeVisible();
    await expect(page.getByRole("region", { name: "Map" })).toBeVisible();
    await expect(page.getByLabel("Map tool rail")).toBeVisible();
    await expect(page.getByRole("button", { name: /Industrial parcels > 10ac/i }).first()).toBeVisible();

    const canvas = page.locator(".maplibregl-canvas");
    await expect(canvas).toBeVisible({ timeout: MAP_READY_TIMEOUT_MS });
  });

  test("keeps primary action rail available after the map moves", async ({ page }) => {
    const prospectBodies: string[] = [];
    await mockMapData(page);

    page.on("request", (request) => {
      if (request.url().includes("/api/map/prospect") && request.method() === "POST") {
        prospectBodies.push(request.postData() ?? "");
      }
    });

    await page.goto("/map?lat=30.45&lng=-91.18&z=17", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);

    await expect(page.getByLabel("Map tool rail")).toBeVisible({
      timeout: MAP_READY_TIMEOUT_MS,
    });
    await expect(page.getByRole("textbox", { name: /Address, parcel id, owner/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Ask the map/i })).toBeVisible();

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

    await expect(page.getByLabel("Map tool rail")).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Address, parcel id, owner/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Ask the map/i })).toBeVisible();
  });

  test("keeps parcel lookup separate from map copilot analysis", async ({
    page,
  }) => {
    await mockMapData(page);

    await page.goto("/map?lat=30.45&lng=-91.18&z=17", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);

    await expect(page.locator('[data-route-id="map"]')).toHaveAttribute("data-route-path", "/map");
    const geocoderInput = page.getByRole("textbox", { name: /Address, parcel id, owner/i });
    await expect(geocoderInput).toBeVisible({ timeout: MAP_READY_TIMEOUT_MS });
    const analysisInput = page.getByRole("textbox", { name: /Ask the map/i });
    await expect(analysisInput).toBeVisible({ timeout: MAP_READY_TIMEOUT_MS });

    await geocoderInput.fill("2774 Highland Rd");
    await expect(geocoderInput).toHaveValue("2774 Highland Rd");

    await analysisInput.fill("Summarize flood exposure around the selected parcel");
    await expect(analysisInput).toHaveValue(
      "Summarize flood exposure around the selected parcel",
    );
    await expect(geocoderInput).toHaveValue("2774 Highland Rd");
  });

  test("promotes a Baton Rouge parcel lookup into the working set and allows clearing it", async ({ page }) => {
    await mockMapData(page);

    await page.goto("/map?lat=30.45&lng=-91.18&z=17", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);

    const parcelLookup = page.getByRole("textbox", { name: /Address, parcel id, owner/i });
    await expect(parcelLookup).toBeVisible({ timeout: MAP_READY_TIMEOUT_MS });
    await parcelLookup.fill("2774 Highland Rd");
    await parcelLookup.press("Enter");

    await expect(page).toHaveURL(new RegExp(`parcel=${SEARCH_PARCEL.id}`), {
      timeout: MAP_READY_TIMEOUT_MS,
    });

    await parcelLookup.evaluate((element) => element.blur());
    await page.keyboard.press("Escape");

    await expect(page).not.toHaveURL(/parcel=/);
  });
});
