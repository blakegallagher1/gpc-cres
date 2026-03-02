import { test, expect } from "@playwright/test";
import { ensureCopilotClosed, clickNavAndWaitForURL } from "./_helpers/ui";

test.describe("Admin Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
  });

  test("should display admin page heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Admin", level: 1 })
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("Knowledge base, memory, agents, and system configuration")
    ).toBeVisible();
  });

  test("should render all five tab triggers", async ({ page }) => {
    const tabs = ["Overview", "Knowledge", "Memory", "Agents", "System"];
    for (const tab of tabs) {
      await expect(page.getByRole("tab", { name: tab })).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test("overview tab should load KPI cards", async ({ page }) => {
    // Overview is the default tab
    await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "data-state",
      "active",
      { timeout: 10_000 }
    );

    // Wait for data to load (skeletons disappear)
    // KPI labels should appear once SWR resolves
    const kpiLabels = [
      "Knowledge Entries",
      "Verified Memories",
      "Entities Tracked",
      "Agent Runs (24h)",
    ];
    for (const label of kpiLabels) {
      await expect(
        page.getByRole("heading", { name: label })
      ).toBeVisible({ timeout: 30_000 });
    }

    // "Recent Activity" and "Knowledge by Type" card headers
    await expect(page.getByRole("heading", { name: "Recent Activity" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Knowledge by Type" })).toBeVisible();
  });

  test("knowledge tab should render table and controls", async ({ page }) => {
    await page.getByRole("tab", { name: "Knowledge" }).click();
    await expect(page.getByRole("tab", { name: "Knowledge" })).toHaveAttribute(
      "data-state",
      "active"
    );

    // Search input and type filter
    await expect(page.getByPlaceholder("Search content...")).toBeVisible({
      timeout: 30_000,
    });

    // Export CSV button
    await expect(page.getByRole("button", { name: /export csv/i })).toBeVisible();

    // Table headers
    const headers = ["Type", "Source ID", "Content", "Created", "Actions"];
    for (const h of headers) {
      await expect(
        page.locator("th").filter({ hasText: h }).first()
      ).toBeVisible();
    }

    // Entry count text (e.g. "42 entries" or "0 entries")
    await expect(page.getByText(/\d+\s+entries/)).toBeVisible({ timeout: 15_000 });
  });

  test("memory tab should render facts sub-tab by default", async ({
    page,
  }) => {
    await page.getByRole("tab", { name: "Memory" }).click();
    await expect(page.getByRole("tab", { name: "Memory" })).toHaveAttribute(
      "data-state",
      "active"
    );

    // Sub-tab pills
    await expect(
      page.getByRole("button", { name: "Verified Facts" })
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: "Entities" })
    ).toBeVisible();

    // Record count
    await expect(page.getByText(/\d+\s+records/)).toBeVisible({
      timeout: 15_000,
    });

    // Facts table headers
    const headers = ["Entity", "Fact Type", "Payload", "Source", "Weight"];
    for (const h of headers) {
      await expect(
        page.locator("th").filter({ hasText: h }).first()
      ).toBeVisible();
    }
  });

  test("memory tab should switch to entities sub-tab", async ({ page }) => {
    await page.getByRole("tab", { name: "Memory" }).click();

    // Wait for facts sub-tab to load first
    await expect(
      page.getByRole("button", { name: "Entities" })
    ).toBeVisible({ timeout: 30_000 });

    // Click Entities sub-tab
    await page.getByRole("button", { name: "Entities" }).click();

    // Entities table headers
    const headers = ["Address", "Type", "Parcel ID", "Facts", "Created"];
    for (const h of headers) {
      await expect(
        page.locator("th").filter({ hasText: h }).first()
      ).toBeVisible({ timeout: 15_000 });
    }
  });

  test("agents tab should render KPI cards and run table", async ({
    page,
  }) => {
    await page.getByRole("tab", { name: "Agents" }).click();
    await expect(page.getByRole("tab", { name: "Agents" })).toHaveAttribute(
      "data-state",
      "active"
    );

    // KPI labels
    const kpis = ["Runs (24h)", "Success Rate", "Total Runs"];
    for (const label of kpis) {
      await expect(page.getByText(label)).toBeVisible({ timeout: 30_000 });
    }

    // Runs table headers
    const headers = ["Agent", "Status", "Duration", "Deal", "Started"];
    for (const h of headers) {
      await expect(
        page.locator("th").filter({ hasText: h }).first()
      ).toBeVisible();
    }
  });

  test("system tab should render database table counts", async ({ page }) => {
    await page.getByRole("tab", { name: "System" }).click();
    await expect(page.getByRole("tab", { name: "System" })).toHaveAttribute(
      "data-state",
      "active"
    );

    // Database card header
    await expect(page.getByText("Database")).toBeVisible({ timeout: 30_000 });

    // Table headers
    await expect(page.locator("th").filter({ hasText: "Table" }).first()).toBeVisible();
    await expect(page.locator("th").filter({ hasText: "Row Count" }).first()).toBeVisible();
  });
});

test.describe("Admin Dashboard - API endpoints", () => {
  test("stats API should return 200 for each tab", async ({ request }) => {
    const tabs = ["overview", "knowledge", "memory", "agents", "system"];
    for (const tab of tabs) {
      const res = await request.get(`/api/admin/stats?tab=${tab}`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toBeDefined();
      expect(body[tab]).toBeDefined();
    }
  });

  test("stats API should return paginated knowledge results", async ({
    request,
  }) => {
    const res = await request.get(
      "/api/admin/stats?tab=knowledge&page=1&limit=5"
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.knowledge).toBeDefined();
    expect(body.knowledge.page).toBe(1);
    expect(Array.isArray(body.knowledge.rows)).toBe(true);
    expect(typeof body.knowledge.total).toBe("number");
    expect(Array.isArray(body.knowledge.contentTypes)).toBe(true);
  });

  test("stats API should return memory facts and entities", async ({
    request,
  }) => {
    // Facts sub-tab
    const factsRes = await request.get(
      "/api/admin/stats?tab=memory&subTab=facts"
    );
    expect(factsRes.status()).toBe(200);
    const factsBody = await factsRes.json();
    expect(factsBody.memory.subTab).toBe("facts");
    expect(Array.isArray(factsBody.memory.rows)).toBe(true);

    // Entities sub-tab
    const entitiesRes = await request.get(
      "/api/admin/stats?tab=memory&subTab=entities"
    );
    expect(entitiesRes.status()).toBe(200);
    const entitiesBody = await entitiesRes.json();
    expect(entitiesBody.memory.subTab).toBe("entities");
    expect(Array.isArray(entitiesBody.memory.rows)).toBe(true);
  });

  test("stats API should return agents data with stats", async ({
    request,
  }) => {
    const res = await request.get("/api/admin/stats?tab=agents");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.agents).toBeDefined();
    expect(Array.isArray(body.agents.runs)).toBe(true);
    expect(typeof body.agents.stats.total24h).toBe("number");
    expect(typeof body.agents.stats.successRate).toBe("number");
    expect(Array.isArray(body.agents.dailyByRunType)).toBe(true);
  });

  test("stats API should return system table counts", async ({ request }) => {
    const res = await request.get("/api/admin/stats?tab=system");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.system).toBeDefined();
    expect(body.system.tableCounts).toBeDefined();
    const expectedTables = [
      "runs",
      "memoryVerified",
      "internalEntities",
      "deals",
      "conversations",
      "knowledgeEmbeddings",
    ];
    for (const t of expectedTables) {
      expect(typeof body.system.tableCounts[t]).toBe("number");
    }
  });

  test("export API should return CSV for knowledge", async ({ request }) => {
    const res = await request.post("/api/admin/export", {
      data: { type: "knowledge" },
    });
    expect(res.status()).toBe(200);
    const contentType = res.headers()["content-type"];
    expect(contentType).toContain("text/csv");
  });

  test("export API should return CSV for memory", async ({ request }) => {
    const res = await request.post("/api/admin/export", {
      data: { type: "memory" },
    });
    expect(res.status()).toBe(200);
    const contentType = res.headers()["content-type"];
    expect(contentType).toContain("text/csv");
  });
});

test.describe("Admin Dashboard - Navigation", () => {
  test("should navigate to admin from homepage", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
    await clickNavAndWaitForURL(page, "/admin", /\/admin/, {
      timeoutMs: 30_000,
    });
    await expect(
      page.getByRole("heading", { name: "Admin", level: 1 })
    ).toBeVisible({ timeout: 15_000 });
  });
});
