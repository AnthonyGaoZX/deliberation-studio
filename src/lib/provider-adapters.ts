import { dedupeCitations, extractDomain, sanitizeModelText } from "@/lib/citations";
import { PROVIDER_CATALOG } from "@/lib/provider-catalog";
import type { Citation, ParticipantConfig, ProviderKind, ResponseLengthMode } from "@/types/debate";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ProviderResult = {
  text: string;
  citations: Citation[];
};

const REQUEST_TIMEOUT_MS = 45_000;
const UNREADABLE_TEXT_FALLBACK =
  "This round did not return a complete readable answer, so the discussion kept moving with a short placeholder. You can retry this step later if you want a fuller reply.";
const CITATION_ONLY_FALLBACK =
  "The model returned source links for this round, but it did not finish a complete readable answer. The discussion will continue, and you can retry this step later for a fuller reply.";
const TOKEN_BUDGETS: Record<Exclude<ResponseLengthMode, "expansive">, { responses: number; chat: number }> = {
  concise: { responses: 900, chat: 700 },
  balanced: { responses: 2200, chat: 1400 },
};
const ANTHROPIC_EXPANSIVE_MAX_TOKENS = 4096;

const OFFICIAL_HOSTS: Partial<Record<ProviderKind, string>> = {
  openai: "api.openai.com",
  anthropic: "api.anthropic.com",
  gemini: "generativelanguage.googleapis.com",
  deepseek: "api.deepseek.com",
  xai: "api.x.ai",
};

function normalizeAsciiPunctuation(value: string) {
  return value
    .replace(/：/g, ":")
    .replace(/／/g, "/")
    .replace(/．/g, ".")
    .replace(/，/g, ",")
    .replace(/　/g, " ");
}

function sanitizeApiKey(apiKey: string) {
  return normalizeAsciiPunctuation(apiKey)
    .replace(/[^\x21-\x7E]/g, "")
    .trim()
    .replace(/^api(?:\s|-|_)?key\s*[:：]\s*/i, "")
    .replace(/^bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function sanitizeBaseUrl(baseUrl: string) {
  const normalized = normalizeAsciiPunctuation(baseUrl)
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .replace(/^base\s*url\s*[:：]\s*/i, "");

  try {
    return new URL(normalized).toString();
  } catch {
    return normalized;
  }
}

function buildEndpoint(baseUrl: string, path: string) {
  const safeBaseUrl = sanitizeBaseUrl(baseUrl);
  const normalized = safeBaseUrl.endsWith("/") ? safeBaseUrl : `${safeBaseUrl}/`;
  return new URL(path, normalized).toString();
}

function getHostname(baseUrl: string) {
  try {
    return new URL(sanitizeBaseUrl(baseUrl)).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown request error";
}

function sanitizeProviderErrorDetail(detail: string) {
  return detail
    .replace(/\(provided key:[^)]+\)/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function usesGatewayBaseUrl(participant: ParticipantConfig) {
  const officialHost = OFFICIAL_HOSTS[participant.provider];
  if (!officialHost) return false;
  return !getHostname(participant.baseUrl).includes(officialHost);
}

function appendRelayHint(participant: ParticipantConfig, detail: string) {
  const sanitized = sanitizeProviderErrorDetail(detail);
  const normalized = sanitized.toLowerCase();
  const looksLikeCredentialProblem =
    normalized.includes("api key") ||
    normalized.includes("x-api-key") ||
    normalized.includes("credential") ||
    normalized.includes("unauthorized");

  if (!looksLikeCredentialProblem) return sanitized;

  if (["openai", "anthropic", "gemini"].includes(participant.provider) && !usesGatewayBaseUrl(participant)) {
    return `${sanitized} If this key comes from a relay or reseller, also fill the provider Base URL instead of using the official default endpoint.`;
  }

  return sanitized;
}

function makeProviderError(participant: ParticipantConfig, detail: string) {
  return new Error(`${participant.label} request failed: ${appendRelayHint(participant, detail)}`);
}

export function providerCanUseNativeSearch(participant: ParticipantConfig) {
  if (!PROVIDER_CATALOG[participant.provider].supportsNativeSearch) {
    return false;
  }

  if (usesGatewayBaseUrl(participant) && ["openai", "anthropic", "gemini"].includes(participant.provider)) {
    return false;
  }

  return true;
}

async function fetchWithTimeout(url: string, init: RequestInit, participant: ParticipantConfig) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw makeProviderError(participant, `Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`);
    }

    throw makeProviderError(participant, stringifyError(error));
  } finally {
    clearTimeout(timeout);
  }
}

async function safeJson(response: Response, participant: ParticipantConfig) {
  const text = await response.text().catch(() => "");

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw makeProviderError(
      participant,
      text.trim()
        ? `The API returned content that could not be parsed as JSON: ${text.slice(0, 240)}`
        : "The API returned an empty or unreadable response.",
    );
  }
}

