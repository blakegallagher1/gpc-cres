import { describe, it, expect } from "vitest";
import {
  urlAllowlistGuardrail,
  parcelIdFormatGuardrail,
  requiredFieldsGuardrail,
  outputCompletenessGuardrail,
  noErrorOutputGuardrail,
  runInputGuardrails,
  runOutputGuardrails,
  type InputGuardrail,
  type OutputGuardrail,
} from "../toolGuardrails";

describe("urlAllowlistGuardrail", () => {
  it("allows known domains", () => {
    const result = urlAllowlistGuardrail("browser_task", {
      url: "https://gallagherpropco.com/properties",
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("allows www variants of known domains", () => {
    const result = urlAllowlistGuardrail("browser_task", {
      url: "https://www.fema.gov/flood-map",
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects unknown domains", () => {
    const result = urlAllowlistGuardrail("browser_task", {
      url: "https://evil.com/phishing",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not in the browser allowlist");
  });

  it("handles invalid URLs", () => {
    const result = urlAllowlistGuardrail("browser_task", {
      url: "not a url",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid URL");
  });

  it("allows subdomains of allowlisted domains", () => {
    const result = urlAllowlistGuardrail("browser_task", {
      url: "https://msc.fema.gov/portal",
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns valid=true when url is missing", () => {
    const result = urlAllowlistGuardrail("browser_task", {});
    expect(result.valid).toBe(true);
  });

  it("returns valid=true when url is null", () => {
    const result = urlAllowlistGuardrail("browser_task", { url: null });
    expect(result.valid).toBe(true);
  });
});

describe("parcelIdFormatGuardrail", () => {
  it("rejects empty parcel IDs", () => {
    const result = parcelIdFormatGuardrail("search_parcels", {
      parcelId: "",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Parcel ID cannot be empty");
  });

  it("rejects whitespace-only parcel IDs", () => {
    const result = parcelIdFormatGuardrail("search_parcels", {
      parcelId: "   ",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Parcel ID cannot be empty");
  });

  it("accepts valid numeric parcel IDs", () => {
    const result = parcelIdFormatGuardrail("search_parcels", {
      parcelId: "123456",
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("accepts parcel IDs with parcel_id field name", () => {
    const result = parcelIdFormatGuardrail("search_parcels", {
      parcel_id: "789012",
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns valid=true when parcelId is missing", () => {
    const result = parcelIdFormatGuardrail("search_parcels", {});
    expect(result.valid).toBe(true);
  });
});

describe("requiredFieldsGuardrail", () => {
  it("detects missing required fields", () => {
    const guardrail = requiredFieldsGuardrail(["title", "description"]);
    const result = guardrail("create_task", { title: "Test" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing required fields");
    expect(result.error).toContain("description");
  });

  it("detects multiple missing fields", () => {
    const guardrail = requiredFieldsGuardrail(["title", "description", "priority"]);
    const result = guardrail("create_task", { title: "Test" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("description");
    expect(result.error).toContain("priority");
  });

  it("passes when all required fields are present", () => {
    const guardrail = requiredFieldsGuardrail(["title", "description"]);
    const result = guardrail("create_task", {
      title: "Test",
      description: "A test task",
      extra: "ignored",
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("treats null as missing", () => {
    const guardrail = requiredFieldsGuardrail(["title"]);
    const result = guardrail("create_task", { title: null });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing required fields");
  });

  it("treats undefined as missing", () => {
    const guardrail = requiredFieldsGuardrail(["title"]);
    const result = guardrail("create_task", {});
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing required fields");
  });

  it("treats empty string as missing", () => {
    const guardrail = requiredFieldsGuardrail(["title"]);
    const result = guardrail("create_task", { title: "" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing required fields");
  });
});

describe("outputCompletenessGuardrail", () => {
  it("rejects sparse output", () => {
    const guardrail = outputCompletenessGuardrail(5);
    const result = guardrail("search_parcels", {
      id: "123",
      name: "Test",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("only 2 fields");
    expect(result.error).toContain("minimum: 5");
  });

  it("accepts output with minimum field count", () => {
    const guardrail = outputCompletenessGuardrail(3);
    const result = guardrail("search_parcels", {
      id: "123",
      name: "Test",
      county: "EBR",
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("accepts output with more than minimum fields", () => {
    const guardrail = outputCompletenessGuardrail(2);
    const result = guardrail("search_parcels", {
      id: "123",
      name: "Test",
      county: "EBR",
      zoning: "Commercial",
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns valid=true for null output", () => {
    const guardrail = outputCompletenessGuardrail(5);
    const result = guardrail("search_parcels", null);
    expect(result.valid).toBe(true);
  });

  it("returns valid=true for non-object output", () => {
    const guardrail = outputCompletenessGuardrail(5);
    const result = guardrail("search_parcels", "string output");
    expect(result.valid).toBe(true);
  });
});

describe("noErrorOutputGuardrail", () => {
  it("catches error field in output", () => {
    const result = noErrorOutputGuardrail("search_parcels", {
      error: "Database connection failed",
      data: null,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Tool returned error");
    expect(result.error).toContain("Database connection failed");
  });

  it("catches success=false in output", () => {
    const result = noErrorOutputGuardrail("search_parcels", {
      success: false,
      reason: "No results",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Tool reported failure");
  });

  it("passes when no error indicators present", () => {
    const result = noErrorOutputGuardrail("search_parcels", {
      data: [{ id: "123" }],
      count: 1,
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("passes when error field is empty string", () => {
    const result = noErrorOutputGuardrail("search_parcels", {
      error: "",
      data: [{ id: "123" }],
    });
    expect(result.valid).toBe(true);
  });

  it("passes when success=true", () => {
    const result = noErrorOutputGuardrail("search_parcels", {
      success: true,
      data: [{ id: "123" }],
    });
    expect(result.valid).toBe(true);
  });

  it("returns valid=true for null output", () => {
    const result = noErrorOutputGuardrail("search_parcels", null);
    expect(result.valid).toBe(true);
  });

  it("returns valid=true for non-object output", () => {
    const result = noErrorOutputGuardrail("search_parcels", "success");
    expect(result.valid).toBe(true);
  });
});

describe("runInputGuardrails", () => {
  it("short-circuits on first failure", () => {
    const guardrail1: InputGuardrail = () => ({ valid: false, error: "First error" });
    const guardrail2: InputGuardrail = () => ({ valid: false, error: "Second error" });

    const result = runInputGuardrails("test_tool", {}, [guardrail1, guardrail2]);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("First error");
  });

  it("runs all guardrails when all pass", () => {
    let callCount = 0;
    const guardrail1: InputGuardrail = () => {
      callCount++;
      return { valid: true };
    };
    const guardrail2: InputGuardrail = () => {
      callCount++;
      return { valid: true };
    };

    const result = runInputGuardrails("test_tool", {}, [guardrail1, guardrail2]);

    expect(result.valid).toBe(true);
    expect(callCount).toBe(2);
  });

  it("passes with empty guardrail list", () => {
    const result = runInputGuardrails("test_tool", {}, []);
    expect(result.valid).toBe(true);
  });

  it("returns error from failing guardrail", () => {
    const guardrail1: InputGuardrail = () => ({ valid: true });
    const guardrail2: InputGuardrail = () => ({
      valid: false,
      error: "Specific error",
    });

    const result = runInputGuardrails("test_tool", {}, [guardrail1, guardrail2]);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Specific error");
  });
});

describe("runOutputGuardrails", () => {
  it("short-circuits on first failure", () => {
    const guardrail1: OutputGuardrail = () => ({ valid: false, error: "First error" });
    const guardrail2: OutputGuardrail = () => ({ valid: false, error: "Second error" });

    const result = runOutputGuardrails("test_tool", {}, [guardrail1, guardrail2]);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("First error");
  });

  it("passes when all guardrails pass", () => {
    let callCount = 0;
    const guardrail1: OutputGuardrail = () => {
      callCount++;
      return { valid: true };
    };
    const guardrail2: OutputGuardrail = () => {
      callCount++;
      return { valid: true };
    };

    const result = runOutputGuardrails("test_tool", { data: "test" }, [
      guardrail1,
      guardrail2,
    ]);

    expect(result.valid).toBe(true);
    expect(callCount).toBe(2);
  });

  it("passes with empty guardrail list", () => {
    const result = runOutputGuardrails("test_tool", { data: "test" }, []);
    expect(result.valid).toBe(true);
  });

  it("returns error from failing guardrail", () => {
    const guardrail1: OutputGuardrail = () => ({ valid: true });
    const guardrail2: OutputGuardrail = () => ({
      valid: false,
      error: "Output issue",
    });

    const result = runOutputGuardrails("test_tool", { data: "test" }, [
      guardrail1,
      guardrail2,
    ]);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Output issue");
  });
});
