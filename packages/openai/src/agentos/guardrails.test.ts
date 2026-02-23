import { describe, expect, it } from "vitest";

import {
  detectSqlInjectionSignals,
  detectAndRedactPii,
} from "./guardrails.js";

describe("sqlInjectionGuardrail", () => {
  it("detects OR 1=1 injection", () => {
    const signals = detectSqlInjectionSignals("' OR 1=1 --");
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.some((s) => s.includes("sql_injection"))).toBe(true);
  });

  it("detects UNION SELECT injection", () => {
    const signals = detectSqlInjectionSignals(
      "SELECT * FROM users UNION ALL SELECT * FROM passwords",
    );
    expect(signals.length).toBeGreaterThan(0);
  });

  it("detects DROP TABLE via semicolon", () => {
    const signals = detectSqlInjectionSignals("'; DROP TABLE users; --");
    expect(signals.length).toBeGreaterThan(0);
  });

  it("allows normal CRE queries", () => {
    const signals = detectSqlInjectionSignals(
      "What is the zoning for parcel 12345?",
    );
    expect(signals.length).toBe(0);
  });

  it("allows normal SQL SELECT", () => {
    const signals = detectSqlInjectionSignals(
      "SELECT name, acreage FROM parcels WHERE id = 'abc'",
    );
    expect(signals.length).toBe(0);
  });
});

describe("piiRedactionGuardrail", () => {
  it("catches and redacts SSN pattern", () => {
    const { cleaned, found } = detectAndRedactPii(
      "The owner's SSN is 123-45-6789 and they live in Baton Rouge.",
    );
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((f) => f.startsWith("SSN"))).toBe(true);
    expect(cleaned).toContain("[REDACTED-SSN]");
    expect(cleaned).not.toContain("123-45-6789");
  });

  it("catches credit card pattern", () => {
    const { cleaned, found } = detectAndRedactPii(
      "Card: 4111-1111-1111-1111",
    );
    expect(found.some((f) => f.startsWith("Credit Card"))).toBe(true);
    expect(cleaned).toContain("[REDACTED-CC]");
  });

  it("passes clean CRE text through", () => {
    const text =
      "The property at 123 Main St has 2.5 acres and is zoned C-2.";
    const { cleaned, found } = detectAndRedactPii(text);
    expect(found.length).toBe(0);
    expect(cleaned).toBe(text);
  });
});
