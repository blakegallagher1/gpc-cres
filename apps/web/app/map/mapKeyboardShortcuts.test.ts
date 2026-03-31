import { describe, expect, it } from "vitest";
import { getMapPageShortcutAction } from "./MapPageClient";

describe("getMapPageShortcutAction", () => {
  it("maps power-user shortcuts to map actions", () => {
    expect(getMapPageShortcutAction({ key: "[" })).toBe("toggle-sidebar");
    expect(getMapPageShortcutAction({ key: "+" })).toBe("zoom-in");
    expect(getMapPageShortcutAction({ key: "=" })).toBe("zoom-in");
    expect(getMapPageShortcutAction({ key: "-" })).toBe("zoom-out");
    expect(getMapPageShortcutAction({ key: "_" })).toBe("zoom-out");
    expect(getMapPageShortcutAction({ key: "Escape" })).toBe("deselect-all");
  });

  it("ignores text-entry targets", () => {
    expect(
      getMapPageShortcutAction({
        key: "[",
        tagName: "INPUT",
      }),
    ).toBeNull();
    expect(
      getMapPageShortcutAction({
        key: "+",
        tagName: "TEXTAREA",
      }),
    ).toBeNull();
    expect(
      getMapPageShortcutAction({
        key: "Escape",
        tagName: "DIV",
        isContentEditable: true,
      }),
    ).toBeNull();
  });
});
