import { expect, test } from "@playwright/test";
import { ensureCopilotClosed } from "./_helpers/ui";

test.describe("Chat learning", () => {
  test("stores a property fact through chat and makes it recallable", async ({ page }) => {
    test.setTimeout(240_000);

    const houseNumber = Date.now().toString().slice(-5);
    const address = `${houseNumber} Memory Trace Avenue, Baton Rouge, LA 70808`;
    const salePrice = 2_345_678;
    const capRate = 6.1;
    const noi = 143_087;
    const saleDate = "2025-02-14";

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
    await page.getByText("Loading...").waitFor({ state: "hidden", timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(5_000);

    const composer = page.getByPlaceholder("Ask something complex...");
    await composer.waitFor({ state: "visible", timeout: 10_000 });
    await composer.click();
    await composer.fill(
      `Store this property fact for future recall: ${address} sold for $${salePrice.toLocaleString()} ` +
        `on ${saleDate} at a ${capRate}% cap rate with NOI $${noi.toLocaleString()}. ` +
        "Confirm after storing it.",
    );
    await page.waitForTimeout(1_000);
    await ensureCopilotClosed(page);
    await composer.press("Enter");

    let lookupPayload: Record<string, unknown> | null = null;
    let lookupValue: unknown = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const response = await page.request.get(
        `/api/entities/lookup?address=${encodeURIComponent(address)}`,
      );
      if (response.ok()) {
        const data = (await response.json()) as Record<string, unknown>;
        lookupPayload = data;
        const truth =
          typeof data.truth === "object" && data.truth !== null
            ? (data.truth as {
                currentValues?: Record<string, { value?: unknown }>;
              })
            : null;
        lookupValue = truth?.currentValues?.["comp.sale_price"]?.value ?? null;
        if (lookupValue === salePrice) {
          break;
        }
      }
      await page.waitForTimeout(5_000);
    }

    expect(lookupValue).toBe(salePrice);

    expect(lookupPayload).toMatchObject({
      found: true,
      truth: {
        currentValues: {
          "comp.sale_price": { value: salePrice },
          "comp.cap_rate": { value: capRate },
          "comp.noi": { value: noi },
        },
      },
    });
    expect(String(lookupPayload?.canonicalAddress ?? "")).toContain(
      `${houseNumber} memory trace avenue`,
    );
  });
});
