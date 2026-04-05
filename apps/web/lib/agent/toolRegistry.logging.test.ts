import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
const hydrateRequiredNullableToolArgsMock = vi.fn();
const loggerInfoMock = vi.fn();
const loggerWarnMock = vi.fn();

vi.mock("@entitlement-os/openai", () => ({
  ALL_AGENT_TOOLS: [
    {
      name: "mock_tool",
      parameters: {},
      invoke: invokeMock,
    },
  ],
  resolveToolCatalogEntry: vi.fn(() => null),
  resolveToolName: vi.fn((toolName: string) => toolName),
  TOOL_NAME_ALIASES: {},
}));

vi.mock("./toolInvokeInput", () => ({
  hydrateRequiredNullableToolArgs: hydrateRequiredNullableToolArgsMock,
}));

vi.mock("./loggerAdapter", () => ({
  logger: {
    info: loggerInfoMock,
    warn: loggerWarnMock,
  },
}));

async function loadRegistry() {
  const mod = await import("@/lib/agent/toolRegistry");
  return mod.toolRegistry;
}

describe("toolRegistry logging", () => {
  beforeEach(() => {
    vi.resetModules();
    invokeMock.mockReset();
    hydrateRequiredNullableToolArgsMock.mockReset();
    loggerInfoMock.mockReset();
    loggerWarnMock.mockReset();
    hydrateRequiredNullableToolArgsMock.mockImplementation((_, args) => args);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("logs successful tool execution with duration and injected auth context", async () => {
    invokeMock.mockResolvedValue('{"ok":true}');
    const toolRegistry = await loadRegistry();

    const result = await toolRegistry.mock_tool(
      { parcelId: "parcel-1" },
      {
        orgId: "org-1",
        userId: "user-1",
        conversationId: "conv-1",
        dealId: "deal-1",
      },
    );

    expect(result).toBe('{"ok":true}');
    expect(hydrateRequiredNullableToolArgsMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        parcelId: "parcel-1",
        orgId: "org-1",
      }),
    );
    expect(invokeMock).toHaveBeenCalledWith(
      {
        context: {
          orgId: "org-1",
          userId: "user-1",
        },
      },
      JSON.stringify({ parcelId: "parcel-1", orgId: "org-1" }),
      {},
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "Tool execution completed",
      expect.objectContaining({
        tool: "mock_tool",
        orgId: "org-1",
        userId: "user-1",
        conversationId: "conv-1",
        dealId: "deal-1",
        status: "success",
      }),
    );
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it("logs tool-returned JSON errors as tool_error without throwing", async () => {
    invokeMock.mockResolvedValue('{"error":"Tool failed safely"}');
    const toolRegistry = await loadRegistry();

    const result = await toolRegistry.mock_tool(
      {},
      {
        orgId: "org-2",
        userId: "user-2",
        conversationId: "conv-2",
      },
    );

    expect(result).toBe('{"error":"Tool failed safely"}');
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "Tool execution completed",
      expect.objectContaining({
        tool: "mock_tool",
        orgId: "org-2",
        status: "tool_error",
        error: "Tool failed safely",
      }),
    );
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it("logs thrown tool execution failures and rethrows", async () => {
    invokeMock.mockRejectedValue(new Error("invoke exploded"));
    const toolRegistry = await loadRegistry();

    await expect(
      toolRegistry.mock_tool(
        {},
        {
          orgId: "org-3",
          userId: "user-3",
          conversationId: "conv-3",
        },
      ),
    ).rejects.toThrow("invoke exploded");

    expect(loggerWarnMock).toHaveBeenCalledWith(
      "Tool execution failed",
      expect.objectContaining({
        tool: "mock_tool",
        orgId: "org-3",
        status: "error",
        error: "invoke exploded",
      }),
    );
    expect(loggerInfoMock).not.toHaveBeenCalled();
  });
});