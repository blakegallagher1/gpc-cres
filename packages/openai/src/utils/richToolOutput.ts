/**
 * Structured tool output types for the OpenAI Responses API (P2 Pattern 12).
 * Enables tools to return images and files alongside text.
 */

export type ToolOutputText = { type: "text"; text: string };
export type ToolOutputImage = {
  type: "image";
  imageUrl?: string;
  base64Data?: string;
  mediaType?: string;
  detail?: "low" | "high" | "auto" | "original";
};
export type ToolOutputFile = {
  type: "file";
  filePath: string;
  mediaType?: string;
  filename?: string;
};

export type RichToolOutput = ToolOutputText | ToolOutputImage | ToolOutputFile;

export function textOutput(text: string): ToolOutputText {
  return { type: "text", text };
}

export function imageOutput(options: {
  url?: string;
  base64?: string;
  mediaType?: string;
  detail?: "low" | "high" | "auto" | "original";
}): ToolOutputImage {
  return {
    type: "image",
    imageUrl: options.url,
    base64Data: options.base64,
    mediaType: options.mediaType ?? "image/png",
    detail: options.detail ?? "original",
  };
}

export function fileOutput(options: {
  path: string;
  mediaType?: string;
  filename?: string;
}): ToolOutputFile {
  return {
    type: "file",
    filePath: options.path,
    mediaType: options.mediaType,
    filename: options.filename,
  };
}

export function isRichOutput(value: unknown): value is RichToolOutput {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return obj.type === "text" || obj.type === "image" || obj.type === "file";
}
