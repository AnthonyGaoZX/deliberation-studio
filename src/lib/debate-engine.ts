import { z } from "zod";
import { sanitizeModelText } from "@/lib/citations";
import { getPersonaPreset } from "@/lib/persona-presets";
import { sideLabel } from "@/lib/provider-catalog";
import { callProvider, providerCanUseNativeSearch } from "@/lib/provider-adapters";
import { performSearch } from "@/lib/search-adapter";
import { shouldCreateSharedSearch, shouldUseNativeSearch } from "@/lib/search-strategy";
import {
  buildJudgeReadableSummary,
  buildModeratorFallback,
  buildSearchFailureMessage,
  buildSummaryGuidance,
  normalizeFreeTextFinalReport,
  normalizeReadableDebaterTurn,
  parseStructuredTurnText,
  renderJsonLikeText,
  tryParseJsonLike,
} from "@/lib/structured-output";
import type {
  DebateConfig,
  DebatePhase,
  DebateTurn,
  FinalReport,
  ParticipantConfig,
  RoundEvaluation,
  SearchEvidence,
  TurnResponse,
} from "@/types/debate";

const participantSchema = z
  .object({
    id: z.string(),
    provider: z.enum(["openai", "anthropic", "gemini", "deepseek", "xai", "custom"]),
    label: z.string().min(1),
    roleName: z.string().min(1),
    stance: z.enum(["support", "oppose", "neutral", "free"]).optional(),
    side: z.enum(["support", "oppose", "neutral", "free"]).optional(),
    model: z.string().min(1),
    apiKey: z.string(),
    baseUrl: z.string().url(),
    systemPrompt: z.string().optional(),
    enableSearch: z.boolean(),
    persona: z
      .enum([
        "balanced_standard",
        "supporter",
        "opposer",
        "objective_judge",
        "balanced_judge",
        "conservative_judge",
        "rigorous_judge",
        "pragmatic_judge",
        "risk_sensitive_judge",
        "evidence_first_judge",
        "philosopher_showman",
        "combative_troll",
        "nonsense_poet",
        "sarcastic_oracle",
        "chuunibyo_rebel",
        "risk_averse",
        "aggressive_explorer",
        "pragmatist",
        "skeptic",
        "long_termist",
        "cost_first",
        "ux_first",
        "custom",
      ])
      .optional(),
    template: z
      .enum([
        "balanced_standard",
        "supporter",
        "opposer",
        "objective_judge",
        "balanced_judge",
        "conservative_judge",
        "rigorous_judge",
        "pragmatic_judge",
        "risk_sensitive_judge",
        "evidence_first_judge",
        "philosopher_showman",
        "combative_troll",
        "nonsense_poet",
        "sarcastic_oracle",
        "chuunibyo_rebel",
        "risk_averse",
        "aggressive_explorer",
        "pragmatist",
        "skeptic",
        "long_termist",
        "cost_first",
        "ux_first",
        "custom",
      ])
      .optional(),
    personaDescription: z.string().optional(),
    templateDescription: z.string().optional(),
    includeInFinalSummary: z.boolean(),
  })
  .transform((value) => ({
    ...value,
    stance: value.stance ?? value.side ?? "free",
    persona:
      value.persona === "supporter" || value.persona === "opposer"
        ? "balanced_standard"
        : value.persona ?? value.template ?? "balanced_standard",
    personaDescription: value.personaDescription ?? value.templateDescription ?? "",
  }));

