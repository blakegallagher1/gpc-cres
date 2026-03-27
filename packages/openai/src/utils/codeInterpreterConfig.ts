/**
 * Code Interpreter tool configuration for multi-pass document inspection (P3 Pattern 49).
 * Enables zoom, crop, rotate operations via Python in an OpenAI-hosted container.
 */

export type CodeInterpreterEnvironment = {
  type: "code_interpreter";
  container: { type: "auto" };
};

export type ImageOperation =
  | { type: "crop"; x: number; y: number; width: number; height: number }
  | { type: "rotate"; degrees: number }
  | { type: "resize"; width: number; height: number }
  | { type: "enhance"; contrast?: number; brightness?: number; sharpness?: number }
  | { type: "grayscale" };

export type ProcessingPipeline = {
  operations: ImageOperation[];
  outputFormat: "png" | "jpeg";
  quality?: number;
};

export function buildCodeInterpreterToolConfig(): CodeInterpreterEnvironment {
  return {
    type: "code_interpreter",
    container: { type: "auto" },
  };
}

export function buildProcessingPipeline(operations: ImageOperation[]): ProcessingPipeline {
  return {
    operations,
    outputFormat: "png",
    quality: 95,
  };
}

export function shouldUseCodeInterpreter(options: {
  pageComplexity?: "low" | "medium" | "high";
  hasSmallText?: boolean;
  isSkewed?: boolean;
  extractionFailed?: boolean;
}): boolean {
  if (options.extractionFailed) return true;
  if (options.isSkewed) return true;
  if (options.pageComplexity === "high" && options.hasSmallText) return true;
  return false;
}

export function buildCropOperation(region: {
  x: number; y: number; width: number; height: number;
}): ImageOperation {
  return { type: "crop", ...region };
}

export function buildRotateOperation(degrees: number): ImageOperation {
  return { type: "rotate", degrees: degrees % 360 };
}

export function buildEnhanceOperation(options?: {
  contrast?: number; brightness?: number; sharpness?: number;
}): ImageOperation {
  return {
    type: "enhance",
    contrast: options?.contrast ?? 1.2,
    brightness: options?.brightness ?? 1.0,
    sharpness: options?.sharpness ?? 1.5,
  };
}
