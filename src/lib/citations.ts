import type { Citation } from "@/types/debate";

export function extractDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function dedupeCitations(citations: Citation[]) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    if (seen.has(citation.url)) return false;
    seen.add(citation.url);
    return true;
  });
}

export function sanitizeModelText(text: string) {
  return text
    // xAI / Grok internal render tags
    .replace(/<grok:render[\s\S]*?<\/grok:render>/giu, "")
    .replace(/<argument[\s\S]*?<\/argument>/giu, "")
    .replace(/<\/?grok:[^>]+>/giu, "")
    // Generic provider metadata wrappers
    .replace(/<tool_call[^>]*>[\s\S]*?<\/tool_call>/giu, "")
    .replace(/<metadata[^>]*>[\s\S]*?<\/metadata>/giu, "")
    .replace(/<citation[^>]*>[\s\S]*?<\/citation>/giu, "")
    .replace(/<source[^>]*>[\s\S]*?<\/source>/giu, "")
    // Common citation markers
    .replace(/(?:\[\^?\d+\^?\]|\(\[\d+\]\)|<\|cite_start\|>[\s\S]*?<\|cite_end\|>)/giu, "")
    .replace(/\[\s*source\s*\d+\s*\]/giu, "")
    .replace(/【\s*\d+\s*†[^】]*】/gu, "")
    .replace(/^\s*(?:sources?|citations?|来源)\s*[:：]\s*$/gimu, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
