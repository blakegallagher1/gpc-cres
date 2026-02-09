import {
  exportWorkflow,
  importWorkflow,
  workflowTemplates,
} from "@/lib/workflow-io";
import { Workflow } from "@/types";

describe("workflow-io", () => {
  const mockWorkflow: Workflow = {
    id: "wf_test",
    name: "Test Workflow",
    description: "A test workflow",
    nodes: [
      {
        id: "start",
        type: "start",
        position: { x: 100, y: 100 },
        data: { label: "Start" },
      },
      {
        id: "agent1",
        type: "agent",
        position: { x: 200, y: 200 },
        data: { agentId: "research", label: "Research" },
      },
    ],
    edges: [
      { id: "e1", source: "start", target: "agent1" },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    run_count: 0,
  };

  describe("exportWorkflow", () => {
    it("should export workflow to JSON string", () => {
      const json = exportWorkflow(mockWorkflow);
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe("1.0.0");
      expect(parsed.workflow.name).toBe("Test Workflow");
      expect(parsed.workflow.nodes).toHaveLength(2);
      expect(parsed.workflow.edges).toHaveLength(1);
      expect(parsed.exported_at).toBeDefined();
    });
  });

  describe("importWorkflow", () => {
    it("should import valid workflow JSON", () => {
      const exported = exportWorkflow(mockWorkflow);
      const result = importWorkflow(exported);

      expect(result.success).toBe(true);
      expect(result.workflow?.name).toBe("Test Workflow");
      expect(result.workflow?.nodes).toHaveLength(2);
      expect(result.workflow?.edges).toHaveLength(1);
    });

    it("should fail on invalid JSON", () => {
      const result = importWorkflow("invalid json");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to parse");
    });

    it("should fail on missing workflow data", () => {
      const result = importWorkflow(JSON.stringify({ version: "1.0.0" }));

      expect(result.success).toBe(false);
      expect(result.error).toContain("missing workflow data");
    });

    it("should fail on invalid nodes array", () => {
      const result = importWorkflow(
        JSON.stringify({
          version: "1.0.0",
          workflow: { name: "Test", nodes: "invalid", edges: [] },
        })
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("nodes must be an array");
    });

    it("should fail on invalid edges array", () => {
      const result = importWorkflow(
        JSON.stringify({
          version: "1.0.0",
          workflow: { name: "Test", nodes: [], edges: "invalid" },
        })
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("edges must be an array");
    });

    it("should fail on invalid node structure", () => {
      const result = importWorkflow(
        JSON.stringify({
          version: "1.0.0",
          workflow: {
            name: "Test",
            nodes: [{ id: "node1" }], // missing type and position
            edges: [],
          },
        })
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid node structure");
    });

    it("should fail on invalid edge structure", () => {
      const result = importWorkflow(
        JSON.stringify({
          version: "1.0.0",
          workflow: {
            name: "Test",
            nodes: [{ id: "node1", type: "start", position: { x: 0, y: 0 } }],
            edges: [{ id: "e1" }], // missing source and target
          },
        })
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid edge structure");
    });
  });

  describe("workflowTemplates", () => {
    it("should have at least 3 templates", () => {
      expect(workflowTemplates.length).toBeGreaterThanOrEqual(3);
    });

    it("should have a blank template", () => {
      const blank = workflowTemplates.find((t) => t.id === "blank");
      expect(blank).toBeDefined();
      expect(blank?.nodes).toHaveLength(1);
    });

    it("should have a property analysis template", () => {
      const template = workflowTemplates.find((t) => t.id === "property-analysis");
      expect(template).toBeDefined();
      expect(template?.nodes.length).toBeGreaterThan(2);
    });

    it("each template should have required fields", () => {
      workflowTemplates.forEach((template) => {
        expect(template.id).toBeDefined();
        expect(template.name).toBeDefined();
        expect(template.description).toBeDefined();
        expect(Array.isArray(template.nodes)).toBe(true);
        expect(Array.isArray(template.edges)).toBe(true);
      });
    });
  });
});
