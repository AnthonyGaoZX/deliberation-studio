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

  it("extracts text from array-style chat completion content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          choices: [
            {
              message: {
                content: [
                  { type: "text", text: "First paragraph." },
                  { type: "text", text: "Second paragraph." },
                ],
              },
            },
          ],
        }),
      ),
    );

    const result = await callProvider(participant, [{ role: "user", content: "test" }], false);
    expect(result.text).toContain("First paragraph.");
    expect(result.text).toContain("Second paragraph.");
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

  it("extracts readable text from nested OpenAI responses output blocks", async () => {
    const openAiParticipant: ParticipantConfig = {
      ...participant,
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.4-mini",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: "Natural paragraph one.",
                },
                {
                  type: "output_text",
                  content: [{ type: "output_text", text: "Natural paragraph two." }],
                },
              ],
            },
          ],
        }),
      ),
    );

    const result = await callProvider(openAiParticipant, [{ role: "user", content: "test" }], false);
    expect(result.text).toContain("Natural paragraph one.");
    expect(result.text).toContain("Natural paragraph two.");
  });

  it("returns a readable placeholder instead of throwing when OpenAI returns no readable text", async () => {
    const openAiParticipant: ParticipantConfig = {
      ...participant,
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.4-mini",
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ output: [] })));

    const result = await callProvider(openAiParticipant, [{ role: "user", content: "test" }], false);
    expect(result.text).toContain("did not return a complete readable answer");
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

  it("adds Gemini max output token budget to reduce truncation", async () => {
    const geminiParticipant: ParticipantConfig = {
      ...participant,
      provider: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-3.1-flash-lite",
    };

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await callProvider(geminiParticipant, [{ role: "user", content: "test" }], true);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as { generationConfig?: { maxOutputTokens?: number } };
    expect(payload.generationConfig?.maxOutputTokens).toBe(2200);
  });

  it("removes Gemini token budget protection in expansive mode", async () => {
    const geminiParticipant: ParticipantConfig = {
      ...participant,
      provider: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-3.1-flash-lite",
    };

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await callProvider(geminiParticipant, [{ role: "user", content: "test" }], true, false, "expansive");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as { generationConfig?: { maxOutputTokens?: number } };
    expect(payload.generationConfig?.maxOutputTokens).toBeUndefined();
  });

  it("returns a readable fallback when Gemini only returns citations", async () => {
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
              content: { parts: [] },
              groundingMetadata: {
                groundingChunks: [{ web: { title: "Example", uri: "https://example.com/page" } }],
              },
            },
          ],
        }),
      ),
    );

    const result = await callProvider(geminiParticipant, [{ role: "user", content: "test" }], true);
    expect(result.text).toContain("source links");
    expect(result.citations[0]?.url).toBe("https://example.com/page");
  });

  it("retries Gemini with query-param auth when header auth is rejected", async () => {
    const geminiParticipant: ParticipantConfig = {
      ...participant,
      provider: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "AIza-demo-key",
      model: "gemini-3.1-flash-lite",
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              message: "Incorrect API key provided.",
            },
          },
          false,
          401,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          candidates: [{ content: { parts: [{ text: "Recovered after retry." }] } }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await callProvider(geminiParticipant, [{ role: "user", content: "test" }], false);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("?key=AIza-demo-key");
    expect(result.text).toContain("Recovered after retry.");
  });

  it("sanitizes Gemini api keys and base urls before sending headers", async () => {
    const geminiParticipant: ParticipantConfig = {
      ...participant,
      provider: "gemini",
      baseUrl: "https：//generativelanguage.googleapis.com/v1beta",
      apiKey: "API Key：demo-key",
      model: "gemini-3.1-flash-lite",
    };

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await callProvider(geminiParticipant, [{ role: "user", content: "test" }], false);

    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;

    expect(calledUrl).toContain("https://generativelanguage.googleapis.com/v1beta");
    expect(headers["x-goog-api-key"]).toBe("demo-key");
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

  it("removes chat-completion token budget protection in expansive mode", async () => {
    const deepseekParticipant: ParticipantConfig = {
      ...participant,
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
    };

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "plain text output" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await callProvider(deepseekParticipant, [{ role: "user", content: "debate naturally" }], false, false, "expansive");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as {
      max_tokens?: number;
      max_completion_tokens?: number;
    };

    expect(payload.max_tokens).toBeUndefined();
    expect(payload.max_completion_tokens).toBeUndefined();
  });

  it("keeps a high required token ceiling for Anthropic expansive mode", async () => {
    const anthropicParticipant: ParticipantConfig = {
      ...participant,
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-5",
    };

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        content: [{ type: "text", text: "ok" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await callProvider(anthropicParticipant, [{ role: "user", content: "test" }], false, false, "expansive");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as { max_tokens?: number };
    expect(payload.max_tokens).toBe(4096);
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

  it("removes relay urls and echoed key fragments from credential errors", async () => {
    const geminiParticipant: ParticipantConfig = {
      ...participant,
      provider: "gemini",
      label: "Gemini / Google 4",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-3.1-flash-lite",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              message:
                "Incorrect API key provided. You can get your API key at https://www.ohmygpt.com/apis/keys (provided key: Flash-***8336)",
            },
          },
          false,
          401,
        ),
      ),
    );

    await expect(callProvider(geminiParticipant, [{ role: "user", content: "test" }], false)).rejects.toThrow(
      /Gemini \/ Google 4 request failed: Incorrect API key provided\./,
    );
  });

  it("disables native search when OpenAI-family providers use a relay base url", () => {
    const gatewayOpenAi: ParticipantConfig = {
      ...participant,
      provider: "openai",
      baseUrl: "https://api.custom-relay.com/v1",
    };

    const gatewayAnthropic: ParticipantConfig = {
      ...participant,
      provider: "anthropic",
      baseUrl: "https://api.custom-relay.com/v1",
    };

    const gatewayGemini: ParticipantConfig = {
      ...participant,
      provider: "gemini",
      baseUrl: "https://api.custom-relay.com/v1",
    };

    expect(providerCanUseNativeSearch(gatewayOpenAi)).toBe(false);
    expect(providerCanUseNativeSearch(gatewayAnthropic)).toBe(false);
    expect(providerCanUseNativeSearch(gatewayGemini)).toBe(false);

    const officialGrok: ParticipantConfig = {
      ...participant,
      provider: "xai",
      baseUrl: "https://api.x.ai/v1",
    };
    expect(providerCanUseNativeSearch(officialGrok)).toBe(true);
  });
});
