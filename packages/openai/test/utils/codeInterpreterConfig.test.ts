import { describe, expect, it } from "vitest";

import {
  buildCodeInterpreterToolConfig,
  buildProcessingPipeline,
  shouldUseCodeInterpreter,
  buildCropOperation,
  buildRotateOperation,
  buildEnhanceOperation,
} from "../../src/utils/codeInterpreterConfig.js";

describe("codeInterpreterConfig", () => {
  describe("buildCodeInterpreterToolConfig", () => {
    it("returns correct structure", () => {
      const config = buildCodeInterpreterToolConfig();
      expect(config).toEqual({
        type: "code_interpreter",
        container: { type: "auto" },
      });
    });
  });

  describe("buildProcessingPipeline", () => {
    it("includes operations and format", () => {
      const cropOp = buildCropOperation({ x: 0, y: 0, width: 100, height: 100 });
      const rotateOp = buildRotateOperation(90);
      const operations = [cropOp, rotateOp];

      const pipeline = buildProcessingPipeline(operations);

      expect(pipeline).toEqual({
        operations,
        outputFormat: "png",
        quality: 95,
      });
    });
  });

  describe("shouldUseCodeInterpreter", () => {
    it("returns true for failed extraction", () => {
      const result = shouldUseCodeInterpreter({ extractionFailed: true });
      expect(result).toBe(true);
    });

    it("returns true for skewed pages", () => {
      const result = shouldUseCodeInterpreter({ isSkewed: true });
      expect(result).toBe(true);
    });

    it("returns true for high complexity with small text", () => {
      const result = shouldUseCodeInterpreter({
        pageComplexity: "high",
        hasSmallText: true,
      });
      expect(result).toBe(true);
    });

    it("returns true for high complexity without small text", () => {
      const result = shouldUseCodeInterpreter({
        pageComplexity: "high",
        hasSmallText: false,
      });
      expect(result).toBe(false);
    });

    it("returns false for simple pages", () => {
      const result = shouldUseCodeInterpreter({
        pageComplexity: "low",
        hasSmallText: false,
        isSkewed: false,
        extractionFailed: false,
      });
      expect(result).toBe(false);
    });

    it("returns false for medium complexity without small text", () => {
      const result = shouldUseCodeInterpreter({
        pageComplexity: "medium",
        hasSmallText: false,
        isSkewed: false,
      });
      expect(result).toBe(false);
    });
  });

  describe("buildCropOperation", () => {
    it("creates crop with coordinates", () => {
      const crop = buildCropOperation({
        x: 100,
        y: 200,
        width: 300,
        height: 400,
      });

      expect(crop).toEqual({
        type: "crop",
        x: 100,
        y: 200,
        width: 300,
        height: 400,
      });
    });
  });

  describe("buildRotateOperation", () => {
    it("normalizes degrees", () => {
      const rotate1 = buildRotateOperation(90);
      expect(rotate1).toEqual({ type: "rotate", degrees: 90 });

      const rotate2 = buildRotateOperation(450);
      expect(rotate2).toEqual({ type: "rotate", degrees: 90 });

      const rotate3 = buildRotateOperation(720);
      expect(rotate3).toEqual({ type: "rotate", degrees: 0 });
    });
  });

  describe("buildEnhanceOperation", () => {
    it("uses defaults when no options provided", () => {
      const enhance = buildEnhanceOperation();

      expect(enhance).toEqual({
        type: "enhance",
        contrast: 1.2,
        brightness: 1.0,
        sharpness: 1.5,
      });
    });

    it("merges provided options with defaults", () => {
      const enhance = buildEnhanceOperation({
        contrast: 1.5,
        sharpness: 2.0,
      });

      expect(enhance).toEqual({
        type: "enhance",
        contrast: 1.5,
        brightness: 1.0,
        sharpness: 2.0,
      });
    });

    it("uses all custom values", () => {
      const enhance = buildEnhanceOperation({
        contrast: 1.1,
        brightness: 0.9,
        sharpness: 1.8,
      });

      expect(enhance).toEqual({
        type: "enhance",
        contrast: 1.1,
        brightness: 0.9,
        sharpness: 1.8,
      });
    });
  });
});