export const debateConfigSchema = z.object({
  locale: z.enum(["zh", "en"]),
  appMode: z.enum(["simple", "advanced"]),
  debateMode: z.enum(["multi_model", "single_model_personas"]),
  discussionPattern: z.enum(["structured_discussion", "judge_stop"]),
  discussionType: z.enum(["conclusion", "analysis", "research", "entertainment"]),
  outputLanguage: z.enum(["zh", "en"]),
  singleModelRoleCount: z.number().int().min(3).max(6),
  topic: z.string().min(6),
  rounds: z.number().int().min(1).max(8),
  stopThreshold: z.number().min(0.55).max(0.95),
  responseLength: z.enum(["concise", "balanced", "expansive"]),
  participants: z.array(participantSchema).min(1).max(8),
  moderatorId: z.string().optional(),
  judgeId: z.string().optional(),
  judgeInstruction: z.string().min(10),
  runtimeLimitSeconds: z.number().int().min(0).max(43200).optional(),
  search: z.object({
    enabled: z.boolean(),
    mode: z.enum(["off", "shared_once", "per_participant", "hybrid"]),
    continuePerRound: z.boolean(),
    tavilyApiKey: z.string().optional(),
  }),
});

const turnRequestSchema = z.object({
  config: debateConfigSchema,
  participantId: z.string().min(1),
  phase: z.enum(["opening", "response", "synthesis", "moderator", "score", "judge"]),
  round: z.number().int().min(1),
  transcript: z.array(
    z.object({
      id: z.string(),
      participantId: z.string(),
      speaker: z.string(),
      roleName: z.string(),
      phase: z.enum(["opening", "response", "synthesis", "moderator", "score", "judge", "user", "system"]),
      round: z.number().int(),
      currentPosition: z.enum(["support", "oppose", "neutral"]).optional(),
      keyReason: z.string(),
      evidence: z.string(),
      responseToOthers: z.string(),
      interimConclusion: z.string(),
      content: z.string(),
      searchSummary: z.string().optional(),
      searchFailed: z.boolean().optional(),
      citations: z
        .array(
          z.object({
            title: z.string(),
            url: z.string(),
            domain: z.string(),
            snippet: z.string().optional(),
          }),
        )
        .optional(),
      evaluation: z
        .object({
          supportWinRate: z.number(),
          opposeWinRate: z.number(),
          leadingSide: z.enum(["support", "oppose", "neutral"]),
          shouldStop: z.boolean(),
          rationale: z.string(),
        })
        .optional(),
    }),
  ),
  rollingSummary: z.string().optional(),
  sharedSearch: z
    .object({
      summary: z.string(),
      citations: z.array(
        z.object({
          title: z.string(),
          url: z.string(),
          domain: z.string(),
          snippet: z.string().optional(),
        }),
      ),
      contextBlock: z.string(),
      failed: z.boolean(),
      provider: z.enum(["tavily", "duckduckgo", "searxng", "none", "native"]).optional(),
      failureReason: z.string().optional(),
    })
    .nullable(),
});

const summarizeRequestSchema = z.object({
  config: debateConfigSchema,
  transcript: z.array(z.any()),
  rollingSummary: z.string().optional(),
});

const COMMON_RULES = [
  "Use real information. If uncertain, state uncertainty clearly.",
  "Keep the debate structured and evidence-oriented.",
  "Do not impersonate another participant.",
  "Separate facts, interpretation, and recommendations.",
];

function outputLanguageInstruction(language: DebateConfig["outputLanguage"]) {
  return language === "zh" ? "Write your answer in Simplified Chinese." : "Write your answer in English.";
}

function discussionTypeInstruction(config: DebateConfig) {
  switch (config.discussionType) {
    case "conclusion":
      return "The final goal is a clear recommendation when evidence is strong enough.";
    case "analysis":
      return "Do not force a single winner if different conditions lead to different best choices.";
    case "research":
      return "Prioritize verification, challenge assumptions, and avoid premature convergence.";
    case "entertainment":
      return "Prioritize entertaining rhetoric and dramatic contrast while keeping arguments coherent.";
    default:
      return "Keep the discussion coherent and evidence-oriented.";
  }
}

function getParticipant(config: DebateConfig, participantId: string) {
  const participant = config.participants.find((item) => item.id === participantId);
  if (!participant) {
    throw new Error("We could not find the requested participant.");
  }
  return participant;
}

function validateConfig(config: DebateConfig) {
  if (!config.participants.length) {
    throw new Error("Please add at least one model before starting.");
  }

  for (const participant of config.participants) {
    if (!participant.apiKey.trim()) {
      throw new Error(`Missing API key for ${participant.label}.`);
    }
  }
}

