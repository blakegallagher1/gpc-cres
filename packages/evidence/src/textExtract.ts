import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { htmlToText } = require("html-to-text") as {
  htmlToText: (
    html: string,
    options?: {
      wordwrap?: false | number;
      selectors?: Array<{ selector: string; format: string }>;
    },
  ) => string;
};

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
