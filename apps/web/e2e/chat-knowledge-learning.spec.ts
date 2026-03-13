import { expect, test } from "@playwright/test";
import { ensureCopilotClosed } from "./_helpers/ui";

const KNOWLEDGE_SEARCH_ATTEMPTS = 15;
const KNOWLEDGE_SEARCH_INTERVAL_MS = 5_000;

type KnowledgeSearchEntry = {
  contentType?: unknown;
  contentText?: unknown;
  metadata?: unknown;
};

function isKnowledgeSearchMatch(
  entry: KnowledgeSearchEntry,
  title: string,
  marker: string,
): boolean {
  const metadata =
    typeof entry.metadata === "object" && entry.metadata !== null
      ? (entry.metadata as Record<string, unknown>)
      : null;
  const metadataTitle = typeof metadata?.title === "string" ? metadata.title : "";
  const metadataTags = Array.isArray(metadata?.tags) ? metadata.tags.map(String) : [];
  const contentText = typeof entry.contentText === "string" ? entry.contentText : "";

  return (
    entry.contentType === "agent_analysis" &&
    (metadataTitle === title ||
      metadataTags.includes(marker) ||
      contentText.includes(title) ||
      contentText.includes(marker))
  );
}

test.describe("Chat knowledge learning", () => {
  test("stores a reusable knowledge entry through chat and makes it searchable", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    const marker = `kb-e2e-${Date.now()}`;
    const title = `Knowledge Trace ${marker}`;
    const prompt =
      `Create a reusable underwriting knowledge entry for future reference. ` +
      `This is an agent-analysis pattern, not a property fact, so store it in the knowledge base rather than property memory. ` +
      `Use content_type agent_analysis, the exact title "${title}", and include the exact marker "${marker}" in the stored content and tags. ` +
      `Store this reusable conclusion: For small-bay flex screening in Baton Rouge, if near-term lease rollover exceeds 30 percent ` +
      `and deferred maintenance is above 18 dollars per square foot, require a heavier TI reserve and a 125 basis point exit cap expansion ` +
      `even when current occupancy looks strong. ` +
      `Explain the reasoning in 2 to 4 sentences, store it, and confirm after storing it.`;

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
    await page.getByText("Loading...").waitFor({ state: "hidden", timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(5_000);

    const composer = page.getByPlaceholder("Ask something complex...");
    await composer.waitFor({ state: "visible", timeout: 10_000 });
    await composer.click();
    await composer.fill(prompt);
    await page.waitForTimeout(1_000);
    await ensureCopilotClosed(page);
    await composer.press("Enter");

    let searchPayload: Record<string, unknown> | null = null;
    let matchedEntry: KnowledgeSearchEntry | null = null;

    for (let attempt = 0; attempt < KNOWLEDGE_SEARCH_ATTEMPTS; attempt++) {
      const response = await page.request.get(
        `/api/knowledge?view=search&q=${encodeURIComponent(marker)}&mode=exact&types=agent_analysis&limit=5`,
      );

      if (response.ok()) {
        const data = (await response.json()) as Record<string, unknown>;
        searchPayload = data;
        const results = Array.isArray(data.results) ? (data.results as KnowledgeSearchEntry[]) : [];
        matchedEntry = results.find((entry) => isKnowledgeSearchMatch(entry, title, marker)) ?? null;
        if (matchedEntry) {
          break;
        }
      }

      await page.waitForTimeout(KNOWLEDGE_SEARCH_INTERVAL_MS);
    }

    expect(searchPayload).toMatchObject({ mode: "exact" });
    expect(matchedEntry).not.toBeNull();

    const metadata =
      typeof matchedEntry?.metadata === "object" && matchedEntry.metadata !== null
        ? (matchedEntry.metadata as Record<string, unknown>)
        : {};
    const metadataTags = Array.isArray(metadata.tags) ? metadata.tags.map(String) : [];
    const contentText = typeof matchedEntry?.contentText === "string" ? matchedEntry.contentText : "";

    expect(matchedEntry).toMatchObject({
      contentType: "agent_analysis",
      metadata: expect.objectContaining({
        title,
      }),
    });
    expect(metadataTags).toContain(marker);
    expect(contentText).toContain(marker);
    expect(contentText).toContain(title);
  });
});
