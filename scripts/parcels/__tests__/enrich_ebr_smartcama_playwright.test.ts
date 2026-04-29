import { describe, expect, it } from "vitest";

import {
  buildSmartCamaSearchBody,
  buildTargetQuery,
  buildUploadSql,
  csvCell,
  latestSale,
  mapConcurrent,
  parseCli,
  parseDate,
  parseMoney,
  toMoneyRow,
} from "../enrich_ebr_smartcama_playwright";

describe("parseCli", () => {
  it("parses --apply flag", () => {
    const opts = parseCli(["--apply"]);
    expect(opts.apply).toBe(true);
    expect(opts.dryRun).toBe(false);
  });

  it("parses --dry-run flag", () => {
    const opts = parseCli(["--dry-run"]);
    expect(opts.dryRun).toBe(true);
    expect(opts.apply).toBe(false);
  });

  it("parses --max-rows", () => {
    const opts = parseCli(["--max-rows", "50"]);
    expect(opts.maxRows).toBe(50);
  });

  it("parses --batch-size", () => {
    const opts = parseCli(["--batch-size", "10"]);
    expect(opts.batchSize).toBe(10);
  });

  it("parses --concurrency", () => {
    const opts = parseCli(["--concurrency", "5"]);
    expect(opts.concurrency).toBe(5);
  });

  it("parses --resume", () => {
    const opts = parseCli(["--resume"]);
    expect(opts.resume).toBe(true);
  });

  it("parses --assessment-numbers as comma list", () => {
    const opts = parseCli(["--assessment-numbers", "001, 002, 003"]);
    expect(opts.assessmentNumbers).toEqual(["001", "002", "003"]);
  });

  it("parses persistent profile session flags", () => {
    const opts = parseCli([
      "--profile-dir",
      "output/custom-smartcama-profile",
      "--verification-timeout-seconds",
      "120",
      "--force-verify",
    ]);
    expect(opts.profileDir).toBe("output/custom-smartcama-profile");
    expect(opts.verificationTimeoutSeconds).toBe(120);
    expect(opts.forceVerify).toBe(true);
  });

  it("floors verification timeout to 30 seconds", () => {
    const opts = parseCli(["--verification-timeout-seconds", "5"]);
    expect(opts.verificationTimeoutSeconds).toBe(30);
  });

  it("uses defaults when no args", () => {
    const opts = parseCli([]);
    expect(opts.batchSize).toBe(25);
    expect(opts.concurrency).toBe(1);
    expect(opts.maxRows).toBeNull();
    expect(opts.apply).toBe(false);
    expect(opts.dryRun).toBe(false);
    expect(opts.resume).toBe(false);
    expect(opts.profileDir).toBe("output/smartcama-browser-profile");
    expect(opts.verificationTimeoutSeconds).toBe(300);
    expect(opts.forceVerify).toBe(false);
  });
});

describe("parseMoney", () => {
  it("returns null for null/undefined", () => {
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });

  it("parses numeric value", () => {
    expect(parseMoney(1234.56)).toBe(1234.56);
  });

  it("parses string with $ and commas", () => {
    expect(parseMoney("$1,234,567.89")).toBe(1234567.89);
  });

  it("returns null for non-numeric string", () => {
    expect(parseMoney("N/A")).toBeNull();
  });
});

describe("parseDate", () => {
  it("returns null for null/empty", () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate("")).toBeNull();
  });

  it("parses ISO date string", () => {
    expect(parseDate("2024-03-15T00:00:00")).toBe("2024-03-15");
  });

  it("parses date with time", () => {
    expect(parseDate("2024-06-01T12:30:00Z")).toBe("2024-06-01");
  });

  it("returns null for invalid date", () => {
    expect(parseDate("not-a-date")).toBeNull();
  });
});

describe("latestSale", () => {
  it("returns null for empty/undefined sales", () => {
    expect(latestSale(undefined)).toBeNull();
    expect(latestSale([])).toBeNull();
  });

  it("returns the most recent sale by SaleDate", () => {
    const sales = [
      { SaleDate: "2020-01-01", SaleAmount: 100000 },
      { SaleDate: "2023-06-15", SaleAmount: 200000 },
      { SaleDate: "2021-03-01", SaleAmount: 150000 },
    ];
    const result = latestSale(sales);
    expect(result?.SaleDate).toBe("2023-06-15");
    expect(result?.SaleAmount).toBe(200000);
  });

  it("falls back to CreatedDateMillis when SaleDate is null", () => {
    const sales = [
      { SaleDate: null, SaleAmount: 100000, CreatedDateMillis: 1600000000000 },
      { SaleDate: null, SaleAmount: 200000, CreatedDateMillis: 1700000000000 },
    ];
    const result = latestSale(sales);
    expect(result?.SaleAmount).toBe(200000);
  });
});

