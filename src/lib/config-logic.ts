import type {
  DebateConfig,
  DebateStance,
  Locale,
  ParticipantConfig,
  ProviderKind,
} from "@/types/debate";
import type { ProviderConnectionMap } from "@/types/ui";
import {
  ENTERTAINMENT_PERSONA_IDS,
  JUDGE_PERSONA_IDS,
  STANDARD_DEBATER_PERSONA_IDS,
  getPersonaPreset,
} from "@/lib/persona-presets";
import { createParticipant, PROVIDER_CATALOG } from "@/lib/provider-catalog";
import { createStarterSingleModelSetup } from "@/lib/default-config";
import { text, roleNameForParticipant } from "@/lib/text-helpers";
import { sanitizeApiKeyInput, sanitizeBaseUrlInput } from "@/lib/sanitize";

const providerKinds = Object.keys(PROVIDER_CATALOG) as ProviderKind[];

const simplePersonaAllowList = ["balanced_standard", "pragmatist", "skeptic", "risk_averse"] as const;

export function createDefaultProviderConnections(): ProviderConnectionMap {
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

export function normalizeParticipantConfig(participant: ParticipantConfig, locale?: Locale): ParticipantConfig {
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

export function buildPersonaDescription(persona: ParticipantConfig["persona"], locale: Locale, existing?: string) {
  if (persona === "custom") {
    return existing ?? "";
  }

  return getPersonaPreset(persona)?.prompt[locale] ?? "";
}

export function migrateConfig(config: DebateConfig): DebateConfig {
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

export function resolveConfigForRun(config: DebateConfig, providerConnections: ProviderConnectionMap): DebateConfig {
  return {
    ...config,
    participants: config.participants.map((participant) => resolveParticipantConnection(participant, providerConnections)),
  };
}

export function requiredProvidersForConfig(config: DebateConfig) {
  return [...new Set(config.participants.map((participant) => participant.provider))];
}

export function buildSingleParticipants(
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

export function getDebaterPersonaOptions(config: DebateConfig) {
  if (config.discussionType === "entertainment") return ENTERTAINMENT_PERSONA_IDS;
  const standard = STANDARD_DEBATER_PERSONA_IDS;
  if (config.appMode === "simple") {
    return standard.filter((id) => simplePersonaAllowList.includes(id as (typeof simplePersonaAllowList)[number]));
  }
  return standard;
}

export function applyConfigConstraints(config: DebateConfig, locale: Locale): DebateConfig {
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
        stance: "neutral" as DebateStance,
        persona: "objective_judge" as ParticipantConfig["persona"],
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
            ? "free" as DebateStance
            : participant.stance === "neutral"
              ? index % 2 === 0
                ? "support" as DebateStance
                : "oppose" as DebateStance
              : participant.stance,
        persona: JUDGE_PERSONA_IDS.includes(participant.persona) ? "balanced_standard" as ParticipantConfig["persona"] : participant.persona,
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
          stance: "neutral" as DebateStance,
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
