import {
  shouldWriteArtifact,
  buildArtifactPath,
  buildArtifactReference,
  isArtifactReference,
  formatArtifactSummary,
  ArtifactReference,
} from "../artifactBoundary";

describe("artifactBoundary", () => {
  describe("shouldWriteArtifact", () => {
    it("returns false for small string data", () => {
      const smallData = "hello world";
      expect(shouldWriteArtifact(smallData)).toBe(false);
    });

    it("returns true for large string data", () => {
      const largeData = "x".repeat(60_000);
      expect(shouldWriteArtifact(largeData)).toBe(true);
    });

    it("returns false for small buffer data", () => {
      const smallBuffer = Buffer.from("hello world");
      expect(shouldWriteArtifact(smallBuffer)).toBe(false);
    });

    it("returns true for large buffer data", () => {
      const largeBuffer = Buffer.alloc(60_000);
      expect(shouldWriteArtifact(largeBuffer)).toBe(true);
    });

    it("returns false at threshold boundary (50KB)", () => {
      const exactThreshold = "x".repeat(50_000);
      expect(shouldWriteArtifact(exactThreshold)).toBe(false);
    });

    it("returns true just above threshold boundary", () => {
      const justAboveThreshold = "x".repeat(50_001);
      expect(shouldWriteArtifact(justAboveThreshold)).toBe(true);
    });
  });

  describe("buildArtifactPath", () => {
    it("uses default directory when not provided", () => {
      const path = buildArtifactPath({
        toolName: "myTool",
        format: "json",
        timestamp: 1234567890,
      });
      expect(path).toMatch(/^\/mnt\/data\//);
    });

    it("uses custom directory when provided", () => {
      const path = buildArtifactPath({
        dir: "/custom/path",
        toolName: "myTool",
        format: "json",
        timestamp: 1234567890,
      });
      expect(path).toMatch(/^\/custom\/path\//);
    });

    it("sanitizes tool name", () => {
      const path = buildArtifactPath({
        toolName: "my-tool@2.0/alpha!",
        format: "json",
        timestamp: 1234567890,
      });
      expect(path).toContain("my-tool_2_0_alpha_");
    });

    it("includes timestamp", () => {
      const ts = 1234567890;
      const path = buildArtifactPath({
        toolName: "myTool",
        format: "json",
        timestamp: ts,
      });
      expect(path).toContain(`${ts}.json`);
    });

    it("uses current timestamp when not provided", () => {
      const beforeTime = Date.now();
      const path = buildArtifactPath({
        toolName: "myTool",
        format: "json",
      });
      const afterTime = Date.now();

      // Extract timestamp from path
      const match = path.match(/(\d+)\.json$/);
      expect(match).not.toBeNull();
      const ts = parseInt(match![1], 10);
      expect(ts).toBeGreaterThanOrEqual(beforeTime);
      expect(ts).toBeLessThanOrEqual(afterTime);
    });

    it("includes format extension", () => {
      const path = buildArtifactPath({
        toolName: "myTool",
        format: "csv",
        timestamp: 1234567890,
      });
      expect(path).toMatch(/\.csv$/);
    });
  });

  describe("buildArtifactReference", () => {
    it("creates correct structure", () => {
      const ref = buildArtifactReference({
        path: "/mnt/data/report-123.json",
        size: 75_000,
        format: "json",
      });

      expect(ref.type).toBe("artifact_reference");
      expect(ref.path).toBe("/mnt/data/report-123.json");
      expect(ref.size).toBe(75_000);
      expect(ref.format).toBe("json");
      expect(ref.createdAt).toBeDefined();
      expect(ref.label).toBeUndefined();
    });

    it("includes optional label", () => {
      const ref = buildArtifactReference({
        path: "/mnt/data/report-123.json",
        size: 75_000,
        format: "json",
        label: "Financial Report",
      });

      expect(ref.label).toBe("Financial Report");
    });

    it("sets createdAt to valid ISO string", () => {
      const ref = buildArtifactReference({
        path: "/mnt/data/report-123.json",
        size: 75_000,
        format: "json",
      });

      expect(() => new Date(ref.createdAt)).not.toThrow();
      expect(ref.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("isArtifactReference", () => {
    it("returns true for valid artifact reference", () => {
      const ref: ArtifactReference = {
        type: "artifact_reference",
        path: "/mnt/data/report.json",
        size: 75_000,
        format: "json",
        createdAt: new Date().toISOString(),
      };

      expect(isArtifactReference(ref)).toBe(true);
    });

    it("returns false for null", () => {
      expect(isArtifactReference(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isArtifactReference(undefined)).toBe(false);
    });

    it("returns false for non-object", () => {
      expect(isArtifactReference("string")).toBe(false);
      expect(isArtifactReference(123)).toBe(false);
    });

    it("returns false when type is missing", () => {
      expect(
        isArtifactReference({
          path: "/mnt/data/report.json",
          size: 75_000,
        })
      ).toBe(false);
    });

    it("returns false when type is wrong", () => {
      expect(
        isArtifactReference({
          type: "other_type",
          path: "/mnt/data/report.json",
          size: 75_000,
        })
      ).toBe(false);
    });

    it("returns false when path is missing", () => {
      expect(
        isArtifactReference({
          type: "artifact_reference",
          size: 75_000,
        })
      ).toBe(false);
    });

    it("returns false when path is not a string", () => {
      expect(
        isArtifactReference({
          type: "artifact_reference",
          path: 123,
          size: 75_000,
        })
      ).toBe(false);
    });
  });

  describe("formatArtifactSummary", () => {
    it("includes size in KB", () => {
      const ref: ArtifactReference = {
        type: "artifact_reference",
        path: "/mnt/data/report.json",
        size: 75_000,
        format: "json",
        createdAt: new Date().toISOString(),
      };

      const summary = formatArtifactSummary(ref);
      expect(summary).toContain("73.2KB");
    });

    it("includes path", () => {
      const ref: ArtifactReference = {
        type: "artifact_reference",
        path: "/mnt/data/report.json",
        size: 75_000,
        format: "json",
        createdAt: new Date().toISOString(),
      };

      const summary = formatArtifactSummary(ref);
      expect(summary).toContain("/mnt/data/report.json");
    });

    it("includes format", () => {
      const ref: ArtifactReference = {
        type: "artifact_reference",
        path: "/mnt/data/report.json",
        size: 75_000,
        format: "json",
        createdAt: new Date().toISOString(),
      };

      const summary = formatArtifactSummary(ref);
      expect(summary).toContain("json file");
    });

    it("includes label when present", () => {
      const ref: ArtifactReference = {
        type: "artifact_reference",
        path: "/mnt/data/report.json",
        size: 75_000,
        format: "json",
        label: "Financial Report",
        createdAt: new Date().toISOString(),
      };

      const summary = formatArtifactSummary(ref);
      expect(summary).toContain("Financial Report");
    });

    it("omits label when not present", () => {
      const ref: ArtifactReference = {
        type: "artifact_reference",
        path: "/mnt/data/report.json",
        size: 75_000,
        format: "json",
        createdAt: new Date().toISOString(),
      };

      const summary = formatArtifactSummary(ref);
      expect(summary).not.toContain("undefined");
      expect(summary).toContain("[Artifact:");
    });

    it("formats summary as readable string", () => {
      const ref: ArtifactReference = {
        type: "artifact_reference",
        path: "/mnt/data/report.json",
        size: 102_400,
        format: "pdf",
        label: "Lease Analysis",
        createdAt: new Date().toISOString(),
      };

      const summary = formatArtifactSummary(ref);
      expect(summary).toMatch(/\[Artifact \(Lease Analysis\): pdf file, 100.0KB at \/mnt\/data\/report.json\]/);
    });
  });
});
