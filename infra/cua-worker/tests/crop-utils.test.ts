import { describe, expect, it } from "vitest";
import {
  BoundingBox,
  buildCropRegion,
  buildFocusedExtractionPrompt,
  shouldCropAndRerun,
  validateBoundingBox,
} from "../src/crop-utils.js";

describe("crop-utils: validateBoundingBox", () => {
  const imageWidth = 1920;
  const imageHeight = 1080;

  it("accepts valid region", () => {
    const box: BoundingBox = { x: 100, y: 100, width: 500, height: 300 };
    const result = validateBoundingBox(box, imageWidth, imageHeight);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("rejects region with width too small", () => {
    const box: BoundingBox = { x: 100, y: 100, width: 150, height: 300 };
    const result = validateBoundingBox(box, imageWidth, imageHeight);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("too small");
  });

  it("rejects region with height too small", () => {
    const box: BoundingBox = { x: 100, y: 100, width: 500, height: 150 };
    const result = validateBoundingBox(box, imageWidth, imageHeight);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("too small");
  });

  it("rejects negative x coordinate", () => {
    const box: BoundingBox = { x: -10, y: 100, width: 500, height: 300 };
    const result = validateBoundingBox(box, imageWidth, imageHeight);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("negative");
  });

  it("rejects negative y coordinate", () => {
    const box: BoundingBox = { x: 100, y: -10, width: 500, height: 300 };
    const result = validateBoundingBox(box, imageWidth, imageHeight);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("negative");
  });

  it("rejects region extending beyond image width", () => {
    const box: BoundingBox = { x: 1500, y: 100, width: 500, height: 300 };
    const result = validateBoundingBox(box, imageWidth, imageHeight);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("extends beyond");
  });

  it("rejects region extending beyond image height", () => {
    const box: BoundingBox = { x: 100, y: 900, width: 500, height: 300 };
    const result = validateBoundingBox(box, imageWidth, imageHeight);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("extends beyond");
  });

  it("rejects region covering >90% of image", () => {
    const box: BoundingBox = { x: 0, y: 0, width: 1900, height: 1070 };
    const result = validateBoundingBox(box, imageWidth, imageHeight);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain(">90%");
  });

  it("accepts region at exactly min dimension boundary", () => {
    const box: BoundingBox = { x: 100, y: 100, width: 200, height: 200 };
    const result = validateBoundingBox(box, imageWidth, imageHeight);
    expect(result.valid).toBe(true);
  });
});

describe("crop-utils: shouldCropAndRerun", () => {
  it("returns true when confidenceScore is below default threshold", () => {
    const result = shouldCropAndRerun({ confidenceScore: 0.5 });
    expect(result).toBe(true);
  });

  it("returns false when confidenceScore is above default threshold", () => {
    const result = shouldCropAndRerun({ confidenceScore: 0.7 });
    expect(result).toBe(false);
  });

  it("returns true when confidenceScore is below custom threshold", () => {
    const result = shouldCropAndRerun({
      confidenceScore: 0.5,
      confidenceThreshold: 0.8,
    });
    expect(result).toBe(true);
  });

  it("returns false when confidenceScore is above custom threshold", () => {
    const result = shouldCropAndRerun({
      confidenceScore: 0.9,
      confidenceThreshold: 0.8,
    });
    expect(result).toBe(false);
  });

  it("returns true when modelSuggestsCrop is true regardless of confidence", () => {
    const result = shouldCropAndRerun({
      confidenceScore: 0.9,
      modelSuggestsCrop: true,
    });
    expect(result).toBe(true);
  });

  it("returns false when no options provided", () => {
    const result = shouldCropAndRerun({});
    expect(result).toBe(false);
  });

  it("returns false when confidenceScore is at threshold boundary", () => {
    const result = shouldCropAndRerun({ confidenceScore: 0.6 });
    expect(result).toBe(false);
  });

  it("returns true when confidenceScore is just below threshold", () => {
    const result = shouldCropAndRerun({ confidenceScore: 0.59 });
    expect(result).toBe(true);
  });
});

describe("crop-utils: buildCropRegion", () => {
  const imageWidth = 1920;
  const imageHeight = 1080;

  it("converts normalized 0-999 coordinates to pixel coordinates", () => {
    const normalized = { xMin: 0, yMin: 0, xMax: 500, yMax: 500 };
    const region = buildCropRegion(normalized, imageWidth, imageHeight, 0);

    expect(region.x).toBe(0);
    expect(region.y).toBe(0);
    expect(region.width).toBe(Math.ceil((500 / 999) * imageWidth));
    expect(region.height).toBe(Math.ceil((500 / 999) * imageHeight));
  });

  it("applies padding correctly", () => {
    const normalized = { xMin: 100, yMin: 100, xMax: 500, yMax: 500 };
    const region = buildCropRegion(normalized, imageWidth, imageHeight, 20);

    // x should be (100/999)*1920 - 20, clamped to >= 0
    const expectedXBase = Math.floor((100 / 999) * imageWidth);
    expect(region.x).toBe(expectedXBase - 20);
    expect(region.y).toBe(Math.floor((100 / 999) * imageHeight) - 20);
  });

  it("clamps negative x to 0 when padding exceeds boundary", () => {
    const normalized = { xMin: 0, yMin: 0, xMax: 500, yMax: 500 };
    const region = buildCropRegion(normalized, imageWidth, imageHeight, 50);

    expect(region.x).toBe(0);
    expect(region.y).toBe(0);
  });

  it("clamps region beyond image bounds on right side", () => {
    const normalized = { xMin: 800, yMin: 100, xMax: 999, yMax: 500 };
    const region = buildCropRegion(normalized, imageWidth, imageHeight, 50);

    const maxX = region.x + region.width;
    expect(maxX).toBeLessThanOrEqual(imageWidth);
  });

  it("clamps region beyond image bounds on bottom side", () => {
    const normalized = { xMin: 100, yMin: 800, xMax: 500, yMax: 999 };
    const region = buildCropRegion(normalized, imageWidth, imageHeight, 50);

    const maxY = region.y + region.height;
    expect(maxY).toBeLessThanOrEqual(imageHeight);
  });

  it("uses default padding of 20 when not specified", () => {
    const normalized = { xMin: 100, yMin: 100, xMax: 500, yMax: 500 };
    const region1 = buildCropRegion(normalized, imageWidth, imageHeight);
    const region2 = buildCropRegion(normalized, imageWidth, imageHeight, 20);

    expect(region1.x).toBe(region2.x);
    expect(region1.y).toBe(region2.y);
    expect(region1.width).toBe(region2.width);
    expect(region1.height).toBe(region2.height);
  });

  it("handles full-screen normalized region", () => {
    const normalized = { xMin: 0, yMin: 0, xMax: 999, yMax: 999 };
    const region = buildCropRegion(normalized, imageWidth, imageHeight, 0);

    expect(region.x).toBe(0);
    expect(region.y).toBe(0);
    expect(region.x + region.width).toBeLessThanOrEqual(imageWidth);
    expect(region.y + region.height).toBeLessThanOrEqual(imageHeight);
  });
});

describe("crop-utils: buildFocusedExtractionPrompt", () => {
  it("includes original task instructions", () => {
    const original = "Extract all rent amounts from this document.";
    const region: BoundingBox = { x: 100, y: 100, width: 500, height: 300 };

    const prompt = buildFocusedExtractionPrompt(original, region);

    expect(prompt).toContain(original);
    expect(prompt).toContain("Original task:");
  });

  it("includes crop region dimensions and position", () => {
    const original = "Extract data";
    const region: BoundingBox = { x: 150, y: 200, width: 600, height: 400 };

    const prompt = buildFocusedExtractionPrompt(original, region);

    expect(prompt).toContain("600×400px");
    expect(prompt).toContain("(150, 200)");
  });

  it("includes focused extraction mode header", () => {
    const original = "Extract data";
    const region: BoundingBox = { x: 100, y: 100, width: 500, height: 300 };

    const prompt = buildFocusedExtractionPrompt(original, region);

    expect(prompt).toContain("FOCUSED EXTRACTION MODE");
    expect(prompt).toContain("cropped region");
  });

  it("emphasizes exact data extraction", () => {
    const original = "Extract data";
    const region: BoundingBox = { x: 100, y: 100, width: 500, height: 300 };

    const prompt = buildFocusedExtractionPrompt(original, region);

    expect(prompt).toContain("exactly");
    expect(prompt).toContain("paraphrase");
  });

  it("formats output as multi-line string", () => {
    const original = "Extract data";
    const region: BoundingBox = { x: 100, y: 100, width: 500, height: 300 };

    const prompt = buildFocusedExtractionPrompt(original, region);
    const lines = prompt.split("\n");

    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toContain("FOCUSED EXTRACTION MODE");
  });
});
