export type Locale = "zh" | "en";

export type ProviderKind =
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "xai"
  | "custom";

export type AppMode = "simple" | "advanced";

export type DebateMode = "multi_model" | "single_model_personas";

export type DiscussionPattern = "structured_discussion" | "judge_stop";

export type SearchMode = "off" | "shared_once" | "per_participant" | "hybrid";

export type ResponseLengthMode = "concise" | "balanced" | "expansive";

export type OutputLanguage = "zh" | "en";

export type DiscussionType = "conclusion" | "analysis" | "research" | "entertainment";

export type DebateStance = "support" | "oppose" | "neutral" | "free";
export type DebateSide = DebateStance;

export type DebatePhase =
  | "opening"
  | "response"
  | "synthesis"
  | "moderator"
  | "score"
  | "judge"
  | "user"
  | "system";

export type ParticipantTemplate =
  | "balanced_standard"
  | "risk_averse"
  | "aggressive_explorer"
  | "pragmatist"
  | "skeptic"
  | "long_termist"
  | "cost_first"
  | "ux_first"
  | "objective_judge"
  | "balanced_judge"
  | "conservative_judge"
  | "rigorous_judge"
  | "pragmatic_judge"
  | "risk_sensitive_judge"
  | "evidence_first_judge"
  | "philosopher_showman"
  | "combative_troll"
  | "nonsense_poet"
  | "sarcastic_oracle"
  | "chuunibyo_rebel"
  | "custom"
  // legacy compatibility only
  | "supporter"
  | "opposer";

export type Citation = {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
};

export type ModelPreset = {
  value: string;
  label: string;
  summary: Record<Locale, string>;
};

export type ProviderMeta = {
  kind: ProviderKind;
  label: Record<Locale, string>;
  shortDescription: Record<Locale, string>;
  apiKeyHelp: Record<Locale, string>;
  officialUrl: string;
  apiConsoleUrl: string;
  defaultBaseUrl: string;
  defaultModel: string;
  supportsNativeSearch: boolean;
  supportsJsonMode: boolean;
  modelPresets: ModelPreset[];
};

export type ParticipantConfig = {
  id: string;
  provider: ProviderKind;
  label: string;
  roleName: string;
  stance: DebateStance;
  side?: DebateStance;
  model: string;
  apiKey: string;
  baseUrl: string;
  systemPrompt?: string;
  enableSearch: boolean;
  persona: ParticipantTemplate;
  template?: ParticipantTemplate;
  personaDescription: string;
  templateDescription?: string;
  includeInFinalSummary: boolean;
};

export type SearchConfig = {
  enabled: boolean;
  mode: SearchMode;
  continuePerRound: boolean;
  tavilyApiKey?: string;
};

export type DebateConfig = {
  locale: Locale;
  appMode: AppMode;
  debateMode: DebateMode;
  discussionPattern: DiscussionPattern;
  discussionType: DiscussionType;
  outputLanguage: OutputLanguage;
  singleModelRoleCount: number;
  topic: string;
  rounds: number;
  stopThreshold: number;
  responseLength: ResponseLengthMode;
  participants: ParticipantConfig[];
  moderatorId?: string;
  judgeId?: string;
  judgeInstruction: string;
  runtimeLimitSeconds?: number;
  search: SearchConfig;
};

export type SearchEvidence = {
  summary: string;
  citations: Citation[];
  contextBlock: string;
  failed: boolean;
  provider?: "tavily" | "duckduckgo" | "searxng" | "none" | "native";
  failureReason?: string;
};

export type DebateTurn = {
  id: string;
  participantId: string;
  speaker: string;
  roleName: string;
  phase: DebatePhase;
  round: number;
  currentPosition?: Exclude<DebateSide, "free">;
  keyReason: string;
  evidence: string;
  responseToOthers: string;
  interimConclusion: string;
  content: string;
  displaySections?: Array<{
    title: string;
    body: string;
  }>;
  citations?: Citation[];
  searchSummary?: string;
  searchFailed?: boolean;
  evaluation?: RoundEvaluation;
};

export type RoundEvaluation = {
  supportWinRate: number;
  opposeWinRate: number;
  leadingSide: "support" | "oppose" | "neutral";
  shouldStop: boolean;
  rationale: string;
};

export type FinalReport = {
  shortConclusion: string;
  detailedConclusion: string;
  comparison: Array<{
    speaker: string;
    roleName: string;
    stance: string;
    reasoningStyle: string;
    strongestPoint: string;
  }>;
  uncertainty: string;
  howToReadDisagreement: string;
};

export type PrepareResponse = {
  config: DebateConfig;
  sharedSearch: SearchEvidence | null;
};

export type TurnResponse = {
  turn: DebateTurn;
  evaluation?: RoundEvaluation;
};

export type SummaryResponse = {
  summary: string;
};

export type RunStage =
  | "opening"
  | "response"
  | "moderator"
  | "score"
  | "synthesis"
  | "judge"
  | "done";

export type RunStatus = "idle" | "running" | "paused" | "completed";

export type FailedAction = {
  kind: "participant" | "moderator" | "score" | "judge";
  participantId: string;
  round: number;
};
