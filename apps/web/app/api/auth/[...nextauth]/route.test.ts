import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("/api/auth/[...nextauth] route contract", () => {
  it("re-exports GET and POST handlers from auth", () => {
    const source = readFileSync(
      join(process.cwd(), "apps/web/app/api/auth/[...nextauth]/route.ts"),
      "utf8",
    );
    expect(source).toContain('import { handlers } from "@/auth";');
    expect(source).toContain("export const { GET, POST } = handlers;");
  });
});
