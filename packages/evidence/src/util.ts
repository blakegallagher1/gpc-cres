import path from "node:path";

export function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function detectExtension(contentType: string | null, url: string): string {
  const lowerType = (contentType ?? "").toLowerCase();
  if (lowerType.includes("application/pdf")) return ".pdf";
  if (lowerType.includes("text/html")) return ".html";
  if (lowerType.includes("text/plain")) return ".txt";
  if (lowerType.includes("image/png")) return ".png";
  if (lowerType.includes("image/jpeg")) return ".jpg";

  try {
    const ext = path.extname(new URL(url).pathname);
    if (ext) return ext;
  } catch {
    // ignore
  }

  // Default for unknown text-ish responses.
  return ".bin";
}

export function looksLikeJsPlaceholder(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("enable javascript") ||
    lower.includes("requires javascript") ||
    lower.includes("please enable javascript") ||
    lower.includes("javascript is disabled")
  );
}

