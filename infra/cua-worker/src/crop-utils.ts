/**
 * Crop-and-rerun utilities for focused CUA data extraction (P2 Pattern 50).
 * Two-pass approach: full screenshot → detect region → crop → re-analyze.
 */

export type BoundingBox = {
  x: number;      // top-left x (pixels)
  y: number;      // top-left y (pixels)
  width: number;  // width (pixels)
  height: number; // height (pixels)
};

export type CropResult = {
  croppedBase64: string;
  originalWidth: number;
  originalHeight: number;
  cropRegion: BoundingBox;
};

const MIN_CROP_DIMENSION = 200;
const MAX_CROP_RATIO = 0.9; // Don't crop if region is >90% of original

export function validateBoundingBox(
  box: BoundingBox,
  imageWidth: number,
  imageHeight: number,
): { valid: boolean; reason?: string } {
  if (box.width < MIN_CROP_DIMENSION || box.height < MIN_CROP_DIMENSION) {
    return { valid: false, reason: `Crop region too small (min ${MIN_CROP_DIMENSION}px)` };
  }
  if (box.x < 0 || box.y < 0) {
    return { valid: false, reason: "Crop region has negative coordinates" };
  }
  if (box.x + box.width > imageWidth || box.y + box.height > imageHeight) {
    return { valid: false, reason: "Crop region extends beyond image bounds" };
  }
  const cropArea = box.width * box.height;
  const totalArea = imageWidth * imageHeight;
  if (cropArea / totalArea > MAX_CROP_RATIO) {
    return { valid: false, reason: "Crop region covers >90% of image — no benefit to cropping" };
  }
  return { valid: true };
}

export function shouldCropAndRerun(options: {
  confidenceScore?: number;
  confidenceThreshold?: number;
  modelSuggestsCrop?: boolean;
}): boolean {
  const threshold = options.confidenceThreshold ?? 0.6;
  if (options.modelSuggestsCrop) return true;
  if (options.confidenceScore !== undefined && options.confidenceScore < threshold) return true;
  return false;
}

export function buildCropRegion(
  normalized: { xMin: number; yMin: number; xMax: number; yMax: number },
  imageWidth: number,
  imageHeight: number,
  padding: number = 20,
): BoundingBox {
  // Convert normalized 0-999 coordinates to pixel coordinates
  const x = Math.max(0, Math.floor((normalized.xMin / 999) * imageWidth) - padding);
  const y = Math.max(0, Math.floor((normalized.yMin / 999) * imageHeight) - padding);
  const x2 = Math.min(imageWidth, Math.ceil((normalized.xMax / 999) * imageWidth) + padding);
  const y2 = Math.min(imageHeight, Math.ceil((normalized.yMax / 999) * imageHeight) + padding);
  return { x, y, width: x2 - x, height: y2 - y };
}

export function buildFocusedExtractionPrompt(
  originalInstructions: string,
  cropRegion: BoundingBox,
): string {
  return [
    "FOCUSED EXTRACTION MODE — This is a cropped region of a larger page.",
    `Region: ${cropRegion.width}×${cropRegion.height}px from position (${cropRegion.x}, ${cropRegion.y}).`,
    "Extract ALL visible data exactly as shown. Do not paraphrase or round numbers.",
    "",
    "Original task:",
    originalInstructions,
  ].join("\n");
}
