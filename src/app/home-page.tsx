"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { APP_COPY, buildHelpSnapshot, buildProviderSnapshot, t } from "@/lib/i18n";
import { createDefaultConfig, STORAGE_KEY } from "@/lib/default-config";
import {
  JUDGE_PERSONA_IDS,
  getPersonaPreset,
} from "@/lib/persona-presets";
import { createParticipant, PROVIDER_CATALOG, stanceLabel } from "@/lib/provider-catalog";
import type {
  DebateConfig,
  DebateStance,
  Locale,
  ParticipantConfig,
  ProviderKind,
} from "@/types/debate";
import type { AppStorage, ProviderConnectionMap, ReadingTheme } from "@/types/ui";
import { text, statusLabel, stageLabel } from "@/lib/text-helpers";
import { sanitizeApiKeyInput, sanitizeBaseUrlInput } from "@/lib/sanitize";
import {
  applyConfigConstraints,
  buildPersonaDescription,
  buildSingleParticipants,
  createDefaultProviderConnections,
  getDebaterPersonaOptions,
  migrateConfig,
  normalizeParticipantConfig,
} from "@/lib/config-logic";
import { buildCsv, downloadFile } from "@/lib/export-utils";
import { useDebateSession } from "@/hooks/use-debate-session";
import { ToggleGroup } from "@/components/toggle-group";
import { Field, ModelVariantField } from "@/components/field";
import { TrendChart } from "@/components/trend-chart";
import { TurnBody } from "@/components/turn-body";
import { ParticipantCheckControls } from "@/components/participant-check";

const providerKinds = Object.keys(PROVIDER_CATALOG) as ProviderKind[];

