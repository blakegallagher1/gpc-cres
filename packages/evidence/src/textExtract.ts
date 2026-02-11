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
  const { extractText } = await import("unpdf");
  const result = await extractText(bytes, { mergePages: true });
  return String(result.text ?? "").trim();
}
