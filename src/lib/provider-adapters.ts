import { dedupeCitations, extractDomain, sanitizeModelText } from "@/lib/citations";
import { PROVIDER_CATALOG } from "@/lib/provider-catalog";
import type { Citation, ParticipantConfig, ProviderKind } from "@/types/debate";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ProviderResult = {
  text: string;
  citations: Citation[];
};

const REQUEST_TIMEOUT_MS = 45_000;

const OFFICIAL_HOSTS: Partial<Record<ProviderKind, string>> = {
  openai: "api.openai.com",
  anthropic: "api.anthropic.com",
  gemini: "generativelanguage.googleapis.com",
  deepseek: "api.deepseek.com",
  xai: "api.x.ai",
};

function buildEndpoint(baseUrl: string, path: string) {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path, normalized).toString();
}

function getHostname(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown request error";
}

function makeProviderError(participant: ParticipantConfig, detail: string) {
  return new Error(`${participant.label} request failed: ${detail}`);
}

function usesGatewayBaseUrl(participant: ParticipantConfig) {
  const officialHost = OFFICIAL_HOSTS[participant.provider];
  if (!officialHost) return false;
  return !getHostname(participant.baseUrl).includes(officialHost);
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

async function callResponsesApi(
  participant: ParticipantConfig,
  messages: ChatMessage[],
  tools: unknown[] | undefined,
) {
  const response = await fetchWithTimeout(
    buildEndpoint(participant.baseUrl, "responses"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${participant.apiKey}`,
      },
      body: JSON.stringify({
        model: participant.model,
        input: messages.map((message) => ({
          role: message.role,
          content: [{ type: "input_text", text: message.content }],
        })),
        tools,
        include: tools?.length ? ["web_search_call.action.sources"] : undefined,
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

  const text = data.output_text?.trim() || collectTextParts(data.output);
  if (!text.trim()) {
    throw makeProviderError(participant, "The API returned successfully but no readable text was found.");
  }

  return {
    text: sanitizeModelText(text),
    citations: dedupeCitations([...citationsFromContent, ...citationsFromTopLevel]),
  } satisfies ProviderResult;
}

async function callAnthropic(participant: ParticipantConfig, messages: ChatMessage[], enableSearch: boolean) {
  const system = messages.find((message) => message.role === "system")?.content ?? "";
  const response = await fetchWithTimeout(
    buildEndpoint(participant.baseUrl, "v1/messages"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": participant.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: participant.model,
        max_tokens: 1400,
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
    throw makeProviderError(participant, "The API returned successfully but no readable text was found.");
  }

  return {
    text: sanitizeModelText(text),
    citations: dedupeCitations((data.content ?? []).flatMap((block) => collectCitations(block.citations))),
  } satisfies ProviderResult;
}

async function callGemini(participant: ParticipantConfig, messages: ChatMessage[], enableSearch: boolean) {
  const system = messages.find((message) => message.role === "system")?.content ?? "";
  const userPayload = messages
    .filter((message) => message.role !== "system")
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n");

  const response = await fetchWithTimeout(
    buildEndpoint(participant.baseUrl, `models/${participant.model}:generateContent`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": participant.apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: system }],
        },
        contents: [{ role: "user", parts: [{ text: userPayload }] }],
        tools: enableSearch ? [{ google_search: {} }] : undefined,
      }),
    },
    participant,
  );

  if (!response.ok) {
    throw makeProviderError(participant, await readErrorBody(response));
  }

  const data = (await safeJson(response, participant)) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: { groundingChunks?: Array<{ web?: { title?: string; uri?: string } }> };
    }>;
  };

  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((part) => part.text?.trim() || "").filter(Boolean).join("\n");

  if (!text.trim()) {
    throw makeProviderError(participant, "The API returned successfully but no readable text was found.");
  }

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

  return {
    text: sanitizeModelText(text),
    citations,
  } satisfies ProviderResult;
}

async function callChatCompletion(participant: ParticipantConfig, messages: ChatMessage[], jsonMode: boolean) {
  const supportsJson = PROVIDER_CATALOG[participant.provider].supportsJsonMode;
  const tokenBudgetField =
    participant.provider === "openai"
      ? { max_completion_tokens: 1400 }
      : { max_tokens: 1400 };
  const response = await fetchWithTimeout(
    buildEndpoint(participant.baseUrl, "chat/completions"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${participant.apiKey}`,
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
    throw makeProviderError(participant, "The API returned successfully but no readable text was found.");
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
): Promise<ProviderResult> {
  const gateway = usesGatewayBaseUrl(participant);

  switch (participant.provider) {
    case "openai":
      return gateway
        ? callChatCompletion(participant, messages, jsonMode)
        : callResponsesApi(participant, messages, nativeSearch ? [{ type: "web_search" }] : undefined);
    case "xai":
      return callResponsesApi(participant, messages, nativeSearch ? [{ type: "web_search" }] : undefined);
    case "anthropic":
      return gateway ? callChatCompletion(participant, messages, jsonMode) : callAnthropic(participant, messages, nativeSearch);
    case "gemini":
      return gateway ? callChatCompletion(participant, messages, jsonMode) : callGemini(participant, messages, nativeSearch);
    case "deepseek":
    case "custom":
      return callChatCompletion(participant, messages, jsonMode);
    default:
      throw makeProviderError(participant, "Unsupported provider.");
  }
}
