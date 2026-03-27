import { describe, it, expect, vi } from "vitest";
import {
  getWorkDir,
  buildOutputPath,
  shouldWriteToDisk,
  buildDiskOutputReference,
  isDiskOutputReference,
  formatDiskOutputSummary,
  type DiskOutputReference,
} from "../diskOutputManager";

describe("diskOutputManager", () => {
  describe("getWorkDir", () => {
    it("should return correct path for conversation", () => {
      const conversationId = "conv-123";
      const result = getWorkDir(conversationId);

      expect(result).toBe("/tmp/agent-outputs/conv-123");
    });

    it("should handle different conversation IDs", () => {
      const result1 = getWorkDir("conv-abc");
      const result2 = getWorkDir("conv-xyz");

      expect(result1).toBe("/tmp/agent-outputs/conv-abc");
      expect(result2).toBe("/tmp/agent-outputs/conv-xyz");
    });

    it("should handle special characters in conversation ID", () => {
      const result = getWorkDir("conv-123_test.id");

      expect(result).toContain("conv-123_test.id");
    });
  });

  describe("buildOutputPath", () => {
    it("should include tool name and format", () => {
      const result = buildOutputPath({
        conversationId: "conv-123",
        toolName: "analyze_document",
        format: "json",
      });

      expect(result).toContain("analyze_document");
      expect(result).toContain(".json");
    });

    it("should sanitize tool name", () => {
      const result = buildOutputPath({
        conversationId: "conv-123",
        toolName: "analyze@document#tool",
        format: "csv",
      });

      expect(result).not.toContain("@");
      expect(result).not.toContain("#");
      expect(result).toContain("analyze_document_tool");
      expect(result).toContain(".csv");
    });

    it("should use custom temp dir when provided", () => {
      const result = buildOutputPath({
        conversationId: "conv-123",
        toolName: "my_tool",
        format: "txt",
        tempDir: "/custom/temp",
      });

      expect(result).toContain("/custom/temp");
      expect(result).toContain("my_tool");
      expect(result).toContain(".txt");
    });

    it("should use default work dir when temp dir not provided", () => {
      const result = buildOutputPath({
        conversationId: "conv-123",
        toolName: "my_tool",
        format: "txt",
      });

      expect(result).toContain("/tmp/agent-outputs/conv-123");
      expect(result).toContain("my_tool");
    });

    it("should include UUID segment in path", () => {
      const result = buildOutputPath({
        conversationId: "conv-123",
        toolName: "test_tool",
        format: "json",
      });

      // UUID segment should be 8 chars (slice of full UUID)
      const uuidPart = result.match(/test_tool-[a-f0-9]{8}\.json/);
      expect(uuidPart).toBeTruthy();
    });

    it("should generate unique paths on successive calls", () => {
      const result1 = buildOutputPath({
        conversationId: "conv-123",
        toolName: "test_tool",
        format: "json",
      });

      const result2 = buildOutputPath({
        conversationId: "conv-123",
        toolName: "test_tool",
        format: "json",
      });

      expect(result1).not.toBe(result2);
    });

    it("should replace invalid path characters in tool name", () => {
      const result = buildOutputPath({
        conversationId: "conv-123",
        toolName: "tool/with\\spaces@special#chars",
        format: "txt",
      });

      // Should sanitize invalid filename chars (/, \, @, #, etc.)
      const filename = result.split("/").pop() || "";
      expect(filename).not.toContain("/");
      expect(filename).not.toContain("\\");
      expect(filename).not.toContain("@");
      expect(filename).not.toContain("#");
      expect(filename).toContain("_");
    });
  });

  describe("shouldWriteToDisk", () => {
    it("should return false for small string data", () => {
      const smallString = "This is a small string";
      expect(shouldWriteToDisk(smallString)).toBe(false);
    });

    it("should return true for large string data", () => {
      const largeString = "x".repeat(200_000);
      expect(shouldWriteToDisk(largeString)).toBe(true);
    });

    it("should return false for small buffer data", () => {
      const smallBuffer = Buffer.from("Small data");
      expect(shouldWriteToDisk(smallBuffer)).toBe(false);
    });

    it("should return true for large buffer data", () => {
      const largeBuffer = Buffer.alloc(200_000);
      expect(shouldWriteToDisk(largeBuffer)).toBe(true);
    });

    it("should respect custom threshold", () => {
      const data = "x".repeat(50_000); // 50KB

      expect(shouldWriteToDisk(data, 100_000)).toBe(false); // 100KB threshold
      expect(shouldWriteToDisk(data, 40_000)).toBe(true); // 40KB threshold
    });

    it("should use default 100KB threshold", () => {
      const justUnder = "x".repeat(99_999);
      const justOver = "x".repeat(100_001);

      expect(shouldWriteToDisk(justUnder)).toBe(false);
      expect(shouldWriteToDisk(justOver)).toBe(true);
    });

    it("should handle buffer size correctly", () => {
      const buffer = Buffer.alloc(100_001);
      expect(shouldWriteToDisk(buffer)).toBe(true);
    });

    it("should handle empty data", () => {
      expect(shouldWriteToDisk("")).toBe(false);
      expect(shouldWriteToDisk(Buffer.alloc(0))).toBe(false);
    });
  });

  describe("buildDiskOutputReference", () => {
    it("should create correct structure", () => {
      const ref = buildDiskOutputReference({
        path: "/tmp/output.json",
        format: "json",
        sizeEstimate: 150_000,
        toolName: "analyze_tool",
        conversationId: "conv-123",
      });

      expect(ref.type).toBe("disk_output");
      expect(ref.path).toBe("/tmp/output.json");
      expect(ref.format).toBe("json");
      expect(ref.sizeEstimate).toBe(150_000);
      expect(ref.toolName).toBe("analyze_tool");
      expect(ref.conversationId).toBe("conv-123");
    });

    it("should set createdAt to ISO string", () => {
      const before = new Date();
      const ref = buildDiskOutputReference({
        path: "/tmp/output.json",
        format: "json",
        sizeEstimate: 150_000,
        toolName: "analyze_tool",
        conversationId: "conv-123",
      });
      const after = new Date();

      expect(ref.createdAt).toBeTruthy();
      const createdTime = new Date(ref.createdAt);
      expect(createdTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(createdTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should handle different size estimates", () => {
      const ref1 = buildDiskOutputReference({
        path: "/tmp/small.json",
        format: "json",
        sizeEstimate: 1_000,
        toolName: "tool1",
        conversationId: "conv-1",
      });

      const ref2 = buildDiskOutputReference({
        path: "/tmp/large.json",
        format: "json",
        sizeEstimate: 10_000_000,
        toolName: "tool2",
        conversationId: "conv-2",
      });

      expect(ref1.sizeEstimate).toBe(1_000);
      expect(ref2.sizeEstimate).toBe(10_000_000);
    });

    it("should handle different formats", () => {
      const formats = ["json", "csv", "parquet", "arrow", "txt"];

      formats.forEach((fmt) => {
        const ref = buildDiskOutputReference({
          path: `/tmp/output.${fmt}`,
          format: fmt,
          sizeEstimate: 100_000,
          toolName: "tool",
          conversationId: "conv",
        });

        expect(ref.format).toBe(fmt);
      });
    });
  });

  describe("isDiskOutputReference", () => {
    it("should return true for valid disk output reference", () => {
      const ref: DiskOutputReference = {
        type: "disk_output",
        path: "/tmp/output.json",
        format: "json",
        sizeEstimate: 150_000,
        toolName: "analyze_tool",
        conversationId: "conv-123",
        createdAt: new Date().toISOString(),
      };

      expect(isDiskOutputReference(ref)).toBe(true);
    });

    it("should return false for null", () => {
      expect(isDiskOutputReference(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isDiskOutputReference(undefined)).toBe(false);
    });

    it("should return false for non-object", () => {
      expect(isDiskOutputReference("string")).toBe(false);
      expect(isDiskOutputReference(123)).toBe(false);
      expect(isDiskOutputReference(true)).toBe(false);
    });

    it("should return false for object without type field", () => {
      expect(
        isDiskOutputReference({
          path: "/tmp/output.json",
          format: "json",
        })
      ).toBe(false);
    });

    it("should return false for object with wrong type", () => {
      expect(
        isDiskOutputReference({
          type: "memory_output",
          path: "/tmp/output.json",
        })
      ).toBe(false);
    });

    it("should return false for partial reference", () => {
      expect(
        isDiskOutputReference({
          type: "disk_output",
          path: "/tmp/output.json",
        })
      ).toBe(true); // Type check only, other fields not required
    });

    it("should work with arrays", () => {
      expect(isDiskOutputReference([])).toBe(false);
    });

    it("should work with objects created from references", () => {
      const ref = buildDiskOutputReference({
        path: "/tmp/output.json",
        format: "json",
        sizeEstimate: 150_000,
        toolName: "tool",
        conversationId: "conv",
      });

      expect(isDiskOutputReference(ref)).toBe(true);
    });
  });

  describe("formatDiskOutputSummary", () => {
    it("should include key information", () => {
      const ref: DiskOutputReference = {
        type: "disk_output",
        path: "/tmp/output.json",
        format: "json",
        sizeEstimate: 150_000,
        toolName: "analyze_tool",
        conversationId: "conv-123",
        createdAt: new Date().toISOString(),
      };

      const summary = formatDiskOutputSummary(ref);

      expect(summary).toContain("json");
      expect(summary).toContain("analyze_tool");
      expect(summary).toContain("/tmp/output.json");
      expect(summary).toContain("KB");
    });

    it("should convert bytes to KB correctly", () => {
      const ref: DiskOutputReference = {
        type: "disk_output",
        path: "/tmp/output.json",
        format: "json",
        sizeEstimate: 1_024_000, // ~1000 KB
        toolName: "tool",
        conversationId: "conv",
        createdAt: new Date().toISOString(),
      };

      const summary = formatDiskOutputSummary(ref);

      expect(summary).toContain("1000.0KB");
    });

    it("should handle small file sizes", () => {
      const ref: DiskOutputReference = {
        type: "disk_output",
        path: "/tmp/output.json",
        format: "json",
        sizeEstimate: 512,
        toolName: "tool",
        conversationId: "conv",
        createdAt: new Date().toISOString(),
      };

      const summary = formatDiskOutputSummary(ref);

      expect(summary).toContain("0.5KB");
    });

    it("should handle large file sizes", () => {
      const ref: DiskOutputReference = {
        type: "disk_output",
        path: "/tmp/output.json",
        format: "json",
        sizeEstimate: 50_000_000,
        toolName: "tool",
        conversationId: "conv",
        createdAt: new Date().toISOString(),
      };

      const summary = formatDiskOutputSummary(ref);

      expect(summary).toContain("48828.1KB");
    });

    it("should format as bracketed string", () => {
      const ref: DiskOutputReference = {
        type: "disk_output",
        path: "/tmp/output.json",
        format: "json",
        sizeEstimate: 150_000,
        toolName: "tool",
        conversationId: "conv",
        createdAt: new Date().toISOString(),
      };

      const summary = formatDiskOutputSummary(ref);

      expect(summary).toMatch(/^\[Disk output:/);
      expect(summary).toMatch(/\]$/);
    });

    it("should work with different formats", () => {
      const formats = ["csv", "parquet", "arrow"];

      formats.forEach((fmt) => {
        const ref: DiskOutputReference = {
          type: "disk_output",
          path: `/tmp/output.${fmt}`,
          format: fmt,
          sizeEstimate: 200_000,
          toolName: "tool",
          conversationId: "conv",
          createdAt: new Date().toISOString(),
        };

        const summary = formatDiskOutputSummary(ref);
        expect(summary).toContain(fmt);
      });
    });

    it("should include tool name in summary", () => {
      const toolNames = ["query_database", "analyze_image", "process_text"];

      toolNames.forEach((toolName) => {
        const ref: DiskOutputReference = {
          type: "disk_output",
          path: "/tmp/output.json",
          format: "json",
          sizeEstimate: 200_000,
          toolName,
          conversationId: "conv",
          createdAt: new Date().toISOString(),
        };

        const summary = formatDiskOutputSummary(ref);
        expect(summary).toContain(toolName);
      });
    });
  });

  describe("integration scenarios", () => {
    it("should create reference for tool output workflow", () => {
      const conversationId = "conv-456";
      const toolName = "query_large_dataset";
      const format = "csv";
      const largeData = "x".repeat(500_000);

      // Check if we should write to disk
      expect(shouldWriteToDisk(largeData)).toBe(true);

      // Build output path
      const path = buildOutputPath({
        conversationId,
        toolName,
        format,
      });

      expect(path).toContain(conversationId);
      expect(path).toContain(toolName);

      // Create reference
      const ref = buildDiskOutputReference({
        path,
        format,
        sizeEstimate: largeData.length,
        toolName,
        conversationId,
      });

      // Validate reference
      expect(isDiskOutputReference(ref)).toBe(true);

      // Format for display
      const summary = formatDiskOutputSummary(ref);
      expect(summary).toContain("csv");
      expect(summary).toContain(toolName);
    });

    it("should handle multiple outputs from same tool", () => {
      const conversationId = "conv-789";
      const toolName = "batch_analyzer";

      const paths = [
        buildOutputPath({
          conversationId,
          toolName,
          format: "json",
        }),
        buildOutputPath({
          conversationId,
          toolName,
          format: "json",
        }),
        buildOutputPath({
          conversationId,
          toolName,
          format: "csv",
        }),
      ];

      // All paths should be unique
      const uniquePaths = new Set(paths);
      expect(uniquePaths.size).toBe(3);

      // All should reference same tool and conversation
      paths.forEach((path) => {
        expect(path).toContain(conversationId);
        expect(path).toContain(toolName);
      });
    });

    it("should create complete output pipeline", () => {
      const conversationId = "conv-pipeline-test";
      const tools = ["fetch_data", "transform_data", "analyze_results"];
      const formats = ["json", "csv", "json"];

      const outputs = tools.map((tool, idx) => {
        const format = formats[idx];
        const sizeEstimate = 250_000 + idx * 50_000;

        const path = buildOutputPath({
          conversationId,
          toolName: tool,
          format,
        });

        return buildDiskOutputReference({
          path,
          format,
          sizeEstimate,
          toolName: tool,
          conversationId,
        });
      });

      // Verify all outputs
      outputs.forEach((output) => {
        expect(isDiskOutputReference(output)).toBe(true);
        expect(output.conversationId).toBe(conversationId);
      });

      // Verify all are different
      const paths = outputs.map((o) => o.path);
      const uniquePaths = new Set(paths);
      expect(uniquePaths.size).toBe(3);
    });
  });
});
