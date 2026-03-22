import { expect, test, type Locator, type Page } from "@playwright/test";
import { ensureCopilotClosed } from "./_helpers/ui";

const CHAT_READY_TIMEOUT_MS = 15_000;
const DESKTOP_COMPOSER_BOTTOM_TOLERANCE_PX = 12;
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const MOBILE_COMPOSER_BOTTOM_MAX_PX = MOBILE_VIEWPORT.height + 12;
const SUMMARY_CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const APPROVAL_CONVERSATION_ID = "22222222-2222-4222-8222-222222222222";

type ConversationMessageFixture = {
  id: string;
  role: "assistant" | "system" | "user" | "tool";
  content: string;
  agentName?: string | null;
  toolCalls?: Array<Record<string, unknown>> | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

type ConversationDetailFixture = {
  id: string;
  title?: string | null;
  dealId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  messages: ConversationMessageFixture[];
};

type MockChatShellOptions = {
  conversations?: Array<Record<string, unknown>>;
  conversationDetails?: Record<string, ConversationDetailFixture>;
};

function getVisibleComposer(page: Page): Locator {
  return page.locator('textarea[placeholder="Ask something complex..."]:visible').first();
}

function getVisibleInspector(page: Page): Locator {
  return page.locator("aside").filter({ hasText: "Verification and specialist coverage" }).first();
}

async function mockChatShell(page: Page, options: MockChatShellOptions = {}) {
  const conversations = options.conversations ?? [];
  const conversationDetails = options.conversationDetails ?? {};

  await page.route(/\/api\/chat\/conversations(?:\/[^/?]+)?(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/api/chat/conversations")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ conversations }),
      });
      return;
    }

    const conversationId = url.pathname.split("/").pop() ?? "";
    const detail = conversationDetails[conversationId];
    if (!detail) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ conversation: null }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        conversation: {
          id: detail.id,
          title: detail.title ?? "Saved run",
          dealId: detail.dealId ?? null,
          createdAt: detail.createdAt ?? "2026-03-21T14:00:00.000Z",
          updatedAt: detail.updatedAt ?? "2026-03-21T14:05:00.000Z",
          messages: detail.messages,
        },
      }),
    });
  });

  await page.route("**/api/deals", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ deals: [] }),
    });
  });

  await page.route("**/api/auth/token", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: "playwright-token" }),
    });
  });
}

async function expectComposerReachable(page: Page, maxBottomPx: number) {
  const composer = getVisibleComposer(page);
  const box = await composer.boundingBox();

  expect(box).not.toBeNull();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(maxBottomPx);
}

async function openChat(
  page: Page,
  path = "/chat",
  options: MockChatShellOptions = {},
) {
  await mockChatShell(page, options);
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await ensureCopilotClosed(page);
  await page
    .getByText("Loading...")
    .waitFor({ state: "hidden", timeout: CHAT_READY_TIMEOUT_MS })
    .catch(() => undefined);
  await page
    .getByText("Loading conversations...")
    .waitFor({ state: "hidden", timeout: CHAT_READY_TIMEOUT_MS })
    .catch(() => undefined);
  await getVisibleComposer(page).waitFor({
    state: "visible",
    timeout: CHAT_READY_TIMEOUT_MS,
  });
}

