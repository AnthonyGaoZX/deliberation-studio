import { describe, expect, it } from "vitest";
import {
  buildSearchFailureMessage,
  normalizeFreeTextFinalReport,
  normalizeReadableDebaterTurn,
  parseStructuredTurnText,
  renderJsonLikeText,
  tryParseJsonLike,
} from "@/lib/structured-output";
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
  it("parses standard json when a model still returns it", () => {
    const parsed = parseStructuredTurnText('{"position":"support","message":"A natural paragraph answer."}');
    expect(parsed.message).toBe("A natural paragraph answer.");
    expect(parsed.position).toBe("support");
  });

  it("repairs near-json with unquoted keys", () => {
    const parsed = tryParseJsonLike<{ message: string }>("{message:'hello',}");
    expect(parsed?.message).toBe("hello");
  });

  it("extracts labeled free text when present", () => {
    const parsed = parseStructuredTurnText("Position: oppose\nMessage: This is the main reply.");
    expect(parsed.position).toBe("oppose");
    expect(parsed.message).toContain("main reply");
  });

  it("keeps natural debater text intact instead of inventing fallback warnings", () => {
    const normalized = normalizeReadableDebaterTurn(
      "I still support this plan because the cost is manageable and the rollout can be staged.",
      "support",
      "en",
    );

    expect(normalized.currentPosition).toBe("support");
    expect(normalized.content).toContain("I still support this plan");
    expect(normalized.evidence).toBe("");
  });

  it("turns free-text final reports into readable summaries without debug wording", () => {
    const report = normalizeFreeTextFinalReport("Overall, the safer choice is to wait for more evidence.");
    expect(report.rawText).toContain("safer choice");
    expect(report.shortConclusion).toContain("safer choice");
    expect(report.uncertainty).toBe("");
  });

  it("turns json-like moderator output into readable text", () => {
    const rendered = renderJsonLikeText(
      '{"analysis":{"academic":"LSE is stronger in theory.","career":"Imperial is more applied."},"final_recommendation":{"choice":"LSE","reason":"Stronger finance signal."}}',
      "en",
    );

    expect(rendered).toContain("Analysis");
    expect(rendered).toContain("Final recommendation");
    expect(rendered).not.toContain('{"analysis"');
  });

  it("builds product-style DeepSeek fallback search text", () => {
    const message = buildSearchFailureMessage("zh", deepseekParticipant);
    expect(message).toContain("DeepSeek");
    expect(message).toContain("外部搜索增强");
  });
});
