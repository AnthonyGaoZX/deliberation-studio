import { extractDomain } from "@/lib/citations";
import type { Citation, SearchEvidence } from "@/types/debate";

const REQUEST_TIMEOUT_MS = 30000;

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function buildEvidence(summary: string, citations: Citation[], provider: SearchEvidence["provider"]): SearchEvidence {
  return {
    summary,
    citations,
    provider,
    contextBlock: [
      "Shared web evidence:",
      `Summary: ${summary}`,
      ...citations.map(
        (citation, index) =>
          `${index + 1}. ${citation.title}\nDomain: ${citation.domain}\nURL: ${citation.url}\nNote: ${citation.snippet ?? ""}`,
      ),
    ].join("\n\n"),
    failed: false,
  };
}

function sanitizeSearchQuery(query: string, fallbackQuery?: string) {
  const normalize = (value: string) =>
    value
      .replace(/\s+/g, " ")
      .replace(/[`*_>#-]/g, " ")
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1 $2")
      .trim();

  const primary = normalize(query);
  if (primary) {
    return primary.slice(0, 200);
  }

  const fallback = normalize(fallbackQuery ?? "");
  if (fallback) {
    return fallback.slice(0, 200);
  }

  return "latest public information about the current debate topic";
}

export async function searchWithTavily(query: string, apiKey: string): Promise<SearchEvidence> {
  const response = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: 6,
      include_answer: true,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    answer?: string;
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };

  const citations: Citation[] = (data.results ?? [])
    .flatMap((item) =>
      item.url
        ? [
            {
              title: item.title || extractDomain(item.url),
              url: item.url,
              domain: extractDomain(item.url),
              snippet: item.content,
            },
          ]
        : [],
    )
    .slice(0, 6);

  return buildEvidence(
    data.answer?.trim() || "The search returned useful sources, but no short answer summary was available.",
    citations,
    "tavily",
  );
}

async function searchWithDuckDuckGoInstant(query: string): Promise<SearchEvidence | null> {
  const response = await fetchWithTimeout(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "DeliberationStudio/1.0",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`DuckDuckGo instant search failed: HTTP ${response.status}`);
  }

  const bodyText = await response.text().catch(() => "");
  if (!bodyText.trim()) {
    return null;
  }

  let data: {
    AbstractText?: string;
    AbstractURL?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }>;
  };
  try {
    data = JSON.parse(bodyText);
  } catch {
    return null;
  }

  const nested = (data.RelatedTopics ?? []).flatMap((item) => (item.Topics?.length ? item.Topics : [item]));
  const citations = [
    data.AbstractURL
      ? {
          title: extractDomain(data.AbstractURL),
          url: data.AbstractURL,
          domain: extractDomain(data.AbstractURL),
          snippet: data.AbstractText,
        }
      : null,
    ...nested.slice(0, 5).map((item) =>
      item.FirstURL
        ? {
            title: extractDomain(item.FirstURL),
            url: item.FirstURL,
            domain: extractDomain(item.FirstURL),
            snippet: item.Text,
          }
        : null,
    ),
  ].filter(Boolean) as Citation[];

  if (!citations.length && !data.AbstractText?.trim()) {
    return null;
  }

  return buildEvidence(
    data.AbstractText?.trim() || "A lightweight web lookup found related public sources.",
    citations,
    "duckduckgo",
  );
}

function decodeDuckRedirect(url: string) {
  try {
    const parsed = new URL(url, "https://duckduckgo.com");
    const encoded = parsed.searchParams.get("uddg");
    return encoded ? decodeURIComponent(encoded) : url;
  } catch {
    return url;
  }
}

async function searchWithDuckDuckGoHtml(query: string): Promise<SearchEvidence> {
  const response = await fetchWithTimeout("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "DeliberationStudio/1.0",
    },
    body: `q=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo HTML search failed: HTTP ${response.status}`);
  }

  const html = await response.text();
  const matches = [...html.matchAll(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].slice(0, 6);
  const citations: Citation[] = matches.flatMap((match) => {
    const [, href, rawTitle] = match;
    const title = rawTitle.replace(/<[^>]+>/g, "").trim();
    const normalized = decodeDuckRedirect(href.startsWith("//") ? `https:${href}` : href);
    if (!normalized.startsWith("http")) return [];
    return [
      {
        title: title || extractDomain(normalized),
        url: normalized,
        domain: extractDomain(normalized),
      },
    ];
  });

  if (!citations.length) {
    throw new Error("DuckDuckGo HTML search returned no readable results");
  }

  return buildEvidence("A web lookup found public pages relevant to this question.", citations, "duckduckgo");
}

async function searchWithSearxng(query: string): Promise<SearchEvidence> {
  const response = await fetchWithTimeout(
    `https://searx.be/search?q=${encodeURIComponent(query)}&format=json&language=en`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "DeliberationStudio/1.0",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Searxng search failed: HTTP ${response.status}`);
  }

  const bodyText = await response.text().catch(() => "");
  if (!bodyText.trim()) {
    throw new Error("Searxng returned an empty response");
  }

  let data: {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new Error("Searxng returned non-JSON content");
  }

  const citations = (data.results ?? [])
    .flatMap((item) =>
      item.url
        ? [
            {
              title: item.title || extractDomain(item.url),
              url: item.url,
              domain: extractDomain(item.url),
              snippet: item.content,
            },
          ]
        : [],
    )
    .slice(0, 6);

  if (!citations.length) {
    throw new Error("Searxng returned no readable results");
  }

  return buildEvidence("A metasearch lookup returned public pages related to this topic.", citations, "searxng");
}

export async function searchWithDuckDuckGo(query: string): Promise<SearchEvidence> {
  const instant = await searchWithDuckDuckGoInstant(query);
  if (instant) return instant;
  return searchWithDuckDuckGoHtml(query);
}

export async function performSearch(query: string, tavilyApiKey?: string, fallbackQuery?: string): Promise<SearchEvidence> {
  const sanitizedQuery = sanitizeSearchQuery(query, fallbackQuery);

  try {
    if (tavilyApiKey?.trim()) {
      return await searchWithTavily(sanitizedQuery, tavilyApiKey.trim());
    }
  } catch (error) {
    // continue to public fallback chain
    const reason = error instanceof Error ? error.message : "Tavily search failed";
    try {
      return await searchWithDuckDuckGo(sanitizedQuery);
    } catch {
      try {
        return await searchWithSearxng(sanitizedQuery);
      } catch {
        return {
          summary: "This round could not fetch fresh web results.",
          citations: [],
          contextBlock: "Web search failed for this round.",
          failed: true,
          provider: "none",
          failureReason: reason,
        };
      }
    }
  }

  try {
    return await searchWithDuckDuckGo(sanitizedQuery);
  } catch (duckError) {
    try {
      return await searchWithSearxng(sanitizedQuery);
    } catch {
      return {
        summary: "This round could not fetch fresh web results.",
        citations: [],
        contextBlock: "Web search failed for this round.",
        failed: true,
        provider: "none",
        failureReason: duckError instanceof Error ? duckError.message : "Search fallback failed",
      };
    }
  }
}
