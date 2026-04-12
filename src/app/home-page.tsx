"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { APP_COPY, buildHelpSnapshot, buildProviderSnapshot, t } from "@/lib/i18n";
import { createDefaultConfig, createStarterSingleModelSetup, STORAGE_KEY } from "@/lib/default-config";
import {
  ENTERTAINMENT_PERSONA_IDS,
  JUDGE_PERSONA_IDS,
  STANDARD_DEBATER_PERSONA_IDS,
  getPersonaPreset,
} from "@/lib/persona-presets";
import { describeModelVariant, getModelPresets } from "@/lib/model-presets";
import { createParticipant, PROVIDER_CATALOG, stanceLabel } from "@/lib/provider-catalog";
import type {
  DebateConfig,
  DebateStance,
  DebateTurn,
  FailedAction,
  Locale,
  ParticipantConfig,
  ProviderKind,
  RoundEvaluation,
  RunStage,
  RunStatus,
  SearchEvidence,
} from "@/types/debate";

type ReadingTheme = "warm-light" | "soft-dark" | "graphite" | "paper";
type ToggleOption<T extends string> = { value: T; label: string };
type ProviderConnection = {
  apiKey: string;
  baseUrl: string;
};

type ProviderConnectionMap = Record<ProviderKind, ProviderConnection>;

type AppStorage = {
  config?: DebateConfig;
  theme?: "light" | "dark";
  locale?: Locale;
  providerConnections?: ProviderConnectionMap;
};

const providerKinds = Object.keys(PROVIDER_CATALOG) as ProviderKind[];
const simplePersonaAllowList = ["balanced_standard", "pragmatist", "skeptic", "risk_averse"] as const;

function text(locale: Locale, zh: string, en: string) {
  return locale === "zh" ? zh : en;
}

function createDefaultProviderConnections(): ProviderConnectionMap {
  return providerKinds.reduce(
    (accumulator, kind) => {
      accumulator[kind] = {
        apiKey: "",
        baseUrl: PROVIDER_CATALOG[kind].defaultBaseUrl,
      };
      return accumulator;
    },
    {} as ProviderConnectionMap,
  );
}

function normalizeAsciiPunctuation(value: string) {
  return value
    .replace(/：/g, ":")
    .replace(/／/g, "/")
    .replace(/．/g, ".")
    .replace(/，/g, ",")
    .replace(/　/g, " ");
}

