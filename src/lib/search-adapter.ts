import { extractDomain } from "@/lib/citations";
import type { Citation, SearchEvidence } from "@/types/debate";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESULTS = 6;

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

function decodeHtmlEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "));
}

function cleanXmlText(value: string | undefined) {
  return value ? stripHtml(value) : "";
}

function parseRssItems(xml: string) {
  return [...xml.matchAll(/<item\b[\s\S]*?>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
}

function extractXmlTag(item: string, tagName: string) {
  return item.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"))?.[1];
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

function normalizeSearchFailure(reason: string) {
  return reason
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
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
      max_results: MAX_RESULTS,
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
    .slice(0, MAX_RESULTS);

  return buildEvidence(
    data.answer?.trim() || "The search returned useful sources, but no short answer summary was available.",
    citations,
    "tavily",
  );
}

async function searchWithBingRss(query: string): Promise<SearchEvidence> {
  const response = await fetchWithTimeout(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`, {
    method: "GET",
    headers: {
      Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Bing RSS search failed: HTTP ${response.status}`);
  }

  const xml = await response.text().catch(() => "");
  if (!xml.trim()) {
    throw new Error("Bing RSS search returned an empty response");
  }

  const citations = parseRssItems(xml)
    .flatMap((item) => {
      const url = cleanXmlText(extractXmlTag(item, "link"));
      if (!url.startsWith("http")) return [];

      return [
        {
          title: cleanXmlText(extractXmlTag(item, "title")) || extractDomain(url),
          url,
          domain: extractDomain(url),
          snippet: cleanXmlText(extractXmlTag(item, "description")),
        },
      ];
    })
    .slice(0, MAX_RESULTS);

  if (!citations.length) {
    throw new Error("Bing RSS search returned no readable results");
  }

  return buildEvidence("A public Bing RSS lookup found live pages related to this topic.", citations, "bing");
}

async function searchWithGoogleNewsRss(query: string): Promise<SearchEvidence> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Google News RSS search failed: HTTP ${response.status}`);
  }

  const xml = await response.text().catch(() => "");
  if (!xml.trim()) {
    throw new Error("Google News RSS search returned an empty response");
  }

  const citations = parseRssItems(xml)
    .flatMap((item) => {
      const link = cleanXmlText(extractXmlTag(item, "link"));
      if (!link.startsWith("http")) return [];

      const sourceUrl = item.match(/<source\b[^>]*url="([^"]+)"/i)?.[1];
      const sourceName = cleanXmlText(extractXmlTag(item, "source"));
      const domain = sourceUrl ? extractDomain(sourceUrl) : extractDomain(link);

      return [
        {
          title: cleanXmlText(extractXmlTag(item, "title")) || sourceName || domain,
          url: link,
          domain,
          snippet: cleanXmlText(extractXmlTag(item, "description")),
        },
      ];
    })
    .slice(0, MAX_RESULTS);

  if (!citations.length) {
    throw new Error("Google News RSS search returned no readable results");
  }

  return buildEvidence("A public Google News RSS lookup found recent reporting related to this topic.", citations, "google_news");
}

async function searchWithWikipedia(query: string): Promise<SearchEvidence> {
  const response = await fetchWithTimeout(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Wikipedia search failed: HTTP ${response.status}`);
  }

  const data = (await response.json().catch(() => ({}))) as {
    query?: {
      search?: Array<{ title: string; pageid: number; snippet: string }>;
    };
  };

  const citations = (data.query?.search ?? [])
    .slice(0, MAX_RESULTS)
    .map((item) => {
      const url = `https://en.wikipedia.org/?curid=${item.pageid}`;
      return {
        title: item.title,
        url,
        domain: "en.wikipedia.org",
        snippet: stripHtml(item.snippet),
      };
    });

  if (!citations.length) {
    throw new Error("Wikipedia search returned no results");
  }

  return buildEvidence("A Wikipedia search found encyclopedic details.", citations, "wikipedia");
}

async function searchWithDuckDuckGoHtml(query: string): Promise<SearchEvidence> {
  const response = await fetchWithTimeout("https://lite.duckduckgo.com/lite/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    body: `q=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo HTML search failed: HTTP ${response.status}`);
  }

  const bodyText = await response.text().catch(() => "");
  if (!bodyText.trim()) {
    throw new Error("DuckDuckGo HTML search returned an empty response");
  }

  if (/anomaly-modal|Unfortunately,\s*bots use DuckDuckGo too/i.test(bodyText)) {
    throw new Error("DuckDuckGo lite returned an anti-bot challenge");
  }

  const matches = [...bodyText.matchAll(/<a([^>]*)class=['"]result-link['"]([^>]*)>([\s\S]*?)<\/a>/gi)].slice(0, MAX_RESULTS);
  const citations: Citation[] = matches.flatMap((match) => {
    const rawAttrs = `${match[1]} ${match[2]}`;
    const href = rawAttrs.match(/href=['"]([^'"]+)['"]/i)?.[1] ?? "";
    if (!href) return [];

    const normalized = decodeDuckRedirect(href.startsWith("//") ? `https:${href}` : href);
    if (!normalized.startsWith("http")) return [];

    return [
      {
        title: stripHtml(match[3]) || extractDomain(normalized),
        url: normalized,
        domain: extractDomain(normalized),
      },
    ];
  });

  if (!citations.length) {
    throw new Error("DuckDuckGo HTML search returned no readable results");
  }

  return buildEvidence("A DuckDuckGo Lite lookup found public pages relevant to this question.", citations, "duckduckgo");
}

async function searchWithSearxng(query: string): Promise<SearchEvidence> {
  const response = await fetchWithTimeout(`https://searx.be/search?q=${encodeURIComponent(query)}&format=json&language=en`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "DeliberationStudio/1.0",
    },
  });

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
    .slice(0, MAX_RESULTS);

  if (!citations.length) {
    throw new Error("Searxng returned no readable results");
  }

  return buildEvidence("A metasearch lookup returned public pages related to this topic.", citations, "searxng");
}

async function performPublicSearch(query: string, preferredFailureReason?: string): Promise<SearchEvidence> {
  const providers: Array<() => Promise<SearchEvidence>> = [
    () => searchWithBingRss(query),
    () => searchWithGoogleNewsRss(query),
    () => searchWithWikipedia(query),
    () => searchWithDuckDuckGoHtml(query),
    () => searchWithSearxng(query),
  ];

  let lastReason = preferredFailureReason ?? "";

  for (const provider of providers) {
    try {
      return await provider();
    } catch (error) {
      lastReason = error instanceof Error ? error.message : "Public search fallback failed";
    }
  }

  return {
    summary: "This round could not fetch fresh web results.",
    citations: [],
    contextBlock: "Web search failed for this round.",
    failed: true,
    provider: "none",
    failureReason: normalizeSearchFailure(lastReason || "Search fallback failed"),
  };
}

export async function performSearch(query: string, tavilyApiKey?: string, fallbackQuery?: string): Promise<SearchEvidence> {
  const sanitizedQuery = sanitizeSearchQuery(query, fallbackQuery);

  if (tavilyApiKey?.trim()) {
    try {
      return await searchWithTavily(sanitizedQuery, tavilyApiKey.trim());
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Tavily search failed";
      return performPublicSearch(sanitizedQuery, reason);
    }
  }

  return performPublicSearch(sanitizedQuery);
}