async function readErrorBody(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return `HTTP ${response.status}`;
  }

  try {
    const json = JSON.parse(text) as {
      error?: string | { message?: string };
      message?: string;
    };

    if (typeof json.error === "string" && json.error.trim()) return json.error;
    if (json.error && typeof json.error === "object" && json.error.message?.trim()) return json.error.message;
    if (json.message?.trim()) return json.message;
  } catch {
    // fall through to plain text
  }

  return text.trim();
}

function collectCitations(entries: Array<{ title?: string; url?: string; snippet?: string }> = []) {
  return entries.flatMap((item) =>
    item.url
      ? [
          {
            title: item.title || extractDomain(item.url),
            url: item.url,
            domain: extractDomain(item.url),
            snippet: item.snippet,
          },
        ]
      : [],
  );
}

function collectTextParts(
  output: Array<{
    type?: string;
    text?: string;
    content?: Array<{ type?: string; text?: string }>;
  }> = [],
) {
  return output
    .flatMap((item) => {
      const ownText = item.text?.trim() ? [item.text.trim()] : [];
      const nestedText = (item.content ?? []).map((content) => content.text?.trim() || "").filter(Boolean);
      return [...ownText, ...nestedText];
    })
    .filter(Boolean)
    .join("\n");
}

function collectResponsesText(value: unknown, bucket: string[] = []): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) bucket.push(trimmed);
    return bucket;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectResponsesText(item, bucket));
    return bucket;
  }

  if (!value || typeof value !== "object") {
    return bucket;
  }

  const record = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(record)) {
    if (["title", "url", "id", "status", "type", "role"].includes(key)) continue;
    if (key === "annotations" || key === "citations") continue;
    collectResponsesText(nested, bucket);
  }

  return bucket;
}

function uniqueText(lines: string[]) {
  return lines.filter((line, index, array) => array.findIndex((candidate) => candidate === line) === index).join("\n");
}

function getResponsesTokenBudget(responseLength: ResponseLengthMode) {
  return responseLength === "expansive" ? undefined : TOKEN_BUDGETS[responseLength].responses;
}

function getChatTokenBudget(responseLength: ResponseLengthMode, provider: ProviderKind) {
  if (responseLength === "expansive") {
    return provider === "anthropic" ? ANTHROPIC_EXPANSIVE_MAX_TOKENS : undefined;
  }

  return TOKEN_BUDGETS[responseLength].chat;
}

function buildUnreadableFallback(hasCitations: boolean) {
  return hasCitations ? CITATION_ONLY_FALLBACK : UNREADABLE_TEXT_FALLBACK;
}

function isLikelyCredentialError(detail: string) {
  const normalized = detail.toLowerCase();
  return (
    normalized.includes("api key") ||
    normalized.includes("x-api-key") ||
    normalized.includes("credential") ||
    normalized.includes("unauthorized") ||
    normalized.includes("authentication")
  );
}

function buildGeminiEndpoint(baseUrl: string, model: string, apiKey?: string) {
  const url = new URL(buildEndpoint(baseUrl, `models/${model}:generateContent`));
  if (apiKey) {
    url.searchParams.set("key", apiKey);
  }
  return url.toString();
}

function buildGeminiRequestInit(
  participant: ParticipantConfig,
  messages: ChatMessage[],
  enableSearch: boolean,
  responseLength: ResponseLengthMode,
  authMode: "header" | "query",
): RequestInit {
  const system = messages.find((message) => message.role === "system")?.content ?? "";
  const userPayload = messages
    .filter((message) => message.role !== "system")
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n");
  const maxOutputTokens = getResponsesTokenBudget(responseLength);
  const apiKey = sanitizeApiKey(participant.apiKey);

  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authMode === "header" ? { "x-goog-api-key": apiKey } : {}),
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: system }],
      },
      contents: [{ role: "user", parts: [{ text: userPayload }] }],
      tools: enableSearch ? [{ google_search: {} }] : undefined,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens,
      },
    }),
  };
}

