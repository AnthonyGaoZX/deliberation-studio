import { describe, expect, it } from "vitest";
import { sanitizeModelText } from "@/lib/citations";

describe("sanitizeModelText", () => {
  it("removes citation artifacts and provider tags", () => {
    const text = "Answer [1] with <citation>hidden</citation> clean output.";
    expect(sanitizeModelText(text)).toBe("Answer with clean output.");
  });

  it("removes Grok internal render tags", () => {
    const text = 'Hello <grok:render type="render_inline_citation"><argument name="citation_id">24</argument></grok:render> world';
    expect(sanitizeModelText(text)).toBe("Hello world");
  });
});
