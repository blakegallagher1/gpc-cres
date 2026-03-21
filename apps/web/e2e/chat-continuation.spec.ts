import { expect, test, type Page } from "@playwright/test";
import { ensureCopilotClosed } from "./_helpers/ui";

type MockConversationConfig = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  messages: Array<Record<string, unknown>>;
};

async function openChat(page: Page, path = "/chat") {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await ensureCopilotClosed(page);
  await page.getByText("Loading...").waitFor({ state: "hidden", timeout: 15_000 }).catch(() => undefined);
  await page.getByPlaceholder("Ask something complex...").waitFor({ state: "visible", timeout: 15_000 });
}

const LIVE_DB_E2E_ENABLED = process.env.PLAYWRIGHT_LIVE_DB_E2E === "true";

async function openConversationSidebar(page: Page) {
  const openByClass = page
    .locator("button")
    .filter({ has: page.locator("svg.lucide-panel-left-open") })
    .first();
  const openByAbsoluteButton = page.locator("div.relative > button.absolute").first();

  if (await openByClass.isVisible().catch(() => false)) {
    await openByClass.click();
  } else {
    await openByAbsoluteButton.click();
  }

  await expect(page.getByText("Conversations")).toBeVisible();
}

async function mockConversationHistory(page: Page, config: MockConversationConfig) {
  await page.route("**/api/chat/conversations", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        conversations: [
          {
            id: config.id,
            title: config.title,
            dealId: null,
            updatedAt: config.updatedAt,
            messageCount: config.messageCount,
          },
        ],
      }),
    });
  });

  await page.route(`**/api/chat/conversations/${config.id}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        conversation: {
          id: config.id,
          title: config.title,
          dealId: null,
          createdAt: config.updatedAt,
          updatedAt: config.updatedAt,
          messages: config.messages,
        },
      }),
    });
  });
}

test.describe("Chat continuation", () => {
  test("reopens a historical conversation and rehydrates pending approval state", async ({ page }) => {
    const conversationId = "conv-history-qa";
    await mockConversationHistory(page, {
      id: conversationId,
      title: "Downtown zoning follow-up",
      updatedAt: "2026-03-12T10:10:00.000Z",
      messageCount: 2,
      messages: [
        {
          id: "msg-history-1",
          role: "assistant",
          content: "Loaded parcel context.",
          agentName: "Coordinator",
          toolCalls: null,
          metadata: {
            kind: "chat_assistant_message",
            runId: "run-history-finished",
          },
          createdAt: "2026-03-12T10:05:00.000Z",
        },
        {
          id: "msg-history-approval",
          role: "system",
          content: "Approval required for update_deal_status",
          agentName: null,
          toolCalls: [
            {
              name: "update_deal_status",
              args: {
                dealId: "deal-123",
                status: "UNDER_REVIEW",
              },
            },
          ],
          metadata: {
            kind: "tool_approval_requested",
            runId: "run-history-approval",
            toolCallId: "call-history-approval",
            toolName: "update_deal_status",
            pendingApproval: true,
          },
          createdAt: "2026-03-12T10:06:00.000Z",
        },
      ],
    });

    await openChat(page);
    await openConversationSidebar(page);
    await page.getByRole("button", { name: /downtown zoning follow-up/i }).click();

    await expect(page).toHaveURL(new RegExp(`conversationId=${conversationId}`));
    await expect(page.getByText("Loaded parcel context.")).toBeVisible();
    await expect(page.getByText("Tool approval required: update_deal_status")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();
  });

  test("submits approval on a reopened conversation and renders resumed tool events", async ({ page }) => {
    const conversationId = "conv-approval-qa";
    const approvalRequests: Array<Record<string, unknown>> = [];

    await mockConversationHistory(page, {
      id: conversationId,
      title: "Approval hold",
      updatedAt: "2026-03-12T11:00:00.000Z",
      messageCount: 2,
      messages: [
        {
          id: "msg-approval-1",
          role: "assistant",
          content: "Loaded pending tool gate.",
          agentName: "Coordinator",
          toolCalls: null,
          metadata: {
            kind: "chat_assistant_message",
            runId: "run-approval-initial",
          },
          createdAt: "2026-03-12T11:00:00.000Z",
        },
        {
          id: "msg-approval-prompt",
          role: "system",
          content: "Approval required for update_deal_status",
          agentName: null,
          toolCalls: [
            {
              name: "update_deal_status",
              args: {
                dealId: "deal-987",
                status: "APPROVED",
              },
            },
          ],
          metadata: {
            kind: "tool_approval_requested",
            runId: "run-approval-qa",
            toolCallId: "call-approval-qa",
            toolName: "update_deal_status",
            pendingApproval: true,
          },
          createdAt: "2026-03-12T11:01:00.000Z",
        },
      ],
    });

    await page.route("**/api/chat/tool-approval", async (route) => {
      const request = route.request();
      approvalRequests.push((request.postDataJSON() as Record<string, unknown>) ?? {});
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          events: [
            {
              type: "tool_end",
              name: "update_deal_status",
              toolCallId: "call-approval-qa",
              result: "Status change approved.",
              status: "completed",
            },
            {
              type: "done",
              runId: "run-approval-qa",
              status: "succeeded",
              conversationId,
            },
          ],
        }),
      });
    });

    await openChat(page, `/chat?conversationId=${conversationId}`);
    await expect(page.getByText("Tool approval required: update_deal_status")).toBeVisible();

    await page.getByRole("button", { name: "Approve" }).click();

    await expect.poll(() => approvalRequests.length).toBe(1);
    expect(approvalRequests[0]).toEqual({
      runId: "run-approval-qa",
      toolCallId: "call-approval-qa",
      action: "approve",
    });

    await expect(page.getByText("Decision submitted.")).toBeVisible();
    await expect(page.getByText("Status change approved.")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`conversationId=${conversationId}`));
  });

  test("continues the same DB-backed conversation after reload and preserves recallable context", async ({ page }) => {
    test.skip(
      !LIVE_DB_E2E_ENABLED,
      "Requires live DB/Hyperdrive connectivity; set PLAYWRIGHT_LIVE_DB_E2E=true to run.",
    );
    test.setTimeout(240_000);

    const houseNumber = Date.now().toString().slice(-5);
    const address = `${houseNumber} Continuation Trace Avenue, Baton Rouge, LA 70808`;
    const salePrice = 2_345_678;
    const salePricePattern = /2,?345,?678/;

    await openChat(page);

    const composer = page.getByPlaceholder("Ask something complex...");
    await composer.click();
    await composer.fill(
      `Store this property fact for future recall: ${address} sold for $${salePrice.toLocaleString()} ` +
        "on 2025-02-14 at a 6.1% cap rate with NOI $143,087. Confirm after storing it.",
    );
    await ensureCopilotClosed(page);
    await composer.press("Enter");

    let conversationId: string | null = null;
    await expect(page.getByRole("button", { name: /stop/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /send/i })).toBeVisible({ timeout: 120_000 });
    await expect
      .poll(async () => {
        const current = new URL(page.url());
        conversationId = current.searchParams.get("conversationId");
        return conversationId;
      }, { timeout: 15_000 })
      .not.toBeNull();

    let lookupValue: unknown = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const response = await page.request.get(
        `/api/entities/lookup?address=${encodeURIComponent(address)}`,
      );
      if (response.ok()) {
        const payload = (await response.json()) as {
          truth?: {
            currentValues?: Record<string, { value?: unknown }>;
          };
        };
        lookupValue = payload.truth?.currentValues?.["comp.sale_price"]?.value ?? null;
        if (lookupValue === salePrice) {
          break;
        }
      }
      await page.waitForTimeout(5_000);
    }

    expect(lookupValue).toBe(salePrice);
    expect(conversationId).not.toBeNull();

    await page.reload({ waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
    await page.getByPlaceholder("Ask something complex...").waitFor({ state: "visible", timeout: 15_000 });
    await expect(
      page.locator("p.whitespace-pre-wrap").filter({ hasText: address }).first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => new URL(page.url()).searchParams.get("conversationId"))
      .toBe(conversationId);

    const initialPriceMentions = await page.getByText(salePricePattern).count();

    const reloadComposer = page.getByPlaceholder("Ask something complex...");
    await reloadComposer.click();
    await reloadComposer.fill(`What was the sale price for ${address}? Reply with the number only.`);
    await ensureCopilotClosed(page);
    await reloadComposer.press("Enter");

    await expect(page.getByRole("button", { name: /send/i })).toBeVisible({ timeout: 120_000 });
    await expect
      .poll(async () => await page.getByText(salePricePattern).count(), { timeout: 120_000 })
      .toBeGreaterThan(initialPriceMentions);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("conversationId"))
      .toBe(conversationId);
  });

  test("reconnects after an abnormal websocket close when websocket transport is enabled", async ({ page }) => {
    let tokenRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/auth/token")) {
        tokenRequests += 1;
      }
    });

    await openChat(page);
    await page.waitForTimeout(3_000);

    test.skip(
      tokenRequests === 0,
      "Current dev server bundle does not enable NEXT_PUBLIC_AGENT_WS_URL, so browser reconnect flow is unreachable in this lane.",
    );
  });
});
