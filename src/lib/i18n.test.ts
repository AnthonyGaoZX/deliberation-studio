import { describe, expect, it } from "vitest";
import { buildHelpSnapshot, buildProviderSnapshot } from "@/lib/i18n";

describe("i18n content", () => {
  it("returns bilingual help sections", () => {
    expect(buildHelpSnapshot("zh").length).toBeGreaterThan(3);
    expect(buildHelpSnapshot("en").length).toBeGreaterThan(3);
  });

  it("includes provider descriptions for both languages", () => {
    const zh = buildProviderSnapshot("zh");
    const en = buildProviderSnapshot("en");
    expect(zh[0]?.description).toBeTruthy();
    expect(en[0]?.description).toBeTruthy();
  });
});
