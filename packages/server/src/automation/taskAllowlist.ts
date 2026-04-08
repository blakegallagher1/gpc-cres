import { AUTOMATION_CONFIG } from "./config";

/**
 * Check if a task title indicates it can be auto-executed by an agent.
 * Tasks containing human-only keywords (call, meet, negotiate, sign, schedule)
 * are NEVER auto-executed.
 */
export function isAgentExecutable(title: string): boolean {
  const lower = title.toLowerCase();
  return !AUTOMATION_CONFIG.taskExecution.humanOnlyKeywords.some(
    (keyword) => lower.includes(keyword)
  );
}

/**
 * Get the reason a task cannot be auto-executed.
 * Returns null if the task IS agent-executable.
 */
export function getHumanOnlyReason(title: string): string | null {
  const lower = title.toLowerCase();
  for (const keyword of AUTOMATION_CONFIG.taskExecution.humanOnlyKeywords) {
    if (lower.includes(keyword)) {
      return `Task contains human-only keyword "${keyword}" — requires manual execution`;
    }
  }
  return null;
}
