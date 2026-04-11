import { afterEach, describe, expect, it, vi } from "vitest";
import { callProvider, providerCanUseNativeSearch } from "@/lib/provider-adapters";
import type { ParticipantConfig } from "@/types/debate";

const participant: ParticipantConfig = {
  id: "p1",
  provider: "custom",
  label: "Custom 1",
  roleName: "Support",
  stance: "support",
  model: "demo-model",
  apiKey: "key",
  baseUrl: "https://example.com/v1",
  enableSearch: false,
  persona: "balanced_standard",
  personaDescription: "Use a balanced and readable style.",
  includeInFinalSummary: true,
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  const text = JSON.stringify(body);
  return {
    ok,
    status,
    text: async () => text,
  };
}

describe("provider adapters", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses OpenAI-compatible chat completion responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "Hello world" } }] })),
    );

    const result = await callProvider(participant, [{ role: "user", content: "test" }], false);
    expect(result.text).toBe("Hello world");
  });

  it("extracts nested text and citations from responses-style providers", async () => {
    const xaiParticipant: ParticipantConfig = {
      ...participant,
      provider: "xai",
      baseUrl: "https://api.x.ai/v1",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          output: [
            {
              content: [
                {
                  text: '{"keyReason":"Structured reason","evidence":"Structured evidence","responseToOthers":"Structured reply","interimConclusion":"Structured ending"}',
                  annotations: [{ title: "Example", url: "https://example.com", text: "note" }],
                },
              ],
            },
          ],
        }),
      ),
    );

    const result = await callProvider(xaiParticipant, [{ role: "user", content: "test" }], true);
    expect(result.text).toContain("Structured reason");
    expect(result.citations[0]?.url).toBe("https://example.com");
  });

  it("parses Anthropic text blocks cleanly", async () => {
    const anthropicParticipant: ParticipantConfig = {
      ...participant,
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "claude-4.5-sonnet",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          content: [{ type: "text", text: "Reason: Clear answer\nEvidence: Source-based" }],
        }),
      ),
    );

    const result = await callProvider(anthropicParticipant, [{ role: "user", content: "test" }], true);
    expect(result.text).toContain("Reason");
  });

  it("routes Anthropic gateway requests through OpenAI-compatible chat completions", async () => {
    const gatewayParticipant: ParticipantConfig = {
      ...participant,
      provider: "anthropic",
      baseUrl: "https://api.ohmygpt.com/v1",
      model: "claude-4.5-haiku",
    };

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "Gateway reply" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callProvider(gatewayParticipant, [{ role: "user", content: "hello" }], true);

    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as { messages?: Array<{ role: string; content: string }> };

    expect(calledUrl).toContain("/chat/completions");
    expect(payload.messages?.[0]?.content).toBe("hello");
    expect(result.text).toBe("Gateway reply");
  });

  it("sends native web_search tool for xAI when enabled", async () => {
    const xaiParticipant: ParticipantConfig = {
      ...participant,
      provider: "xai",
      baseUrl: "https://api.x.ai/v1",
      model: "grok-4",
    };

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ output_text: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await callProvider(xaiParticipant, [{ role: "user", content: "latest news?" }], true);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as { tools?: Array<{ type: string }> };
    expect(payload.tools?.[0]?.type).toBe("web_search");
  });

  it("parses Gemini grounding output cleanly", async () => {
    const geminiParticipant: ParticipantConfig = {
      ...participant,
      provider: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-3.1-flash-lite",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          candidates: [
            {
              content: { parts: [{ text: '{"keyReason":"Main point"}' }] },
              groundingMetadata: {
                groundingChunks: [{ web: { title: "Example", uri: "https://example.com/page" } }],
              },
            },
          ],
        }),
      ),
    );

    const result = await callProvider(geminiParticipant, [{ role: "user", content: "test" }], true);
    expect(result.text).toContain("Main point");
    expect(result.citations[0]?.domain).toBe("example.com");
  });

  it("only enables chat-completion json mode when explicitly requested", async () => {
    const deepseekParticipant: ParticipantConfig = {
      ...participant,
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
    };

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "plain text output" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await callProvider(deepseekParticipant, [{ role: "user", content: "debate naturally" }], false, false);
    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const firstPayload = JSON.parse(String(firstInit.body)) as { response_format?: unknown };
    expect(firstPayload.response_format).toBeUndefined();

    await callProvider(deepseekParticipant, [{ role: "user", content: "return json" }], false, true);
    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const secondPayload = JSON.parse(String(secondInit.body)) as { response_format?: { type: string } };
    expect(secondPayload.response_format?.type).toBe("json_object");
  });

  it("surfaces DeepSeek HTTP errors as readable provider errors", async () => {
    const deepseekParticipant: ParticipantConfig = {
      ...participant,
      provider: "deepseek",
      label: "DeepSeek 1",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: { message: "Invalid API key" } }, false, 401)),
    );

    await expect(callProvider(deepseekParticipant, [{ role: "user", content: "test" }], false)).rejects.toThrow(
      /DeepSeek 1 request failed: Invalid API key/,
    );
  });

  it("disables native search when OpenAI-family providers use a relay base url", () => {
    const gatewayOpenAi: ParticipantConfig = {
      ...participant,
      provider: "openai",
      baseUrl: "https://api.ohmygpt.com/v1",
    };

    const gatewayAnthropic: ParticipantConfig = {
      ...participant,
      provider: "anthropic",
      baseUrl: "https://api.ohmygpt.com/v1",
    };

    const gatewayGemini: ParticipantConfig = {
      ...participant,
      provider: "gemini",
      baseUrl: "https://api.ohmygpt.com/v1",
    };

    expect(providerCanUseNativeSearch(gatewayOpenAi)).toBe(false);
    expect(providerCanUseNativeSearch(gatewayAnthropic)).toBe(false);
    expect(providerCanUseNativeSearch(gatewayGemini)).toBe(false);
  });
});
