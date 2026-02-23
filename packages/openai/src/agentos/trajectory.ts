import { isAgentOsFeatureEnabled } from "./config.js";
import { maybeTrimToolOutput } from "./utils/toolOutputTrimmer.js";

type JsonRecord = Record<string, unknown>;

export type TrajectoryEventKind =
  | "agent_switch"
  | "handoff"
  | "tool_start"
  | "tool_end"
  | "text_delta"
  | "error";

export type TrajectoryEvent = {
  at: string;
  kind: TrajectoryEventKind;
  agentName?: string;
  toolName?: string;
  details?: JsonRecord;
};

export type TrajectorySnapshot = {
  version: "1.0";
  eventCount: number;
  events: TrajectoryEvent[];
};

export class TrajectoryRecorder {
  private events: TrajectoryEvent[] = [];
  private readonly maxEvents: number;

  constructor(maxEvents = 400) {
    this.maxEvents = Math.max(1, maxEvents);
  }

  record(event: Omit<TrajectoryEvent, "at">): void {
    const details =
      event.details && typeof event.details === "object"
        ? (maybeTrimToolOutput(event.details).value as JsonRecord)
        : event.details;

    this.events.push({
      at: new Date().toISOString(),
      ...event,
      details,
    });

    if (this.events.length > this.maxEvents) {
      const overflow = this.events.length - this.maxEvents;
      this.events.splice(0, overflow);
    }
  }

  snapshot(): TrajectorySnapshot {
    return {
      version: "1.0",
      eventCount: this.events.length,
      events: [...this.events],
    };
  }
}

export function createTrajectoryRecorder(): TrajectoryRecorder | null {
  if (!isAgentOsFeatureEnabled("trajectoryCapture")) {
    return null;
  }
  return new TrajectoryRecorder();
}

