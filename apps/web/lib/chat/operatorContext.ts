export const OPERATOR_CONTEXT_STORAGE_KEY = 'gpc.operatorContext.v1';

export type OperatorContextSource =
  | 'command-center'
  | 'deal'
  | 'map'
  | 'memory'
  | 'run'
  | 'upload'
  | 'manual';

export type OperatorContextItem = {
  id: string;
  source: OperatorContextSource;
  label: string;
  detail?: string;
  href?: string;
  payload?: Record<string, unknown>;
};

export type OperatorContextEnvelope = {
  version: 1;
  createdAt: string;
  sourceSurface: string;
  prompt?: string;
  items: OperatorContextItem[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOperatorContextSource(value: unknown): value is OperatorContextSource {
  return (
    value === 'command-center' ||
    value === 'deal' ||
    value === 'map' ||
    value === 'memory' ||
    value === 'run' ||
    value === 'upload' ||
    value === 'manual'
  );
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function createOperatorContextEnvelope(params: {
  sourceSurface: string;
  prompt?: string;
  items: OperatorContextItem[];
}): OperatorContextEnvelope {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    sourceSurface: params.sourceSurface,
    prompt: normalizeOptionalString(params.prompt),
    items: dedupeOperatorContextItems(params.items),
  };
}

export function dedupeOperatorContextItems(items: OperatorContextItem[]): OperatorContextItem[] {
  const seen = new Set<string>();
  const next: OperatorContextItem[] = [];

  for (const item of items) {
    const key = `${item.source}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }

  return next;
}

export function normalizeOperatorContextEnvelope(value: unknown): OperatorContextEnvelope | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.items)) {
    return null;
  }

  const items = value.items
    .map((item): OperatorContextItem | null => {
      if (!isRecord(item) || !isOperatorContextSource(item.source)) {
        return null;
      }

      const id = normalizeOptionalString(item.id);
      const label = normalizeOptionalString(item.label);
      if (!id || !label) {
        return null;
      }

      return {
        id,
        source: item.source,
        label,
        detail: normalizeOptionalString(item.detail),
        href: normalizeOptionalString(item.href),
        payload: isRecord(item.payload) ? item.payload : undefined,
      };
    })
    .filter((item): item is OperatorContextItem => item !== null);

  if (items.length === 0) {
    return null;
  }

  return {
    version: 1,
    createdAt: normalizeOptionalString(value.createdAt) ?? new Date().toISOString(),
    sourceSurface: normalizeOptionalString(value.sourceSurface) ?? 'unknown',
    prompt: normalizeOptionalString(value.prompt),
    items: dedupeOperatorContextItems(items),
  };
}

export function writeOperatorContextEnvelope(envelope: OperatorContextEnvelope): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(OPERATOR_CONTEXT_STORAGE_KEY, JSON.stringify(envelope));
}

export function consumeOperatorContextEnvelope(): OperatorContextEnvelope | null {
  if (typeof window === 'undefined') return null;

  const raw = window.sessionStorage.getItem(OPERATOR_CONTEXT_STORAGE_KEY);
  if (!raw) return null;

  window.sessionStorage.removeItem(OPERATOR_CONTEXT_STORAGE_KEY);

  try {
    return normalizeOperatorContextEnvelope(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function buildOperatorContextPrompt(envelope: OperatorContextEnvelope | null): string {
  if (!envelope || envelope.items.length === 0) {
    return '';
  }

  const lines = [
    '[Operator Context]',
    `sourceSurface=${envelope.sourceSurface}`,
    `createdAt=${envelope.createdAt}`,
    ...envelope.items.map((item, index) => {
      const pieces = [
        `${index + 1}. ${item.source}: ${item.label}`,
        item.detail ? `detail=${item.detail}` : null,
        item.href ? `href=${item.href}` : null,
      ].filter((piece): piece is string => piece !== null);
      return pieces.join(' | ');
    }),
    '[/Operator Context]',
  ];

  return `${lines.join('\n')}\n\n`;
}

export function removeOperatorContextItem(
  envelope: OperatorContextEnvelope | null,
  itemId: string,
): OperatorContextEnvelope | null {
  if (!envelope) return null;

  const nextItems = envelope.items.filter((item) => item.id !== itemId);
  if (nextItems.length === 0) {
    return null;
  }

  return {
    ...envelope,
    items: nextItems,
  };
}
