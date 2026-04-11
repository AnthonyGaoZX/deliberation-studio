import { sanitizeModelText } from "@/lib/citations";
import type { DebateConfig, DebateTurn, FinalReport, Locale, ParticipantConfig } from "@/types/debate";

type ParsedTurnFields = {
  position?: "support" | "oppose" | "neutral";
  keyReason?: string;
  evidence?: string;
  responseToOthers?: string;
  interimConclusion?: string;
  message?: string;
  needsCorrection?: boolean;
};

function firstParagraph(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

function extractJsonLikeCandidate(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const objectMatch = candidate.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return objectMatch?.[0] ?? "";
}

function repairJsonLike(candidate: string) {
  return candidate
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/([{,]\s*)([A-Za-z_][\w]*)\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/:\s*'([^']*)'/g, ': "$1"');
}

export function tryParseJsonLike<T>(text: string): T | null {
  const candidate = extractJsonLikeCandidate(text);
  if (!candidate) return null;

  const attempts = [candidate, repairJsonLike(candidate)];
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as T;
    } catch {
      continue;
    }
  }

  return null;
}

function normalizePosition(raw?: string): "support" | "oppose" | "neutral" | undefined {
  if (!raw) return undefined;

  const value = raw.trim().toLowerCase();
  if (["support", "pro", "支持", "赞成", "正方"].includes(value)) return "support";
  if (["oppose", "con", "反对", "反方"].includes(value)) return "oppose";
  if (["neutral", "中立", "客观"].includes(value)) return "neutral";
  return undefined;
}

function flattenObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const nested = flattenObject(record.turn) ?? flattenObject(record.moderator) ?? flattenObject(record.output) ?? flattenObject(record.result);
  return nested ? { ...record, ...nested } : record;
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function pickBoolean(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function parseJsonFields(raw: string): ParsedTurnFields {
  const parsed = tryParseJsonLike<unknown>(raw);
  const object = flattenObject(parsed);
  if (!object) return {};

  return {
    position: normalizePosition(pickString(object, ["position", "stance", "currentPosition", "side", "立场"])),
    keyReason: pickString(object, ["keyReason", "coreReason", "reason", "核心理由", "理由"]),
    evidence: pickString(object, ["evidence", "basis", "证据", "依据"]),
    responseToOthers: pickString(object, ["responseToOthers", "response", "rebuttal", "counterpoint", "回应"]),
    interimConclusion: pickString(object, ["interimConclusion", "conclusion", "stageConclusion", "阶段结论", "结论"]),
    message: pickString(object, ["message", "moderatorMessage", "主持人提醒"]),
    needsCorrection: pickBoolean(object, ["needsCorrection", "shouldCorrect", "纠偏"]),
  };
}

function extractLabeledField(text: string, labels: string[]) {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const boundary =
    "(?:position|current position|stance|reason|key reason|core reason|evidence|response|response to others|rebuttal|interim conclusion|conclusion|message|立场|核心理由|理由|证据|依据|回应|阶段结论|主持人提醒)";
  const regex = new RegExp(`(?:^|\\n)\\s*(?:${escaped})\\s*[:：]\\s*([\\s\\S]*?)(?=(?:\\n\\s*${boundary}\\s*[:：])|$)`, "i");
  return regex.exec(text)?.[1]?.trim();
}

function parseLabeledFields(text: string): ParsedTurnFields {
  const position = extractLabeledField(text, ["position", "current position", "stance", "立场"]);

  return {
    position: normalizePosition(position),
    keyReason: extractLabeledField(text, ["key reason", "core reason", "reason", "核心理由", "理由"]),
    evidence: extractLabeledField(text, ["evidence", "basis", "证据", "依据"]),
    responseToOthers: extractLabeledField(text, ["response to others", "response", "rebuttal", "回应", "反驳"]),
    interimConclusion: extractLabeledField(text, ["interim conclusion", "conclusion", "阶段结论", "结论"]),
    message: extractLabeledField(text, ["message", "moderator note", "主持人提醒"]),
  };
}

export function parseStructuredTurnText(rawText: string): ParsedTurnFields {
  const clean = sanitizeModelText(rawText);
  const fromJson = parseJsonFields(clean);
  if (Object.values(fromJson).some((value) => value !== undefined)) return fromJson;
  return parseLabeledFields(clean);
}

export function buildTurnDisplaySections(
  locale: Locale,
  turn: Pick<DebateTurn, "phase" | "currentPosition" | "keyReason" | "evidence" | "responseToOthers" | "interimConclusion">,
) {
  if (turn.phase === "moderator") {
    return [{ title: locale === "zh" ? "主持人提醒" : "Moderator note", body: turn.interimConclusion }];
  }

  if (turn.phase === "score") {
    return [
      { title: locale === "zh" ? "本轮判断" : "Round evaluation", body: turn.responseToOthers },
      ...(turn.evidence ? [{ title: locale === "zh" ? "判断依据" : "Why the judge thinks so", body: turn.evidence }] : []),
    ];
  }

  if (turn.phase === "judge") {
    return [
      { title: locale === "zh" ? "一句话结论" : "One-line conclusion", body: turn.keyReason },
      { title: locale === "zh" ? "详细结论" : "Detailed conclusion", body: turn.interimConclusion },
      { title: locale === "zh" ? "如何理解分歧" : "How to read disagreement", body: turn.responseToOthers },
      { title: locale === "zh" ? "仍然存在的不确定性" : "Remaining uncertainty", body: turn.evidence },
    ].filter((section) => section.body.trim().length > 0);
  }

  return [
    { title: locale === "zh" ? "当前立场" : "Current stance", body: turn.currentPosition ?? (locale === "zh" ? "未明确说明" : "Not clearly stated") },
    { title: locale === "zh" ? "核心观点" : "Core point", body: turn.keyReason },
    { title: locale === "zh" ? "证据与依据" : "Evidence and basis", body: turn.evidence },
    { title: locale === "zh" ? "对其他观点的回应" : "Response to other viewpoints", body: turn.responseToOthers },
    { title: locale === "zh" ? "阶段结论" : "Interim conclusion", body: turn.interimConclusion },
  ].filter((section) => section.body.trim().length > 0);
}

export function buildReadableParticipantBody(_locale: Locale, turn: Pick<DebateTurn, "displaySections">) {
  return (turn.displaySections ?? []).map((section) => `${section.title}\n${section.body}`).join("\n\n");
}

export function buildJudgeReadableSummary(locale: Locale, report: FinalReport) {
  return [
    `${locale === "zh" ? "一句话结论" : "One-line conclusion"}\n${report.shortConclusion}`,
    `${locale === "zh" ? "详细结论" : "Detailed conclusion"}\n${report.detailedConclusion}`,
    `${locale === "zh" ? "如何理解分歧" : "How to read disagreement"}\n${report.howToReadDisagreement}`,
    `${locale === "zh" ? "仍然存在的不确定性" : "Remaining uncertainty"}\n${report.uncertainty}`,
  ].join("\n\n");
}

export function buildModeratorFallback(locale: Locale) {
  return locale === "zh"
    ? "主持人本轮没有发现需要额外纠偏的问题，讨论继续。"
    : "The moderator did not add an extra correction this round, so the discussion continues.";
}

export function buildSearchFailureMessage(locale: Locale, participant: ParticipantConfig, failureReason?: string) {
  if (participant.provider === "deepseek") {
    if (locale === "zh") {
      return [
        "本轮未成功获取新的网页资料，因此以下内容主要基于模型已有知识生成。",
        "DeepSeek 在本项目中依赖第三方搜索增强。如果你希望继续联网检索，请检查搜索 API 配置后重新开始。",
        failureReason ? `可能原因：${failureReason}` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    return [
      "This round could not fetch fresh web results, so the answer below is based mainly on built-in model knowledge.",
      "In this app, DeepSeek relies on external search augmentation. If you want live search again, review the search API setup and restart.",
      failureReason ? `Possible reason: ${failureReason}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (participant.provider === "xai") {
    if (locale === "zh") {
      return [
        "本轮 Grok 原生联网没有返回可用的新资料，因此以下内容主要基于模型已有知识生成。",
        failureReason ? `可能原因：${failureReason}` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    return [
      "This round Grok native web search did not return usable live results, so the answer below relied mainly on built-in model knowledge.",
      failureReason ? `Possible reason: ${failureReason}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (locale === "zh") {
    return [
      "本轮未成功获取新的网页资料，因此以下内容主要基于模型已有知识生成。",
      "你可以稍后重试联网，或检查当前网络与搜索配置。",
      failureReason ? `可能原因：${failureReason}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    "This round could not fetch fresh web results, so the answer below is based mainly on built-in model knowledge.",
    "You can retry later or review your network and search settings.",
    failureReason ? `Possible reason: ${failureReason}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildSummaryGuidance(config: DebateConfig) {
  const included = config.participants.filter((participant) => participant.includeInFinalSummary);
  const excluded = config.participants.filter((participant) => !participant.includeInFinalSummary);

  return {
    included,
    excluded,
    instructions: [
      included.length
        ? `Core participants for the final summary: ${included.map((participant) => `${participant.label} (${participant.roleName})`).join(", ")}.`
        : "No participants were explicitly marked as core for the final summary. Use the strongest reliable viewpoints.",
      excluded.length
        ? `These participants are supplementary stress-test voices. They may appear in the narrative, but should not dominate the final conclusion unless they reveal a critical flaw: ${excluded.map((participant) => `${participant.label} (${participant.roleName})`).join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function buildParticipantFallbacks(locale: Locale, cleanText: string, citationsCount: number, searchFailed: boolean) {
  return {
    keyReason:
      firstParagraph(cleanText) ||
      (locale === "zh"
        ? citationsCount
          ? "本轮主要返回了搜索资料，系统已尽量整理成可读观点。"
          : "本轮只返回了部分内容，系统保留了最可读的摘要。"
        : citationsCount
          ? "This round mostly returned source material, so the app reorganized it into a readable point."
          : "This round returned only part of an answer, so the app kept the most readable summary."),
    evidence:
      citationsCount > 0
        ? locale === "zh"
          ? `本轮引用了 ${citationsCount} 条外部来源。`
          : `This round referenced ${citationsCount} external source${citationsCount > 1 ? "s" : ""}.`
        : searchFailed
          ? locale === "zh"
            ? "本轮未成功联网，因此更依赖模型已有知识。"
            : "Fresh web results were unavailable this round, so the model relied more on built-in knowledge."
          : locale === "zh"
            ? "模型没有单独输出证据段落。"
            : "The model did not return a separate evidence section.",
    responseToOthers:
      cleanText
        ? locale === "zh"
          ? "本轮输出更接近自由文本，系统已提取主要回应内容。"
          : "This answer came back in freer text, so the app extracted the key response to other viewpoints."
        : locale === "zh"
          ? "本轮未清晰给出对其他观点的回应。"
          : "This round did not clearly separate a response to other viewpoints.",
    interimConclusion:
      cleanText
        ? locale === "zh"
          ? "本轮已有可读内容，但并非每个结构化字段都完整。"
          : "This round returned readable content, but not every structured field was complete."
        : locale === "zh"
          ? "本轮未明确给出阶段结论。"
          : "This round did not return a clear interim conclusion.",
  };
}
