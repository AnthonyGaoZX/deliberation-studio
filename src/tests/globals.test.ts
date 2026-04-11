import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("dark mode readability tokens", () => {
  it("defines separate dark theme ink and panel colors", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain('html[data-theme="dark"]');
    expect(css).toContain("--ink: #f4f7f9");
    expect(css).toContain("--panel: rgba(24, 30, 36, 0.96)");
  });
});
