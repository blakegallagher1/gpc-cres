import type {
  CommandCenterDeadlineBucket,
  CommandCenterDeadlineItem,
  CommandCenterPipelineDayBucket,
  CommandCenterPortfolioDeal,
  CommandCenterUrgency,
} from "./commandCenterTypes";

const ACTIVE_PIPELINE_STATUSES = new Set([
  "INTAKE",
  "TRIAGE_DONE",
  "PREAPP",
  "CONCEPT",
  "NEIGHBORS",
  "SUBMITTED",
  "HEARING",
  "APPROVED",
  "EXIT_MARKETED",
]);

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Fetches command-center JSON and throws with the API error message when available. */
export async function fetchCommandCenterJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      isRecord(data) && typeof data.error === "string"
        ? data.error
        : `Failed to load ${url}`;
    throw new Error(message);
  }

  return data as T;
}

/** Formats a timestamp into a compact relative age for compact operator feeds. */
export function timeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Formats deadline urgency into the short labels used in the command-center rail. */
export function formatDue(hoursUntilDue: number): string {
  if (hoursUntilDue <= -48) {
    const days = Math.abs(Math.round(hoursUntilDue / 24));
    return `${days}d overdue`;
  }

  if (hoursUntilDue <= 0) {
    const hours = Math.abs(Math.round(hoursUntilDue));
    return hours === 0 ? "due now" : `${hours}h overdue`;
  }

  if (hoursUntilDue < 24) {
    return `${Math.round(hoursUntilDue)}h`;
  }

  return `${Math.round(hoursUntilDue / 24)}d`;
}

/** Counts deadlines by urgency for quick KPI strips and rail badges. */
export function countDeadlineUrgencies(
  deadlines: CommandCenterDeadlineItem[],
): Record<CommandCenterUrgency, number> {
  return deadlines.reduce<Record<CommandCenterUrgency, number>>(
    (counts, deadline) => {
      counts[deadline.urgency] += 1;
      return counts;
    },
    { black: 0, red: 0, yellow: 0, green: 0 },
  );
}

/** Buckets deadlines into a fixed day-offset histogram for the deadline load section. */
export function buildDeadlineTimeline(deadlines: CommandCenterDeadlineItem[]): {
  buckets: CommandCenterDeadlineBucket[];
  maxCount: number;
} {
  const buckets: CommandCenterDeadlineBucket[] = [
    { label: "Overdue", count: 0 },
    { label: "Today", count: 0 },
    { label: "Tomorrow", count: 0 },
    { label: "2 days", count: 0 },
    { label: "3 days", count: 0 },
    { label: "4 days", count: 0 },
    { label: "5 days", count: 0 },
    { label: "6 days", count: 0 },
    { label: "7+ days", count: 0 },
  ];

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (const deadline of deadlines) {
    const due = new Date(deadline.dueAt);
    if (Number.isNaN(due.getTime())) {
      continue;
    }

    due.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((due.getTime() - now.getTime()) / DAY_IN_MS);

    if (diffDays < 0) {
      buckets[0].count += 1;
      continue;
    }

    if (diffDays === 0) {
      buckets[1].count += 1;
      continue;
    }

    if (diffDays >= 7) {
      buckets[8].count += 1;
      continue;
    }

    buckets[diffDays + 1].count += 1;
  }

  return {
    buckets,
    maxCount: Math.max(...buckets.map((bucket) => bucket.count), 1),
  };
}

function buildDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/** Builds a 14-day activity cadence map for the pipeline flow section. */
export function buildPipelineDayTimeline(
  deals: CommandCenterPortfolioDeal[],
  days = 14,
): CommandCenterPipelineDayBucket[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const bucketMap = new Map<string, CommandCenterPipelineDayBucket>();
  const buckets: CommandCenterPipelineDayBucket[] = [];

  for (let index = days - 1; index >= 0; index -= 1) {
    const day = new Date(now.getTime() - index * DAY_IN_MS);
    const dateKey = buildDateKey(day);
    const bucket: CommandCenterPipelineDayBucket = {
      dateKey,
      label: day.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      total: 0,
      countByStatus: {},
    };
    buckets.push(bucket);
    bucketMap.set(dateKey, bucket);
  }

  for (const deal of deals) {
    if (!ACTIVE_PIPELINE_STATUSES.has(deal.status)) {
      continue;
    }

    const updatedAt = new Date(deal.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) {
      continue;
    }

    const bucket = bucketMap.get(buildDateKey(updatedAt));
    if (!bucket) {
      continue;
    }

    bucket.total += 1;
    bucket.countByStatus[deal.status] = (bucket.countByStatus[deal.status] ?? 0) + 1;
  }

  return buckets;
}