export default function HomePage() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [draftConfig, setDraftConfig] = useState<DebateConfig>(() => createDefaultConfig("zh", "simple"));
  const [providerConnections, setProviderConnections] = useState<ProviderConnectionMap>(() => createDefaultProviderConnections());

  const [readingTheme, setReadingTheme] = useState<ReadingTheme>("soft-dark");
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.7);
  const [paragraphGap, setParagraphGap] = useState(18);
  const [textWidth, setTextWidth] = useState(74);
  const [showHelp, setShowHelp] = useState(false);

  const activeConfig = useMemo(() => applyConfigConstraints(draftConfig, locale), [draftConfig, locale]);
  const helpSections = useMemo(() => buildHelpSnapshot(locale), [locale]);
  const providerHelp = useMemo(() => buildProviderSnapshot(locale), [locale]);
  const singleApiMode = activeConfig.debateMode === "single_model_personas";
  const configurableProviders = activeConfig.appMode === "simple" ? providerKinds.filter((kind) => kind !== "custom") : providerKinds;
  const judge = activeConfig.participants.at(-1);
  const debaters = activeConfig.participants.slice(0, Math.max(0, activeConfig.participants.length - 1));

  const session = useDebateSession(activeConfig, providerConnections, locale);

  const evaluations = useMemo(() => session.transcript.flatMap((turn) => (turn.evaluation ? [turn.evaluation] : [])), [session.transcript]);
  const visibleSearchSummaryTurnIds = useMemo(() => {
    const seen = new Set<string>();
    return new Set(
      session.transcript.flatMap((turn) => {
        const summary = turn.searchSummary?.trim();
        if (!summary) return [];
        if (turn.searchFailed || !seen.has(summary)) {
          seen.add(summary);
          return [turn.id];
        }
        return [];
      }),
    );
  }, [session.transcript]);

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

  function updateDraft(updater: (config: DebateConfig) => DebateConfig) {
    setDraftConfig((current) => updater(current));
  }

  function updateProviderConnection(provider: ProviderKind, updater: (current: { apiKey: string; baseUrl: string }) => { apiKey: string; baseUrl: string }) {
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

                  <ModelVariantField
                    provider={activeConfig.participants[0]?.provider ?? "openai"}
                    model={activeConfig.participants[0]?.model ?? ""}
                    locale={locale}
                    label={text(locale, "模型变体", "Model variant")}
                    onModelChange={(model) => updateSingleShared((item) => ({ ...item, model }))}
                  />

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
                          : text(locale, "你可以自由组合立场和人格，比如\u201c支持方 + 激进型\u201d。", "You can freely combine stance and persona, e.g. \u201cSupport + Aggressive explorer\u201d.")}
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
                      <ParticipantCheckControls
                        participant={role}
                        locale={locale}
                        status={session.status}
                        checkState={session.participantChecks[role.id]}
                        onCheck={session.runParticipantCheck}
                      />
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
                        hint={text(locale, "多模型模式下，厂商由上方\u201c添加\u201d按钮决定，这里仅展示不可修改。", "In multi-model mode, the provider is fixed by the add button above and shown here as read-only.")}
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

                      <ModelVariantField
                        provider={role.provider}
                        model={role.model}
                        locale={locale}
                        label={text(locale, "模型变体", "Model variant")}
                        onModelChange={(model) => updateParticipant(role.id, (item) => ({ ...item, model }))}
                      />

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
                    <ParticipantCheckControls
                      participant={role}
                      locale={locale}
                      status={session.status}
                      checkState={session.participantChecks[role.id]}
                      onCheck={session.runParticipantCheck}
                    />
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

                    <ModelVariantField
                      provider={judge.provider}
                      model={judge.model}
                      locale={locale}
                      label={text(locale, "裁判模型变体", "Judge model variant")}
                      onModelChange={(model) => updateParticipant(judge.id, (item) => ({ ...item, model, stance: "neutral" }))}
                    />

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
                  <ParticipantCheckControls
                    participant={judge}
                    locale={locale}
                    status={session.status}
                    checkState={session.participantChecks[judge.id]}
                    onCheck={session.runParticipantCheck}
                  />
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

          {session.error ? <div className="alert">{session.error}</div> : null}

          <div className="status-strip">
            <span className="chip">{text(locale, "状态", "Status")}: {statusLabel(session.status, locale)}</span>
            <span className="chip">{text(locale, "阶段", "Stage")}: {stageLabel(session.stage, locale)}</span>
            <span className="chip">{text(locale, "轮次", "Round")}: {session.round}</span>
            <span className="chip">{text(locale, "已运行", "Elapsed")}: {(session.elapsedMs / 1000).toFixed(0)}s</span>
          </div>

          <div className="button-row">
            <button type="button" className="button button-primary" disabled={session.status === "running"} onClick={session.startDiscussion}>
              {text(locale, "开始讨论", "Start discussion")}
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={session.status !== "running"}
              onClick={session.pauseDiscussion}
            >
              {text(locale, "暂停", "Pause")}
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={session.status !== "paused"}
              onClick={session.continueDiscussion}
            >
              {text(locale, "继续", "Continue")}
            </button>
            {session.failedAction ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={session.retryCurrentStep}
              >
                {text(locale, "重试当前步骤", "Retry current step")}
              </button>
            ) : null}
            {session.failedAction ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={session.skipCurrentStep}
              >
                {text(locale, "跳过当前步骤", "Skip this step")}
              </button>
            ) : null}
            {session.transcript.length ? (
              <button type="button" className="button button-secondary" onClick={() => downloadFile("debate.csv", buildCsv(session.transcript), "text/csv")}>
                CSV
              </button>
            ) : null}
            {session.transcript.length ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => downloadFile("debate.txt", session.transcript.map((turn) => `${turn.speaker}\n${turn.content}`).join("\n\n"), "text/plain")}
              >
                TXT
              </button>
            ) : null}
            {session.transcript.length ? (
              <button type="button" className="button button-secondary" onClick={() => downloadFile("debate.json", JSON.stringify(session.transcript, null, 2), "application/json")}>
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
                {session.loadingLabel ||
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
              {session.transcript.length ? (
                session.transcript.map((turn) => (
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
                  {text(locale, "还没有讨论记录。先在上半部分完成配置，再点击\u201c开始讨论\u201d。", "No discussion yet. Configure above, then click Start discussion.")}
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
            <textarea value={session.draftUserMessage} onChange={(event) => session.setDraftUserMessage(event.target.value)} />
            <div className="mini-actions">
              <button type="button" className="button button-secondary" onClick={session.addUserComment}>
                {text(locale, "加入讨论记录", "Add to transcript")}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