function responseLengthInstruction(mode: DebateConfig["responseLength"]) {
  switch (mode) {
    case "concise":
      return "Keep it concise. Aim for around 80-140 words.";
    case "expansive":
      return "You may elaborate with richer details, but avoid repetition.";
    default:
      return "Keep it balanced. Aim for around 140-220 words.";
  }
}

function buildTranscriptSnippet(transcript: DebateTurn[]) {
  return transcript
    .slice(-8)
    .map(
      (turn) =>
        `[Round ${turn.round}][${turn.phase}] ${turn.speaker} (${turn.roleName})\n` +
        `Stance: ${turn.currentPosition ?? "neutral"}\n` +
        `${turn.content}`,
    )
    .join("\n\n");
}

function detectResearchCounterpoint(config: DebateConfig, participant: ParticipantConfig, transcript: DebateTurn[]) {
  if (config.discussionType !== "research" || !transcript.length) return "";

  const latestRound = Math.max(...transcript.map((turn) => turn.round));
  const latestTurns = transcript.filter(
    (turn) =>
      turn.round === latestRound &&
      (turn.phase === "opening" || turn.phase === "response") &&
      turn.currentPosition &&
      turn.participantId !== "user",
  );

  if (latestTurns.length < 2) return "";
  const positions = [...new Set(latestTurns.map((turn) => turn.currentPosition))];
  if (positions.length !== 1 || positions[0] === "neutral") return "";

  const triggerParticipantId = latestTurns[0]?.participantId;
  if (participant.id !== triggerParticipantId) return "";

  return positions[0] === "support"
    ? "Research-mode challenge: the group is converging too quickly on a supportive direction. In this round, you must lead the strongest counterargument against that consensus."
    : "Research-mode challenge: the group is converging too quickly on an opposing direction. In this round, you must lead the strongest counterargument against that consensus.";
}

function buildPersonaPrompt(config: DebateConfig, participant: ParticipantConfig) {
  const preset = getPersonaPreset(participant.persona);
  if (participant.persona === "custom") {
    return participant.personaDescription.trim() || preset?.prompt[config.locale] || "";
  }

  return preset?.prompt[config.locale] ?? "";
}

