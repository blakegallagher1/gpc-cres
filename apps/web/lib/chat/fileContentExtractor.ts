'use client';

/**
 * Extract text content from files for inclusion in chat messages.
 * Supports: .txt, .csv, .json, .md, and PDFs via unpdf.
 */

const TEXT_FILE_TYPES = new Set([
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
]);

const TEXT_EXTENSIONS = new Set(['.txt', '.csv', '.json', '.md', '.log']);

/**
 * Check if a file can have its content extracted and included in the message.
 */
export function canExtractFileContent(file: File): boolean {
  if (TEXT_FILE_TYPES.has(file.type)) return true;
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (file.type === 'application/pdf') return true;
  return false;
}

/**
 * Extract text content from a file.
 * Returns up to maxChars of text content.
 */
export async function extractFileContent(
  file: File,
  maxChars: number = 15000
): Promise<string | null> {
  try {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    // Text-based files: read directly
    if (TEXT_FILE_TYPES.has(file.type) || TEXT_EXTENSIONS.has(ext)) {
      const text = await file.text();
      return text.length > maxChars ? text.slice(0, maxChars) : text;
    }

    // PDFs: use unpdf (same API as packages/evidence and documentProcessing.service)
    if (file.type === 'application/pdf') {
      try {
        const { extractText } = await import('unpdf');
        const buffer = await file.arrayBuffer();
        const result = await extractText(new Uint8Array(buffer), { mergePages: true });
        const text = String(result.text ?? '').trim();
        return text.length > maxChars ? text.slice(0, maxChars) : text;
      } catch (err) {
        console.warn(`Failed to extract PDF text: ${err instanceof Error ? err.message : 'Unknown error'}`);
        return null;
      }
    }

    return null;
  } catch (err) {
    console.warn(
      `Failed to extract file content from ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
    return null;
  }
}

/**
 * Build file context string for chat.
 * For text files, includes extracted content.
 * For non-text files, just the filename.
 */
export function buildFileContextString(
  files: Array<{ filename: string; contentType: string; contentPreview?: string }>
): string {
  const parts: string[] = [];
  let hasContent = false;

  for (const file of files) {
    parts.push(`[Attached file: ${file.filename} (${file.contentType})]`);
    if (file.contentPreview) {
      parts.push(`[File content of ${file.filename}]:\n${file.contentPreview}\n[End of file]`);
      hasContent = true;
    }
  }

  const prefix = `[Attached ${files.length} file${files.length > 1 ? 's' : ''}]`;
  const content = parts.join('\n');

  return hasContent ? `${prefix}\n\n${content}` : `${prefix}\n${content.split('\n').slice(1).join('\n')}`;
}
