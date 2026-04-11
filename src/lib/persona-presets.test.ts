import { describe, expect, it } from "vitest";
import { DEBATER_PERSONA_IDS, JUDGE_PERSONA_IDS, PERSONA_PRESETS } from "@/lib/persona-presets";

describe("persona presets", () => {
  it("includes a balanced persona for debaters and judges", () => {
    expect(DEBATER_PERSONA_IDS).toContain("balanced_standard");
    expect(JUDGE_PERSONA_IDS).toContain("objective_judge");
  });

  it("keeps judge personas neutral-only", () => {
    const judgePresets = PERSONA_PRESETS.filter((preset) => JUDGE_PERSONA_IDS.includes(preset.id));
    expect(judgePresets.every((preset) => preset.defaultStance === "neutral")).toBe(true);
  });
});