function extractChatMessageText(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .flatMap((item) => {
        if (typeof item === "string") return [item.trim()];
        if (!item || typeof item !== "object") return [];

        const record = item as Record<string, unknown>;
        const text = typeof record.text === "string" ? record.text.trim() : "";
        if (text) return [text];

        if (record.type === "text" && typeof record.content === "string") {
          return [record.content.trim()];
        }

        return [];
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function extractResponsesReadableText(data: {
  output_text?: string;
  output?: unknown;
}) {
  const pieces = [
    typeof data.output_text === "string" ? data.output_text.trim() : "",
    collectTextParts(
      Array.isArray(data.output)
        ? (data.output as Array<{
            type?: string;
            text?: string;
            content?: Array<{ type?: string; text?: string }>;
          }>)
        : [],
    ),
    uniqueText(collectResponsesText(data.output)),
  ].filter(Boolean);

  return uniqueText(pieces);
}

async function callResponsesApi(
  participant: ParticipantConfig,
  messages: ChatMessage[],
  tools: unknown[] | undefined,
  responseLength: ResponseLengthMode,
) {
  const maxOutputTokens = getResponsesTokenBudget(responseLength);
  const response = await fetchWithTimeout(
    buildEndpoint(participant.baseUrl, "responses"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sanitizeApiKey(participant.apiKey)}`,
      },
      body: JSON.stringify({
        model: participant.model,
        input: messages.map((message) => ({
          role: message.role,
          content: [{ type: "input_text", text: message.content }],
        })),
        tools,
        include: tools?.length ? ["web_search_call.action.sources"] : undefined,
        max_output_tokens: maxOutputTokens,
      }),
    },
    participant,
  );

  if (!response.ok) {
    throw makeProviderError(participant, await readErrorBody(response));
  }

  const data = (await safeJson(response, participant)) as {
    output_text?: string;
    output?: Array<{
      type?: string;
      text?: string;
      content?: Array<{
        type?: string;
        text?: string;
        annotations?: Array<{ title?: string; url?: string; text?: string }>;
      }>;
    }>;
    citations?: Array<{ title?: string; url?: string; text?: string }>;
  };

  const citationsFromContent = (data.output ?? []).flatMap((item) =>
    (item.content ?? []).flatMap((content) =>
      collectCitations(
        (content.annotations ?? []).map((annotation) => ({
          title: annotation.title,
          url: annotation.url,
          snippet: annotation.text,
        })),
      ),
    ),
  );

  const citationsFromTopLevel = collectCitations(
    (data.citations ?? []).map((citation) => ({
      title: citation.title,
      url: citation.url,
      snippet: citation.text,
    })),
  );

  const text = extractResponsesReadableText(data);
  if (!text.trim()) {
    if (responseLength === "expansive") {
      return callResponsesApi(participant, messages, tools, "balanced");
    }

    return {
      text: buildUnreadableFallback([...citationsFromContent, ...citationsFromTopLevel].length > 0),
      citations: dedupeCitations([...citationsFromContent, ...citationsFromTopLevel]),
    } satisfies ProviderResult;
  }

  return {
    text: sanitizeModelText(text),
    citations: dedupeCitations([...citationsFromContent, ...citationsFromTopLevel]),
  } satisfies ProviderResult;
}

async function callAnthropic(
  participant: ParticipantConfig,
  messages: ChatMessage[],
  enableSearch: boolean,
  responseLength: ResponseLengthMode,
) {
  const system = messages.find((message) => message.role === "system")?.content ?? "";
  const maxTokens = getChatTokenBudget(responseLength, participant.provider);
  const response = await fetchWithTimeout(
    buildEndpoint(participant.baseUrl, "v1/messages"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": sanitizeApiKey(participant.apiKey),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: participant.model,
        max_tokens: maxTokens,
        system,
        messages: messages
          .filter((message) => message.role !== "system")
          .map((message) => ({
            role: message.role === "assistant" ? "assistant" : "user",
            content: message.content,
          })),
        tools: enableSearch ? [{ type: "web_search_20250305", name: "web_search" }] : undefined,
      }),
    },
    participant,
  );

  if (!response.ok) {
    throw makeProviderError(participant, await readErrorBody(response));
  }

  const data = (await safeJson(response, participant)) as {
    content?: Array<{
      type?: string;
      text?: string;
      citations?: Array<{ title?: string; url?: string; snippet?: string }>;
    }>;
  };

  const text = (data.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text?.trim() || "")
    .filter(Boolean)
    .join("\n");

  if (!text.trim()) {
    return {
      text: buildUnreadableFallback(false),
      citations: dedupeCitations((data.content ?? []).flatMap((block) => collectCitations(block.citations))),
    } satisfies ProviderResult;
  }

  return {
    text: sanitizeModelText(text),
    citations: dedupeCitations((data.content ?? []).flatMap((block) => collectCitations(block.citations))),
  } satisfies ProviderResult;
}

async function callGemini(
  participant: ParticipantConfig,
  messages: ChatMessage[],
  enableSearch: boolean,
  responseLength: ResponseLengthMode,
) {
  const sanitizedKey = sanitizeApiKey(participant.apiKey);
  let authMode: "header" | "query" = "header";
  let response = await fetchWithTimeout(
    buildGeminiEndpoint(participant.baseUrl, participant.model),
    buildGeminiRequestInit(participant, messages, enableSearch, responseLength, authMode),
    participant,
  );

  if (!response.ok) {
    const detail = await readErrorBody(response);
    if (response.status >= 400 && response.status < 500 && isLikelyCredentialError(detail)) {
      authMode = "query";
      response = await fetchWithTimeout(
        buildGeminiEndpoint(participant.baseUrl, participant.model, sanitizedKey),
        buildGeminiRequestInit(participant, messages, enableSearch, responseLength, authMode),
        participant,
      );
      if (!response.ok) {
        throw makeProviderError(participant, await readErrorBody(response));
      }
    } else {
      throw makeProviderError(participant, detail);
    }
  }

  const data = (await safeJson(response, participant)) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: { groundingChunks?: Array<{ web?: { title?: string; uri?: string } }> };
    }>;
  };

  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((part) => part.text?.trim() || "").filter(Boolean).join("\n");
  const citations = dedupeCitations(
    (candidate?.groundingMetadata?.groundingChunks ?? []).flatMap((chunk) =>
      chunk.web?.uri
        ? [
            {
              title: chunk.web.title || extractDomain(chunk.web.uri),
              url: chunk.web.uri,
              domain: extractDomain(chunk.web.uri),
            },
          ]
        : [],
    ),
  );

  if (!text.trim()) {
    if (responseLength === "expansive") {
      return callGemini(participant, messages, enableSearch, "balanced");
    }

    return {
      text: buildUnreadableFallback(citations.length > 0),
      citations,
    } satisfies ProviderResult;
  }

  return {
    text: sanitizeModelText(text),
    citations,
  } satisfies ProviderResult;
}

async function callChatCompletion(
  participant: ParticipantConfig,
  messages: ChatMessage[],
  jsonMode: boolean,
  responseLength: ResponseLengthMode,
) {
  const supportsJson = PROVIDER_CATALOG[participant.provider].supportsJsonMode;
  const maxTokens = getChatTokenBudget(responseLength, participant.provider);
  const tokenBudgetField = maxTokens
    ? participant.provider === "openai"
      ? { max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens }
    : {};
  const response = await fetchWithTimeout(
    buildEndpoint(participant.baseUrl, "chat/completions"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sanitizeApiKey(participant.apiKey)}`,
      },
      body: JSON.stringify({
        model: participant.model,
        temperature: 0.7,
        messages,
        stream: false,
        ...tokenBudgetField,
        response_format: supportsJson && jsonMode ? { type: "json_object" } : undefined,
      }),
    },
    participant,
  );

  if (!response.ok) {
    throw makeProviderError(participant, await readErrorBody(response));
  }

  const data = (await safeJson(response, participant)) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  const text = extractChatMessageText(data.choices?.[0]?.message?.content);
  if (!text.trim()) {
    if (responseLength === "expansive") {
      return callChatCompletion(participant, messages, jsonMode, "balanced");
    }

    return {
      text: buildUnreadableFallback(false),
      citations: [],
    } satisfies ProviderResult;
  }

  return {
    text: sanitizeModelText(text),
    citations: [],
  } satisfies ProviderResult;
}

export async function callProvider(
  participant: ParticipantConfig,
  messages: ChatMessage[],
  nativeSearch: boolean,
  jsonMode = false,
  responseLength: ResponseLengthMode = "balanced",
): Promise<ProviderResult> {
  const gateway = usesGatewayBaseUrl(participant);

  switch (participant.provider) {
    case "openai":
      return gateway
        ? callChatCompletion(participant, messages, jsonMode, responseLength)
        : callResponsesApi(participant, messages, nativeSearch ? [{ type: "web_search" }] : undefined, responseLength);
    case "xai":
      return callResponsesApi(participant, messages, nativeSearch ? [{ type: "web_search" }] : undefined, responseLength);
    case "anthropic":
      return gateway
        ? callChatCompletion(participant, messages, jsonMode, responseLength)
        : callAnthropic(participant, messages, nativeSearch, responseLength);
    case "gemini":
      return gateway
        ? callChatCompletion(participant, messages, jsonMode, responseLength)
        : callGemini(participant, messages, nativeSearch, responseLength);
    case "deepseek":
    case "custom":
      return callChatCompletion(participant, messages, jsonMode, responseLength);
    default:
      throw makeProviderError(participant, "Unsupported provider.");
  }
}
