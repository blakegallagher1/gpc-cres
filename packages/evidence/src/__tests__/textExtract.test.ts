import { describe, expect, it } from "vitest";

import { extractTextFromHtml } from "../textExtract.js";

describe("extractTextFromHtml", () => {
  it("extracts visible text from a simple HTML page", async () => {
    const html = `
      <html>
        <head><title>Test Page</title></head>
        <body>
          <h1>Hello World</h1>
          <p>This is a paragraph.</p>
        </body>
      </html>
    `;
    const text = await extractTextFromHtml(html);
    // html-to-text uppercases headings
    expect(text.toLowerCase()).toContain("hello world");
    expect(text).toContain("This is a paragraph.");
  });

  it("strips script tags", async () => {
    const html = `
      <html>
        <body>
          <p>Visible text</p>
          <script>var x = "should not appear";</script>
        </body>
      </html>
    `;
    const text = await extractTextFromHtml(html);
    expect(text).toContain("Visible text");
    expect(text).not.toContain("should not appear");
  });

  it("strips style tags", async () => {
    const html = `
      <html>
        <body>
          <style>.hidden { display: none; }</style>
          <p>Content here</p>
        </body>
      </html>
    `;
    const text = await extractTextFromHtml(html);
    expect(text).toContain("Content here");
    expect(text).not.toContain("display: none");
  });

  it("strips noscript tags", async () => {
    const html = `
      <html>
        <body>
          <noscript>Please enable JavaScript</noscript>
          <p>Main content</p>
        </body>
      </html>
    `;
    const text = await extractTextFromHtml(html);
    expect(text).toContain("Main content");
    expect(text).not.toContain("enable JavaScript");
  });

  it("returns empty string for empty HTML", async () => {
    const text = await extractTextFromHtml("");
    expect(text).toBe("");
  });

  it("handles HTML with no body content", async () => {
    const html = "<html><head><title>Empty</title></head><body></body></html>";
    const text = await extractTextFromHtml(html);
    expect(text.trim()).toBe("");
  });

  it("preserves link text", async () => {
    const html = `<p>Visit <a href="https://example.com">Example Site</a> for more.</p>`;
    const text = await extractTextFromHtml(html);
    expect(text).toContain("Example Site");
  });

  it("handles list structures", async () => {
    const html = `
      <ul>
        <li>First item</li>
        <li>Second item</li>
        <li>Third item</li>
      </ul>
    `;
    const text = await extractTextFromHtml(html);
    expect(text).toContain("First item");
    expect(text).toContain("Second item");
    expect(text).toContain("Third item");
  });
});
