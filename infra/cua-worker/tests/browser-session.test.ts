import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  launchMock,
  newContextMock,
  newPageMock,
  gotoMock,
  screenshotMock,
  titleMock,
  urlMock,
  contextCloseMock,
  browserCloseMock,
  mkdirMock,
} = vi.hoisted(() => ({
  launchMock: vi.fn(),
  newContextMock: vi.fn(),
  newPageMock: vi.fn(),
  gotoMock: vi.fn(),
  screenshotMock: vi.fn(),
  titleMock: vi.fn(),
  urlMock: vi.fn(),
  contextCloseMock: vi.fn(),
  browserCloseMock: vi.fn(),
  mkdirMock: vi.fn(),
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: launchMock,
  },
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    mkdir: mkdirMock,
  };
});

describe("launchBrowserSession", () => {
  beforeEach(() => {
    gotoMock.mockReset();
    screenshotMock.mockReset();
    titleMock.mockReset();
    urlMock.mockReset();
    newPageMock.mockReset();
    newContextMock.mockReset();
    launchMock.mockReset();
    contextCloseMock.mockReset();
    browserCloseMock.mockReset();
    mkdirMock.mockReset();

    gotoMock.mockResolvedValue(undefined);
    screenshotMock.mockResolvedValue(undefined);
    titleMock.mockResolvedValue("Example title");
    urlMock.mockReturnValue("https://example.com/path");
    mkdirMock.mockResolvedValue(undefined);

    const page = {
      goto: gotoMock,
      screenshot: screenshotMock,
      title: titleMock,
      url: urlMock,
    };
    const context = {
      newPage: newPageMock,
      close: contextCloseMock,
    };
    const browser = {
      newContext: newContextMock,
      close: browserCloseMock,
    };

    newPageMock.mockResolvedValue(page);
    newContextMock.mockResolvedValue(context);
    launchMock.mockResolvedValue(browser);
    contextCloseMock.mockResolvedValue(undefined);
    browserCloseMock.mockResolvedValue(undefined);
  });

  it("launches Chromium, navigates, and captures sanitized screenshots", async () => {
    const { DEFAULT_VIEWPORT, launchBrowserSession } = await import("../src/browser-session.js");

    const session = await launchBrowserSession({
      url: "https://example.com/path",
      screenshotDir: "/tmp/cua",
      headless: false,
    });

    expect(launchMock).toHaveBeenCalledWith({
      args: [
        `--window-size=${DEFAULT_VIEWPORT.width},${DEFAULT_VIEWPORT.height}`,
        "--disable-extensions",
      ],
      headless: false,
    });
    expect(newContextMock).toHaveBeenCalledWith({ viewport: DEFAULT_VIEWPORT });
    expect(gotoMock).toHaveBeenCalledWith("https://example.com/path", {
      waitUntil: "load",
      timeout: 30_000,
    });

    const first = await session.captureScreenshot("  Parcel Lookup / Baton Rouge  ");
    const second = await session.captureScreenshot("Status#2");

    expect(screenshotMock).toHaveBeenNthCalledWith(1, {
      path: "/tmp/cua/001-parcel-lookup-baton-rouge.png",
    });
    expect(screenshotMock).toHaveBeenNthCalledWith(2, {
      path: "/tmp/cua/002-status-2.png",
    });
    expect(first).toMatchObject({
      path: "/tmp/cua/001-parcel-lookup-baton-rouge.png",
      url: "https://example.com/path",
    });
    expect(second.path).toBe("/tmp/cua/002-status-2.png");

    await expect(session.readState()).resolves.toEqual({
      currentUrl: "https://example.com/path",
      pageTitle: "Example title",
    });
  });

  it("closes the browser context and browser", async () => {
    const { launchBrowserSession } = await import("../src/browser-session.js");

    const session = await launchBrowserSession({
      url: "https://example.com/path",
      screenshotDir: "/tmp/cua",
    });

    await session.close();

    expect(contextCloseMock).toHaveBeenCalledTimes(1);
    expect(browserCloseMock).toHaveBeenCalledTimes(1);
  });
});
