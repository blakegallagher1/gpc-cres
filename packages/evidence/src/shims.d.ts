declare module "html-to-text" {
  export type HtmlToTextOptions = Record<string, unknown>;
  export function htmlToText(html: string, options?: HtmlToTextOptions): string;
}

declare module "pdf-parse" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export default function pdfParse(data: any, options?: Record<string, unknown>): Promise<{ text?: string }>;
}

