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
    const parcelCard = page.getByRole("dialog", { name: /4400 HEATH DR, Baton Rouge, LA details/i });
    await expect(parcelCard).toBeVisible();
    await parcelCard.getByRole("tab", { name: "Deals" }).click();
    await expect(parcelCard.getByRole("button", { name: "Create Deal" })).toBeVisible();

    await Promise.all([
      page.waitForURL(new RegExp(`/deals/new\\?parcelId=${BASE_PARCEL.id}`)),
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

    await geocoderInput.fill("2774 Highland Rd");
    await expect(geocoderInput).toHaveValue("2774 Highland Rd");

    await mapCopilotButton.click();
    const analysisInput = page.getByPlaceholder(
      "Ask for screening, comparison, or a next move...",
    );
    await expect(analysisInput).toBeVisible({ timeout: MAP_READY_TIMEOUT_MS });
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

    const openWorkbench = page.getByRole("button", { name: "Open map workbench" });
    await expect(openWorkbench).toBeVisible({ timeout: MAP_READY_TIMEOUT_MS });
    await openWorkbench.click();

    const parcelLookup = page.getByLabel("Parcel or address search");
    await expect(parcelLookup).toBeVisible({ timeout: MAP_READY_TIMEOUT_MS });
    await parcelLookup.fill("2774 Highland Rd");

    await page.getByRole("option", { name: /2774 HIGHLAND RD, Baton Rouge, LA/i }).click();

    await expect(page).toHaveURL(new RegExp(`parcel=${SEARCH_PARCEL.id}`));
    await expect(page.getByText("1 selected for follow-up")).toBeVisible();

    const openConsoleButton = page.getByRole("button", { name: "Open console" });
    if (await openConsoleButton.isVisible().catch(() => false)) {
      await openConsoleButton.click();
    }

    const clearSelection = page.getByRole("button", { name: "Clear selection" });
    await expect(clearSelection).toBeVisible({ timeout: MAP_READY_TIMEOUT_MS });
    await clearSelection.click();

    await expect(page.getByText("1 selected for follow-up")).toHaveCount(0);
  });
});
