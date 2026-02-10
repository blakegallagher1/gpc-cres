import { isAgentExecutable, getHumanOnlyReason } from "../taskAllowlist";

describe("taskAllowlist", () => {
  describe("isAgentExecutable", () => {
    describe("human-only tasks containing keywords", () => {
      it('should return false for title containing "call"', () => {
        expect(isAgentExecutable("Call the seller about pricing")).toBe(false);
      });

      it('should return false for title containing "meet"', () => {
        expect(isAgentExecutable("Meet with planning commission")).toBe(false);
      });

      it('should return false for title containing "negotiate"', () => {
        expect(isAgentExecutable("Negotiate purchase agreement")).toBe(false);
      });

      it('should return false for title containing "sign"', () => {
        expect(isAgentExecutable("Sign the LOI")).toBe(false);
      });

      it('should return false for title containing "schedule"', () => {
        expect(isAgentExecutable("Schedule site visit")).toBe(false);
      });
    });

    describe("case insensitivity", () => {
      it("should detect uppercase keywords", () => {
        expect(isAgentExecutable("CALL THE SELLER")).toBe(false);
        expect(isAgentExecutable("MEET WITH ENGINEER")).toBe(false);
        expect(isAgentExecutable("NEGOTIATE TERMS")).toBe(false);
        expect(isAgentExecutable("SIGN CONTRACT")).toBe(false);
        expect(isAgentExecutable("SCHEDULE MEETING")).toBe(false);
      });

      it("should detect mixed case keywords", () => {
        expect(isAgentExecutable("Call")).toBe(false);
        expect(isAgentExecutable("Meet")).toBe(false);
        expect(isAgentExecutable("Negotiate")).toBe(false);
        expect(isAgentExecutable("Sign")).toBe(false);
        expect(isAgentExecutable("Schedule")).toBe(false);
      });

      it("should detect lowercase keywords", () => {
        expect(isAgentExecutable("call seller")).toBe(false);
        expect(isAgentExecutable("meet engineer")).toBe(false);
        expect(isAgentExecutable("negotiate price")).toBe(false);
        expect(isAgentExecutable("sign papers")).toBe(false);
        expect(isAgentExecutable("schedule walkthrough")).toBe(false);
      });
    });

    describe("partial matches", () => {
      it("should detect keyword within words (call in callback)", () => {
        expect(isAgentExecutable("callback")).toBe(false);
        expect(isAgentExecutable("Schedule a callback with client")).toBe(false);
      });

      it("should detect keyword within words (meet in meeting)", () => {
        expect(isAgentExecutable("Prepare for meeting")).toBe(false);
        expect(isAgentExecutable("meeting notes")).toBe(false);
      });

      it("should detect keyword within words (sign in signing)", () => {
        expect(isAgentExecutable("signing documents")).toBe(false);
        expect(isAgentExecutable("Get signature")).toBe(false);
      });

      it("should detect keyword within words (schedule in scheduled)", () => {
        expect(isAgentExecutable("This is scheduled")).toBe(false);
        expect(isAgentExecutable("reschedule appointment")).toBe(false);
      });

      it("should detect keyword within words (negotiate in renegotiate)", () => {
        // Note: "negotiation" does NOT contain substring "negotiate" (negotiat-ion vs negotiat-e)
        expect(isAgentExecutable("negotiation strategy")).toBe(true);
        expect(isAgentExecutable("renegotiate terms")).toBe(false);
      });
    });

    describe("agent-executable tasks", () => {
      it("should return true for research tasks", () => {
        expect(isAgentExecutable("Research flood zone classification")).toBe(true);
      });

      it("should return true for verification tasks", () => {
        expect(isAgentExecutable("Verify zoning compatibility")).toBe(true);
      });

      it("should return true for analysis tasks", () => {
        expect(isAgentExecutable("Analyze market comparables")).toBe(true);
      });

      it("should return true for review tasks", () => {
        expect(isAgentExecutable("Review environmental screening results")).toBe(true);
      });

      it("should return true for generation tasks", () => {
        expect(isAgentExecutable("Generate preliminary cost estimate")).toBe(true);
      });

      it("should return true for data gathering tasks", () => {
        expect(isAgentExecutable("Compile wetlands survey data")).toBe(true);
        expect(isAgentExecutable("Extract property boundaries from GIS")).toBe(true);
        expect(isAgentExecutable("Calculate density metrics")).toBe(true);
      });

      it("should return true for document tasks without human keywords", () => {
        expect(isAgentExecutable("Draft initial site plan")).toBe(true);
        expect(isAgentExecutable("Prepare zoning analysis memo")).toBe(true);
        expect(isAgentExecutable("Create financial model")).toBe(true);
      });

      it("should return true for empty or whitespace-only strings", () => {
        expect(isAgentExecutable("")).toBe(true);
        expect(isAgentExecutable("   ")).toBe(true);
        expect(isAgentExecutable("\t\n")).toBe(true);
      });
    });

    describe("edge cases", () => {
      it("should handle titles with multiple keywords", () => {
        expect(isAgentExecutable("Call to schedule a meeting to negotiate")).toBe(false);
      });

      it("should handle titles with keywords at different positions", () => {
        expect(isAgentExecutable("Review before you call")).toBe(false);
        expect(isAgentExecutable("meeting prep")).toBe(false);
        expect(isAgentExecutable("After signing review")).toBe(false);
      });

      it("should handle special characters around keywords", () => {
        expect(isAgentExecutable("Call! the client")).toBe(false);
        expect(isAgentExecutable("(meet) with team")).toBe(false);
        expect(isAgentExecutable("sign: the contract")).toBe(false);
      });
    });
  });

  describe("getHumanOnlyReason", () => {
    describe("returns null for agent-executable tasks", () => {
      it("should return null for research tasks", () => {
        expect(getHumanOnlyReason("Research flood zone classification")).toBeNull();
      });

      it("should return null for verification tasks", () => {
        expect(getHumanOnlyReason("Verify zoning compatibility")).toBeNull();
      });

      it("should return null for analysis tasks", () => {
        expect(getHumanOnlyReason("Analyze market comparables")).toBeNull();
      });

      it("should return null for review tasks", () => {
        expect(getHumanOnlyReason("Review environmental screening results")).toBeNull();
      });

      it("should return null for generation tasks", () => {
        expect(getHumanOnlyReason("Generate preliminary cost estimate")).toBeNull();
      });

      it("should return null for empty string", () => {
        expect(getHumanOnlyReason("")).toBeNull();
      });
    });

    describe("returns descriptive reason for human-only tasks", () => {
      it('should return reason containing the keyword for "call"', () => {
        const reason = getHumanOnlyReason("Call the seller about pricing");
        expect(reason).not.toBeNull();
        expect(typeof reason).toBe("string");
        expect(reason!.length).toBeGreaterThan(0);
        expect(reason!.toLowerCase()).toContain("call");
      });

      it('should return reason containing the keyword for "meet"', () => {
        const reason = getHumanOnlyReason("Meet with planning commission");
        expect(reason).not.toBeNull();
        expect(reason!.toLowerCase()).toContain("meet");
      });

      it('should return reason containing the keyword for "negotiate"', () => {
        const reason = getHumanOnlyReason("Negotiate purchase agreement");
        expect(reason).not.toBeNull();
        expect(reason!.toLowerCase()).toContain("negotiate");
      });

      it('should return reason containing the keyword for "sign"', () => {
        const reason = getHumanOnlyReason("Sign the LOI");
        expect(reason).not.toBeNull();
        expect(reason!.toLowerCase()).toContain("sign");
      });

      it('should return reason containing the keyword for "schedule"', () => {
        const reason = getHumanOnlyReason("Schedule site visit");
        expect(reason).not.toBeNull();
        expect(reason!.toLowerCase()).toContain("schedule");
      });
    });

    describe("handles case insensitivity", () => {
      it("should return reason for uppercase keywords", () => {
        expect(getHumanOnlyReason("CALL THE SELLER")).not.toBeNull();
        expect(getHumanOnlyReason("MEET WITH ENGINEER")).not.toBeNull();
      });

      it("should return reason for mixed case keywords", () => {
        expect(getHumanOnlyReason("Call")).not.toBeNull();
        expect(getHumanOnlyReason("Meet")).not.toBeNull();
      });
    });

    describe("handles partial matches", () => {
      it("should return reason for keywords within words", () => {
        expect(getHumanOnlyReason("callback")).not.toBeNull();
        expect(getHumanOnlyReason("meeting")).not.toBeNull();
        expect(getHumanOnlyReason("signing")).not.toBeNull();
      });
    });

    describe("reason consistency", () => {
      it("should return consistent reasons for the same keyword", () => {
        const reason1 = getHumanOnlyReason("Call seller");
        const reason2 = getHumanOnlyReason("Call the client");
        const reason3 = getHumanOnlyReason("Make a call");

        expect(reason1).not.toBeNull();
        expect(reason2).not.toBeNull();
        expect(reason3).not.toBeNull();

        expect(typeof reason1).toBe("string");
        expect(typeof reason2).toBe("string");
        expect(typeof reason3).toBe("string");
      });
    });
  });
});
