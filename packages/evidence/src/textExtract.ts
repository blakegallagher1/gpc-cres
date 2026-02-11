import { htmlToText } from "html-to-text";

export async function extractTextFromHtml(html: string): Promise<string> {
  return htmlToText(html, {
    wordwrap: false,
    selectors: [
      { selector: "script", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "noscript", format: "skip" },
    ],
  }).trim();
}

export async function extractTextFromPdfBytes(bytes: Uint8Array): Promise<string> {
  // pdf-parse is CJS; ESM import requires dynamic import in some environments.
  // We keep it lazy to avoid overhead in non-PDF runs.
  type PdfParseFn = (data: Buffer | Uint8Array, options?: Record<string, unknown>) => Promise<{ text?: string }>;
  const mod = (await import("pdf-parse")) as unknown as { default?: PdfParseFn } | PdfParseFn;
  const pdfParse: PdfParseFn = typeof mod === "function" ? mod : (mod.default as PdfParseFn);
  const result = await pdfParse(Buffer.from(bytes));
  return String(result.text ?? "").trim();
}
