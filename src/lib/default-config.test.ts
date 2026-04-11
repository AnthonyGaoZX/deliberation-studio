import { describe, expect, it } from "vitest";
import { createDefaultConfig, createStarterSingleModelSetup } from "@/lib/default-config";

describe("single model persona support", () => {
  it("creates an empty beginner-friendly config by default", () => {
    const config = createDefaultConfig("zh");
    expect(config.participants).toHaveLength(0);
    expect(config.appMode).toBe("simple");
    expect(config.debateMode).toBe("single_model_personas");
    expect(config.discussionType).toBe("analysis");
    expect(config.outputLanguage).toBe("zh");
    expect(config.singleModelRoleCount).toBe(3);
    expect(config.search.continuePerRound).toBe(false);
  });

  it("creates support, oppose, and neutral personas from one provider", () => {
    const participants = createStarterSingleModelSetup("en", "deepseek");
    expect(participants).toHaveLength(3);
    expect(participants.map((item) => item.stance)).toEqual(["support", "oppose", "neutral"]);
  });

  it("can expand the single-model starter setup to more debaters plus one judge", () => {
    const participants = createStarterSingleModelSetup("en", "openai", 3);
    expect(participants).toHaveLength(4);
    expect(participants.at(-1)?.stance).toBe("neutral");
    expect(participants.at(-1)?.roleName).toBe("Judge");
    expect(participants.at(-1)?.persona).toBe("objective_judge");
  });
});