describe("csvCell", () => {
  it("returns empty string for null", () => {
    expect(csvCell(null)).toBe("");
  });

  it("wraps string in quotes", () => {
    expect(csvCell("hello")).toBe('"hello"');
  });

  it("escapes double quotes", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("converts number to quoted string", () => {
    expect(csvCell(42)).toBe('"42"');
  });
});

describe("toMoneyRow", () => {
  it("extracts tax and latest sale data", () => {
    const assessment = {
      AssessmentNumber: "12345",
      TotalTax: "$1,234.56",
      Sales: [
        { SaleDate: "2020-01-01", SaleAmount: 100000 },
        { SaleDate: "2023-06-15", SaleAmount: "$250,000" },
      ],
    };
    const row = toMoneyRow("12345", assessment);
    expect(row.parcelId).toBe("12345");
    expect(row.taxAmount).toBe(1234.56);
    expect(row.salePrice).toBe(250000);
    expect(row.saleDate).toBe("2023-06-15");
    expect(JSON.parse(row.rawPayload)).toHaveProperty("smartcama");
  });

  it("handles missing sales gracefully", () => {
    const assessment = { AssessmentNumber: "99999", TotalTax: 500 };
    const row = toMoneyRow("99999", assessment);
    expect(row.saleDate).toBeNull();
    expect(row.salePrice).toBeNull();
    expect(row.taxAmount).toBe(500);
  });
});

describe("buildTargetQuery", () => {
  it("generates valid SQL with limit", () => {
    const sql = buildTargetQuery(100);
    expect(sql).toContain("LIMIT 100");
    expect(sql).toContain("East Baton Rouge");
    expect(sql).toContain("sale_price IS NULL OR tax_amount IS NULL");
    expect(sql).toContain("parcel_id ~ '^[0-9]+$'");
    expect(sql).toContain("ORDER BY md5(parcel_id)");
  });
});

describe("buildSmartCamaSearchBody", () => {
  it("matches SmartCAMA SearchAjax DataTable request shape", () => {
    const body = buildSmartCamaSearchBody("1200445");
    expect(body.get("AssessmentNumber")).toBe("1200445");
    expect(body.get("ExactSearch")).toBe("True");
    expect(body.get("DataTableRequest[draw]")).toBe("1");
    expect(body.get("DataTableRequest[columns][3][name]")).toBe("Assessment.AssessmentNumber");
    expect(body.has("DTableRequest[draw]")).toBe(false);
  });
});

describe("buildUploadSql", () => {
  it("generates SQL with COALESCE upsert", () => {
    const rows = [
      {
        parcelId: "P001",
        saleDate: "2023-01-15",
        salePrice: 200000,
        taxAmount: 3500,
        rawPayload: '{"smartcama":{}}',
      },
    ];
    const sql = buildUploadSql(rows);
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
    expect(sql).toContain("COALESCE(EXCLUDED.sale_price");
    expect(sql).toContain("COALESCE(EXCLUDED.tax_amount");
    expect(sql).toContain("ON CONFLICT (parish, parcel_id) DO UPDATE");
    expect(sql).toContain("\\copy smartcama_money_upload FROM STDIN");
    expect(sql.indexOf("SELECT COUNT(*) FROM smartcama_money_upload")).toBeLessThan(sql.indexOf("COMMIT;"));
    expect(sql).toContain('"P001"');
  });

  it("handles null values in CSV output", () => {
    const rows = [
      {
        parcelId: "P002",
        saleDate: null,
        salePrice: null,
        taxAmount: 1000,
        rawPayload: '{"smartcama":{}}',
      },
    ];
    const sql = buildUploadSql(rows);
    expect(sql).toContain('"P002",,,"1000"');
  });
});

describe("mapConcurrent", () => {
  it("processes items with bounded concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const results = await mapConcurrent([1, 2, 3, 4, 5], 2, async (item) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return item * 2;
    });
    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("handles empty array", async () => {
    const results = await mapConcurrent([], 3, async (item: number) => item);
    expect(results).toEqual([]);
  });
});
