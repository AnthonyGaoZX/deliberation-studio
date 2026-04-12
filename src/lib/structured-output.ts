import { sanitizeModelText } from "@/lib/citations";
import type { DebateConfig, FinalReport, Locale, ParticipantConfig } from "@/types/debate";

type ParsedTurnFields = {
  position?: "support" | "oppose" | "neutral";
  message?: string;
  needsCorrection?: boolean;
};

function firstNonEmptyParagraph(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .find(Boolean);
}

function lastNonEmptyParagraph(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .at(-1);
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
    .replace(/([{,]\s*)([A-Za-z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]*)\s*:/g, '$1"$2":')
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
  const nested =
    flattenObject(record.turn) ??
    flattenObject(record.moderator) ??
    flattenObject(record.output) ??
    flattenObject(record.result) ??
    flattenObject(record.final_recommendation) ??
    flattenObject(record.analysis);

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

function prettifyObjectKey(key: string, locale: Locale) {
  const dictionary: Record<string, Record<Locale, string>> = {
    analysis: { zh: "分析", en: "Analysis" },
    final_recommendation: { zh: "最终建议", en: "Final recommendation" },
    choice: { zh: "建议选择", en: "Recommended choice" },
    reason: { zh: "理由", en: "Reason" },
    summary: { zh: "总结", en: "Summary" },
    academic_comparison: { zh: "学术对比", en: "Academic comparison" },
    academic: { zh: "学术对比", en: "Academic comparison" },
    employment: { zh: "就业结果", en: "Career outcomes" },
    brand: { zh: "品牌与信号", en: "Brand and signal" },
    skills: { zh: "能力培养", en: "Skill development" },
    risk: { zh: "风险分析", en: "Risk analysis" },
    message: { zh: "主持提醒", en: "Moderator note" },
    content: { zh: "内容", en: "Content" },
    text: { zh: "内容", en: "Content" },
  };

  if (dictionary[key]) return dictionary[key][locale];

  const cleaned = key
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return locale === "zh" ? "内容" : "Content";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function renderJsonLikeValue(value: unknown, locale: Locale, depth = 0): string {
  if (value == null) return "";

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => renderJsonLikeValue(item, locale, depth + 1))
      .filter(Boolean)
      .map((item) => `${"  ".repeat(depth)}- ${item}`)
      .join("\n");
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => {
        const rendered = renderJsonLikeValue(nested, locale, depth + 1);
        if (!rendered) return "";

        const title = prettifyObjectKey(key, locale);
        if (typeof nested === "object" && nested && !Array.isArray(nested)) {
          return `${"  ".repeat(depth)}${title}\n${rendered}`;
        }

        return `${"  ".repeat(depth)}${title}: ${rendered}`;
      })
      .filter(Boolean)
      .join("\n\n");
  }

  return "";
}

function parseJsonFields(raw: string): ParsedTurnFields {
  const parsed = tryParseJsonLike<unknown>(raw);
  const object = flattenObject(parsed);
  if (!object) return {};

  return {
    position: normalizePosition(pickString(object, ["position", "stance", "currentPosition", "side", "立场"])),
    message: pickString(object, ["message", "content", "text", "answer", "moderatorMessage", "主持人提醒"]),
    needsCorrection: pickBoolean(object, ["needsCorrection", "shouldCorrect", "纠偏"]),
  };
}

function extractLabeledField(text: string, labels: string[]) {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const boundary = "(?:position|current position|stance|message|content|answer|立场|主持人提醒|内容)";
  const regex = new RegExp(
    `(?:^|\\n)\\s*(?:${escaped})\\s*[:：]\\s*([\\s\\S]*?)(?=(?:\\n\\s*${boundary}\\s*[:：])|$)`,
    "i",
  );
  return regex.exec(text)?.[1]?.trim();
}

function parseLabeledFields(text: string): ParsedTurnFields {
  const position = extractLabeledField(text, ["position", "current position", "stance", "立场"]);

  return {
    position: normalizePosition(position),
    message: extractLabeledField(text, ["message", "content", "answer", "主持人提醒", "内容"]),
  };
}

export function parseStructuredTurnText(rawText: string): ParsedTurnFields {
  const clean = sanitizeModelText(rawText);
  const fromJson = parseJsonFields(clean);
  if (Object.values(fromJson).some((value) => value !== undefined)) return fromJson;
  return parseLabeledFields(clean);
}

export function renderJsonLikeText(rawText: string, locale: Locale) {
  const parsed = tryParseJsonLike<unknown>(rawText);
  if (!parsed) return sanitizeModelText(rawText);

  const rendered = renderJsonLikeValue(parsed, locale);
  return sanitizeModelText(rendered || rawText);
}

export function normalizeReadableDebaterTurn(
  rawText: string,
  fallbackPosition: "support" | "oppose" | "neutral",
  locale: Locale,
) {
  const cleanText = sanitizeModelText(rawText);
  const parsed = parseStructuredTurnText(cleanText);
  const content = parsed.message?.trim() || renderJsonLikeText(cleanText, locale);
  const lead = firstNonEmptyParagraph(content) || content;
  const tail = lastNonEmptyParagraph(content) || content;

  return {
    currentPosition: parsed.position || fallbackPosition,
    content,
    keyReason: lead || "",
    evidence: "",
    responseToOthers: "",
    interimConclusion: tail || lead || "",
  };
}

export function buildJudgeReadableSummary(locale: Locale, report: FinalReport) {
  if (report.rawText?.trim()) {
    return renderJsonLikeText(report.rawText.trim(), locale);
  }

  return [
    locale === "zh" ? `一句话结论：${report.shortConclusion}` : `One-line conclusion: ${report.shortConclusion}`,
    locale === "zh" ? `详细结论：${report.detailedConclusion}` : `Detailed conclusion: ${report.detailedConclusion}`,
    locale === "zh"
      ? `如何理解分歧：${report.howToReadDisagreement}`
      : `How to read disagreement: ${report.howToReadDisagreement}`,
    locale === "zh" ? `不确定性：${report.uncertainty}` : `Uncertainty: ${report.uncertainty}`,
  ]
    .filter(Boolean)
    .join("\n\n");
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

export function normalizeFreeTextFinalReport(rawText: string): FinalReport {
  const clean = renderJsonLikeText(rawText, "en");
  const firstParagraph = firstNonEmptyParagraph(clean) || "";

  return {
    shortConclusion: firstParagraph || "",
    detailedConclusion: clean || "",
    comparison: [],
    uncertainty: "",
    howToReadDisagreement: "",
    rawText: clean,
  };
}
