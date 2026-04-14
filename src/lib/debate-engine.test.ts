import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateTurn, prepareDebate } from "@/lib/debate-engine";
import type { DebateConfig, ParticipantConfig, SearchEvidence } from "@/types/debate";

const callProviderMock = vi.fn();
const performSearchMock = vi.fn();

vi.mock("@/lib/provider-adapters", () => ({
  callProvider: (...args: unknown[]) => callProviderMock(...args),
  providerCanUseNativeSearch: (participant: { provider?: string }) =>
    ["openai", "anthropic", "gemini", "xai"].includes(participant.provider ?? ""),
}));

vi.mock("@/lib/search-adapter", () => ({
  performSearch: (...args: unknown[]) => performSearchMock(...args),
}));

function buildParticipant(overrides: Partial<ParticipantConfig> = {}): ParticipantConfig {
  return {
    id: overrides.id ?? "p1",
    provider: overrides.provider ?? "xai",
    label: overrides.label ?? "Grok / xAI 1",
    roleName: overrides.roleName ?? "Support",
    stance: overrides.stance ?? "support",
    model: overrides.model ?? "grok-4",
    apiKey: overrides.apiKey ?? "key",
    baseUrl: overrides.baseUrl ?? "https://api.x.ai/v1",
    enableSearch: overrides.enableSearch ?? true,
    persona: overrides.persona ?? "balanced_standard",
    personaDescription: overrides.personaDescription ?? "Use a balanced style.",
    includeInFinalSummary: overrides.includeInFinalSummary ?? true,
    systemPrompt: overrides.systemPrompt ?? "",
  };
}

function buildConfig(overrides: Partial<DebateConfig> = {}): DebateConfig {
  const judge = buildParticipant({
    id: "judge",
    label: "Neutral judge",
    roleName: "Judge",
    stance: "neutral",
    persona: "objective_judge",
  });

  return {
    locale: "en",
    appMode: "advanced",
    debateMode: "single_model_personas",
    discussionPattern: "structured_discussion",
    discussionType: "analysis",
    outputLanguage: "en",
    singleModelRoleCount: 3,
    topic: "Should we adopt this product strategy?",
    rounds: 2,
    stopThreshold: 0.75,
    responseLength: "balanced",
    participants: [buildParticipant(), judge],
    moderatorId: "judge",
    judgeId: "judge",
    judgeInstruction: "Stay neutral and summarize clearly.",
    runtimeLimitSeconds: 0,
    search: {
      enabled: true,
      mode: "shared_once",
      continuePerRound: false,
      tavilyApiKey: "",
    },
    ...overrides,
  };
}

const sharedSearch: SearchEvidence = {
  summary: "Fresh sources were found.",
  citations: [{ title: "Example", url: "https://example.com", domain: "example.com", snippet: "snippet" }],
  contextBlock: "Shared evidence block",
  failed: false,
  provider: "bing",
};

describe("debate engine search behavior", () => {
  beforeEach(() => {
    callProviderMock.mockReset();
    performSearchMock.mockReset();
    callProviderMock.mockResolvedValue({ text: "A clear argument in paragraph form.", citations: [] });
    performSearchMock.mockResolvedValue(sharedSearch);
  });

  it("skips shared external search when every participant has native search", async () => {
    const config = buildConfig();

    const result = await prepareDebate({ config });

    expect(performSearchMock).not.toHaveBeenCalled();
    expect(result.sharedSearch).toBeNull();
  });

  it("forces native search for xAI in shared_once mode to provide unique citations", async () => {
    const config = buildConfig();

    await generateTurn({
      config,
      participantId: "p1",
      phase: "opening",
      round: 1,
      transcript: [],
      rollingSummary: "",
      sharedSearch,
    });

    expect(callProviderMock).toHaveBeenCalledTimes(1);
    expect(callProviderMock.mock.calls[0]?.[2]).toBe(true);
  });

  it("uses native search for xAI in hybrid mode while still carrying shared evidence", async () => {
    const config = buildConfig({
      participants: [
        buildParticipant(),
        buildParticipant({
          id: "deepseek-1",
          provider: "deepseek",
          label: "DeepSeek 1",
          roleName: "Oppose",
          stance: "oppose",
          model: "deepseek-chat",
          baseUrl: "https://api.deepseek.com",
        }),
        buildParticipant({
          id: "judge",
          label: "Neutral judge",
          roleName: "Judge",
          stance: "neutral",
          persona: "objective_judge",
        }),
      ],
      search: {
        enabled: true,
        mode: "hybrid",
        continuePerRound: false,
        tavilyApiKey: "",
      },
    });

    await generateTurn({
      config,
      participantId: "p1",
      phase: "opening",
      round: 1,
      transcript: [],
      rollingSummary: "",
      sharedSearch,
    });

    expect(callProviderMock).toHaveBeenCalledTimes(1);
    expect(callProviderMock.mock.calls[0]?.[2]).toBe(true);

    const messages = callProviderMock.mock.calls[0]?.[1] as Array<{ role: string; content: string }>;
    expect(messages[0]?.content).toContain("Shared briefing summary");
    expect(messages[0]?.content).not.toContain("URL: https://example.com");
  });

  it("keeps external search available for DeepSeek without Tavily in per-role mode", async () => {
    const config = buildConfig({
      participants: [
        buildParticipant({
          id: "deepseek-1",
          provider: "deepseek",
          label: "DeepSeek 1",
          roleName: "Support",
          stance: "support",
          model: "deepseek-chat",
          baseUrl: "https://api.deepseek.com",
        }),
        buildParticipant({
          id: "judge",
          label: "Neutral judge",
          roleName: "Judge",
          stance: "neutral",
          persona: "objective_judge",
          provider: "deepseek",
          model: "deepseek-chat",
          baseUrl: "https://api.deepseek.com",
        }),
      ],
      search: {
        enabled: true,
        mode: "per_participant",
        continuePerRound: false,
        tavilyApiKey: "",
      },
    });

    await generateTurn({
      config,
      participantId: "deepseek-1",
      phase: "opening",
      round: 1,
      transcript: [],
      rollingSummary: "",
      sharedSearch: null,
    });

    expect(performSearchMock).toHaveBeenCalledTimes(1);
    expect(callProviderMock.mock.calls[0]?.[2]).toBe(false);
    const messages = callProviderMock.mock.calls[0]?.[1] as Array<{ role: string; content: string }>;
    expect(messages[0]?.content).toContain("Search evidence for this round");
    expect(messages[0]?.content).toContain("Shared evidence block");
  });

  it("forwards expansive response length to the provider layer", async () => {
    const config = buildConfig({
      responseLength: "expansive",
    });

    await generateTurn({
      config,
      participantId: "p1",
      phase: "opening",
      round: 1,
      transcript: [],
      rollingSummary: "",
      sharedSearch,
    });

    expect(callProviderMock).toHaveBeenCalledTimes(1);
    expect(callProviderMock.mock.calls[0]?.[4]).toBe("expansive");
  });
});
