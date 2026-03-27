import { describe, it, expect } from "vitest";
import {
  extractJsDocBlock,
  parseJsDoc,
  extractFunctionDoc,
  truncateDescription,
  type ParsedJsDoc,
} from "../jsdocDescriptionParser";

describe("jsdocDescriptionParser", () => {
  describe("extractJsDocBlock", () => {
    it("finds block before function", () => {
      const source = `
/**
 * This is a test function.
 */
function testFunction() {
  return 42;
}
      `;
      const block = extractJsDocBlock(source, "testFunction");
      expect(block).toBeTruthy();
      expect(block).toContain("This is a test function");
    });

    it("finds block before const", () => {
      const source = `
/**
 * This is a constant function.
 */
const myConstant = () => {
  return "hello";
};
      `;
      const block = extractJsDocBlock(source, "myConstant");
      expect(block).toBeTruthy();
      expect(block).toContain("This is a constant function");
    });

    it("finds block before async function", () => {
      const source = `
/**
 * This is an async function.
 */
export async function fetchData() {
  return await Promise.resolve("data");
}
      `;
      const block = extractJsDocBlock(source, "fetchData");
      expect(block).toBeTruthy();
      expect(block).toContain("This is an async function");
    });

    it("returns null when no JSDoc", () => {
      const source = `
function testFunction() {
  return 42;
}
      `;
      const block = extractJsDocBlock(source, "testFunction");
      expect(block).toBeNull();
    });

    it("returns null when function not found", () => {
      const source = `
/**
 * This is a test.
 */
function otherFunction() {
  return 42;
}
      `;
      const block = extractJsDocBlock(source, "nonexistentFunction");
      expect(block).toBeNull();
    });

    it("handles export keyword before function", () => {
      const source = `
/**
 * Exported function docs.
 */
export function exportedFunc() {
  return "exported";
}
      `;
      const block = extractJsDocBlock(source, "exportedFunc");
      expect(block).toBeTruthy();
      expect(block).toContain("Exported function docs");
    });
  });

  describe("parseJsDoc", () => {
    it("extracts description from plain text", () => {
      const block = `
 * This is a simple description.
      `;
      const result = parseJsDoc(block);
      expect(result.description).toBe("This is a simple description.");
    });

    it("extracts @description tag", () => {
      const block = `
 * @description This is a description from tag.
      `;
      const result = parseJsDoc(block);
      expect(result.description).toBe("This is a description from tag.");
    });

    it("handles multi-line description", () => {
      const block = `
 * This is the first line.
 * This is the second line.
 * This is the third line.
      `;
      const result = parseJsDoc(block);
      expect(result.description).toContain("first line");
      expect(result.description).toContain("second line");
      expect(result.description).toContain("third line");
    });

    it("extracts @param with type", () => {
      const block = `
 * @param {string} name - The name parameter
 * @param {number} age - The age parameter
      `;
      const result = parseJsDoc(block);
      expect(result.params.name).toBe("The name parameter");
      expect(result.params.age).toBe("The age parameter");
    });

    it("extracts @param without type", () => {
      const block = `
 * @param name - The name parameter
 * @param age - The age parameter
      `;
      const result = parseJsDoc(block);
      expect(result.params.name).toBe("The name parameter");
      expect(result.params.age).toBe("The age parameter");
    });

    it("handles @param with complex types", () => {
      const block = `
 * @param {Record<string, unknown>} config - The config object
 * @param {Array<number>} values - The values array
      `;
      const result = parseJsDoc(block);
      expect(result.params.config).toBe("The config object");
      expect(result.params.values).toBe("The values array");
    });

    it("ignores non-description tags (@returns, @throws)", () => {
      const block = `
 * This is the description.
 * @returns {boolean} True if successful
 * @throws {Error} If something fails
      `;
      const result = parseJsDoc(block);
      expect(result.description).toBe("This is the description.");
      expect(result.params).toEqual({});
    });

    it("handles mixed @description and plain text", () => {
      const block = `
 * Some initial text.
 * @description More specific description.
 * @param name - A parameter
      `;
      const result = parseJsDoc(block);
      expect(result.description).toContain("More specific description");
      expect(result.params.name).toBe("A parameter");
    });

    it("handles empty block gracefully", () => {
      const block = "";
      const result = parseJsDoc(block);
      expect(result.description).toBeNull();
      expect(result.params).toEqual({});
    });

    it("handles lines with only asterisks", () => {
      const block = `
 *
 * This has blank lines.
 *
 * And more text.
      `;
      const result = parseJsDoc(block);
      expect(result.description).toContain("blank lines");
      expect(result.description).toContain("more text");
    });

    it("handles various dash styles in @param", () => {
      const block = `
 * @param name - En dash style
 * @param {string} age – Em dash style
 * @param {number} id — Em dash style variant
      `;
      const result = parseJsDoc(block);
      expect(result.params.name).toBe("En dash style");
      expect(result.params.age).toBe("Em dash style");
      expect(result.params.id).toBe("Em dash style variant");
    });
  });

  describe("extractFunctionDoc", () => {
    it("combines extract + parse for full extraction", () => {
      const source = `
/**
 * Calculates the sum of two numbers.
 * @param {number} a - The first number
 * @param {number} b - The second number
 * @returns {number} The sum
 */
function add(a, b) {
  return a + b;
}
      `;
      const result = extractFunctionDoc(source, "add");
      expect(result.description).toContain("sum of two numbers");
      expect(result.params.a).toBe("The first number");
      expect(result.params.b).toBe("The second number");
    });

    it("returns empty doc when function has no JSDoc", () => {
      const source = `
function noDoc() {
  return null;
}
      `;
      const result = extractFunctionDoc(source, "noDoc");
      expect(result.description).toBeNull();
      expect(result.params).toEqual({});
    });

    it("returns empty doc when function not found", () => {
      const source = `
/**
 * Some doc
 */
function otherFunc() {}
      `;
      const result = extractFunctionDoc(source, "unknownFunc");
      expect(result.description).toBeNull();
      expect(result.params).toEqual({});
    });

    it("handles complex multi-line JSDoc", () => {
      const source = `
/**
 * Performs complex operation on data.
 * This is a longer description that spans
 * multiple lines and provides detailed info.
 * @param {Array} data - Input data to process
 * @param {Object} options - Configuration options
 */
function processData(data, options) {
  // implementation
}
      `;
      const result = extractFunctionDoc(source, "processData");
      expect(result.description).toContain("Performs complex operation");
      expect(result.description).toContain("spans");
      expect(result.description).toContain("multiple lines");
      expect(result.params.data).toContain("Input data");
      expect(result.params.options).toContain("Configuration");
    });
  });

  describe("truncateDescription", () => {
    it("leaves short text unchanged", () => {
      const text = "This is a short description.";
      const result = truncateDescription(text, 50);
      expect(result).toBe(text);
    });

    it("truncates long text with ellipsis", () => {
      const text = "This is a very long description that exceeds the maximum allowed length.";
      const result = truncateDescription(text, 30);
      expect(result).toMatch(/\.\.\.$/);
      expect(result.length).toBeLessThanOrEqual(30);
    });

    it("uses default maxLength of 512", () => {
      const text = "x".repeat(600);
      const result = truncateDescription(text);
      expect(result.length).toBeLessThanOrEqual(512);
      expect(result).toMatch(/\.\.\.$/);
    });

    it("handles exactly maxLength text", () => {
      const text = "This is exactly thirty chars!"; // 29 chars
      const result = truncateDescription(text, 29);
      expect(result).toBe(text);
    });

    it("truncates one char over maxLength", () => {
      const text = "This is exactly thirty chars!!"; // 30 chars
      const result = truncateDescription(text, 29);
      expect(result).toMatch(/\.\.\.$/);
      expect(result.length).toBeLessThanOrEqual(29);
    });

    it("preserves word boundaries reasonably", () => {
      const text = "This is a long description that needs to be truncated for display purposes";
      const result = truncateDescription(text, 50);
      expect(result).toMatch(/\.\.\.$/);
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it("handles empty string", () => {
      const result = truncateDescription("", 100);
      expect(result).toBe("");
    });

    it("handles single character", () => {
      const result = truncateDescription("a", 100);
      expect(result).toBe("a");
    });

    it("truncates at exact position", () => {
      const text = "abcdefghij";
      const result = truncateDescription(text, 5);
      expect(result).toBe("ab...");
      expect(result.length).toBe(5);
    });
  });

  describe("integration scenarios", () => {
    it("processes a real-world tool function JSDoc", () => {
      const source = `
/**
 * Searches for parcels in the property database based on criteria.
 * Filters by location, zoning, and ownership to identify investment opportunities.
 * @param {string} query - Search query (address, parcel ID, or owner name)
 * @param {number} limit - Maximum number of results to return
 * @param {string} parish - Optional parish filter
 * @returns {Array} Array of matching parcel records
 */
export async function searchParcels(query, limit, parish) {
  // implementation
}
      `;
      const result = extractFunctionDoc(source, "searchParcels");
      expect(result.description).toBeTruthy();
      expect(result.description!).toContain("Searches for parcels");
      expect(result.description!).toContain("investment opportunities");
      expect(result.params.query).toContain("address");
      expect(result.params.limit.toLowerCase()).toContain("maximum");
      expect(result.params.parish.toLowerCase()).toContain("optional parish filter");
    });

    it("processes full JSDoc parsing pipeline", () => {
      const desc = "This is a very long description that will be used for tool definitions in AI agents. " +
        "It contains detailed information about what the tool does and how to use it. " +
        "This text needs to be truncated to fit within reasonable bounds.";

      const truncated = truncateDescription(desc, 100);
      expect(truncated.length).toBeLessThanOrEqual(100);
      expect(truncated).toMatch(/\.\.\.$/);
    });

    it("handles tool with no params", () => {
      const source = `
/**
 * Retrieves the current system status and health metrics.
 */
function getSystemStatus() {
  return { status: "healthy" };
}
      `;
      const result = extractFunctionDoc(source, "getSystemStatus");
      expect(result.description).toContain("system status");
      expect(result.params).toEqual({});
    });

    it("handles tool with many params", () => {
      const source = `
/**
 * Complex tool with multiple parameters.
 * @param {string} a - First param
 * @param {number} b - Second param
 * @param {boolean} c - Third param
 * @param {Object} d - Fourth param
 * @param {Array} e - Fifth param
 */
function complexTool(a, b, c, d, e) {}
      `;
      const result = extractFunctionDoc(source, "complexTool");
      expect(Object.keys(result.params).length).toBe(5);
      expect(result.params.a).toBe("First param");
      expect(result.params.e).toBe("Fifth param");
    });
  });
});
