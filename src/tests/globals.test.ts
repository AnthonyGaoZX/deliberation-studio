import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("dark mode readability tokens", () => {
  it("defines separate dark theme ink and panel colors", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain('html[data-theme="dark"]');
    expect(css).toContain("--ink: #f8fafc");
    expect(css).toContain("--panel: rgba(24, 24, 27, 0.7)");
  });
});
