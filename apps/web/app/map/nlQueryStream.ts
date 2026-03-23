type NlQueryEvent = {
  type?: string;
  content?: string;
  delta?: string;
  text?: string;
  result?: unknown;
};

export type NlQueryRows = {
  rows: Array<Record<string, unknown>>;
  rowCount: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseRows(value: unknown): NlQueryRows | null {
  if (typeof value === "string") {
    try {
      return parseRows(JSON.parse(value));
    } catch {
      return null;
    }
  }

  if (Array.isArray(value)) {
    const rows = value.filter(isRecord);
    return rows.length > 0
      ? { rows, rowCount: rows.length }
      : null;
  }

  if (!isRecord(value)) return null;

  if (Array.isArray(value.rows)) {
    const rows = value.rows.filter(isRecord);
    if (rows.length > 0 || value.rowCount === 0) {
      return {
        rows,
        rowCount: typeof value.rowCount === "number" ? value.rowCount : rows.length,
      };
    }
  }

  if (typeof value.text === "string") {
    return parseRows(value.text);
  }

  return null;
}

/**
 * Returns appended assistant text from a streamed NL query event.
 */
export function extractNlQueryTextDelta(event: NlQueryEvent): string | null {
  if (event.type !== "text_delta" && event.type !== "response_text_delta") {
    return null;
  }

  if (typeof event.content === "string") return event.content;
  if (typeof event.delta === "string") return event.delta;
  if (typeof event.text === "string") return event.text;
  return null;
}

/**
 * Returns the finalized assistant text from a streamed NL query event.
 */
export function extractNlQueryFinalText(event: NlQueryEvent): string | null {
  if (event.type !== "text" && event.type !== "response_text_done") {
    return null;
  }

  if (typeof event.text === "string") return event.text;
  if (typeof event.content === "string") return event.content;
  if (typeof event.delta === "string") return event.delta;
  return null;
}

/**
 * Extracts structured rows from tool events, including wrapped tool payloads.
 */
export function extractNlQueryRows(event: NlQueryEvent): NlQueryRows | null {
  if (event.type !== "tool_result" && event.type !== "tool_end") {
    return null;
  }

  return parseRows(event.result);
}