test.describe("Chat layout", () => {
  test("keeps the run surface usable on first desktop load", async ({ page }) => {
    await openChat(page);

    await expect(page.getByText("Run Desk")).toBeVisible();
    await expect(page.getByText("Start from a concrete ask")).toBeVisible();

    const viewport = page.viewportSize();

    expect(viewport).not.toBeNull();
    await expectComposerReachable(
      page,
      (viewport?.height ?? 0) + DESKTOP_COMPOSER_BOTTOM_TOLERANCE_PX,
    );
  });

  test("uses mobile controls instead of competing panes on first load", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await openChat(page);

    const historyButton = page.getByRole("button", { name: "History", exact: true });
    const inspectorButton = page.getByRole("button", { name: "Inspector", exact: true });

    await expect(historyButton).toBeVisible({ timeout: CHAT_READY_TIMEOUT_MS });
    await expect(inspectorButton).toBeVisible({ timeout: CHAT_READY_TIMEOUT_MS });

    await expectComposerReachable(page, MOBILE_COMPOSER_BOTTOM_MAX_PX);

    await historyButton.click();
    await expect(page.getByRole("heading", { name: "Conversations" })).toBeVisible();
    await expect(page.getByLabel("Close history").first()).toBeVisible();
    await page.getByLabel("Close history").first().click();
    await inspectorButton.click();

    const inspectorDrawer = page.getByRole("dialog");
    await expect(inspectorDrawer.getByText("Live Execution")).toBeVisible();
    await inspectorDrawer.getByRole("tab", { name: "Verification" }).click();
    await expect(
      inspectorDrawer.getByText("Verification fills in after the first response."),
    ).toBeVisible({ timeout: CHAT_READY_TIMEOUT_MS });
  });

  test("surfaces restored verification context when reopening a saved run", async ({ page }) => {
    await openChat(page, `/chat?conversationId=${SUMMARY_CONVERSATION_ID}`, {
      conversations: [
        {
          id: SUMMARY_CONVERSATION_ID,
          title: "Saved underwriting run",
          dealId: null,
          updatedAt: "2026-03-21T14:05:00.000Z",
          messageCount: 1,
        },
      ],
      conversationDetails: {
        [SUMMARY_CONVERSATION_ID]: {
          id: SUMMARY_CONVERSATION_ID,
          title: "Saved underwriting run",
          messages: [
            {
              id: "msg-summary-1",
              role: "assistant",
              content: "Underwriting screen complete.",
              agentName: "finance",
              createdAt: "2026-03-21T14:04:00.000Z",
              metadata: {
                kind: "chat_assistant_message",
                runId: "run-restored-1",
                trust: {
                  lastAgentName: "finance",
                  confidence: 0.82,
                  toolsInvoked: ["underwriting_model"],
                  missingEvidence: ["Rent roll not attached"],
                  verificationSteps: ["Confirm current rent roll"],
                  proofChecks: ["Compared leverage to debt yield floor"],
                  evidenceCitations: [],
                  durationMs: 1420,
                  errorSummary: null,
                  toolFailures: [],
                },
              },
            },
          ],
        },
      },
    });

    const inspector = getVisibleInspector(page);
    await expect(inspector.getByText("82%")).toBeVisible({ timeout: CHAT_READY_TIMEOUT_MS });
    await expect(inspector.getByRole("button", { name: "Show details" })).toBeVisible({
      timeout: CHAT_READY_TIMEOUT_MS,
    });
  });

  test("keeps approval controls visible on mobile when reopening a saved run", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await openChat(page, `/chat?conversationId=${APPROVAL_CONVERSATION_ID}`, {
      conversations: [
        {
          id: APPROVAL_CONVERSATION_ID,
          title: "Approval pending run",
          dealId: null,
          updatedAt: "2026-03-21T14:08:00.000Z",
          messageCount: 1,
        },
      ],
      conversationDetails: {
        [APPROVAL_CONVERSATION_ID]: {
          id: APPROVAL_CONVERSATION_ID,
          title: "Approval pending run",
          messages: [
            {
              id: "msg-approval-1",
              role: "system",
              content: "Approval required for update_deal_status",
              createdAt: "2026-03-21T14:07:00.000Z",
              toolCalls: [
                {
                  name: "update_deal_status",
                  args: { dealId: "deal-1", status: "APPROVED" },
                },
              ],
              metadata: {
                kind: "tool_approval_requested",
                runId: "run-approval-1",
                toolCallId: "call-approval-1",
                toolName: "update_deal_status",
                pendingApproval: true,
              },
            },
          ],
        },
      },
    });

    await expect(page.getByText("Approval required for update_deal_status")).toBeVisible({
      timeout: CHAT_READY_TIMEOUT_MS,
    });
    await expect(page.getByRole("button", { name: "Open history" })).toBeVisible({
      timeout: CHAT_READY_TIMEOUT_MS,
    });
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible({
      timeout: CHAT_READY_TIMEOUT_MS,
    });
    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible({
      timeout: CHAT_READY_TIMEOUT_MS,
    });
  });
});
