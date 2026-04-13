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

  it("falls back to Wikipedia when no Tavily key is provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: {
            search: [
              { title: "Example Article", pageid: 12345, snippet: "An example about the topic." },
              { title: "Related Topic", pageid: 67890, snippet: "More details here." },
            ],
          },
        }),
      }),
    );

    const result = await performSearch("test query");
    expect(result.failed).toBe(false);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations[0]?.title).toBe("Example Article");
    expect(result.citations[0]?.domain).toBe("en.wikipedia.org");
  });

  it("sanitizes invalid Tavily queries and falls back to the debate topic", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          answer: "Fresh result",
          results: [{ title: "Example", url: "https://example.com", content: "snippet" }],
        }),
      }),
    );

    const result = await performSearch("   ", "tavily-key", "Should we launch this product?");
    expect(result.failed).toBe(false);
    expect(result.summary).toContain("Fresh result");
  });
});
