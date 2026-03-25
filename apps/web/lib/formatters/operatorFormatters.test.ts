import { describe, expect, it } from "vitest";
import {
  formatOperatorAcreage,
  formatOperatorCurrency,
  formatOperatorDate,
  formatOperatorDateTime,
  formatOperatorDistance,
  formatOperatorFileSize,
  formatOperatorPercent,
  formatOperatorRelativeTime,
  formatOperatorTime,
} from "./operatorFormatters";

describe("operatorFormatters", () => {
  it("formats currency", () => {
    expect(formatOperatorCurrency(1234.5)).toBe("$1,234.50");
  });

  it("formats percentages", () => {
    expect(formatOperatorPercent(6.25, { maximumFractionDigits: 2 })).toBe("6.25%");
    expect(formatOperatorPercent(0.082, { input: "ratio", maximumFractionDigits: 1 })).toBe("8.2%");
  });

  it("formats acreage", () => {
    expect(formatOperatorAcreage(12.345)).toBe("12.35 ac");
    expect(formatOperatorAcreage(12.345, { includeUnit: false, maximumFractionDigits: 1 })).toBe("12.3");
  });

  it("formats distances", () => {
    expect(formatOperatorDistance(4.25)).toBe("4.25 mi");
  });

  it("formats file sizes", () => {
    expect(formatOperatorFileSize(512)).toBe("512 B");
    expect(formatOperatorFileSize(2_048)).toBe("2.0 KB");
    expect(formatOperatorFileSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });

  it("formats date and time", () => {
    const value = "2026-03-24T15:45:00.000Z";
    expect(
      formatOperatorDateTime(value, {
        timeZone: "UTC",
      }),
    ).toBe("Mar 24, 03:45 PM");
    expect(
      formatOperatorDate(value, {
        timeZone: "UTC",
      }),
    ).toBe("Mar 24");
    expect(
      formatOperatorTime(value, {
        timeZone: "UTC",
      }),
    ).toBe("3:45 PM");
  });

  it("formats relative time", () => {
    const now = new Date("2026-03-24T15:45:00.000Z");
    expect(formatOperatorRelativeTime("2026-03-24T15:44:30.000Z", now)).toBe("just now");
    expect(formatOperatorRelativeTime("2026-03-24T15:00:00.000Z", now)).toBe("45m ago");
    expect(formatOperatorRelativeTime("2026-03-23T15:45:00.000Z", now)).toBe("1d ago");
  });
});
