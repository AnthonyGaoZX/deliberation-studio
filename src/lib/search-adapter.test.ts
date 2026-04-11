import { afterEach, describe, expect, it, vi } from "vitest";
import { performSearch } from "@/lib/search-adapter";

describe("performSearch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gracefully degrades when search fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await performSearch("test query");
    expect(result.failed).toBe(true);
    expect(result.citations).toHaveLength(0);
  });

  it("falls back to DuckDuckGo HTML results when instant answers are empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            AbstractText: "",
            RelatedTopics: [],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => '<a class="result__a" href="https://example.com/article">Example Article</a>',
        }),
    );

    const result = await performSearch("test query");
    expect(result.failed).toBe(false);
    expect(result.citations[0]?.title).toBe("Example Article");
  });
});
