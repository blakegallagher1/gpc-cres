declare module "html-to-text" {
  export type HtmlToTextOptions = Record<string, unknown>;
  export function htmlToText(html: string, options?: HtmlToTextOptions): string;
}