function participantSystemPrompt(config: DebateConfig, participant: ParticipantConfig, searchEvidence: SearchEvidence | null) {
  const stanceInstruction =
    config.discussionType === "research"
      ? "Research stance rule: do not lock into one side too early. Update your stance according to evidence."
      : config.discussionType === "entertainment"
        ? participant.stance === "free"
          ? "Entertainment stance rule: keep a clear dramatic viewpoint in this turn."
          : `Entertainment stance rule: stay on ${sideLabel(participant.stance, config.locale)} for this run.`
        : `Current stance: ${sideLabel(participant.stance, config.locale)}. Keep it consistent.`;

  return [
    `You are ${participant.label}.`,
    `Role: ${participant.roleName}.`,
    stanceInstruction,
    `Persona guidance:\n${buildPersonaPrompt(config, participant)}`,
    outputLanguageInstruction(config.outputLanguage),
    discussionTypeInstruction(config),
    responseLengthInstruction(config.responseLength),
    ...COMMON_RULES,
    participant.systemPrompt?.trim() || "",
    searchEvidence
      ? searchEvidence.failed
        ? "Web search was unavailable this round. Be transparent that you may rely on prior model knowledge."
        : `Search evidence for this round:\n${searchEvidence.contextBlock}`
      : "",
    "If any search material is in another language, rewrite it in the requested output language instead of copying it verbatim.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function participantUserPrompt(
  config: DebateConfig,
  participant: ParticipantConfig,
  phase: DebatePhase,
  round: number,
  transcript: DebateTurn[],
  rollingSummary?: string,
) {
  return [
    `Question: ${config.topic}`,
    `Discussion mode: ${config.debateMode}`,
    `Discussion type: ${config.discussionType}`,
    outputLanguageInstruction(config.outputLanguage),
    `Current phase: ${phase}`,
    `Round: ${round}`,
    detectResearchCounterpoint(config, participant, transcript),
    rollingSummary?.trim() ? `Earlier summary:\n${rollingSummary.trim()}` : "",
    transcript.length ? `Recent discussion:\n${buildTranscriptSnippet(transcript)}` : "There is no previous discussion yet.",
    "Write in natural paragraphs. Do not output raw JSON, protocol text, or field labels.",
    "Your paragraph should naturally include: your stance, key reason, evidence, response to others, and interim conclusion.",
    "Do not copy shared search notes line for line. Absorb them, then answer naturally in the requested output language.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function moderatorSystemPrompt(config: DebateConfig, participant: ParticipantConfig) {
  return [
    "You are the neutral moderator. You never choose sides.",
    `Moderator persona guidance:\n${buildPersonaPrompt(config, participant)}`,
    outputLanguageInstruction(config.outputLanguage),
    participant.systemPrompt?.trim() || "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function moderatorPrompt(config: DebateConfig, transcript: DebateTurn[], rollingSummary?: string) {
  return [
    `Question: ${config.topic}`,
    "Your job is to keep the debate factual, on-topic, and role-consistent.",
    outputLanguageInstruction(config.outputLanguage),
    discussionTypeInstruction(config),
    rollingSummary?.trim() ? `Earlier summary:\n${rollingSummary.trim()}` : "",
    `Recent discussion:\n${buildTranscriptSnippet(transcript)}`,
    "Reply in short natural text. Do not output raw JSON, protocol text, or field labels.",
    "If search evidence is in another language, summarize it in the requested output language.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function scorePrompt(config: DebateConfig, transcript: DebateTurn[], rollingSummary?: string, searchEvidence?: SearchEvidence | null) {
  return [
    `Question: ${config.topic}`,
    `Judge instruction: ${config.judgeInstruction}`,
    `Discussion type: ${config.discussionType}`,
    outputLanguageInstruction(config.outputLanguage),
    `Stop threshold: ${Math.round(config.stopThreshold * 100)}%`,
    searchEvidence
      ? searchEvidence.failed
        ? "Fresh web search was unavailable this round."
        : `Search evidence:\n${searchEvidence.contextBlock}`
      : "",
    rollingSummary?.trim() ? `Earlier summary:\n${rollingSummary.trim()}` : "",
    `Recent discussion:\n${buildTranscriptSnippet(transcript)}`,
    "Reply in natural text.",
    "You must clearly state support win rate and oppose win rate as percentages, then briefly explain why.",
    "Do not output raw JSON, protocol text, or developer-oriented field labels.",
    "If search evidence is in another language, summarize it in the requested output language.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function judgePrompt(config: DebateConfig, transcript: DebateTurn[], rollingSummary?: string) {
  const summaryGuidance = buildSummaryGuidance(config);
  const outcomeInstruction =
    config.discussionType === "conclusion"
      ? "Provide a practical final recommendation if evidence is strong enough."
      : config.discussionType === "analysis"
        ? "Do not force one winner. Preserve trade-offs and explain scenario-dependent choices."
        : config.discussionType === "entertainment"
          ? "Prioritize memorable rhetorical moments and style contrasts, then add a light practical takeaway."
          : "Prioritize verification quality, challenge handling, and unresolved uncertainty.";

  return [
    `Question: ${config.topic}`,
    `Judge instruction: ${config.judgeInstruction}`,
    `Discussion type: ${config.discussionType}`,
    outputLanguageInstruction(config.outputLanguage),
    outcomeInstruction,
    summaryGuidance.instructions,
    rollingSummary?.trim() ? `Earlier summary:\n${rollingSummary.trim()}` : "",
    `Full discussion:\n${buildTranscriptSnippet(transcript)}`,
    "Write a readable final summary in natural paragraphs.",
    "Include a concise conclusion, a fuller explanation, any remaining uncertainty, and guidance on how the user should interpret disagreement.",
    "Do not output raw JSON, protocol text, or developer-oriented field labels.",
    "If earlier evidence is in another language, summarize it in the requested output language.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function normalizeParticipantTurn(
  config: DebateConfig,
  participant: ParticipantConfig,
  phase: DebatePhase,
  round: number,
  rawText: string,
  citations: SearchEvidence["citations"],
  searchEvidence: SearchEvidence | null,
): DebateTurn {
  const fallbackPosition = participant.stance === "free" ? "neutral" : participant.stance;
  const normalized = normalizeReadableDebaterTurn(rawText, fallbackPosition, config.outputLanguage);

  return {
    id: crypto.randomUUID(),
    participantId: participant.id,
    speaker: participant.label,
    roleName: participant.roleName,
    phase,
    round,
    currentPosition: normalized.currentPosition,
    keyReason: normalized.keyReason,
    evidence: normalized.evidence,
    responseToOthers: normalized.responseToOthers,
    interimConclusion: normalized.interimConclusion,
    content: normalized.content,
    citations,
    searchSummary: searchEvidence?.failed
      ? buildSearchFailureMessage(config.locale, participant, searchEvidence.failureReason)
      : searchEvidence?.summary,
    searchFailed: searchEvidence?.failed,
  };
}

function normalizeEvaluation(rawText: string, threshold: number): RoundEvaluation {
  const parsed =
    tryParseJsonLike<{
      supportWinRate?: number;
      opposeWinRate?: number;
      leadingSide?: "support" | "oppose" | "neutral";
      shouldStop?: boolean;
      rationale?: string;
    }>(rawText) ?? {};

  const clean = sanitizeModelText(rawText);
  const percentageMatches = [...clean.matchAll(/(\d{1,3})\s*%/g)].map((match) => Number(match[1]));
  let supportWinRate = Math.round(parsed.supportWinRate ?? percentageMatches[0] ?? 50);
  let opposeWinRate = Math.round(parsed.opposeWinRate ?? percentageMatches[1] ?? 50);

  const total = supportWinRate + opposeWinRate;
  if (total !== 100) {
    supportWinRate = Math.round((supportWinRate / (total || 100)) * 100);
    opposeWinRate = 100 - supportWinRate;
  }

  const leadingSide =
    parsed.leadingSide ?? (supportWinRate === opposeWinRate ? "neutral" : supportWinRate > opposeWinRate ? "support" : "oppose");

  return {
    supportWinRate: Math.max(0, Math.min(100, supportWinRate)),
    opposeWinRate: Math.max(0, Math.min(100, opposeWinRate)),
    leadingSide,
    shouldStop: Boolean(parsed.shouldStop) || Math.max(supportWinRate, opposeWinRate) >= Math.round(threshold * 100),
    rationale: parsed.rationale?.trim() || "The judge estimated current win rates from evidence quality, rebuttal strength, and discussion consistency.",
  };
}

function normalizeFinalReport(rawText: string, locale: DebateConfig["outputLanguage"]): FinalReport {
  const parsed = tryParseJsonLike<FinalReport>(rawText);
  if (parsed) {
    return {
      ...parsed,
      rawText: renderJsonLikeText(rawText, locale),
    };
  }

  return normalizeFreeTextFinalReport(rawText);
}

function buildSearchQuery(config: DebateConfig, participant: ParticipantConfig, transcript: DebateTurn[], rollingSummary?: string) {
  return [
    config.topic,
    `Participant role: ${participant.roleName}`,
    rollingSummary?.trim() ? `Earlier summary:\n${rollingSummary.trim()}` : "",
    transcript.length ? `Recent discussion:\n${buildTranscriptSnippet(transcript)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function mergeSearchEvidence(base: SearchEvidence | null, supplement: SearchEvidence): SearchEvidence {
  if (!base || base.failed) return supplement;
  if (supplement.failed) return base;

  const citations = [...base.citations, ...supplement.citations].filter(
    (citation, index, array) => array.findIndex((item) => item.url === citation.url) === index,
  );

  return {
    summary: `${base.summary}\n${supplement.summary}`.trim(),
    citations,
    contextBlock: [base.contextBlock, supplement.contextBlock].filter(Boolean).join("\n\n"),
    failed: false,
    provider: supplement.provider ?? base.provider,
  };
}

async function resolveSearchEvidence(
  config: DebateConfig,
  participant: ParticipantConfig,
  transcript: DebateTurn[],
  rollingSummary: string | undefined,
  sharedSearch: SearchEvidence | null,
) {
  if (!config.search.enabled || config.search.mode === "off" || !participant.enableSearch) {
    return null;
  }

  const supportsNativeSearch = providerCanUseNativeSearch(participant);
  const query = buildSearchQuery(config, participant, transcript, rollingSummary);

  if (config.search.mode === "shared_once") {
    if (!config.search.continuePerRound) return sharedSearch;
    if (supportsNativeSearch) return sharedSearch;
    const supplement = await performSearch(query, config.search.tavilyApiKey, config.topic);
    return mergeSearchEvidence(sharedSearch, supplement);
  }

  if (config.search.mode === "per_participant") {
    if (supportsNativeSearch) return null;
    return performSearch(query, config.search.tavilyApiKey, config.topic);
  }

  if (config.search.mode === "hybrid") {
    if (supportsNativeSearch) return sharedSearch;
    const independent = await performSearch(query, config.search.tavilyApiKey, config.topic);
    return mergeSearchEvidence(sharedSearch, independent);
  }

  return null;
}

export async function prepareDebate(raw: unknown) {
  const { config } = z.object({ config: debateConfigSchema }).parse(raw);
  validateConfig(config);

  const sharedSearch = config.search.enabled && shouldCreateSharedSearch(config.search.mode)
    ? await performSearch(config.topic, config.search.tavilyApiKey, config.topic)
    : null;

  return {
    config,
    sharedSearch,
  };
}

export async function generateTurn(raw: unknown): Promise<TurnResponse> {
  const input = turnRequestSchema.parse(raw);
  validateConfig(input.config);
  const participant = getParticipant(input.config, input.participantId);

  if (input.phase === "moderator") {
    const result = await callProvider(
      participant,
      [
        { role: "system", content: moderatorSystemPrompt(input.config, participant) },
        { role: "user", content: moderatorPrompt(input.config, input.transcript, input.rollingSummary) },
      ],
      false,
      false,
    );

    const parsed = parseStructuredTurnText(result.text);
    const moderatorMessage =
      parsed.message?.trim() || renderJsonLikeText(result.text, input.config.outputLanguage) || buildModeratorFallback(input.config.locale);

    return {
      turn: {
        id: crypto.randomUUID(),
        participantId: participant.id,
        speaker: participant.label,
        roleName: participant.roleName,
        phase: "moderator",
        round: input.round,
        keyReason: input.config.locale === "zh" ? "主持检查" : "Moderator checkpoint",
        evidence:
          input.config.locale === "zh"
            ? "主持人检查讨论是否跑题、失真或角色错位。"
            : "The moderator checks topic focus, factual quality, and role consistency.",
        responseToOthers: moderatorMessage,
        interimConclusion: moderatorMessage,
        content: moderatorMessage,
        currentPosition: "neutral",
      },
    };
  }

  if (input.phase === "score") {
    const searchEvidence = await resolveSearchEvidence(input.config, participant, input.transcript, input.rollingSummary, input.sharedSearch);
    const nativeSearchForScore =
      (shouldUseNativeSearch(
        input.config.search.mode,
        providerCanUseNativeSearch(participant),
        input.config.search.enabled,
        input.config.search.continuePerRound,
      )) &&
      !searchEvidence?.failed &&
      (input.config.search.mode === "hybrid" || !searchEvidence);

    const result = await callProvider(
      participant,
      [
        { role: "system", content: moderatorSystemPrompt(input.config, participant) },
        { role: "user", content: scorePrompt(input.config, input.transcript, input.rollingSummary, searchEvidence) },
      ],
      Boolean(nativeSearchForScore),
      false,
    );

    const evaluation = normalizeEvaluation(result.text, input.config.stopThreshold);

    return {
      turn: {
        id: crypto.randomUUID(),
        participantId: participant.id,
        speaker: participant.label,
        roleName: participant.roleName,
        phase: "score",
        round: input.round,
        keyReason: input.config.locale === "zh" ? "裁判评估" : "Judge evaluation",
        evidence: searchEvidence?.failed
          ? buildSearchFailureMessage(input.config.locale, participant, searchEvidence.failureReason)
          : input.config.locale === "zh"
            ? "基于当前讨论与可用证据进行判断。"
            : "Judged from the transcript and available evidence.",
        responseToOthers: evaluation.rationale,
        interimConclusion: evaluation.rationale,
        content: sanitizeModelText(result.text) || evaluation.rationale,
        currentPosition: "neutral",
        citations: result.citations.length ? result.citations : searchEvidence?.citations,
        searchSummary: searchEvidence?.failed ? buildSearchFailureMessage(input.config.locale, participant, searchEvidence.failureReason) : searchEvidence?.summary,
        searchFailed: searchEvidence?.failed,
        evaluation,
      },
      evaluation,
    };
  }

  if (input.phase === "judge") {
    const result = await callProvider(
      participant,
      [
        { role: "system", content: moderatorSystemPrompt(input.config, participant) },
        { role: "user", content: judgePrompt(input.config, input.transcript, input.rollingSummary) },
      ],
      false,
      false,
    );

    const report = normalizeFinalReport(result.text, input.config.outputLanguage);

    return {
      turn: {
        id: crypto.randomUUID(),
        participantId: participant.id,
        speaker: participant.label,
        roleName: participant.roleName,
        phase: "judge",
        round: input.round,
        keyReason: report.shortConclusion,
        evidence: report.uncertainty,
        responseToOthers: report.howToReadDisagreement,
        interimConclusion: report.detailedConclusion,
        content: buildJudgeReadableSummary(input.config.locale, report),
        currentPosition: "neutral",
      },
    };
  }

  const searchEvidence = await resolveSearchEvidence(input.config, participant, input.transcript, input.rollingSummary, input.sharedSearch);
  const nativeSearch =
    (shouldUseNativeSearch(
      input.config.search.mode,
      providerCanUseNativeSearch(participant),
      input.config.search.enabled,
      input.config.search.continuePerRound,
    )) &&
    participant.enableSearch &&
    !searchEvidence?.failed &&
    (input.config.search.mode === "hybrid" || !searchEvidence);

  const result = await callProvider(
    participant,
    [
      { role: "system", content: participantSystemPrompt(input.config, participant, searchEvidence) },
      { role: "user", content: participantUserPrompt(input.config, participant, input.phase, input.round, input.transcript, input.rollingSummary) },
    ],
    nativeSearch,
    false,
  );

  return {
    turn: normalizeParticipantTurn(
      input.config,
      participant,
      input.phase,
      input.round,
      result.text,
      result.citations.length ? result.citations : searchEvidence?.citations ?? [],
      searchEvidence,
    ),
  };
}

export async function summarizeDebate(raw: unknown) {
  const input = summarizeRequestSchema.parse(raw);
  validateConfig(input.config);

  const judge = getParticipant(input.config, input.config.judgeId || input.config.participants[0].id);
  const transcript = input.transcript.slice(0, Math.max(0, input.transcript.length - 6)) as DebateTurn[];

  if (!transcript.length) {
    return {
      summary: input.rollingSummary?.trim() || "",
    };
  }

  const result = await callProvider(
    judge,
    [
      {
        role: "system",
        content: `Summarize earlier discussion into a short rolling brief. Keep key facts, disagreements, and major updates.\n\n${outputLanguageInstruction(input.config.outputLanguage)}`,
      },
      {
        role: "user",
        content: [
          input.rollingSummary?.trim() ? `Existing summary:\n${input.rollingSummary.trim()}` : "",
          `Earlier transcript:\n${buildTranscriptSnippet(transcript)}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    false,
    false,
  );

  return {
    summary: sanitizeModelText(result.text),
  };
}

