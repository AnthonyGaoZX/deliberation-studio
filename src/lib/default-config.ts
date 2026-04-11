import { createParticipant } from "@/lib/provider-catalog";
import type { AppMode, DebateConfig, Locale, ProviderKind } from "@/types/debate";

export const STORAGE_KEY = "ai-decision-studio-config-v13";

export function createDefaultConfig(locale: Locale, appMode: AppMode = "simple"): DebateConfig {
  return {
    locale,
    appMode,
    debateMode: "single_model_personas",
    discussionPattern: "structured_discussion",
    discussionType: "analysis",
    outputLanguage: locale,
    singleModelRoleCount: 3,
    topic: "",
    rounds: 3,
    stopThreshold: 0.75,
    responseLength: "balanced",
    participants: [],
    judgeInstruction:
      locale === "zh"
        ? "请保持中立，优先比较证据质量、推理完整性和适用条件，最后给出清晰、可读、易懂的总结。"
        : "Stay neutral. Prioritize evidence quality, reasoning integrity, and applicability, then produce a clear readable summary.",
    runtimeLimitSeconds: 180,
    search: {
      enabled: true,
      mode: appMode === "simple" ? "shared_once" : "hybrid",
      continuePerRound: false,
      tavilyApiKey: "",
    },
    moderatorId: undefined,
    judgeId: undefined,
  };
}

export function createStarterSingleModelSetup(locale: Locale, provider: ProviderKind, debaterCount = 2) {
  const participants = Array.from({ length: debaterCount + 1 }, (_, index) => createParticipant(provider, index, locale));
  const debaters = participants.slice(0, debaterCount);
  const judge = participants[debaters.length];

  debaters.forEach((participant, index) => {
    participant.stance = index % 2 === 0 ? "support" : "oppose";
    participant.roleName = index % 2 === 0 ? (locale === "zh" ? "支持方" : "Support") : locale === "zh" ? "反对方" : "Oppose";
    participant.persona = index === 0 ? "balanced_standard" : index % 2 === 0 ? "aggressive_explorer" : "skeptic";
  });

  judge.label = locale === "zh" ? "中立裁判" : "Neutral judge";
  judge.roleName = locale === "zh" ? "裁判" : "Judge";
  judge.stance = "neutral";
  judge.persona = "objective_judge";
  judge.personaDescription =
    locale === "zh"
      ? "保持中立，不站队。按证据质量、适用条件和推理完整性进行总结。"
      : "Stay neutral. Summarize based on evidence quality, applicability, and reasoning integrity.";
  judge.includeInFinalSummary = true;

  return participants;
}
