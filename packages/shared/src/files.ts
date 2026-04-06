import path from "node:path";

export function normalizeFilename(filename: string): string {
  return path.basename(filename).trim();
}

export function getFileExtension(filename: string): string {
  return path.extname(normalizeFilename(filename)).toLowerCase();
}

export function hasFileExtension(filename: string, extension: string): boolean {
  const normalizedExtension = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  return getFileExtension(filename) === normalizedExtension;
}