function sanitizeApiKeyInput(value: string) {
  return normalizeAsciiPunctuation(value)
    .trim()
    .replace(/^api(?:\s|-|_)?key\s*[:：]\s*/i, "")
    .replace(/^bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function sanitizeBaseUrlInput(value: string, provider: ProviderKind, allowEmpty = true) {
  const normalized = normalizeAsciiPunctuation(value)
    .trim()
    .replace(/^base\s*url\s*[:：]\s*/i, "");

  if (!normalized) {
    return allowEmpty ? "" : PROVIDER_CATALOG[provider].defaultBaseUrl;
  }

  try {
    return new URL(normalized).toString();
  } catch {
    return normalized;
  }
}

function roleNameForParticipant(stance: DebateStance, locale: Locale, isJudge = false) {
  if (isJudge) return text(locale, "裁判", "Judge");
  if (stance === "free") return text(locale, "自由立场", "Free stance");
  return stanceLabel(stance, locale);
}

function normalizeParticipantConfig(participant: ParticipantConfig, locale?: Locale): ParticipantConfig {
  const nextPersona =
    participant.persona === "supporter" ||
    participant.persona === "opposer" ||
    participant.template === "supporter" ||
    participant.template === "opposer"
      ? "balanced_standard"
      : participant.persona === "balanced_judge" || participant.template === "balanced_judge"
        ? "objective_judge"
        : participant.persona ?? participant.template ?? "balanced_standard";

  return {
    ...participant,
    stance: participant.stance ?? participant.side ?? "free",
    persona: nextPersona,
    roleName:
      locale == null
        ? participant.roleName
        : roleNameForParticipant(participant.stance ?? participant.side ?? "free", locale, JUDGE_PERSONA_IDS.includes(nextPersona)),
    personaDescription:
      participant.personaDescription ??
      participant.templateDescription ??
      getPersonaPreset(nextPersona)?.prompt.zh ??
      "",
  };
}

function buildPersonaDescription(persona: ParticipantConfig["persona"], locale: Locale, existing?: string) {
  if (persona === "custom") {
    return existing ?? "";
  }

  return getPersonaPreset(persona)?.prompt[locale] ?? "";
}

function migrateConfig(config: DebateConfig): DebateConfig {
  return {
    ...config,
    participants: config.participants.map((participant) => normalizeParticipantConfig(participant, config.locale)),
  };
}

function resolveParticipantConnection(
  participant: ParticipantConfig,
  providerConnections: ProviderConnectionMap,
): ParticipantConfig {
  const providerConnection = providerConnections[participant.provider];
  return {
    ...participant,
    apiKey: sanitizeApiKeyInput(providerConnection?.apiKey ?? ""),
    baseUrl: sanitizeBaseUrlInput(providerConnection?.baseUrl ?? "", participant.provider, false),
  };
}

function resolveConfigForRun(config: DebateConfig, providerConnections: ProviderConnectionMap): DebateConfig {
  return {
    ...config,
    participants: config.participants.map((participant) => resolveParticipantConnection(participant, providerConnections)),
  };
}

function requiredProvidersForConfig(config: DebateConfig) {
  return [...new Set(config.participants.map((participant) => participant.provider))];
}

function ToggleGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<ToggleOption<T>>;
}) {
  return (
    <div className="switch-group" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`switch-option ${value === option.value ? "switch-option-active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  full = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <label className={full ? "full-field" : "field"}>
      <span>
        <strong>{label}</strong>
      </span>
      {hint ? <span className="field-hint">{hint}</span> : null}
      {children}
    </label>
  );
}

function chartPath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function statusLabel(status: RunStatus, locale: Locale) {
  const labels: Record<RunStatus, Record<Locale, string>> = {
    idle: { zh: "未开始", en: "Idle" },
    running: { zh: "进行中", en: "Running" },
    paused: { zh: "已暂停", en: "Paused" },
    completed: { zh: "已完成", en: "Completed" },
  };
  return labels[status][locale];
}

function stageLabel(stage: RunStage, locale: Locale) {
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

function TurnBody({ turn }: { turn: DebateTurn }) {
  return (
    <div className="markdown-copy">
      <ReactMarkdown>{turn.content}</ReactMarkdown>
    </div>
  );
}

function TrendChart({
  evaluations,
  enabled,
  locale,
}: {
  evaluations: RoundEvaluation[];
  enabled: boolean;
  locale: Locale;
}) {
  if (!enabled) return null;
  if (!evaluations.length) {
    return (
      <div className="chart-card">
        <strong>{text(locale, "动态胜率会显示在这里", "Dynamic win-rate trend appears here")}</strong>
        <p>{text(locale, "只有在动态停止模式真正运行后，裁判才会在每次辩手发言后更新曲线。", "The curve updates after each debater speech once dynamic-stop mode is running.")}</p>
      </div>
    );
  }

  const width = 520;
  const height = 200;
  const padding = 28;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const supportPoints = evaluations.map((item, index) => ({
    x: padding + (evaluations.length === 1 ? usableWidth / 2 : (usableWidth / (evaluations.length - 1)) * index),
    y: padding + usableHeight - (item.supportWinRate / 100) * usableHeight,
  }));
  const opposePoints = evaluations.map((item, index) => ({
    x: padding + (evaluations.length === 1 ? usableWidth / 2 : (usableWidth / (evaluations.length - 1)) * index),
    y: padding + usableHeight - (item.opposeWinRate / 100) * usableHeight,
  }));

  return (
    <div className="chart-card">
      <div className="chart-head">
        <strong>{text(locale, "动态胜率走势", "Dynamic win-rate trend")}</strong>
        <p>{text(locale, "系统会在每次辩手发言后重新估算当前哪一方更占优势。", "After each debater speech, the system re-estimates which side currently has the edge.")}</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart" aria-label="win rate chart">
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = padding + usableHeight - (tick / 100) * usableHeight;
          return (
            <g key={tick}>
              <line x1={padding} x2={width - padding} y1={y} y2={y} className="chart-grid" />
              <text x={0} y={y + 4} className="chart-label">
                {tick}%
              </text>
            </g>
          );
        })}
        <path d={chartPath(supportPoints)} className="chart-line chart-line-support" />
        <path d={chartPath(opposePoints)} className="chart-line chart-line-oppose" />
      </svg>
    </div>
  );
}

function buildSingleParticipants(
  locale: Locale,
  provider: ProviderKind,
  roleCount: number,
  shared?: Partial<ParticipantConfig>,
  existing: ParticipantConfig[] = [],
) {
  const generated = createStarterSingleModelSetup(locale, provider, Math.max(2, roleCount - 1));
  const base = normalizeParticipantConfig((shared as ParticipantConfig) ?? existing[0] ?? createParticipant(provider, 0, locale), locale);
  const providerLabel = PROVIDER_CATALOG[provider].label[locale];
  return generated.map((generatedRole, index) => {
    const current = existing[index] ? normalizeParticipantConfig(existing[index], locale) : undefined;
    const isJudge = index === generated.length - 1;
    const fallbackPersona = isJudge ? "objective_judge" : index === 0 ? "balanced_standard" : generatedRole.persona;
    const persona = current?.persona ?? fallbackPersona;
    const safePersona = isJudge
      ? JUDGE_PERSONA_IDS.includes(persona)
        ? persona
        : "objective_judge"
      : persona;
    const personaPreset = getPersonaPreset(safePersona);

    return {
      ...generatedRole,
      id: current?.id ?? generatedRole.id,
      provider: base.provider ?? provider,
      model: base.model ?? generatedRole.model,
      apiKey: base.apiKey ?? "",
      baseUrl: base.baseUrl ?? generatedRole.baseUrl,
      enableSearch: current?.enableSearch ?? base.enableSearch ?? true,
      includeInFinalSummary: isJudge ? true : current?.includeInFinalSummary ?? true,
      label: isJudge ? text(locale, "中立裁判", "Neutral judge") : `${providerLabel} ${index + 1}`,
      roleName: roleNameForParticipant(
        isJudge
          ? "neutral"
          : current?.stance === "neutral"
            ? generatedRole.stance
            : current?.stance ?? generatedRole.stance,
        locale,
        isJudge,
      ),
      stance:
        isJudge
          ? "neutral"
          : current?.stance === "neutral"
            ? generatedRole.stance
            : current?.stance ?? generatedRole.stance,
      persona: safePersona,
      personaDescription: current?.personaDescription ?? personaPreset?.prompt[locale] ?? generatedRole.personaDescription,
      systemPrompt: current?.systemPrompt ?? "",
    } satisfies ParticipantConfig;
  });
}

function getDebaterPersonaOptions(config: DebateConfig) {
  if (config.discussionType === "entertainment") return ENTERTAINMENT_PERSONA_IDS;
  const standard = STANDARD_DEBATER_PERSONA_IDS;
  if (config.appMode === "simple") {
    return standard.filter((id) => simplePersonaAllowList.includes(id as (typeof simplePersonaAllowList)[number]));
  }
  return standard;
}

function applyConfigConstraints(config: DebateConfig, locale: Locale): DebateConfig {
  let next = migrateConfig({ ...config, locale });

  if (next.appMode === "simple") {
    next = {
      ...next,
      debateMode: "single_model_personas",
      singleModelRoleCount: 3,
      discussionPattern: "structured_discussion",
    };
  }

  if (next.discussionType === "research") {
    next = {
      ...next,
      search: {
        ...next.search,
        enabled: true,
        mode: next.search.mode === "off" ? "hybrid" : next.search.mode,
        continuePerRound: true,
      },
    };
  }

  if (next.discussionType === "entertainment") {
    next = {
      ...next,
    };
  }

  if (next.debateMode === "single_model_personas") {
    if (next.participants.length) {
      const provider = next.participants[0]?.provider ?? "openai";
      next = {
        ...next,
        participants: buildSingleParticipants(locale, provider, next.singleModelRoleCount, next.participants[0], next.participants),
      };
    }
  } else if (next.participants.length >= 1) {
    const normalized = next.participants.map((participant) => normalizeParticipantConfig(participant, locale));
    const existingJudge = normalized.findLast((participant) => JUDGE_PERSONA_IDS.includes(participant.persona));
    const judge: ParticipantConfig =
      existingJudge ??
      {
        ...createParticipant(normalized[0].provider, normalized.length, locale),
        label: text(locale, "中立裁判", "Neutral judge"),
        roleName: text(locale, "裁判", "Judge"),
        stance: "neutral",
        persona: "objective_judge",
        personaDescription: getPersonaPreset("objective_judge")?.prompt[locale] ?? "",
        apiKey: normalized[0].apiKey,
        model: normalized[0].model,
        baseUrl: normalized[0].baseUrl,
        includeInFinalSummary: true,
      };

    const debaters = normalized
      .filter((participant) => participant.id !== existingJudge?.id)
      .map((participant, index) => ({
        ...participant,
        stance:
          next.discussionType === "research"
            ? "free"
            : participant.stance === "neutral"
              ? index % 2 === 0
                ? "support"
                : "oppose"
              : participant.stance,
        persona: JUDGE_PERSONA_IDS.includes(participant.persona) ? "balanced_standard" : participant.persona,
        roleName: roleNameForParticipant(
          next.discussionType === "research"
            ? "free"
            : participant.stance === "neutral"
              ? index % 2 === 0
                ? "support"
                : "oppose"
              : participant.stance,
          locale,
        ),
      }));

    next = {
      ...next,
      participants: [
        ...debaters,
        {
          ...judge,
          stance: "neutral",
          roleName: roleNameForParticipant("neutral", locale, true),
          includeInFinalSummary: true,
        },
      ],
    };
  }

  next = {
    ...next,
    judgeId: next.participants[next.participants.length - 1]?.id,
    moderatorId: next.participants[next.participants.length - 1]?.id,
  };

  return next;
}

function buildCsv(transcript: DebateTurn[]) {
  return [
    ["round", "phase", "speaker", "role", "position", "reason", "evidence", "response", "conclusion"].join(","),
    ...transcript.map((turn) =>
      [
        turn.round,
        turn.phase,
        `"${turn.speaker}"`,
        `"${turn.roleName}"`,
        `"${turn.currentPosition ?? ""}"`,
        `"${turn.keyReason.replaceAll('"', '""')}"`,
        `"${turn.evidence.replaceAll('"', '""')}"`,
        `"${turn.responseToOthers.replaceAll('"', '""')}"`,
        `"${turn.interimConclusion.replaceAll('"', '""')}"`,
      ].join(","),
    ),
  ].join("\n");
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function HomePage() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [draftConfig, setDraftConfig] = useState<DebateConfig>(() => createDefaultConfig("zh", "simple"));
  const [providerConnections, setProviderConnections] = useState<ProviderConnectionMap>(() => createDefaultProviderConnections());
  const [sessionConfig, setSessionConfig] = useState<DebateConfig | null>(null);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [stage, setStage] = useState<RunStage>("opening");
  const [round, setRound] = useState(1);
  const [speakerIndex, setSpeakerIndex] = useState(0);
  const [transcript, setTranscript] = useState<DebateTurn[]>([]);
  const [sharedSearch, setSharedSearch] = useState<SearchEvidence | null>(null);
  const [rollingSummary, setRollingSummary] = useState("");
  const [summarizedTurnCount, setSummarizedTurnCount] = useState(0);
  const [error, setError] = useState("");
  const [loadingLabel, setLoadingLabel] = useState("");
  const [failedAction, setFailedAction] = useState<FailedAction | null>(null);
  const [draftUserMessage, setDraftUserMessage] = useState("");
  const [runningSince, setRunningSince] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  const [readingTheme, setReadingTheme] = useState<ReadingTheme>("soft-dark");
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.7);
  const [paragraphGap, setParagraphGap] = useState(18);
  const [textWidth, setTextWidth] = useState(74);

  const processingRef = useRef(false);
  const requestAbortRef = useRef<AbortController | null>(null);

  const activeConfig = useMemo(() => applyConfigConstraints(draftConfig, locale), [draftConfig, locale]);
  const helpSections = useMemo(() => buildHelpSnapshot(locale), [locale]);
  const providerHelp = useMemo(() => buildProviderSnapshot(locale), [locale]);
  const singleApiMode = activeConfig.debateMode === "single_model_personas";
  const configurableProviders = activeConfig.appMode === "simple" ? providerKinds.filter((kind) => kind !== "custom") : providerKinds;
  const judge = activeConfig.participants.at(-1);
  const debaters = activeConfig.participants.slice(0, Math.max(0, activeConfig.participants.length - 1));
  const evaluations = useMemo(() => transcript.flatMap((turn) => (turn.evaluation ? [turn.evaluation] : [])), [transcript]);
  const visibleSearchSummaryTurnIds = useMemo(() => {
    const seen = new Set<string>();
    return new Set(
      transcript.flatMap((turn) => {
        const summary = turn.searchSummary?.trim();
        if (!summary) return [];
        if (turn.searchFailed || !seen.has(summary)) {
          seen.add(summary);
          return [turn.id];
        }
        return [];
      }),
    );
  }, [transcript]);

  const showExternalSearchField =
    activeConfig.search.enabled &&
    activeConfig.search.mode !== "off" &&
    activeConfig.participants.some((participant) => participant.provider === "deepseek");

  const readerStyle = useMemo<CSSProperties>(
    () =>
      ({
        "--reader-font-size": `${fontSize}px`,
        "--reader-line-height": String(lineHeight),
        "--reader-paragraph-gap": `${paragraphGap}px`,
        "--reader-width": `${textWidth}ch`,
      }) as CSSProperties,
    [fontSize, lineHeight, paragraphGap, textWidth],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as AppStorage;
      if (parsed.config) setDraftConfig(migrateConfig(parsed.config));
      if (parsed.theme) setTheme(parsed.theme);
      if (parsed.locale) setLocale(parsed.locale);
      if (parsed.providerConnections) {
        setProviderConnections({
          ...createDefaultProviderConnections(),
          ...parsed.providerConnections,
        });
      }
    } catch {
      // ignore corrupted local state
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ config: draftConfig, theme, locale, providerConnections } satisfies AppStorage),
    );
  }, [draftConfig, theme, locale, providerConnections]);

  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      const nextElapsed = runningSince ? now - runningSince : elapsedMs + 1000;
      setElapsedMs(nextElapsed);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [status, runningSince, elapsedMs]);

  async function apiPost(payload: unknown) {
    const controller = new AbortController();
    requestAbortRef.current = controller;

    try {
      const response = await fetch("/api/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      let json: unknown = null;
      try {
        json = await response.json();
      } catch {
        json = null;
      }

      if (!response.ok) {
        const message =
          typeof json === "object" && json && "error" in json && typeof (json as { error?: unknown }).error === "string"
            ? (json as { error: string }).error
            : text(locale, "请求失败，请检查 API 设置或网络状态。", "Request failed. Please check your API settings or network.");
        throw new Error(message);
      }

      return json;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      throw new Error(
        error instanceof Error
          ? error.message
          : text(locale, "网络请求失败，请稍后重试。", "Network request failed. Please try again."),
      );
    } finally {
      requestAbortRef.current = null;
    }
  }

  function updateDraft(updater: (config: DebateConfig) => DebateConfig) {
    setDraftConfig((current) => updater(current));
  }

  function updateProviderConnection(provider: ProviderKind, updater: (current: ProviderConnection) => ProviderConnection) {
    setProviderConnections((current) => ({
      ...current,
      [provider]: updater(current[provider] ?? createDefaultProviderConnections()[provider]),
    }));
  }

  function updateParticipant(participantId: string, updater: (participant: ParticipantConfig) => ParticipantConfig) {
    updateDraft((current) =>
      applyConfigConstraints(
        {
          ...current,
          participants: current.participants.map((participant) =>
            participant.id === participantId
              ? normalizeParticipantConfig(updater(normalizeParticipantConfig(participant, locale)), locale)
              : participant,
          ),
        },
        locale,
      ),
    );
  }

  function updateSingleShared(updater: (participant: ParticipantConfig) => ParticipantConfig) {
    updateDraft((current) => {
      const base = normalizeParticipantConfig(current.participants[0] ?? createParticipant("openai", 0, locale), locale);
      const shared = normalizeParticipantConfig(updater(base), locale);
      return applyConfigConstraints(
        {
          ...current,
          participants: buildSingleParticipants(locale, shared.provider, current.singleModelRoleCount, shared, current.participants),
        },
        locale,
      );
    });
  }

  function setAppMode(nextMode: DebateConfig["appMode"]) {
    updateDraft((current) => applyConfigConstraints({ ...current, appMode: nextMode }, locale));
  }

  function setDebateMode(nextMode: DebateConfig["debateMode"]) {
    updateDraft((current) => applyConfigConstraints({ ...current, debateMode: nextMode }, locale));
  }

  function initSingleMode(provider: ProviderKind) {
    updateDraft((current) =>
      applyConfigConstraints(
        {
          ...current,
          debateMode: "single_model_personas",
          participants: buildSingleParticipants(locale, provider, current.singleModelRoleCount),
        },
        locale,
      ),
    );
  }

  function addParticipant(provider: ProviderKind) {
    updateDraft((current) => {
      if (current.debateMode === "single_model_personas") return current;
      if (!current.participants.length) {
        const first = createParticipant(provider, 0, locale);
        const second = createParticipant(provider, 1, locale);
        const judgeRole = createParticipant(provider, 2, locale);
        judgeRole.label = text(locale, "中立裁判", "Neutral judge");
        judgeRole.roleName = text(locale, "裁判", "Judge");
        judgeRole.stance = "neutral";
        judgeRole.persona = "objective_judge";
        judgeRole.personaDescription = getPersonaPreset("objective_judge")?.prompt[locale] ?? "";
        return applyConfigConstraints({ ...current, participants: [first, second, judgeRole] }, locale);
      }
      const next = current.participants.map((participant) => normalizeParticipantConfig(participant, locale));
      const judgeRole = next.pop();
      if (!judgeRole) return current;
      next.push(createParticipant(provider, next.length, locale));
      next.push(judgeRole);
      return applyConfigConstraints({ ...current, participants: renumberMultiModelParticipants(next) }, locale);
    });
  }

  function renumberMultiModelParticipants(participants: ParticipantConfig[]) {
    const normalized = participants.map((participant) => normalizeParticipantConfig(participant, locale));
    const judgeRole = normalized.at(-1);
    const debaterRoles = normalized.slice(0, Math.max(0, normalized.length - 1)).map((participant, index) => ({
      ...participant,
      label: `${PROVIDER_CATALOG[participant.provider].label[locale]} ${index + 1}`,
    }));
    return judgeRole ? [...debaterRoles, judgeRole] : debaterRoles;
  }

  function removeParticipant(participantId: string) {
    updateDraft((current) => {
      if (current.debateMode === "single_model_personas") return current;
      const judgeRole = current.participants.at(-1);
      const debatersOnly = current.participants.slice(0, Math.max(0, current.participants.length - 1));
      if (!judgeRole || debatersOnly.length <= 2) return current;
      const nextDebaters = debatersOnly.filter((participant) => participant.id !== participantId);
      return applyConfigConstraints(
        {
          ...current,
          participants: renumberMultiModelParticipants([...nextDebaters, judgeRole]),
        },
        locale,
      );
    });
  }

  async function maybeSummarizeIfNeeded(config: DebateConfig, nextTranscript: DebateTurn[], nextSummary: string) {
    if (nextTranscript.length - summarizedTurnCount < 12 || nextTranscript.length < 16) {
      return nextSummary;
    }

    const result = (await apiPost({
      action: "summarize",
      config,
      transcript: nextTranscript,
      rollingSummary: nextSummary,
    })) as { summary: string };

    setSummarizedTurnCount(nextTranscript.length);
    setRollingSummary(result.summary);
    return result.summary;
  }

  async function startDiscussion() {
    const constrainedConfig = applyConfigConstraints(activeConfig, locale);
    const providersInUse = requiredProvidersForConfig(constrainedConfig);
    const missingProvider = providersInUse.find((provider) => !(providerConnections[provider]?.apiKey ?? "").trim());
    const config = resolveConfigForRun(constrainedConfig, providerConnections);

    if (!config.topic.trim()) {
      setError(text(locale, "请先输入要讨论的问题。", "Please enter your question first."));
      return;
    }
    if (!config.participants.length) {
      setError(text(locale, "请先添加至少一个模型。", "Please add at least one model first."));
      return;
    }
    if (missingProvider) {
      setError(
        text(
          locale,
          `请先在顶部的全局模型配置区填写 ${PROVIDER_CATALOG[missingProvider].label[locale]} 的 API Key。`,
          `Please fill in the API key for ${PROVIDER_CATALOG[missingProvider].label[locale]} in the global model settings first.`,
        ),
      );
      return;
    }

    setError("");
    setTranscript([]);
    setSharedSearch(null);
    setRollingSummary("");
    setSummarizedTurnCount(0);
    setFailedAction(null);
    setStatus("running");
    setStage("opening");
    setRound(1);
    setSpeakerIndex(0);
    setLoadingLabel(text(locale, "正在准备讨论…", "Preparing the discussion..."));
    setElapsedMs(0);
    setRunningSince(Date.now());

    try {
      const prepared = (await apiPost({ action: "prepare", config })) as {
        config: DebateConfig;
        sharedSearch: SearchEvidence | null;
      };
      setSessionConfig(migrateConfig(prepared.config));
      setSharedSearch(prepared.sharedSearch);
    } catch (cause) {
      setSessionConfig(null);
      setStatus("paused");
      setLoadingLabel("");
      setError(cause instanceof Error ? cause.message : text(locale, "准备失败，请检查配置后重试。", "Preparation failed. Please review settings and retry."));
    }
  }

  function addUserComment() {
    if (!draftUserMessage.trim()) return;
    setTranscript((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        participantId: "user",
        speaker: text(locale, "你", "You"),
        roleName: text(locale, "用户补充", "User note"),
        phase: "user",
        round,
        keyReason: draftUserMessage.trim(),
        evidence: "",
        responseToOthers: "",
        interimConclusion: "",
        content: draftUserMessage.trim(),
        displaySections: [{ title: text(locale, "你的补充", "Your note"), body: draftUserMessage.trim() }],
      },
    ]);
    setDraftUserMessage("");
  }

  function advanceAfterTurn(evaluation?: RoundEvaluation) {
    if (!sessionConfig) return;
    const speakingCount = Math.max(1, sessionConfig.participants.length - 1);
    const lastSpeakerIndex = speakingCount - 1;

    if (stage === "opening" || stage === "response") {
      if (sessionConfig.discussionPattern === "judge_stop") {
        setStage("score");
        return;
      }

      if (speakerIndex < lastSpeakerIndex) {
        setSpeakerIndex((value) => value + 1);
      } else {
        setStage("moderator");
        setSpeakerIndex(0);
      }
      return;
    }

    if (stage === "moderator") {
      if (round >= sessionConfig.rounds) {
        setStage("judge");
      } else {
        setRound((value) => value + 1);
        setStage("response");
      }
      return;
    }

    if (stage === "score") {
      if (evaluation?.shouldStop) {
        setStage("judge");
        return;
      }

      if (sessionConfig.discussionPattern === "judge_stop") {
        if (speakerIndex < lastSpeakerIndex) {
          setSpeakerIndex((value) => value + 1);
          setStage(round === 1 ? "opening" : "response");
        } else {
          setStage("moderator");
          setSpeakerIndex(0);
        }
        return;
      }

      if (round >= sessionConfig.rounds) {
        setStage("judge");
      } else {
        setRound((value) => value + 1);
        setStage("response");
      }
      return;
    }

    if (stage === "judge") {
      setStatus("completed");
      setStage("done");
      setLoadingLabel("");
    }
  }

  async function executeCurrentStep() {
    if (!sessionConfig || status !== "running" || processingRef.current) return;
    processingRef.current = true;
    try {
      const activeJudge = sessionConfig.participants.at(-1);
      const activeDebaters = sessionConfig.participants.slice(0, Math.max(0, sessionConfig.participants.length - 1));
      const speaker =
        stage === "moderator" || stage === "score" || stage === "judge"
          ? activeJudge
          : activeDebaters[Math.min(speakerIndex, Math.max(0, activeDebaters.length - 1))];
      if (!speaker) throw new Error("No active participant found.");

      setLoadingLabel(text(locale, `正在生成：${speaker.label}`, `Generating: ${speaker.label}`));
      const result = (await apiPost({
        action: "turn",
        config: sessionConfig,
        participantId: speaker.id,
        phase: stage,
        round,
        transcript,
        rollingSummary,
        sharedSearch,
      })) as { turn: DebateTurn; evaluation?: RoundEvaluation };

      const nextTranscript = [...transcript, result.turn];
      setTranscript(nextTranscript);

      const nextSummary = await maybeSummarizeIfNeeded(sessionConfig, nextTranscript, rollingSummary);
      if (nextSummary !== rollingSummary) setRollingSummary(nextSummary);

      advanceAfterTurn(result.evaluation);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") {
        return;
      }
      setStatus("paused");
      setLoadingLabel("");
      setError(cause instanceof Error ? cause.message : text(locale, "本轮失败。你可以重试或跳过。", "This step failed. You can retry or skip."));

      const activeJudge = sessionConfig.participants.at(-1);
      const activeDebaters = sessionConfig.participants.slice(0, Math.max(0, sessionConfig.participants.length - 1));
      const speaker =
        stage === "moderator" || stage === "score" || stage === "judge"
          ? activeJudge
          : activeDebaters[Math.min(speakerIndex, Math.max(0, activeDebaters.length - 1))];

      if (speaker) {
        setFailedAction({
          kind: stage === "judge" ? "judge" : stage === "score" ? "score" : stage === "moderator" ? "moderator" : "participant",
          participantId: speaker.id,
          round,
        });
      }
    } finally {
      processingRef.current = false;
    }
  }

  useEffect(() => {
    if (status === "running" && sessionConfig) {
      void executeCurrentStep();
    }
  }, [status, stage, round, speakerIndex, sessionConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="page-shell">
      <section className="hero-panel card">
        <div className="hero-copy-stack">
          <span className="eyebrow">{t(APP_COPY.appName, locale)}</span>
          <h1>{t(APP_COPY.heroTitle, locale)}</h1>
          <p className="hero-copy">{t(APP_COPY.heroSubtitle, locale)}</p>
          <div className="step-row">
            {APP_COPY.quickSteps[locale].map((step) => (
              <span key={step} className="step-chip">
                {step}
              </span>
            ))}
          </div>
        </div>
        <div className="hero-actions">
          <ToggleGroup
            value={locale}
            onChange={setLocale}
            options={[
              { value: "zh", label: "中文" },
              { value: "en", label: "English" },
            ]}
          />
          <ToggleGroup
            value={theme}
            onChange={setTheme}
            options={[
              { value: "dark", label: text(locale, "深色", "Dark") },
              { value: "light", label: text(locale, "浅色", "Light") },
            ]}
          />
          <button type="button" className="button button-secondary" onClick={() => setShowHelp((value) => !value)}>
            {showHelp ? text(locale, "收起说明", "Hide guide") : text(locale, "打开说明书", "Open guide")}
          </button>
        </div>

        {showHelp ? (
          <div className="manual-panel manual-content">
            {helpSections.map((section) => (
              <section key={section.id}>
                <h3>{section.title}</h3>
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </section>
            ))}
            <section>
              <h3>{text(locale, "官方 API 入口（外部链接）", "Official API pages (external links)")}</h3>
              <div className="manual-content">
                {providerHelp.map((provider) => (
                  <p key={provider.kind}>
                    <a href={provider.apiConsoleUrl} target="_blank" rel="noreferrer">
                      {provider.label}
                    </a>
                    {" · "}
                    {provider.description}
                  </p>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </section>

      <div className="app-stack">
        <section className="workspace card">
          <div className="section-head">
            <div>
              <h2>{text(locale, "开始一次讨论", "Start a new discussion")}</h2>
              <p className="muted">
                {text(
                  locale,
                  "先输入问题，再选择模式。复杂参数都在下面的高级区域，不会打断你的主流程。",
                  "Enter your question first, then choose a mode. Advanced controls stay below and won't block your main flow.",
                )}
              </p>
            </div>
            <ToggleGroup
              value={activeConfig.appMode}
              onChange={setAppMode}
              options={[
                { value: "simple", label: text(locale, "新手模式", "Beginner mode") },
                { value: "advanced", label: text(locale, "专业模式", "Pro mode") },
              ]}
            />
          </div>

          <div className="guide-box">
            <strong>{activeConfig.appMode === "simple" ? text(locale, "新手模式说明", "Beginner mode") : text(locale, "专业模式说明", "Pro mode")}</strong>
            <p>
              {activeConfig.appMode === "simple"
                ? text(
                    locale,
                    "默认使用单 API 多人格。你只需要一个 Key，就能让同一模型从多个角度讨论。",
                    "By default, Beginner mode uses single-API multi-persona. One key is enough for multi-angle discussion.",
                  )
                : text(
                    locale,
                    "专业模式支持多模型与单 API 多人格切换，并开放联网、角色、轮次和输出控制。",
                    "Pro mode lets you switch between multi-model and single-API multi-persona, with full control over search, roles, rounds, and output.",
                  )}
            </p>
          </div>

          <div className="field-grid">
            <Field
              label={text(locale, "你想讨论什么？", "What do you want to discuss?")}
              hint={text(locale, "建议写成完整问题，效果会更好。", "A complete question usually gives better results.")}
              full
            >
              <textarea
                value={activeConfig.topic}
                onChange={(event) => updateDraft((current) => ({ ...current, topic: event.target.value }))}
              />
            </Field>

            <Field
              label={text(locale, "讨论类型", "Discussion type")}
              hint={text(
                locale,
                "定论：必须给建议；分析：允许并列成立；研究：重点查证；娱乐：重在有趣。",
                "Conclusion gives a clear recommendation, Analysis allows parallel answers, Research emphasizes verification, Entertainment emphasizes fun.",
              )}
            >
              <ToggleGroup
                value={activeConfig.discussionType}
                onChange={(value) => updateDraft((current) => ({ ...current, discussionType: value }))}
                options={[
                  { value: "conclusion", label: text(locale, "定论", "Conclusion") },
                  { value: "analysis", label: text(locale, "分析", "Analysis") },
                  { value: "research", label: text(locale, "研究", "Research") },
                  { value: "entertainment", label: text(locale, "娱乐", "Entertainment") },
                ]}
              />
            </Field>

            <Field
              label={text(locale, "输出语言", "Output language")}
              hint={text(locale, "修改后不会重跑当前讨论，只影响下一次开始。", "Changing this does not rerun current output; it applies to the next start.")}
            >
              <ToggleGroup
                value={activeConfig.outputLanguage}
                onChange={(value) => updateDraft((current) => ({ ...current, outputLanguage: value }))}
                options={[
                  { value: "zh", label: "中文" },
                  { value: "en", label: "English" },
                ]}
              />
            </Field>
          </div>

          {activeConfig.appMode === "advanced" ? (
            <div className="manual-content">
              <div className="guide-box">
                <strong>{text(locale, "讨论结构", "Debate structure")}</strong>
                <p>
                  {text(
                    locale,
                    "多模型模式用于比较不同厂商观点。单 API 多人格用于同一模型多角度模拟。",
                    "Multi-model compares providers. Single-API multi-persona simulates multiple viewpoints with one model.",
                  )}
                </p>
              </div>
              <ToggleGroup
                value={activeConfig.debateMode}
                onChange={setDebateMode}
                options={[
                  { value: "single_model_personas", label: text(locale, "单 API 多人格", "Single-API multi-persona") },
                  { value: "multi_model", label: text(locale, "多模型", "Multi-model") },
                ]}
              />
            </div>
          ) : null}

          <div className="provider-card">
            <div className="provider-header">
              <div>
                <h3 className="provider-title">{text(locale, "全局大模型配置", "Global model settings")}</h3>
                <p className="muted">
                  {text(
                    locale,
                    "每家厂商只需要在这里填写一次 API Key 和 Base URL。下方角色卡片只负责选择模型变体，不再重复输入。",
                    "Enter each provider API key and Base URL here once. Role cards below only choose model variants and no longer repeat connection fields.",
                  )}
                </p>
              </div>
            </div>
            <div className="manual-content">
              {configurableProviders.map((kind) => {
                const meta = PROVIDER_CATALOG[kind];
                const connection = providerConnections[kind];
                return (
                  <div key={kind} className="compact-note">
                    <strong>{meta.label[locale]}</strong>
                    <p className="muted">{meta.shortDescription[locale]}</p>
                    <div className="field-grid">
                      <Field label="API Key" hint={meta.apiKeyHelp[locale]}>
                        <input
                          type="password"
                          value={connection.apiKey}
                          placeholder={text(locale, "在这里粘贴该厂商的 Key", "Paste this provider key here")}
                          onChange={(event) =>
                            updateProviderConnection(kind, (current) => ({
                              ...current,
                              apiKey: sanitizeApiKeyInput(event.target.value),
                            }))
                          }
                        />
                      </Field>
                      <Field
                        label="Base URL"
                        hint={text(
                          locale,
                          "可选填。直连官方时可保持默认；使用中转站或兼容网关时改成你的地址。",
                          "Optional. Keep the default for official endpoints, or change it when you use a relay or compatible gateway.",
                        )}
                      >
                        <input
                          value={connection.baseUrl}
                          placeholder={meta.defaultBaseUrl}
                          onChange={(event) =>
                            updateProviderConnection(kind, (current) => ({
                              ...current,
                              baseUrl: sanitizeBaseUrlInput(event.target.value, kind),
                            }))
                          }
                        />
                      </Field>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {singleApiMode ? (
            <div className="manual-content">
              {!activeConfig.participants.length ? (
                <div className="provider-card">
                  <div className="provider-header">
                    <div>
                      <h3 className="provider-title">{text(locale, "先添加一个模型", "Add one model to begin")}</h3>
                      <p className="muted">
                        {text(
                          locale,
                          "单 API 多人格模式只需要一个模型。请选择一个厂商作为共享模型。",
                          "Single-API multi-persona needs only one model. Choose one provider as the shared model.",
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="button-row">
                    {configurableProviders.map((kind) => (
                      <button key={kind} type="button" className="button button-secondary" onClick={() => initSingleMode(kind)}>
                        {text(locale, "使用", "Use")} {PROVIDER_CATALOG[kind].label[locale]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
              <div className="provider-card">
                <div className="provider-header">
                  <div>
                    <h3 className="provider-title">{text(locale, "共享模型设置", "Shared model setup")}</h3>
                    <p className="muted">
                      {text(
                        locale,
                        "单 API 模式下，所有辩手和裁判共用同一个模型配置。",
                        "In single-API mode, all debaters and the judge share one model setup.",
                      )}
                    </p>
                  </div>
                </div>
                <div className="field-grid">
                  <Field label={text(locale, "模型厂商", "Provider")}>
                    <select
                      value={activeConfig.participants[0]?.provider ?? "openai"}
                      onChange={(event) =>
                        updateSingleShared((item) => ({
                          ...item,
                          provider: event.target.value as ProviderKind,
                          model: PROVIDER_CATALOG[event.target.value as ProviderKind].defaultModel,
                        }))
                      }
                    >
                      {configurableProviders.map((kind) => (
                        <option key={kind} value={kind}>
                          {PROVIDER_CATALOG[kind].label[locale]}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label={text(locale, "模型变体", "Model variant")}
                    hint={describeModelVariant(activeConfig.participants[0]?.provider ?? "openai", activeConfig.participants[0]?.model ?? "", locale)}
                  >
                    <select
                      value={activeConfig.participants[0]?.model ?? ""}
                      onChange={(event) => updateSingleShared((item) => ({ ...item, model: event.target.value }))}
                    >
                      {getModelPresets(activeConfig.participants[0]?.provider ?? "openai").map((preset) => (
                        <option key={preset.value} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label={text(locale, "连接方式", "Connection source")}
                    hint={text(
                      locale,
                      "这个共享模型会自动读取上方全局配置中的 API Key 和 Base URL。",
                      "This shared model automatically reads the API key and Base URL from the global settings above.",
                    )}
                  >
                    <div className="compact-note">
                      {text(locale, "无需在这里重复填写连接信息。", "No need to repeat connection fields here.")}
                    </div>
                  </Field>
                </div>
              </div>

              <div className="provider-card">
                <div className="provider-header">
                  <div>
                    <h3 className="provider-title">{text(locale, "角色配置", "Role configuration")}</h3>
                    <p className="muted">{text(locale, "立场与人格完全分离：立场决定站队，人格决定说话风格。", "Stance and persona are fully separated: stance controls position, persona controls style.")}</p>
                  </div>
                </div>

                {activeConfig.appMode === "advanced" ? (
                  <div className="field-grid">
                    <Field
                      label={text(locale, "角色总数", "Total roles")}
                      hint={text(locale, "包含若干辩手 + 1 个中立裁判。", "Includes multiple debaters plus one neutral judge.")}
                    >
                      <select
                        value={String(activeConfig.singleModelRoleCount)}
                        onChange={(event) =>
                          updateDraft((current) =>
                            applyConfigConstraints({ ...current, singleModelRoleCount: Number(event.target.value) }, locale),
                          )
                        }
                      >
                        {[3, 4, 5, 6].map((count) => (
                          <option key={count} value={count}>
                            {count}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                ) : null}

                {activeConfig.participants.map((participant, index) => {
                  const role = normalizeParticipantConfig(participant);
                  const isJudge = index === activeConfig.participants.length - 1;
                  const personaOptions = isJudge ? JUDGE_PERSONA_IDS : getDebaterPersonaOptions(activeConfig);
                  return (
                    <div key={role.id} className="compact-note">
                      <strong>{role.label}</strong>
                      <p className="muted">
                        {isJudge
                          ? text(locale, "裁判必须保持中立。你可以切换裁判风格，但不能改成立场。", "The judge must remain neutral. You can change judge style, but not judge stance.")
                          : text(locale, "你可以自由组合立场和人格，比如“支持方 + 激进型”。", "You can freely combine stance and persona, e.g. “Support + Aggressive explorer”.")}
                      </p>
                      <div className="field-grid">
                        {!isJudge && activeConfig.discussionType !== "research" ? (
                          <Field label={text(locale, "立场（Stance）", "Stance")}>
                            <select
                              value={role.stance}
                              onChange={(event) =>
                                updateParticipant(role.id, (item) => ({
                                  ...item,
                                  stance: event.target.value as DebateStance,
                                  roleName: stanceLabel(event.target.value as DebateStance, locale),
                                }))
                              }
                            >
                              {(["support", "oppose", "free"] as const).map((stance) => (
                                <option key={stance} value={stance}>
                                  {stanceLabel(stance, locale)}
                                </option>
                              ))}
                            </select>
                          </Field>
                        ) : null}

                        <Field label={text(locale, "人格（Persona）", "Persona")} hint={getPersonaPreset(role.persona)?.summary[locale]}>
                          <select
                            value={role.persona}
                            onChange={(event) =>
                              updateParticipant(role.id, (item) => ({
                                ...item,
                                persona: event.target.value as ParticipantConfig["persona"],
                                personaDescription: buildPersonaDescription(
                                  event.target.value as ParticipantConfig["persona"],
                                  locale,
                                  item.persona === "custom" ? item.personaDescription : "",
                                ),
                                stance: isJudge ? "neutral" : item.stance,
                              }))
                            }
                          >
                            {personaOptions.map((id) => (
                              <option key={id} value={id}>
                                {getPersonaPreset(id)?.label[locale]}
                              </option>
                            ))}
                          </select>
                        </Field>

                        {role.persona === "custom" ? (
                          <Field
                            label={text(locale, "自定义人格描述", "Custom persona description")}
                            hint={text(
                              locale,
                              "这里写的内容会直接拼进该角色的系统提示词，替代预设人格说明。",
                              "This text is injected directly into the role system prompt and replaces the preset persona description.",
                            )}
                          >
                            <textarea
                              value={role.personaDescription}
                              onChange={(event) =>
                                updateParticipant(role.id, (item) => ({
                                  ...item,
                                  personaDescription: event.target.value,
                                }))
                              }
                            />
                          </Field>
                        ) : null}

                        {activeConfig.appMode === "advanced" && !isJudge ? (
                          <Field
                            label={text(locale, "参与最终总结", "Weight in final summary")}
                            hint={text(
                              locale,
                              "打开后，这个角色会被裁判重点纳入总结。关闭后，仍参与中间讨论，但在最终总结中权重更低。仅下一次开始生效。",
                              "When on, this role is weighted more in the judge summary. When off, it still debates but has lower final-summary weight. Applies on next run.",
                            )}
                          >
                            <ToggleGroup
                              value={role.includeInFinalSummary ? "on" : "off"}
                              onChange={(value) => updateParticipant(role.id, (item) => ({ ...item, includeInFinalSummary: value === "on" }))}
                              options={[
                                { value: "on", label: text(locale, "纳入", "Include") },
                                { value: "off", label: text(locale, "降低权重", "Lower weight") },
                              ]}
                            />
                          </Field>
                        ) : null}

                        {activeConfig.appMode === "advanced" ? (
                          <Field
                            label={isJudge ? text(locale, "裁判角色说明（可选）", "Judge role note (optional)") : text(locale, "角色说明（可选）", "Role note (optional)")}
                            hint={text(
                              locale,
                              "这是你手动补充给模型的附加说明。切换人格不会覆盖这里的文本。",
                              "This is your manual extra instruction. Changing persona will not overwrite this field.",
                            )}
                          >
                            <textarea
                              value={role.systemPrompt ?? ""}
                              onChange={(event) => updateParticipant(role.id, (item) => ({ ...item, systemPrompt: event.target.value }))}
                            />
                          </Field>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
                </>
              )}
            </div>
          ) : (
            <div className="manual-content">
              <div className="button-row">
                {configurableProviders.map((kind) => (
                  <button key={kind} type="button" className="button button-secondary" onClick={() => addParticipant(kind)}>
                    {text(locale, "添加", "Add")} {PROVIDER_CATALOG[kind].label[locale]}
                  </button>
                ))}
              </div>

              {!activeConfig.participants.length ? (
                <div className="empty-state">
                  {text(locale, "还没有模型，先点击上方按钮添加第一个模型。", "No model yet. Add your first model using the buttons above.")}
                </div>
              ) : null}

              {debaters.map((participant) => {
                const role = normalizeParticipantConfig(participant);
                const personaOptions = getDebaterPersonaOptions(activeConfig);
                return (
                  <div key={role.id} className="provider-card">
                    <div className="provider-header">
                      <div>
                        <h3 className="provider-title">{role.label}</h3>
                        <p className="muted">
                          {text(
                            locale,
                            "立场与人格分开设置：立场决定站队，人格决定表达方式。",
                            "Stance and persona are configured separately: stance sets position, persona sets style.",
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="field-grid">
                      <Field
                        label={text(locale, "模型厂商", "Provider")}
                        hint={text(locale, "多模型模式下，厂商由上方“添加”按钮决定，这里仅展示不可修改。", "In multi-model mode, the provider is fixed by the add button above and shown here as read-only.")}
                      >
                        <select
                          value={role.provider}
                          disabled
                          aria-readonly="true"
                        >
                          {providerKinds.map((kind) => (
                            <option key={kind} value={kind}>
                              {PROVIDER_CATALOG[kind].label[locale]}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field
                        label={text(locale, "模型变体", "Model variant")}
                        hint={describeModelVariant(role.provider, role.model, locale)}
                      >
                        <select
                          value={role.model}
                          onChange={(event) => updateParticipant(role.id, (item) => ({ ...item, model: event.target.value }))}
                        >
                          {getModelPresets(role.provider).map((preset) => (
                            <option key={preset.value} value={preset.value}>
                              {preset.label}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field
                        label={text(locale, "连接方式", "Connection source")}
                        hint={text(
                          locale,
                          "此辩手会自动读取顶部全局配置中对应厂商的 API Key 和 Base URL。",
                          "This debater automatically reads the provider API key and Base URL from the global settings above.",
                        )}
                      >
                        <div className="compact-note">
                          {text(locale, "这里只选模型，不重复填写密钥。", "Only choose the model here. No duplicate key entry is needed.")}
                        </div>
                      </Field>

                      {activeConfig.discussionType !== "research" ? (
                        <Field label={text(locale, "立场（Stance）", "Stance")}>
                          <select
                            value={role.stance}
                            onChange={(event) =>
                              updateParticipant(role.id, (item) => ({
                                ...item,
                                stance: event.target.value as DebateStance,
                                roleName: stanceLabel(event.target.value as DebateStance, locale),
                              }))
                            }
                          >
                            {(["support", "oppose", "free"] as const).map((stance) => (
                              <option key={stance} value={stance}>
                                {stanceLabel(stance, locale)}
                              </option>
                            ))}
                          </select>
                        </Field>
                      ) : null}

                      <Field label={text(locale, "人格（Persona）", "Persona")} hint={getPersonaPreset(role.persona)?.summary[locale]}>
                        <select
                          value={role.persona}
                          onChange={(event) =>
                            updateParticipant(role.id, (item) => ({
                              ...item,
                              persona: event.target.value as ParticipantConfig["persona"],
                              personaDescription: buildPersonaDescription(
                                event.target.value as ParticipantConfig["persona"],
                                locale,
                                item.persona === "custom" ? item.personaDescription : "",
                              ),
                            }))
                          }
                        >
                          {personaOptions.map((id) => (
                            <option key={id} value={id}>
                              {getPersonaPreset(id)?.label[locale]}
                            </option>
                          ))}
                        </select>
                      </Field>

                      {role.persona === "custom" ? (
                        <Field
                          label={text(locale, "自定义人格描述", "Custom persona description")}
                          hint={text(
                            locale,
                            "这里写的内容会直接拼进该辩手的系统提示词，替代预设人格说明。",
                            "This text is injected directly into the debater system prompt and replaces the preset persona description.",
                          )}
                        >
                          <textarea
                            value={role.personaDescription}
                            onChange={(event) =>
                              updateParticipant(role.id, (item) => ({
                                ...item,
                                personaDescription: event.target.value,
                              }))
                            }
                          />
                        </Field>
                      ) : null}

                      <Field
                        label={text(locale, "参与最终总结", "Weight in final summary")}
                        hint={text(
                          locale,
                          "打开后，该角色观点会被裁判重点纳入总结；关闭后仍参与讨论但权重更低。仅下一次开始生效。",
                          "On means the judge weights this role more in final summary. Off means it still debates but with lower summary weight. Applies on next run.",
                        )}
                      >
                        <ToggleGroup
                          value={role.includeInFinalSummary ? "on" : "off"}
                          onChange={(value) => updateParticipant(role.id, (item) => ({ ...item, includeInFinalSummary: value === "on" }))}
                          options={[
                            { value: "on", label: text(locale, "纳入", "Include") },
                            { value: "off", label: text(locale, "降低权重", "Lower weight") },
                          ]} 
                        />
                      </Field>
                    </div>
                    <div className="mini-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={debaters.length <= 2}
                        onClick={() => removeParticipant(role.id)}
                      >
                        {text(locale, "移除这个辩手", "Remove this debater")}
                      </button>
                    </div>
                  </div>
                );
              })}

              {judge ? (
                <div className="provider-card">
                  <div className="provider-header">
                    <div>
                      <h3 className="provider-title">{text(locale, "中立裁判", "Neutral judge")}</h3>
                      <p className="muted">
                        {text(locale, "裁判负责评估与总结，不参与站队。", "The judge evaluates and summarizes, and does not take sides.")}
                      </p>
                    </div>
                  </div>
                  <div className="field-grid">
                    <Field
                      label={text(locale, "裁判模型厂商", "Judge provider")}
                      hint={text(
                        locale,
                        "多模型模式下，你可以单独指定由哪一家模型来担任裁判。",
                        "In multi-model mode, you can choose a separate provider for the judge.",
                      )}
                    >
                      <select
                        value={judge.provider}
                        onChange={(event) =>
                          updateParticipant(judge.id, (item) => ({
                            ...item,
                            provider: event.target.value as ProviderKind,
                            model: PROVIDER_CATALOG[event.target.value as ProviderKind].defaultModel,
                            stance: "neutral",
                          }))
                        }
                      >
                        {configurableProviders.map((kind) => (
                          <option key={kind} value={kind}>
                            {PROVIDER_CATALOG[kind].label[locale]}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      label={text(locale, "裁判模型变体", "Judge model variant")}
                      hint={describeModelVariant(judge.provider, judge.model, locale)}
                    >
                      <select
                        value={judge.model}
                        onChange={(event) => updateParticipant(judge.id, (item) => ({ ...item, model: event.target.value, stance: "neutral" }))}
                      >
                        {getModelPresets(judge.provider).map((preset) => (
                          <option key={preset.value} value={preset.value}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      label={text(locale, "连接方式", "Connection source")}
                      hint={text(
                        locale,
                        "裁判会自动读取顶部全局配置中对应厂商的 API Key 和 Base URL。",
                        "The judge automatically reads the provider API key and Base URL from the global settings above.",
                      )}
                    >
                      <div className="compact-note">
                        {text(locale, "裁判也不需要单独重复填写密钥。", "The judge does not need a separate key entry here.")}
                      </div>
                    </Field>

                    <Field label={text(locale, "裁判人格（Persona）", "Judge persona")} hint={getPersonaPreset(judge.persona)?.summary[locale]}>
                      <select
                        value={judge.persona}
                        onChange={(event) =>
                          updateParticipant(judge.id, (item) => ({
                            ...item,
                            persona: event.target.value as ParticipantConfig["persona"],
                            stance: "neutral",
                            personaDescription: buildPersonaDescription(
                              event.target.value as ParticipantConfig["persona"],
                              locale,
                              item.persona === "custom" ? item.personaDescription : "",
                            ),
                          }))
                        }
                      >
                        {JUDGE_PERSONA_IDS.map((id) => (
                          <option key={id} value={id}>
                            {getPersonaPreset(id)?.label[locale]}
                          </option>
                        ))}
                      </select>
                    </Field>

                    {judge.persona === "custom" ? (
                      <Field
                        label={text(locale, "自定义裁判人格", "Custom judge persona")}
                        hint={text(
                          locale,
                          "这里写的内容会直接拼进裁判的系统提示词，替代预设裁判人格说明。",
                          "This text is injected directly into the judge system prompt and replaces the preset judge persona description.",
                        )}
                      >
                        <textarea
                          value={judge.personaDescription}
                          onChange={(event) =>
                            updateParticipant(judge.id, (item) => ({
                              ...item,
                              personaDescription: event.target.value,
                              stance: "neutral",
                            }))
                          }
                        />
                      </Field>
                    ) : null}

                    <Field
                      label={text(locale, "裁判全局指令", "Judge instruction")}
                      hint={text(
                        locale,
                        "这是裁判的总规则。切换裁判人格不会覆盖这里的文本。",
                        "This is the judge's global instruction. Persona changes do not overwrite this field.",
                      )}
                    >
                      <textarea
                        value={activeConfig.judgeInstruction}
                        onChange={(event) => updateDraft((current) => ({ ...current, judgeInstruction: event.target.value }))}
                      />
                    </Field>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          <div className="manual-content">
            <div className="provider-card">
              <div className="provider-header">
                <div>
                  <h3 className="provider-title">{text(locale, "搜索与流程", "Search and flow controls")}</h3>
                  <p className="muted">
                    {text(
                      locale,
                      "所有开关都是真生效，不会只是界面变化。除显示设置外，改动会在下一次开始时生效。",
                      "All switches are functional, not cosmetic. Except display settings, changes apply to the next run.",
                    )}
                  </p>
                </div>
              </div>
              <div className="field-grid">
                <Field
                  label={text(locale, "是否联网", "Use web search")}
                  hint={text(locale, "关闭后整场都只用模型已有知识。", "When off, the whole run uses model-only knowledge.")}
                >
                  <ToggleGroup
                    value={activeConfig.search.enabled ? "on" : "off"}
                    onChange={(value) => updateDraft((current) => ({ ...current, search: { ...current.search, enabled: value === "on" } }))}
                    options={[
                      { value: "on", label: text(locale, "开启", "On") },
                      { value: "off", label: text(locale, "关闭", "Off") },
                    ]}
                  />
                </Field>

                <Field
                  label={text(locale, "发言节奏", "Turn pattern")}
                  hint={text(
                    locale,
                    "固定回合会跑完设定轮数；动态停止会在双方胜率长期稳定时提前结束。",
                    "Fixed rounds run full count; Dynamic stop ends earlier when win rates stabilize.",
                  )}
                >
                  <ToggleGroup
                    value={activeConfig.discussionPattern}
                    onChange={(value) => updateDraft((current) => ({ ...current, discussionPattern: value }))}
                    options={[
                      { value: "structured_discussion", label: text(locale, "固定回合", "Fixed rounds") },
                      { value: "judge_stop", label: text(locale, "动态停止", "Dynamic stop") },
                    ]}
                  />
                </Field>

                {activeConfig.search.enabled ? (
                  <Field
                    label={text(locale, "联网策略", "Search strategy")}
                    hint={text(
                      locale,
                      "统一一次适合快速起步；独立搜索适合看不同查证路径；混合模式先共享后补充。",
                      "Shared-once is fastest to start; per-role search explores divergent evidence paths; hybrid shares first, then expands.",
                    )}
                  >
                    <select
                      value={activeConfig.search.mode}
                      onChange={(event) =>
                        updateDraft((current) => ({ ...current, search: { ...current.search, mode: event.target.value as DebateConfig["search"]["mode"] } }))
                      }
                    >
                      <option value="off">{text(locale, "不联网", "No search")}</option>
                      <option value="shared_once">{text(locale, "统一搜索一次", "Shared once")}</option>
                      <option value="per_participant">{text(locale, "每位角色独立搜索", "Per-role search")}</option>
                      <option value="hybrid">{text(locale, "混合模式", "Hybrid")}</option>
                    </select>
                  </Field>
                ) : null}

                {activeConfig.search.enabled && activeConfig.search.mode !== "off" ? (
                  <Field
                    label={text(locale, "每轮持续搜索", "Continue searching each round")}
                    hint={text(
                      locale,
                      "开启后每轮都能继续查新资料；关闭后主要使用初始检索结果。",
                      "On means each round can fetch fresh web info; Off mainly relies on initial retrieval.",
                    )}
                  >
                    <ToggleGroup
                      value={activeConfig.search.continuePerRound ? "on" : "off"}
                      onChange={(value) => updateDraft((current) => ({ ...current, search: { ...current.search, continuePerRound: value === "on" } }))}
                      options={[
                        { value: "on", label: text(locale, "开启", "On") },
                        { value: "off", label: text(locale, "关闭", "Off") },
                      ]}
                    />
                  </Field>
                ) : null}

                {activeConfig.discussionPattern === "judge_stop" ? (
                  <Field
                    label={text(locale, "动态停止灵敏度", "Dynamic-stop sensitivity")}
                    hint={text(
                      locale,
                      "数值越低越容易提前停；数值越高越倾向继续讨论。只影响下一次重新开始。",
                      "Lower values stop earlier; higher values keep debating longer. Applies on next restart only.",
                    )}
                  >
                    <input
                      type="range"
                      min="0.55"
                      max="0.95"
                      step="0.05"
                      value={activeConfig.stopThreshold}
                      onChange={(event) => updateDraft((current) => ({ ...current, stopThreshold: Number(event.target.value) }))}
                    />
                  </Field>
                ) : null}

                <Field
                  label={text(locale, "输出长度", "Output length")}
                  hint={text(
                    locale,
                    "精简更快更省；适中适合多数场景；自由发挥更详细但更耗时。",
                    "Concise is faster/cheaper; balanced fits most cases; expansive is richer but costs more time/tokens.",
                  )}
                >
                  <ToggleGroup
                    value={activeConfig.responseLength}
                    onChange={(value) => updateDraft((current) => ({ ...current, responseLength: value }))}
                    options={[
                      { value: "concise", label: text(locale, "精简", "Concise") },
                      { value: "balanced", label: text(locale, "适中", "Balanced") },
                      { value: "expansive", label: text(locale, "自由发挥", "Expansive") },
                    ]}
                  />
                </Field>

                <Field
                  label={text(locale, "讨论轮数", "Total rounds")}
                  hint={text(locale, "只在固定回合模式严格生效。", "Strictly used in fixed-round mode.")}
                >
                  <select
                    value={String(activeConfig.rounds)}
                    onChange={(event) => updateDraft((current) => ({ ...current, rounds: Number(event.target.value) }))}
                  >
                    {[1, 2, 3, 4, 5, 6].map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </Field>

                {showExternalSearchField ? (
                  <Field
                    label={text(locale, "外部搜索 API（可选）", "External search API (optional)")}
                    hint={text(
                      locale,
                      "仅在使用 DeepSeek 且开启联网时显示。填写 Tavily Key 可提高联网稳定性；不填则自动回退到公开搜索。",
                      "Visible only when DeepSeek is selected with web search enabled. A Tavily key improves reliability; otherwise public fallback search is used.",
                    )}
                  >
                    <input
                      value={activeConfig.search.tavilyApiKey ?? ""}
                      onChange={(event) =>
                        updateDraft((current) => ({ ...current, search: { ...current.search, tavilyApiKey: event.target.value } }))
                      }
                    />
                  </Field>
                ) : null}
              </div>
            </div>

            <div className="provider-card">
              <div className="provider-header">
                <div>
                  <h3 className="provider-title">{text(locale, "阅读体验", "Reading comfort")}</h3>
                  <p className="muted">{text(locale, "这些设置只影响显示效果，不会触发重跑。", "These settings only affect display and never trigger reruns.")}</p>
                </div>
              </div>
              <div className="field-grid">
                <Field label={text(locale, "阅读背景", "Reading surface")}>
                  <select value={readingTheme} onChange={(event) => setReadingTheme(event.target.value as ReadingTheme)}>
                    <option value="soft-dark">{text(locale, "柔和深色", "Soft dark")}</option>
                    <option value="graphite">{text(locale, "石墨灰", "Graphite")}</option>
                    <option value="warm-light">{text(locale, "暖米色", "Warm light")}</option>
                    <option value="paper">{text(locale, "纸张白", "Paper")}</option>
                  </select>
                </Field>
                <Field label={text(locale, "字体大小", "Font size")}>
                  <input type="range" min="15" max="24" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} />
                </Field>
                <Field label={text(locale, "行距", "Line spacing")}>
                  <input type="range" min="1.4" max="2.2" step="0.1" value={lineHeight} onChange={(event) => setLineHeight(Number(event.target.value))} />
                </Field>
                <Field label={text(locale, "段间距", "Paragraph gap")}>
                  <input type="range" min="10" max="32" value={paragraphGap} onChange={(event) => setParagraphGap(Number(event.target.value))} />
                </Field>
                <Field label={text(locale, "正文宽度", "Text width")}>
                  <input type="range" min="56" max="92" value={textWidth} onChange={(event) => setTextWidth(Number(event.target.value))} />
                </Field>
              </div>
            </div>
          </div>

          {error ? <div className="alert">{error}</div> : null}

          <div className="status-strip">
            <span className="chip">{text(locale, "状态", "Status")}: {statusLabel(status, locale)}</span>
            <span className="chip">{text(locale, "阶段", "Stage")}: {stageLabel(stage, locale)}</span>
            <span className="chip">{text(locale, "轮次", "Round")}: {round}</span>
            <span className="chip">{text(locale, "已运行", "Elapsed")}: {(elapsedMs / 1000).toFixed(0)}s</span>
          </div>

          <div className="button-row">
            <button type="button" className="button button-primary" disabled={status === "running"} onClick={() => void startDiscussion()}>
              {text(locale, "开始讨论", "Start discussion")}
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={status !== "running"}
              onClick={() => {
                setStatus("paused");
                setLoadingLabel("");
                setError(text(locale, "已手动暂停。当前内容会保留，你可以稍后继续。", "Paused manually. Your current progress is preserved and you can continue later."));
                requestAbortRef.current?.abort();
              }}
            >
              {text(locale, "暂停", "Pause")}
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={status !== "paused"}
              onClick={() => {
                setStatus("running");
                setRunningSince(Date.now() - elapsedMs);
              }}
            >
              {text(locale, "继续", "Continue")}
            </button>
            {failedAction ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setFailedAction(null);
                  setStatus("running");
                }}
              >
                {text(locale, "重试当前步骤", "Retry current step")}
              </button>
            ) : null}
            {failedAction ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setFailedAction(null);
                  setError("");
                  advanceAfterTurn();
                  setStatus("running");
                }}
              >
                {text(locale, "跳过当前步骤", "Skip this step")}
              </button>
            ) : null}
            {transcript.length ? (
              <button type="button" className="button button-secondary" onClick={() => downloadFile("debate.csv", buildCsv(transcript), "text/csv")}>
                CSV
              </button>
            ) : null}
            {transcript.length ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => downloadFile("debate.txt", transcript.map((turn) => `${turn.speaker}\n${turn.content}`).join("\n\n"), "text/plain")}
              >
                TXT
              </button>
            ) : null}
            {transcript.length ? (
              <button type="button" className="button button-secondary" onClick={() => downloadFile("debate.json", JSON.stringify(transcript, null, 2), "application/json")}>
                JSON
              </button>
            ) : null}
          </div>
        </section>

        <section className="result-panel card">
          <div className="section-head">
            <div>
              <h2>{text(locale, "讨论过程与结果", "Discussion and result")}</h2>
              <p className="muted">
                {loadingLabel ||
                  text(
                    locale,
                    "这里会展示每轮辩手发言、主持纠偏、动态胜率和最终裁判总结。",
                    "This area shows turn-by-turn debate, moderation notes, dynamic win-rates, and final judge summary.",
                  )}
              </p>
            </div>
          </div>

          <TrendChart evaluations={evaluations} enabled={activeConfig.discussionPattern === "judge_stop"} locale={locale} />

          <div className={`reader-surface reader-${readingTheme}`} style={readerStyle}>
            <div className="readable-copy timeline">
              {transcript.length ? (
                transcript.map((turn) => (
                  <article key={turn.id} className="timeline-item">
                    <div className="provider-header">
                      <div>
                        <strong>{turn.speaker}</strong>
                        <p className="muted">
                          {turn.roleName} · {turn.phase} · {text(locale, "第", "Round ")}
                          {turn.round}
                          {locale === "zh" ? "轮" : ""}
                        </p>
                        {turn.currentPosition ? (
                          <p className="muted">
                            {text(locale, "当前立场", "Current stance")}: {stanceLabel(turn.currentPosition, locale)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {turn.searchSummary && visibleSearchSummaryTurnIds.has(turn.id) ? (
                      <p className={turn.searchFailed ? "score-note" : "search-note"}>
                        {turn.searchFailed
                          ? turn.searchSummary
                          : text(
                              locale,
                              "本轮已参考联网资料。具体来源见下方链接。",
                              "This turn used live web evidence. See the sources below.",
                            )}
                      </p>
                    ) : null}
                    <TurnBody turn={turn} />
                    {turn.citations?.length ? (
                      <div className="citations">
                        {turn.citations.map((citation) => (
                          <a key={`${turn.id}-${citation.url}`} href={citation.url} target="_blank" rel="noreferrer">
                            {citation.title} · {citation.domain}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  {text(locale, "还没有讨论记录。先在上半部分完成配置，再点击“开始讨论”。", "No discussion yet. Configure above, then click Start discussion.")}
                </div>
              )}
            </div>
          </div>

          <div className="interject-box">
            <strong>{text(locale, "中途发言", "Jump in mid-debate")}</strong>
            <p className="muted">
              {text(
                locale,
                "如果你想补充背景、纠正事实或新增条件，可以先暂停，再把话加入记录。",
                "If you want to add context, correct facts, or add constraints, pause first and append your note.",
              )}
            </p>
            <textarea value={draftUserMessage} onChange={(event) => setDraftUserMessage(event.target.value)} />
            <div className="mini-actions">
              <button type="button" className="button button-secondary" onClick={addUserComment}>
                {text(locale, "加入讨论记录", "Add to transcript")}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

