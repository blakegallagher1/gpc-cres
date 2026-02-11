declare module "html-to-text" {
  export type HtmlToTextOptions = Record<string, unknown>;
  export function htmlToText(html: string, options?: HtmlToTextOptions): string;
}

declare module "pdf-parse" {
  export default function pdfParse(data: Buffer | Uint8Array, options?: Record<string, unknown>): Promise<{ text?: string }>;
}
