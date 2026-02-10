import { createAutomationTask } from "../notifications";

jest.mock("@entitlement-os/db", () => ({
  prisma: {
    task: {
      create: jest.fn(),
    },
  },
}));

// Get reference to the mock function after jest.mock hoisting
const db = jest.requireMock("@entitlement-os/db") as {
  prisma: { task: { create: jest.Mock } };
};
const mockTaskCreate = db.prisma.task.create;

describe("notifications", () => {
  beforeEach(() => {
    mockTaskCreate.mockReset();
  });

  describe("createAutomationTask", () => {
    it("should create task with correct orgId and dealId", async () => {
      const mockTask = {
        id: "task-1",
        orgId: "org-123",
        dealId: "deal-456",
        title: "[AUTO] Review parcel enrichment",
        description: "[enrichment_review] Test description",
        status: "TODO",
        pipelineStep: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTaskCreate.mockResolvedValue(mockTask);

      const result = await createAutomationTask({
        orgId: "org-123",
        dealId: "deal-456",
        type: "enrichment_review",
        title: "Review parcel enrichment",
        description: "Test description",
      });

      expect(mockTaskCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: "org-123",
          dealId: "deal-456",
        }),
      });

      expect(result).toEqual(mockTask);
    });

    it('should prefix title with "[AUTO] "', async () => {
      const mockTask = {
        id: "task-1",
        title: "[AUTO] Review triage results",
        status: "TODO",
      };

      mockTaskCreate.mockResolvedValue(mockTask);

      await createAutomationTask({
        orgId: "org-1",
        dealId: "deal-1",
        type: "veto_review",
        title: "Review triage results",
        description: "Test",
      });

      expect(mockTaskCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: "[AUTO] Review triage results",
        }),
      });
    });

    it('should not double-prefix if title already has [AUTO]', async () => {
      const mockTask = {
        id: "task-1",
        title: "[AUTO] Review triage results",
        status: "TODO",
      };

      mockTaskCreate.mockResolvedValue(mockTask);

      await createAutomationTask({
        orgId: "org-1",
        dealId: "deal-1",
        type: "veto_review",
        title: "[AUTO] Review triage results",
        description: "Test",
      });

      expect(mockTaskCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: "[AUTO] Review triage results",
        }),
      });
    });

    it("should set status to TODO", async () => {
      const mockTask = { id: "task-1", status: "TODO" };
      mockTaskCreate.mockResolvedValue(mockTask);

      await createAutomationTask({
        orgId: "org-1",
        dealId: "deal-1",
        type: "kill_confirmation",
        title: "Confirm kill decision",
        description: "Test",
      });

      expect(mockTaskCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: "TODO",
        }),
      });
    });

    it("should include description with notification type prefix", async () => {
      const mockTask = { id: "task-1" };
      mockTaskCreate.mockResolvedValue(mockTask);

      await createAutomationTask({
        orgId: "org-1",
        dealId: "deal-1",
        type: "advancement_suggestion",
        title: "Consider advancing to next stage",
        description: "All criteria met for advancement",
      });

      expect(mockTaskCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          description: expect.stringContaining("advancement_suggestion"),
        }),
      });
    });

    it("should use provided pipelineStep (number)", async () => {
      const mockTask = { id: "task-1", pipelineStep: 3 };
      mockTaskCreate.mockResolvedValue(mockTask);

      await createAutomationTask({
        orgId: "org-1",
        dealId: "deal-1",
        type: "document_review",
        title: "Review uploaded documents",
        description: "Test",
        pipelineStep: 3,
      });

      expect(mockTaskCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pipelineStep: 3,
        }),
      });
    });

    it("should default pipelineStep to 1 if not provided", async () => {
      const mockTask = { id: "task-1", pipelineStep: 1 };
      mockTaskCreate.mockResolvedValue(mockTask);

      await createAutomationTask({
        orgId: "org-1",
        dealId: "deal-1",
        type: "enrichment_review",
        title: "Review enrichment",
        description: "Test",
      });

      expect(mockTaskCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pipelineStep: 1,
        }),
      });
    });

    it("should include dueAt if provided", async () => {
      const dueDate = new Date("2026-02-15T10:00:00Z");
      const mockTask = { id: "task-1", dueAt: dueDate };
      mockTaskCreate.mockResolvedValue(mockTask);

      await createAutomationTask({
        orgId: "org-1",
        dealId: "deal-1",
        type: "kill_confirmation",
        title: "Confirm kill",
        description: "Test",
        dueAt: dueDate,
      });

      expect(mockTaskCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dueAt: dueDate,
        }),
      });
    });

    it("should not include dueAt if not provided", async () => {
      const mockTask = { id: "task-1" };
      mockTaskCreate.mockResolvedValue(mockTask);

      await createAutomationTask({
        orgId: "org-1",
        dealId: "deal-1",
        type: "outreach_review",
        title: "Review outreach",
        description: "Test",
      });

      const callArgs = mockTaskCreate.mock.calls[0][0];
      expect(callArgs.data.dueAt).toBeUndefined();
    });

    it("should return the created task", async () => {
      const mockTask = {
        id: "task-123",
        orgId: "org-1",
        dealId: "deal-1",
        title: "[AUTO] Test task",
        description: "[veto_review] Test description",
        status: "TODO",
        pipelineStep: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTaskCreate.mockResolvedValue(mockTask);

      const result = await createAutomationTask({
        orgId: "org-1",
        dealId: "deal-1",
        type: "veto_review",
        title: "Test task",
        description: "Test description",
      });

      expect(result).toEqual(mockTask);
      expect(result.id).toBe("task-123");
    });
  });

  describe("notification types", () => {
    it("should handle veto_review notification type", async () => {
      const mockTask = { id: "task-1" };
      mockTaskCreate.mockResolvedValue(mockTask);

      await createAutomationTask({
        orgId: "org-1",
        dealId: "deal-1",
        type: "veto_review",
        title: "Review intake decision",
        description: "New deal created automatically",
      });

      expect(mockTaskCreate).toHaveBeenCalled();
      const callArgs = mockTaskCreate.mock.calls[0][0];
      expect(callArgs.data.description).toMatch(/veto_review/);
    });

    it("should handle enrichment_review notification type", async () => {
      const mockTask = { id: "task-1" };
      mockTaskCreate.mockResolvedValue(mockTask);

      await createAutomationTask({
        orgId: "org-1",
        dealId: "deal-1",
        type: "enrichment_review",
        title: "Review enrichment results",
        description: "Low confidence enrichment",
      });

      expect(mockTaskCreate).toHaveBeenCalled();
      const callArgs = mockTaskCreate.mock.calls[0][0];
      expect(callArgs.data.description).toMatch(/enrichment_review/);
    });

    it("should handle kill_confirmation notification type", async () => {
      const mockTask = { id: "task-1" };
      mockTaskCreate.mockResolvedValue(mockTask);

      await createAutomationTask({
        orgId: "org-1",
        dealId: "deal-1",
        type: "kill_confirmation",
        title: "Confirm kill decision",
        description: "Triage recommended KILL",
      });

      expect(mockTaskCreate).toHaveBeenCalled();
      const callArgs = mockTaskCreate.mock.calls[0][0];
      expect(callArgs.data.description).toMatch(/kill_confirmation/);
    });

    it("should handle advancement_suggestion notification type", async () => {
      const mockTask = { id: "task-1" };
      mockTaskCreate.mockResolvedValue(mockTask);

      await createAutomationTask({
        orgId: "org-1",
        dealId: "deal-1",
        type: "advancement_suggestion",
        title: "Consider advancing to PREAPP",
        description: "All criteria met",
      });

      expect(mockTaskCreate).toHaveBeenCalled();
      const callArgs = mockTaskCreate.mock.calls[0][0];
      expect(callArgs.data.description).toMatch(/advancement_suggestion/);
    });

    it("should handle outreach_review notification type", async () => {
      const mockTask = { id: "task-1" };
      mockTaskCreate.mockResolvedValue(mockTask);

      await createAutomationTask({
        orgId: "org-1",
        dealId: "deal-1",
        type: "outreach_review",
        title: "Review outreach draft",
        description: "Draft email ready",
      });

      expect(mockTaskCreate).toHaveBeenCalled();
      const callArgs = mockTaskCreate.mock.calls[0][0];
      expect(callArgs.data.description).toMatch(/outreach_review/);
    });

    it("should handle document_review notification type", async () => {
      const mockTask = { id: "task-1" };
      mockTaskCreate.mockResolvedValue(mockTask);

      await createAutomationTask({
        orgId: "org-1",
        dealId: "deal-1",
        type: "document_review",
        title: "Review uploaded documents",
        description: "New documents detected",
      });

      expect(mockTaskCreate).toHaveBeenCalled();
      const callArgs = mockTaskCreate.mock.calls[0][0];
      expect(callArgs.data.description).toMatch(/document_review/);
    });

    it("should handle classification_review notification type", async () => {
      const mockTask = { id: "task-1" };
      mockTaskCreate.mockResolvedValue(mockTask);

      await createAutomationTask({
        orgId: "org-1",
        dealId: "deal-1",
        type: "classification_review",
        title: "Review document classification",
        description: "Low confidence classification",
      });

      expect(mockTaskCreate).toHaveBeenCalled();
      const callArgs = mockTaskCreate.mock.calls[0][0];
      expect(callArgs.data.description).toMatch(/classification_review/);
    });
  });

  describe("error handling", () => {
    it("should propagate Prisma errors", async () => {
      const error = new Error("Database connection failed");
      mockTaskCreate.mockRejectedValue(error);

      await expect(
        createAutomationTask({
          orgId: "org-1",
          dealId: "deal-1",
          type: "veto_review",
          title: "Test",
          description: "Test",
        })
      ).rejects.toThrow("Database connection failed");
    });

    it("should handle validation errors", async () => {
      const error = new Error("Invalid dealId");
      mockTaskCreate.mockRejectedValue(error);

      await expect(
        createAutomationTask({
          orgId: "org-1",
          dealId: "invalid-deal",
          type: "enrichment_review",
          title: "Test",
          description: "Test",
        })
      ).rejects.toThrow("Invalid dealId");
    });
  });

  describe("parameter validation", () => {
    it("should handle all required parameters", async () => {
      const mockTask = { id: "task-1" };
      mockTaskCreate.mockResolvedValue(mockTask);

      await createAutomationTask({
        orgId: "org-123",
        dealId: "deal-456",
        type: "veto_review",
        title: "Test title",
        description: "Test description",
      });

      expect(mockTaskCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: "org-123",
          dealId: "deal-456",
          title: expect.stringContaining("Test title"),
          description: expect.any(String),
          status: "TODO",
        }),
      });
    });

    it("should handle all optional parameters", async () => {
      const dueDate = new Date("2026-02-20T10:00:00Z");
      const mockTask = { id: "task-1" };
      mockTaskCreate.mockResolvedValue(mockTask);

      await createAutomationTask({
        orgId: "org-1",
        dealId: "deal-1",
        type: "advancement_suggestion",
        title: "Test",
        description: "Test",
        pipelineStep: 4,
        dueAt: dueDate,
      });

      expect(mockTaskCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pipelineStep: 4,
          dueAt: dueDate,
        }),
      });
    });
  });
});
