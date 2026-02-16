import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  addTraceProcessorMock,
  startTraceExportLoopMock,
  setDisabledMock,
  batchCtorMock,
} = vi.hoisted(() => ({
  addTraceProcessorMock: vi.fn(),
  startTraceExportLoopMock: vi.fn(),
  setDisabledMock: vi.fn(),
  batchCtorMock: vi.fn(),
}));

vi.mock("@openai/agents", () => ({
  addTraceProcessor: addTraceProcessorMock,
  startTraceExportLoop: startTraceExportLoopMock,
  getGlobalTraceProvider: () => ({
    setDisabled: setDisabledMock,
  }),
  BatchTraceProcessor: class MockBatchTraceProcessor {
    constructor(exporter: unknown, options: unknown) {
      batchCtorMock(exporter, options);
    }
  },
}));

describe("Phase 1 Tracing :: setup", () => {
  beforeEach(() => {
    vi.resetModules();
    addTraceProcessorMock.mockReset();
    startTraceExportLoopMock.mockReset();
    setDisabledMock.mockReset();
    batchCtorMock.mockReset();
    delete process.env.OPENAI_AGENTS_TRACING_DISABLED;
    delete process.env.OPENAI_AGENTS_TRACE_MAX_QUEUE_SIZE;
    delete process.env.OPENAI_AGENTS_TRACE_MAX_BATCH_SIZE;
    delete process.env.OPENAI_AGENTS_TRACE_SCHEDULE_DELAY_MS;
    delete process.env.OPENAI_AGENTS_TRACE_EXPORT_TRIGGER_RATIO;
  });

  it("[MATRIX:tracing:setup][PACK:bootstrap] registers processor once and starts export loop by default", async () => {
    const { isAgentTracingConfigured, setupAgentTracing } = await import(
      "../../../src/tracing/setup.js"
    );

    expect(isAgentTracingConfigured()).toBe(false);
    setupAgentTracing();
    setupAgentTracing();

    expect(isAgentTracingConfigured()).toBe(true);
    expect(batchCtorMock).toHaveBeenCalledTimes(1);
    expect(addTraceProcessorMock).toHaveBeenCalledTimes(1);
    expect(startTraceExportLoopMock).toHaveBeenCalledTimes(1);
    expect(setDisabledMock).toHaveBeenCalledWith(false);

    const [, options] = batchCtorMock.mock.calls[0];
    expect(options).toEqual({
      maxQueueSize: 2048,
      maxBatchSize: 200,
      scheduleDelay: 5000,
      exportTriggerRatio: 0.7,
    });
  });

  it("[MATRIX:tracing:setup][PACK:safety] supports explicit disable and env-tuned processor options", async () => {
    process.env.OPENAI_AGENTS_TRACE_MAX_QUEUE_SIZE = "4096";
    process.env.OPENAI_AGENTS_TRACE_MAX_BATCH_SIZE = "500";
    process.env.OPENAI_AGENTS_TRACE_SCHEDULE_DELAY_MS = "1000";
    process.env.OPENAI_AGENTS_TRACE_EXPORT_TRIGGER_RATIO = "0.9";

    const { setupAgentTracing } = await import("../../../src/tracing/setup.js");
    setupAgentTracing({ startLoop: false });

    expect(batchCtorMock).toHaveBeenCalledTimes(1);
    expect(startTraceExportLoopMock).not.toHaveBeenCalled();
    const [, options] = batchCtorMock.mock.calls[0];
    expect(options).toEqual({
      maxQueueSize: 4096,
      maxBatchSize: 500,
      scheduleDelay: 1000,
      exportTriggerRatio: 0.9,
    });

    vi.resetModules();
    addTraceProcessorMock.mockReset();
    startTraceExportLoopMock.mockReset();
    setDisabledMock.mockReset();
    batchCtorMock.mockReset();

    process.env.OPENAI_AGENTS_TRACING_DISABLED = "true";
    const disabledSetupModule = await import("../../../src/tracing/setup.js");
    disabledSetupModule.setupAgentTracing();

    expect(disabledSetupModule.isAgentTracingConfigured()).toBe(false);
    expect(batchCtorMock).not.toHaveBeenCalled();
    expect(addTraceProcessorMock).not.toHaveBeenCalled();
    expect(setDisabledMock).not.toHaveBeenCalled();
  });
});
