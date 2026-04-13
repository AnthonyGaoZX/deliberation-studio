import { useEffect, useRef, useState } from "react";
import type {
  DebateConfig,
  DebateTurn,
  FailedAction,
  Locale,
  RoundEvaluation,
  RunStage,
  RunStatus,
  SearchEvidence,
} from "@/types/debate";
import type { ParticipantCheckState, ProviderConnectionMap } from "@/types/ui";
import { text } from "@/lib/text-helpers";
import { PROVIDER_CATALOG } from "@/lib/provider-catalog";
import {
  applyConfigConstraints,
  migrateConfig,
  requiredProvidersForConfig,
  resolveConfigForRun,
} from "@/lib/config-logic";

export type DebateSessionState = {
  sessionConfig: DebateConfig | null;
  status: RunStatus;
  stage: RunStage;
  round: number;
  speakerIndex: number;
  transcript: DebateTurn[];
  sharedSearch: SearchEvidence | null;
  rollingSummary: string;
  error: string;
  loadingLabel: string;
  failedAction: FailedAction | null;
  draftUserMessage: string;
  elapsedMs: number;
  participantChecks: Record<string, ParticipantCheckState>;
};

export type DebateSessionActions = {
  startDiscussion: () => void;
  pauseDiscussion: () => void;
  continueDiscussion: () => void;
  retryCurrentStep: () => void;
  skipCurrentStep: () => void;
  addUserComment: () => void;
  setDraftUserMessage: (value: string) => void;
  setError: (value: string) => void;
  runParticipantCheck: (participantId: string, mode: "output" | "search") => void;
};

export function useDebateSession(
  activeConfig: DebateConfig,
  providerConnections: ProviderConnectionMap,
  locale: Locale,
): DebateSessionState & DebateSessionActions {
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
  const [participantChecks, setParticipantChecks] = useState<Record<string, ParticipantCheckState>>({});

  const processingRef = useRef(false);
  const requestAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      const nextElapsed = runningSince ? now - runningSince : elapsedMs + 1000;
      setElapsedMs(nextElapsed);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [status, runningSince, elapsedMs]);

  async function apiPost(payload: unknown, trackAbort = true) {
    const controller = new AbortController();
    if (trackAbort) {
      requestAbortRef.current = controller;
    }

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
      if (trackAbort) {
        requestAbortRef.current = null;
      }
    }
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

  function pauseDiscussion() {
    setStatus("paused");
    setLoadingLabel("");
    setError(text(locale, "已手动暂停。当前内容会保留，你可以稍后继续。", "Paused manually. Your current progress is preserved and you can continue later."));
    requestAbortRef.current?.abort();
  }

  function continueDiscussion() {
    setStatus("running");
    setRunningSince(Date.now() - elapsedMs);
  }

  function retryCurrentStep() {
    setFailedAction(null);
    setStatus("running");
  }

  function skipCurrentStep() {
    setFailedAction(null);
    setError("");
    advanceAfterTurn();
    setStatus("running");
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

  async function runParticipantCheck(participantId: string, mode: "output" | "search") {
    const constrainedConfig = applyConfigConstraints(activeConfig, locale);
    const config = resolveConfigForRun(
      {
        ...constrainedConfig,
        topic: constrainedConfig.topic.trim() || text(locale, "请用一句话说明今天的 AI 模型动态。", "Give one short update about current AI model news."),
      },
      providerConnections,
    );
    const participant = config.participants.find((item) => item.id === participantId);

    if (!participant) {
      setParticipantChecks((current) => ({
        ...current,
        [participantId]: {
          status: "error",
          mode,
          message: text(locale, "没有找到这个角色。", "This role could not be found."),
        },
      }));
      return;
    }

    if (!participant.apiKey.trim()) {
      setParticipantChecks((current) => ({
        ...current,
        [participantId]: {
          status: "error",
          mode,
          message: text(
            locale,
            `请先在上方填写 ${PROVIDER_CATALOG[participant.provider].label[locale]} 的 API Key。`,
            `Please fill in the ${PROVIDER_CATALOG[participant.provider].label[locale]} API key above first.`,
          ),
        },
      }));
      return;
    }

    setParticipantChecks((current) => ({
      ...current,
      [participantId]: {
        status: "loading",
        mode,
        message:
          mode === "search"
            ? text(locale, "正在测试联网输出…", "Testing live web output...")
            : text(locale, "正在测试基础输出…", "Testing basic output..."),
      },
    }));

    try {
      const result = (await apiPost(
        {
          action: "check",
          config,
          participantId,
          mode,
        },
        false,
      )) as {
        ok: boolean;
        mode: "output" | "search";
        text: string;
        searchProvider?: string;
        citations?: Array<{ url: string }>;
      };

      const citationCount = result.citations?.length ?? 0;
      const successMessage =
        mode === "search"
          ? text(
              locale,
              `联网测试通过。${result.searchProvider === "native" ? "已走模型原生联网。" : "已走外部搜索增强。"}${citationCount ? ` 发现 ${citationCount} 条来源。` : ""}`,
              `Web test passed. ${result.searchProvider === "native" ? "Native provider search was used." : "External search augmentation was used."}${citationCount ? ` ${citationCount} source link(s) found.` : ""}`,
            )
          : text(locale, "基础输出测试通过。", "Basic output test passed.");

      setParticipantChecks((current) => ({
        ...current,
        [participantId]: {
          status: "success",
          mode,
          message: `${successMessage} ${result.text}`.trim(),
        },
      }));
    } catch (cause) {
      setParticipantChecks((current) => ({
        ...current,
        [participantId]: {
          status: "error",
          mode,
          message:
            cause instanceof Error
              ? cause.message
              : text(locale, "测试失败，请检查 API 配置后再试。", "Test failed. Please check the API configuration and try again."),
        },
      }));
    }
  }

  return {
    sessionConfig,
    status,
    stage,
    round,
    speakerIndex,
    transcript,
    sharedSearch,
    rollingSummary,
    error,
    loadingLabel,
    failedAction,
    draftUserMessage,
    elapsedMs,
    participantChecks,
    startDiscussion: () => void startDiscussion(),
    pauseDiscussion,
    continueDiscussion,
    retryCurrentStep,
    skipCurrentStep,
    addUserComment,
    setDraftUserMessage,
    setError,
    runParticipantCheck: (participantId: string, mode: "output" | "search") => void runParticipantCheck(participantId, mode),
  };
}
