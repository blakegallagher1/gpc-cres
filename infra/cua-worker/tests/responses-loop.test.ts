import { describe, expect, it, vi } from "vitest";
import { runNativeComputerLoop } from "../src/responses-loop.js";

function createMockSession() {
  const screenshotSpy = vi.fn().mockResolvedValue(Buffer.from("png"));
  const clickSpy = vi.fn().mockResolvedValue(undefined);
  const moveSpy = vi.fn().mockResolvedValue(undefined);
  const mouseDownSpy = vi.fn().mockResolvedValue(undefined);
  const mouseUpSpy = vi.fn().mockResolvedValue(undefined);
  const wheelSpy = vi.fn().mockResolvedValue(undefined);
  const keyDownSpy = vi.fn().mockResolvedValue(undefined);
  const keyUpSpy = vi.fn().mockResolvedValue(undefined);
  const keyTypeSpy = vi.fn().mockResolvedValue(undefined);
  const keyPressSpy = vi.fn().mockResolvedValue(undefined);

  return {
    page: {
      screenshot: screenshotSpy,
      url: vi.fn(() => "https://example.com"),
      title: vi.fn().mockResolvedValue("Example"),
      mouse: {
        click: clickSpy,
        move: moveSpy,
        down: mouseDownSpy,
        up: mouseUpSpy,
        wheel: wheelSpy,
      },
      keyboard: {
        down: keyDownSpy,
        up: keyUpSpy,
        type: keyTypeSpy,
        press: keyPressSpy,
      },
    },
    captureScreenshot: vi
      .fn()
      .mockResolvedValueOnce({
        path: "/tmp/001-initial-state.png",
        capturedAt: new Date().toISOString(),
        url: "https://example.com",
      })
      .mockResolvedValueOnce({
        path: "/tmp/002-turn-1.png",
        capturedAt: new Date().toISOString(),
        url: "https://example.com",
      }),
    readState: vi.fn().mockResolvedValue({
      currentUrl: "https://example.com",
      pageTitle: "Example",
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe("runNativeComputerLoop", () => {
  it("holds modifier keys around mouse actions", async () => {
    const session = createMockSession();
    const createResponse = vi
      .fn()
      .mockResolvedValueOnce({
        id: "resp_1",
        output: [
          {
            type: "computer_call",
            call_id: "call_1",
            actions: [{ type: "click", x: 120, y: 180, keys: ["CTRL"] }],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1, prompt_tokens_details: { cached_tokens: 0 } },
      })
      .mockResolvedValueOnce({
        id: "resp_2",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "Done." }],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1, prompt_tokens_details: { cached_tokens: 0 } },
      });

    const client = {
      responses: {
        create: createResponse,
      },
    };

    await runNativeComputerLoop({
      client: client as never,
      model: "gpt-5.4",
      session: session as never,
      instructions: "Open the listing.",
      maxTurns: 4,
      onEvent: vi.fn(),
      signal: new AbortController().signal,
    });

    expect(session.page.keyboard.down).toHaveBeenCalledWith("Control");
    expect(session.page.mouse.click).toHaveBeenCalledWith(120, 180, { button: "left" });
    expect(session.page.keyboard.up).toHaveBeenCalledWith("Control");

    const downOrder = vi.mocked(session.page.keyboard.down).mock.invocationCallOrder[0];
    const clickOrder = vi.mocked(session.page.mouse.click).mock.invocationCallOrder[0];
    const upOrder = vi.mocked(session.page.keyboard.up).mock.invocationCallOrder[0];
    expect(downOrder).toBeLessThan(clickOrder);
    expect(clickOrder).toBeLessThan(upOrder);
  });

  it("stops when the response contains pending safety checks", async () => {
    const session = createMockSession();
    const onEvent = vi.fn();
    const client = {
      responses: {
        create: vi.fn().mockResolvedValue({
          id: "resp_1",
          output: [
            {
              type: "computer_call",
              call_id: "call_1",
              pending_safety_checks: [
                { code: "confirm_action", message: "Confirm before sending data" },
              ],
              actions: [{ type: "click", x: 120, y: 180 }],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1, prompt_tokens_details: { cached_tokens: 0 } },
        }),
      },
    };

    await expect(
      runNativeComputerLoop({
        client: client as never,
        model: "gpt-5.4",
        session: session as never,
        instructions: "Submit the form.",
        maxTurns: 2,
        onEvent,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("Computer use paused for human confirmation");

    expect(session.page.mouse.click).not.toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        data: expect.objectContaining({
          pendingSafetyChecks: [
            expect.objectContaining({
              code: "confirm_action",
            }),
          ],
        }),
      }),
    );
  });
});
