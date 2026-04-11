import { describe, expect, it } from "vitest";
import { buildSearchFailureMessage, parseStructuredTurnText, tryParseJsonLike } from "@/lib/structured-output";
import type { ParticipantConfig } from "@/types/debate";

const deepseekParticipant: ParticipantConfig = {
  id: "p1",
  provider: "deepseek",
  label: "DeepSeek",
  roleName: "Support",
  stance: "support",
  model: "deepseek-chat",
  apiKey: "key",
  baseUrl: "https://api.deepseek.com",
  enableSearch: true,
  persona: "balanced_standard",
  personaDescription: "",
  includeInFinalSummary: true,
};

describe("structured output parsing", () => {
  it("parses standard json", () => {
    const parsed = parseStructuredTurnText(
      '{"position":"support","keyReason":"A","evidence":"B","responseToOthers":"C","interimConclusion":"D"}',
    );
    expect(parsed.keyReason).toBe("A");
    expect(parsed.position).toBe("support");
  });

  it("repairs near-json with unquoted keys", () => {
    const parsed = tryParseJsonLike<{ keyReason: string }>("{keyReason:'hello',}");
    expect(parsed?.keyReason).toBe("hello");
  });

  it("extracts labeled free text", () => {
    const parsed = parseStructuredTurnText(
      "Position: oppose\nReason: Too costly\nEvidence: Budget pressure\nResponse: It ignores timing\nInterim conclusion: Wait for now",
    );
    expect(parsed.position).toBe("oppose");
    expect(parsed.evidence).toContain("Budget");
  });

  it("parses moderator-style json without exposing raw objects", () => {
    const parsed = parseStructuredTurnText('{"message":"Stay neutral and answer the strongest objection.","needsCorrection":true}');
    expect(parsed.message).toContain("Stay neutral");
    expect(parsed.needsCorrection).toBe(true);
  });

  it("parses nested moderator payloads without duplicate wrappers", () => {
    const parsed = parseStructuredTurnText(
      '{"moderator":{"message":"Focus on evidence quality, not tone.","needsCorrection":false}}',
    );
    expect(parsed.message).toBe("Focus on evidence quality, not tone.");
    expect(parsed.needsCorrection).toBe(false);
  });

  it("builds product-style DeepSeek fallback search text", () => {
    const message = buildSearchFailureMessage("zh", deepseekParticipant);
    expect(message).toContain("DeepSeek");
    expect(message).toContain("第三方搜索");
  });
});
