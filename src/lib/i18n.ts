import { HELP_SECTIONS } from "@/lib/help-content";
import { PERSONA_PRESETS } from "@/lib/persona-presets";
import { PROVIDER_CATALOG } from "@/lib/provider-catalog";
import type { Locale } from "@/types/debate";

export function t<T extends Record<Locale, string>>(value: T, locale: Locale) {
  return value[locale];
}

export const APP_COPY = {
  appName: { zh: "思辨剧场", en: "Deliberation Studio" },
  heroTitle: {
    zh: "让多个 AI 围绕同一个问题展开讨论，帮你更快看清分歧与结论",
    en: "Let multiple AIs debate one question so you can see disagreements and conclusions faster",
  },
  heroSubtitle: {
    zh: "输入问题、选择模式、开始讨论。你会得到可读的过程记录和清晰总结，不需要编程背景。",
    en: "Enter a question, choose a mode, and start. Get readable debate logs and a clear summary without coding knowledge.",
  },
  starterLabel: { zh: "新手模式", en: "Beginner mode" },
  advancedLabel: { zh: "专业模式", en: "Pro mode" },
  quickSteps: {
    zh: ["第一步：输入问题", "第二步：选择模型和模式", "第三步：开始讨论并查看总结"],
    en: ["Step 1: Enter your question", "Step 2: Choose models and mode", "Step 3: Start and read the summary"],
  },
};

export function buildHelpSnapshot(locale: Locale) {
  return HELP_SECTIONS.map((section) => ({
    id: section.id,
    title: section.title[locale],
    body: section.body[locale],
  }));
}

export function buildProviderSnapshot(locale: Locale) {
  return Object.values(PROVIDER_CATALOG).map((provider) => ({
    kind: provider.kind,
    label: provider.label[locale],
    description: provider.shortDescription[locale],
    apiKeyHelp: provider.apiKeyHelp[locale],
    officialUrl: provider.officialUrl,
    apiConsoleUrl: provider.apiConsoleUrl,
    models: provider.modelPresets.map((model) => ({
      value: model.value,
      label: model.label,
      summary: model.summary[locale],
    })),
  }));
}

export function buildPersonaSnapshot(locale: Locale) {
  return PERSONA_PRESETS.map((persona) => ({
    id: persona.id,
    label: persona.label[locale],
    summary: persona.summary[locale],
  }));
}
