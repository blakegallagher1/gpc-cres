const DEFAULT_LOCALE = "en-US";
const DEFAULT_CURRENCY = "USD";
const KIBIBYTE = 1024;
const MEBIBYTE = KIBIBYTE * 1024;
const GIBIBYTE = MEBIBYTE * 1024;

type DateLike = string | number | Date;

function toValidDate(value: DateLike): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Formats USD values for dense operator surfaces.
 */
export function formatOperatorCurrency(
  value: number,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  },
): string {
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency: DEFAULT_CURRENCY,
    minimumFractionDigits: options?.minimumFractionDigits ?? 2,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  }).format(value);
}

/**
 * Formats percentage values with an explicit suffix.
 */
export function formatOperatorPercent(
  value: number,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    input?: "percent" | "ratio";
  },
): string {
  const normalizedValue = options?.input === "ratio" ? value * 100 : value;
  return `${normalizedValue.toLocaleString(DEFAULT_LOCALE, {
    minimumFractionDigits: options?.minimumFractionDigits ?? 1,
    maximumFractionDigits: options?.maximumFractionDigits ?? 1,
  })}%`;
}

/**
 * Formats acreage values with optional unit suffixes.
 */
export function formatOperatorAcreage(
  value: number,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    includeUnit?: boolean;
  },
): string {
  const formatted = value.toLocaleString(DEFAULT_LOCALE, {
    minimumFractionDigits: options?.minimumFractionDigits ?? 1,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  });
  return options?.includeUnit === false ? formatted : `${formatted} ac`;
}

/**
 * Formats mile distances for map and logistics surfaces.
 */
export function formatOperatorDistance(
  value: number,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    unit?: string;
  },
): string {
  const formatted = value.toLocaleString(DEFAULT_LOCALE, {
    minimumFractionDigits: options?.minimumFractionDigits ?? 1,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  });
  return `${formatted} ${options?.unit ?? "mi"}`;
}

/**
 * Formats file sizes for upload UI and generated artifacts.
 */
export function formatOperatorFileSize(bytes: number): string {
  if (bytes < KIBIBYTE) return `${bytes} B`;
  if (bytes < MEBIBYTE) return `${(bytes / KIBIBYTE).toFixed(1)} KB`;
  if (bytes < GIBIBYTE) return `${(bytes / MEBIBYTE).toFixed(1)} MB`;
  return `${(bytes / GIBIBYTE).toFixed(1)} GB`;
}

/**
 * Formats date + time values using the operator default style.
 */
export function formatOperatorDateTime(
  value: DateLike,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = toValidDate(value);
  if (!date) return "N/A";
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(date);
}

/**
 * Formats date-only values with compact month/day output.
 */
export function formatOperatorDate(
  value: DateLike,
  options?: Intl.DateTimeFormatOptions,
): string {
  return formatOperatorDateTime(value, {
    month: "short",
    day: "numeric",
    hour: undefined,
    minute: undefined,
    ...options,
  });
}

/**
 * Formats time-only values for feed badges and timestamps.
 */
export function formatOperatorTime(
  value: DateLike,
  options?: Intl.DateTimeFormatOptions,
): string {
  return formatOperatorDateTime(value, {
    hour: "numeric",
    minute: "2-digit",
    month: undefined,
    day: undefined,
    ...options,
  });
}

/**
 * Formats compact relative ages for dense notification and feed UI.
 */
export function formatOperatorRelativeTime(
  value: DateLike,
  now = new Date(),
): string {
  const date = toValidDate(value);
  if (!date) return "N/A";

  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatOperatorDate(date);
}

/**
 * Shared formatter collection for operator-focused UI.
 */
export const operatorFormatters = {
  currency: formatOperatorCurrency,
  percent: formatOperatorPercent,
  acreage: formatOperatorAcreage,
  distance: formatOperatorDistance,
  fileSize: formatOperatorFileSize,
  dateTime: formatOperatorDateTime,
  date: formatOperatorDate,
  time: formatOperatorTime,
  relativeTime: formatOperatorRelativeTime,
};
