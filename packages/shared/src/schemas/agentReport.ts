import { z } from "zod";

const TaskUnderstandingSchema = z.object({
  summary: z
    .string()
    .describe("How the coordinator interprets the original request and its goals"),
  focus_questions: z
    .array(z.string())
    .nullable()
    .describe("Outstanding questions or follow-ups to clarify the mission")
    .optional(),
  context: z
    .string()
    .nullable()
    .describe("Additional context that shaped the interpretation")
    .optional(),
});

const ExecutionPlanStepSchema = z.object({
  agent: z.string().describe("Specialist agent responsible for the step"),
  responsibility: z.string().describe("What that agent is expected to deliver"),
  rationale: z.string().describe("Why the agent is being requested for this task"),
  timeline: z
    .string()
    .nullable()
    .describe("Target timing for the step (week/day/date)")
    .optional(),
});

const ExecutionPlanSchema = z.object({
  summary: z.string().describe("How the coordinator plans to sequence the work"),
  steps: z
    .array(ExecutionPlanStepSchema)
    .min(1, "At least one plan step is required"),
});

const AgentOutputSchema = z.object({
  agent: z.string().describe("Name of the agent that produced the output"),
  summary: z.string().describe("Brief description of the agent's conclusion"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .optional()
    .describe("Optional confidence score between 0 and 1"),
  citations: z
    .array(z.string().url())
    .nullable()
    .describe("URLs referenced when generating the agent output")
    .optional(),
});

const SynthesisSchema = z.object({
  recommendation: z.string().describe("Final recommendation for the ask"),
  rationale: z.string().describe("Evidence that supports the recommendation"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .optional()
    .describe("Optional confidence level assigned to the recommendation"),
});

const UncertaintyItemSchema = z.object({
  area: z.string().describe("Area of uncertainty (e.g., permits, market)"),
  impact: z.string().describe("How the uncertainty affects the recommendation"),
  mitigation: z
    .string()
    .describe("What can be done to reduce or monitor the uncertainty"),
  reducible: z
    .boolean()
    .describe("True when more data can reduce the uncertainty, false when irreducible"),
});

const NextStepSchema = z.object({
  action: z.string().describe("Action to take"),
  owner: z.string().describe("Person, team, or agent responsible"),
  dueDate: z
    .string()
    .datetime()
    .nullable()
    .describe("ISO 8601 due date for the action")
    .optional(),
  priority: z
    .enum(["high", "medium", "low"])
    .nullable()
    .describe("Priority label for the action")
    .optional(),
});

export const AgentReportSchema = z.object({
  schema_version: z.literal("1.0"),
  generated_at: z.string().datetime().describe("ISO 8601 timestamp of report generation"),
  task_understanding: TaskUnderstandingSchema.describe("How the task was interpreted"),
  execution_plan: ExecutionPlanSchema.describe("Coordinated sequencing of specialist calls"),
  agent_outputs: z
    .array(AgentOutputSchema)
    .min(1, "At least one agent output is required")
    .describe("Captured outputs from the specialist agents"),
  synthesis: SynthesisSchema.describe("Integrated recommendation"),
  key_assumptions: z
    .array(z.string())
    .default([])
    .describe("Assumptions that could change the recommendation"),
  uncertainty_map: z
    .array(UncertaintyItemSchema)
    .default([])
    .describe("Known uncertainties and how they are addressed"),
  next_steps: z
    .array(NextStepSchema)
    .min(1, "At least one next step is required")
    .describe("Actions that should occur after this report"),
  sources: z
    .array(z.string().url())
    .default([])
    .describe("URLs cited to support the final report"),
});

export type AgentReport = z.infer<typeof AgentReportSchema>;
