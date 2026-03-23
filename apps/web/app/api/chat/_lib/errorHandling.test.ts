import { describe, expect, it } from "vitest";
import { sanitizeChatErrorMessage } from "./errorHandling";

describe("sanitizeChatErrorMessage", () => {
  it("maps gateway proxy failures to a friendly upstream-service error", () => {
    expect(
      sanitizeChatErrorMessage(
        "Gateway DB proxy error (500): unable to parse request.",
        "corr-1",
      ),
    ).toEqual({
      code: "upstream_service_error",
      correlationId: "corr-1",
      message:
        "The requested analysis could not start. Link a deal if this command is deal-specific, then try again.",
    });
  });

  it("maps invalid query parameter failures to a friendly filter-reset message", () => {
    expect(
      sanitizeChatErrorMessage("Invalid query parameters", "corr-2"),
    ).toEqual({
      code: "invalid_query_parameters",
      correlationId: "corr-2",
      message: "This panel could not load with the current filters. Retry or reset the selection.",
    });
  });
});
