import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SellerSubmissionSection } from "./SellerSubmissionSection";

describe("SellerSubmissionSection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function fillRequiredFields() {
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jane" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText("Property address"), { target: { value: "123 Main St" } });
  }

  it("renders required fields and submit button", () => {
    render(<SellerSubmissionSection />);

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Property address")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Seller Intake" })).toBeInTheDocument();
  });

  it("shows submitting then success state when submission succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: 1 }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: 1 }), { status: 202 }));

    vi.stubGlobal("fetch", fetchMock);

    render(<SellerSubmissionSection />);
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Submit Seller Intake" }));

    expect(screen.getByRole("button", { name: "Submitting..." })).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByText("Submission received.")).toBeInTheDocument();
    });
  });

  it("shows error state when submission fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: 1 }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "bad" }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: 1 }), { status: 202 }));

    vi.stubGlobal("fetch", fetchMock);

    render(<SellerSubmissionSection />);
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Submit Seller Intake" }));

    await waitFor(() => {
      expect(screen.getByText("Submission failed. Please try again.")).toBeInTheDocument();
    });
  });
});
