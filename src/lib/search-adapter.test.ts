import { afterEach, describe, expect, it, vi } from "vitest";
import { performSearch } from "@/lib/search-adapter";

function textResponse(body: string, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => body,
  };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("performSearch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gracefully degrades when every search provider fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await performSearch("test query");

    expect(result.failed).toBe(true);
    expect(result.citations).toHaveLength(0);
  });

  it("falls back to Bing RSS when no Tavily key is provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        textResponse(`<?xml version="1.0" encoding="utf-8" ?>
          <rss version="2.0">
            <channel>
              <item>
                <title>Example Article</title>
                <link>https://example.com/article</link>
                <description>An example about the topic.</description>
              </item>
            </channel>
          </rss>`),
      ),
    );

    const result = await performSearch("test query");

    expect(result.failed).toBe(false);
    expect(result.provider).toBe("bing");
    expect(result.citations[0]?.title).toBe("Example Article");
    expect(result.citations[0]?.domain).toBe("example.com");
  });

  it("falls back to Google News RSS when Bing RSS fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("bing blocked"))
      .mockResolvedValueOnce(
        textResponse(`<?xml version="1.0" encoding="UTF-8"?>
          <rss version="2.0">
            <channel>
              <item>
                <title>Example News</title>
                <link>https://news.google.com/rss/articles/demo</link>
                <description><![CDATA[<a href="https://news.google.com/rss/articles/demo">Example News</a>&nbsp;&nbsp;<font color="#6f6f6f">Example Source</font>]]></description>
                <source url="https://example.com">Example Source</source>
              </item>
            </channel>
          </rss>`),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await performSearch("test query");

    expect(result.failed).toBe(false);
    expect(result.provider).toBe("google_news");
    expect(result.citations[0]?.title).toBe("Example News");
    expect(result.citations[0]?.domain).toBe("example.com");
  });

  it("sanitizes invalid Tavily queries and falls back to the debate topic", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          answer: "Fresh result",
          results: [{ title: "Example", url: "https://example.com", content: "snippet" }],
        }),
      ),
    );

    const result = await performSearch("   ", "tavily-key", "Should we launch this product?");

    expect(result.failed).toBe(false);
    expect(result.summary).toContain("Fresh result");
  });
});
