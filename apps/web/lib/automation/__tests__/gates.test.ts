import { requiresHumanApproval, canAutoAdvance, getAdvancementCriteria } from "../gates";

describe("gates", () => {
  describe("requiresHumanApproval", () => {
    it("should require approval for TRIAGE_DONE -> PREAPP", () => {
      expect(requiresHumanApproval("TRIAGE_DONE", "PREAPP")).toBe(true);
    });

    it("should require approval for PREAPP -> CONCEPT", () => {
      expect(requiresHumanApproval("PREAPP", "CONCEPT")).toBe(true);
    });

    it("should require approval for CONCEPT -> NEIGHBORS", () => {
      expect(requiresHumanApproval("CONCEPT", "NEIGHBORS")).toBe(true);
    });

    it("should require approval for NEIGHBORS -> SUBMITTED", () => {
      expect(requiresHumanApproval("NEIGHBORS", "SUBMITTED")).toBe(true);
    });

    it("should require approval for SUBMITTED -> HEARING", () => {
      expect(requiresHumanApproval("SUBMITTED", "HEARING")).toBe(true);
    });

    it("should require approval for HEARING -> APPROVED", () => {
      expect(requiresHumanApproval("HEARING", "APPROVED")).toBe(true);
    });

    it("should require approval for APPROVED -> EXIT_MARKETED", () => {
      expect(requiresHumanApproval("APPROVED", "EXIT_MARKETED")).toBe(true);
    });

    it("should require approval for EXIT_MARKETED -> EXITED", () => {
      expect(requiresHumanApproval("EXIT_MARKETED", "EXITED")).toBe(true);
    });

    it("should NOT require approval for INTAKE -> TRIAGE_DONE (the only auto-advance)", () => {
      expect(requiresHumanApproval("INTAKE", "TRIAGE_DONE")).toBe(false);
    });

    it("should NOT require approval for any status -> KILLED", () => {
      expect(requiresHumanApproval("INTAKE", "KILLED")).toBe(false);
      expect(requiresHumanApproval("TRIAGE_DONE", "KILLED")).toBe(false);
      expect(requiresHumanApproval("PREAPP", "KILLED")).toBe(false);
      expect(requiresHumanApproval("CONCEPT", "KILLED")).toBe(false);
      expect(requiresHumanApproval("NEIGHBORS", "KILLED")).toBe(false);
      expect(requiresHumanApproval("SUBMITTED", "KILLED")).toBe(false);
      expect(requiresHumanApproval("HEARING", "KILLED")).toBe(false);
      expect(requiresHumanApproval("APPROVED", "KILLED")).toBe(false);
      expect(requiresHumanApproval("EXIT_MARKETED", "KILLED")).toBe(false);
    });

    it("should handle edge case: KILLED -> KILLED", () => {
      expect(requiresHumanApproval("KILLED", "KILLED")).toBe(false);
    });

    it("should handle edge case: same status transitions", () => {
      expect(requiresHumanApproval("INTAKE", "INTAKE")).toBe(false);
      expect(requiresHumanApproval("PREAPP", "PREAPP")).toBe(false);
    });
  });

  describe("canAutoAdvance", () => {
    it("should return TRUE ONLY for INTAKE -> TRIAGE_DONE", () => {
      expect(canAutoAdvance("INTAKE", "TRIAGE_DONE")).toBe(true);
    });

    it("should return FALSE for TRIAGE_DONE -> PREAPP", () => {
      expect(canAutoAdvance("TRIAGE_DONE", "PREAPP")).toBe(false);
    });

    it("should return FALSE for PREAPP -> CONCEPT", () => {
      expect(canAutoAdvance("PREAPP", "CONCEPT")).toBe(false);
    });

    it("should return FALSE for CONCEPT -> NEIGHBORS", () => {
      expect(canAutoAdvance("CONCEPT", "NEIGHBORS")).toBe(false);
    });

    it("should return FALSE for NEIGHBORS -> SUBMITTED", () => {
      expect(canAutoAdvance("NEIGHBORS", "SUBMITTED")).toBe(false);
    });

    it("should return FALSE for SUBMITTED -> HEARING", () => {
      expect(canAutoAdvance("SUBMITTED", "HEARING")).toBe(false);
    });

    it("should return FALSE for HEARING -> APPROVED", () => {
      expect(canAutoAdvance("HEARING", "APPROVED")).toBe(false);
    });

    it("should return FALSE for APPROVED -> EXIT_MARKETED", () => {
      expect(canAutoAdvance("APPROVED", "EXIT_MARKETED")).toBe(false);
    });

    it("should return FALSE for EXIT_MARKETED -> EXITED", () => {
      expect(canAutoAdvance("EXIT_MARKETED", "EXITED")).toBe(false);
    });

    it("should return FALSE for invalid transitions", () => {
      expect(canAutoAdvance("INTAKE", "APPROVED")).toBe(false);
      expect(canAutoAdvance("INTAKE", "EXITED")).toBe(false);
      expect(canAutoAdvance("PREAPP", "HEARING")).toBe(false);
    });

    it("should return FALSE for transitions to KILLED", () => {
      expect(canAutoAdvance("INTAKE", "KILLED")).toBe(false);
      expect(canAutoAdvance("TRIAGE_DONE", "KILLED")).toBe(false);
      expect(canAutoAdvance("PREAPP", "KILLED")).toBe(false);
    });

    it("should return FALSE for same status transitions", () => {
      expect(canAutoAdvance("INTAKE", "INTAKE")).toBe(false);
      expect(canAutoAdvance("TRIAGE_DONE", "TRIAGE_DONE")).toBe(false);
    });

    it("should return FALSE for backwards transitions", () => {
      expect(canAutoAdvance("TRIAGE_DONE", "INTAKE")).toBe(false);
      expect(canAutoAdvance("PREAPP", "TRIAGE_DONE")).toBe(false);
      expect(canAutoAdvance("APPROVED", "HEARING")).toBe(false);
    });
  });

  describe("getAdvancementCriteria", () => {
    it("should return null for INTAKE (no criteria needed, auto-advance)", () => {
      expect(getAdvancementCriteria("INTAKE")).toBeNull();
    });

    it("should return null for EXITED (terminal state)", () => {
      expect(getAdvancementCriteria("EXITED")).toBeNull();
    });

    it("should return null for KILLED (terminal state)", () => {
      expect(getAdvancementCriteria("KILLED")).toBeNull();
    });

    it("should return criteria for TRIAGE_DONE mentioning tasks and decision=ADVANCE", () => {
      const criteria = getAdvancementCriteria("TRIAGE_DONE");
      expect(criteria).not.toBeNull();
      expect(typeof criteria).toBe("object");

      const criteriaStr = JSON.stringify(criteria).toLowerCase();
      expect(criteriaStr).toMatch(/task/);
      expect(criteriaStr).toMatch(/advance|decision/);
    });

    it("should return criteria for PREAPP mentioning pre-app meeting notes", () => {
      const criteria = getAdvancementCriteria("PREAPP");
      expect(criteria).not.toBeNull();
      expect(typeof criteria).toBe("object");

      const criteriaStr = JSON.stringify(criteria).toLowerCase();
      expect(criteriaStr).toMatch(/pre-?app|meeting|notes/);
    });

    it("should return non-null criteria for CONCEPT", () => {
      const criteria = getAdvancementCriteria("CONCEPT");
      expect(criteria).not.toBeNull();
      expect(typeof criteria).toBe("object");
    });

    it("should return non-null criteria for NEIGHBORS", () => {
      const criteria = getAdvancementCriteria("NEIGHBORS");
      expect(criteria).not.toBeNull();
      expect(typeof criteria).toBe("object");
    });

    it("should return non-null criteria for SUBMITTED", () => {
      const criteria = getAdvancementCriteria("SUBMITTED");
      expect(criteria).not.toBeNull();
      expect(typeof criteria).toBe("object");
    });

    it("should return non-null criteria for HEARING", () => {
      const criteria = getAdvancementCriteria("HEARING");
      expect(criteria).not.toBeNull();
      expect(typeof criteria).toBe("object");
    });

    it("should return non-null criteria for APPROVED", () => {
      const criteria = getAdvancementCriteria("APPROVED");
      expect(criteria).not.toBeNull();
      expect(typeof criteria).toBe("object");
    });

    it("should return non-null criteria for EXIT_MARKETED", () => {
      const criteria = getAdvancementCriteria("EXIT_MARKETED");
      expect(criteria).not.toBeNull();
      expect(typeof criteria).toBe("object");
    });

    it("should return consistent criteria objects with required fields", () => {
      const stages = [
        "TRIAGE_DONE",
        "PREAPP",
        "CONCEPT",
        "NEIGHBORS",
        "SUBMITTED",
        "HEARING",
        "APPROVED",
        "EXIT_MARKETED",
      ] as const;

      stages.forEach((stage) => {
        const criteria = getAdvancementCriteria(stage);
        expect(criteria).not.toBeNull();
        expect(criteria).toHaveProperty("description");
        expect(typeof criteria!.description).toBe("string");
        expect(criteria!.description.length).toBeGreaterThan(0);
      });
    });
  });
});
