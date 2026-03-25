import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  formatOperatorCurrency,
  formatOperatorDateTime,
  formatOperatorRelativeTime,
} from "@/lib/formatters/operatorFormatters";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

export function formatCurrency(amount: number): string {
  return formatOperatorCurrency(amount);
}

export function formatDate(date: string | Date): string {
  return formatOperatorDateTime(date);
}

export function timeAgo(date: string | Date): string {
  return formatOperatorRelativeTime(date);
}
