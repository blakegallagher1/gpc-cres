import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_DIR = path.resolve(__dirname, "..", "..", "templates");

export async function loadTemplateFile(filename: string): Promise<string> {
  const fullPath = path.join(TEMPLATE_DIR, filename);
  return await fs.readFile(fullPath, "utf8");
}

