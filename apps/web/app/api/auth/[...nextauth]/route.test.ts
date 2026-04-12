import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";

const APP_ROOT =
  basename(process.cwd()) === "web" ? process.cwd() : join(process.cwd(), "apps/web");

describe("/api/auth/[...nextauth] route contract", () => {
  it("re-exports GET and POST handlers from auth", () => {
    const source = readFileSync(
      join(APP_ROOT, "app/api/auth/[...nextauth]/route.ts"),
      "utf8",
    );
    expect(source).toContain('import { handlers } from "@/auth";');
    expect(source).toContain("export const { GET, POST } = handlers;");
  });
});
