import { describe, expect, it } from "vitest";
import {
  fileOutput,
  imageOutput,
  isRichOutput,
  textOutput,
  type RichToolOutput,
} from "../richToolOutput";

describe("richToolOutput", () => {
  it("builds and validates known tool output variants", () => {
    const outputs: RichToolOutput[] = [
      textOutput("analysis completed"),
      imageOutput({
        url: "https://example.com/render.png",
        mediaType: "image/png",
        detail: "high",
      }),
      fileOutput({
        path: "/tmp/report.pdf",
        mediaType: "application/pdf",
        filename: "report.pdf",
      }),
    ];

    const [text, image, file] = outputs;

    expect(isRichOutput(text)).toBe(true);
    expect(text).toMatchObject({ type: "text", text: "analysis completed" });

    expect(isRichOutput(image)).toBe(true);
    expect(image).toMatchObject({
      type: "image",
      imageUrl: "https://example.com/render.png",
      mediaType: "image/png",
      detail: "high",
    });

    expect(isRichOutput(file)).toBe(true);
    expect(file).toMatchObject({
      type: "file",
      filePath: "/tmp/report.pdf",
      mediaType: "application/pdf",
      filename: "report.pdf",
    });
  });

  it("returns false for invalid rich output payloads", () => {
    expect(isRichOutput({ type: "video", url: "missing-type-fields" })).toBe(
      false,
    );
    expect(isRichOutput({})).toBe(false);
    expect(isRichOutput(null)).toBe(false);
  });
});
