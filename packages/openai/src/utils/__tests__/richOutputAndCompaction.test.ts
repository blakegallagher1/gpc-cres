import { describe, it, expect } from "vitest";
import {
  textOutput,
  imageOutput,
  fileOutput,
  isRichOutput,
  ToolOutputText,
  ToolOutputImage,
  ToolOutputFile,
  RichToolOutput,
} from "../richToolOutput";
import {
  selectCompactionCandidates,
  preserveUserMessages,
  shouldTriggerCompaction,
  partitionForCompaction,
  ConversationItem,
} from "../compactionFiltering";

describe("richToolOutput", () => {
  describe("textOutput", () => {
    it("should create a text output with correct type", () => {
      const output = textOutput("Hello, world!");
      expect(output).toEqual({
        type: "text",
        text: "Hello, world!",
      });
    });

    it("should preserve exact text content", () => {
      const longText = "This is a very long text\nwith multiple lines\nand special chars: !@#$%";
      const output = textOutput(longText);
      expect(output.text).toBe(longText);
    });
  });

  describe("imageOutput", () => {
    it("should create image output with URL", () => {
      const output = imageOutput({ url: "https://example.com/image.png" });
      expect(output.type).toBe("image");
      expect(output.imageUrl).toBe("https://example.com/image.png");
    });

    it("should apply default mediaType and detail", () => {
      const output = imageOutput({ url: "https://example.com/image.png" });
      expect(output.mediaType).toBe("image/png");
      expect(output.detail).toBe("original");
    });

    it("should respect custom detail option", () => {
      const output = imageOutput({
        url: "https://example.com/image.png",
        detail: "low",
      });
      expect(output.detail).toBe("low");
    });

    it("should accept base64 data", () => {
      const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const output = imageOutput({ base64 });
      expect(output.base64Data).toBe(base64);
    });

    it("should accept custom mediaType", () => {
      const output = imageOutput({
        url: "https://example.com/image.jpg",
        mediaType: "image/jpeg",
      });
      expect(output.mediaType).toBe("image/jpeg");
    });
  });

  describe("fileOutput", () => {
    it("should create file output with path", () => {
      const output = fileOutput({ path: "/tmp/document.pdf" });
      expect(output).toEqual({
        type: "file",
        filePath: "/tmp/document.pdf",
        mediaType: undefined,
        filename: undefined,
      });
    });

    it("should accept optional mediaType and filename", () => {
      const output = fileOutput({
        path: "/tmp/document.pdf",
        mediaType: "application/pdf",
        filename: "report.pdf",
      });
      expect(output.mediaType).toBe("application/pdf");
      expect(output.filename).toBe("report.pdf");
    });
  });

  describe("isRichOutput", () => {
    it("should return true for text output", () => {
      const output = textOutput("test");
      expect(isRichOutput(output)).toBe(true);
    });

    it("should return true for image output", () => {
      const output = imageOutput({ url: "https://example.com/image.png" });
      expect(isRichOutput(output)).toBe(true);
    });

    it("should return true for file output", () => {
      const output = fileOutput({ path: "/tmp/test.pdf" });
      expect(isRichOutput(output)).toBe(true);
    });

    it("should return false for plain objects without type", () => {
      const plainObj = { text: "hello" };
      expect(isRichOutput(plainObj)).toBe(false);
    });

    it("should return false for objects with unrecognized type", () => {
      const obj = { type: "unknown" };
      expect(isRichOutput(obj)).toBe(false);
    });

    it("should return false for null", () => {
      expect(isRichOutput(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isRichOutput(undefined)).toBe(false);
    });

    it("should return false for primitives", () => {
      expect(isRichOutput("string")).toBe(false);
      expect(isRichOutput(42)).toBe(false);
      expect(isRichOutput(true)).toBe(false);
    });
  });
});

describe("compactionFiltering", () => {
  const createItem = (role?: string, type?: string, id?: string): ConversationItem => ({
    role,
    type,
    id,
  });

  describe("selectCompactionCandidates", () => {
    it("should exclude user messages", () => {
      const items: ConversationItem[] = [
        createItem("user", undefined, "1"),
        createItem("assistant", undefined, "2"),
        createItem("user", undefined, "3"),
      ];
      const candidates = selectCompactionCandidates(items);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].id).toBe("2");
    });

    it("should exclude compaction type items", () => {
      const items: ConversationItem[] = [
        createItem("assistant", undefined, "1"),
        createItem(undefined, "compaction", "2"),
        createItem("assistant", undefined, "3"),
      ];
      const candidates = selectCompactionCandidates(items);
      expect(candidates).toHaveLength(2);
      expect(candidates.map((c) => c.id)).toEqual(["1", "3"]);
    });

    it("should keep assistant and tool messages", () => {
      const items: ConversationItem[] = [
        createItem("assistant", undefined, "1"),
        createItem("tool", undefined, "2"),
        createItem("assistant", "function_call", "3"),
      ];
      const candidates = selectCompactionCandidates(items);
      expect(candidates).toHaveLength(3);
    });

    it("should handle empty list", () => {
      const candidates = selectCompactionCandidates([]);
      expect(candidates).toEqual([]);
    });
  });

  describe("preserveUserMessages", () => {
    it("should keep only user messages", () => {
      const items: ConversationItem[] = [
        createItem("user", undefined, "1"),
        createItem("assistant", undefined, "2"),
        createItem("user", undefined, "3"),
      ];
      const preserved = preserveUserMessages(items);
      expect(preserved).toHaveLength(2);
      expect(preserved.map((p) => p.id)).toEqual(["1", "3"]);
    });

    it("should return empty array if no user messages", () => {
      const items: ConversationItem[] = [
        createItem("assistant", undefined, "1"),
        createItem("tool", undefined, "2"),
      ];
      const preserved = preserveUserMessages(items);
      expect(preserved).toEqual([]);
    });
  });

  describe("shouldTriggerCompaction", () => {
    it("should return true when candidates meet threshold", () => {
      expect(shouldTriggerCompaction(10)).toBe(true);
      expect(shouldTriggerCompaction(15)).toBe(true);
    });

    it("should return false when candidates below threshold", () => {
      expect(shouldTriggerCompaction(9)).toBe(false);
      expect(shouldTriggerCompaction(0)).toBe(false);
    });

    it("should respect custom threshold", () => {
      expect(shouldTriggerCompaction(20, 20)).toBe(true);
      expect(shouldTriggerCompaction(19, 20)).toBe(false);
    });

    it("should handle edge cases", () => {
      expect(shouldTriggerCompaction(1, 1)).toBe(true);
      expect(shouldTriggerCompaction(0, 1)).toBe(false);
    });
  });

  describe("partitionForCompaction", () => {
    it("should separate items into preserve and compact groups", () => {
      const items: ConversationItem[] = [
        createItem("user", undefined, "1"),
        createItem("assistant", undefined, "2"),
        createItem("assistant", undefined, "3"),
        createItem("user", undefined, "4"),
      ];
      const { preserve, compact } = partitionForCompaction(items);
      expect(preserve.map((p) => p.id)).toEqual(["1", "4"]);
      expect(compact.map((c) => c.id)).toEqual(["2", "3"]);
    });

    it("should preserve compaction type items", () => {
      const items: ConversationItem[] = [
        createItem("user", undefined, "1"),
        createItem("assistant", undefined, "2"),
        createItem(undefined, "compaction", "3"),
      ];
      const { preserve, compact } = partitionForCompaction(items);
      expect(preserve.map((p) => p.id)).toEqual(["1", "3"]);
      expect(compact.map((c) => c.id)).toEqual(["2"]);
    });

    it("should handle all-preserve scenario", () => {
      const items: ConversationItem[] = [
        createItem("user", undefined, "1"),
        createItem("user", undefined, "2"),
      ];
      const { preserve, compact } = partitionForCompaction(items);
      expect(preserve).toHaveLength(2);
      expect(compact).toHaveLength(0);
    });

    it("should handle all-compact scenario", () => {
      const items: ConversationItem[] = [
        createItem("assistant", undefined, "1"),
        createItem("tool", undefined, "2"),
      ];
      const { preserve, compact } = partitionForCompaction(items);
      expect(preserve).toHaveLength(0);
      expect(compact).toHaveLength(2);
    });

    it("should handle empty list", () => {
      const { preserve, compact } = partitionForCompaction([]);
      expect(preserve).toEqual([]);
      expect(compact).toEqual([]);
    });

    it("should preserve order within groups", () => {
      const items: ConversationItem[] = [
        createItem("user", undefined, "1"),
        createItem("assistant", undefined, "2"),
        createItem("user", undefined, "3"),
        createItem("assistant", undefined, "4"),
        createItem("user", undefined, "5"),
      ];
      const { preserve, compact } = partitionForCompaction(items);
      expect(preserve.map((p) => p.id)).toEqual(["1", "3", "5"]);
      expect(compact.map((c) => c.id)).toEqual(["2", "4"]);
    });
  });
});
