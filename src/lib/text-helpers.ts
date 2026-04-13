import type { DebateStance, Locale, RunStage, RunStatus } from "@/types/debate";
import { stanceLabel } from "@/lib/provider-catalog";

export function text(locale: Locale, zh: string, en: string) {
  return locale === "zh" ? zh : en;
}

export function roleNameForParticipant(stance: DebateStance, locale: Locale, isJudge = false) {
  if (isJudge) return text(locale, "裁判", "Judge");
  if (stance === "free") return text(locale, "自由立场", "Free stance");
  return stanceLabel(stance, locale);
}

export function statusLabel(status: RunStatus, locale: Locale) {
  const labels: Record<RunStatus, Record<Locale, string>> = {
    idle: { zh: "未开始", en: "Idle" },
    running: { zh: "进行中", en: "Running" },
    paused: { zh: "已暂停", en: "Paused" },
    completed: { zh: "已完成", en: "Completed" },
  };
  return labels[status][locale];
}

export function stageLabel(stage: RunStage, locale: Locale) {
  const labels: Record<RunStage, Record<Locale, string>> = {
    opening: { zh: "开场陈述", en: "Opening" },
    response: { zh: "回应阶段", en: "Response" },
    moderator: { zh: "主持纠偏", en: "Moderator" },
    score: { zh: "裁判评分", en: "Scoring" },
    synthesis: { zh: "综合整理", en: "Synthesis" },
    judge: { zh: "最终总结", en: "Final summary" },
    done: { zh: "全部结束", en: "Done" },
  };
  return labels[stage][locale];
}
