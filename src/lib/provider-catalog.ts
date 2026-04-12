import type { DebateStance, Locale, ParticipantConfig, ProviderKind, ProviderMeta } from "@/types/debate";

export const PROVIDER_CATALOG: Record<ProviderKind, ProviderMeta> = {
  openai: {
    kind: "openai",
    label: { zh: "GPT / OpenAI", en: "GPT / OpenAI" },
    shortDescription: {
      zh: "通用能力强，适合结构化讨论、总结和多轮比较。",
      en: "Strong general capability for structured discussion, summaries, and multi-round comparison.",
    },
    apiKeyHelp: {
      zh: "前往 OpenAI 官方平台创建 API Key（外部网站）。",
      en: "Create an API key on the official OpenAI platform (external site).",
    },
    officialUrl: "https://openai.com",
    apiConsoleUrl: "https://platform.openai.com/api-keys",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.4-mini",
    supportsNativeSearch: true,
    supportsJsonMode: true,
    modelPresets: [
      {
        value: "gpt-5.4",
        label: "GPT-5.4",
        summary: {
          zh: "更适合复杂分析和深度总结，通常成本更高。",
          en: "Better for deeper analysis and richer summaries, usually at a higher cost.",
        },
      },
      {
        value: "gpt-5.4-mini",
        label: "GPT-5.4 Mini",
        summary: {
          zh: "更省钱、更快，适合日常讨论和快速测试。",
          en: "Cheaper and faster, good for everyday discussion and quick testing.",
        },
      },
      {
        value: "gpt-4.1",
        label: "GPT-4.1",
        summary: {
          zh: "稳定通用，适合较长文本分析。",
          en: "Stable and versatile for longer text analysis.",
        },
      },
      {
        value: "gpt-4.1-mini",
        label: "GPT-4.1 Mini",
        summary: {
          zh: "轻量低成本，适合简单任务。",
          en: "Lightweight and cost-efficient for simpler tasks.",
        },
      },
    ],
  },
  anthropic: {
    kind: "anthropic",
    label: { zh: "Claude / Anthropic", en: "Claude / Anthropic" },
    shortDescription: {
      zh: "擅长长文本理解、细致表达和条件分析。",
      en: "Strong for long-context understanding, nuanced writing, and conditional analysis.",
    },
    apiKeyHelp: {
      zh: "前往 Anthropic Console 创建 API Key（外部网站）。",
      en: "Create an API key in Anthropic Console (external site).",
    },
    officialUrl: "https://www.anthropic.com",
    apiConsoleUrl: "https://console.anthropic.com/settings/keys",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-haiku-4-5",
    supportsNativeSearch: true,
    supportsJsonMode: false,
    modelPresets: [
      {
        value: "claude-sonnet-4-5",
        label: "Claude Sonnet 4.5",
        summary: {
          zh: "更适合复杂推理和高质量写作。",
          en: "Better for complex reasoning and higher-quality writing.",
        },
      },
      {
        value: "claude-haiku-4-5",
        label: "Claude Haiku 4.5",
        summary: {
          zh: "更轻量、更快，适合低成本多轮讨论。",
          en: "Lighter and faster, good for lower-cost multi-round discussion.",
        },
      },
      {
        value: "claude-3.5-haiku",
        label: "Claude 3.5 Haiku",
        summary: {
          zh: "适合简单问答和快速验证。",
          en: "Good for quick Q&A and lightweight validation.",
        },
      },
    ],
  },
  gemini: {
    kind: "gemini",
    label: { zh: "Gemini / Google", en: "Gemini / Google" },
    shortDescription: {
      zh: "响应快，适合资料整合、快速比较和轻量联网讨论。",
      en: "Fast responses, good for synthesis, comparison, and lightweight web-assisted discussion.",
    },
    apiKeyHelp: {
      zh: "前往 Google AI Studio 创建 API Key（外部网站）。",
      en: "Create an API key in Google AI Studio (external site).",
    },
    officialUrl: "https://ai.google.dev",
    apiConsoleUrl: "https://aistudio.google.com/app/apikey",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-3.1-flash-lite-preview",
    supportsNativeSearch: true,
    supportsJsonMode: false,
    modelPresets: [
      {
        value: "gemini-3.1-pro-preview",
        label: "Gemini 3.1 Pro Preview",
        summary: {
          zh: "更适合复杂推理和长上下文分析。",
          en: "Better for complex reasoning and long-context analysis.",
        },
      },
      {
        value: "gemini-3-flash-preview",
        label: "Gemini 3 Flash Preview",
        summary: {
          zh: "速度快，适合大多数场景。",
          en: "Fast and suitable for most scenarios.",
        },
      },
      {
        value: "gemini-3.1-flash-lite-preview",
        label: "Gemini 3.1 Flash-Lite Preview",
        summary: {
          zh: "更轻量、更省钱，适合低成本测试。",
          en: "Lighter and cheaper, good for low-cost testing.",
        },
      },
    ],
  },
  deepseek: {
    kind: "deepseek",
    label: { zh: "DeepSeek", en: "DeepSeek" },
    shortDescription: {
      zh: "支持 Chat 和 Reasoner。在本项目中，联网依赖外部搜索增强。",
      en: "Supports Chat and Reasoner. In this app, live web search relies on external search augmentation.",
    },
    apiKeyHelp: {
      zh: "前往 DeepSeek 官方平台创建 API Key（外部网站）。",
      en: "Create an API key on the official DeepSeek platform (external site).",
    },
    officialUrl: "https://www.deepseek.com",
    apiConsoleUrl: "https://platform.deepseek.com/api_keys",
    defaultBaseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
    supportsNativeSearch: false,
    supportsJsonMode: true,
    modelPresets: [
      {
        value: "deepseek-chat",
        label: "DeepSeek Chat",
        summary: {
          zh: "更适合日常讨论和快速回复。",
          en: "Better for everyday discussion and faster replies.",
        },
      },
      {
        value: "deepseek-reasoner",
        label: "DeepSeek Reasoner",
        summary: {
          zh: "更适合推理密集和复杂分析任务。",
          en: "Better for reasoning-heavy and complex analysis tasks.",
        },
      },
    ],
  },
  xai: {
    kind: "xai",
    label: { zh: "Grok / xAI", en: "Grok / xAI" },
    shortDescription: {
      zh: "支持原生联网搜索，适合查证最新信息和多轮追问。",
      en: "Supports native web search, good for fresh information checks and follow-up probing.",
    },
    apiKeyHelp: {
      zh: "前往 xAI Console 创建 API Key（外部网站）。",
      en: "Create an API key in xAI Console (external site).",
    },
    officialUrl: "https://docs.x.ai/developers",
    apiConsoleUrl: "https://console.x.ai",
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-4",
    supportsNativeSearch: true,
    supportsJsonMode: false,
    modelPresets: [
      {
        value: "grok-4",
        label: "Grok 4",
        summary: {
          zh: "稳定通用，适合大多数辩论场景。",
          en: "Stable general-purpose choice for most debate scenarios.",
        },
      },
      {
        value: "grok-4.20-reasoning",
        label: "Grok 4.20 Reasoning",
        summary: {
          zh: "更适合深入推理和复杂讨论。",
          en: "Better for deeper reasoning and more complex discussion.",
        },
      },
      {
        value: "grok-3-mini",
        label: "Grok 3 Mini",
        summary: {
          zh: "更轻量，适合低成本快速测试。",
          en: "Lighter and cheaper for quick experiments.",
        },
      },
    ],
  },
  custom: {
    kind: "custom",
    label: { zh: "第三方 / OpenAI 兼容", en: "Third-party / OpenAI-compatible" },
    shortDescription: {
      zh: "用于接入兼容 OpenAI API 的第三方模型服务或中转站。",
      en: "Use this for third-party services or relays compatible with OpenAI APIs.",
    },
    apiKeyHelp: {
      zh: "填写你所使用平台提供的 API Key。",
      en: "Use the API key provided by your chosen platform.",
    },
    officialUrl: "https://platform.openai.com/docs/api-reference",
    apiConsoleUrl: "https://platform.openai.com/docs/api-reference",
    defaultBaseUrl: "https://your-provider.example/v1",
    defaultModel: "your-model-name",
    supportsNativeSearch: false,
    supportsJsonMode: false,
    modelPresets: [],
  },
};

const DEFAULT_STANCES: DebateStance[] = ["support", "oppose", "neutral"];

function defaultStance(index: number) {
  return DEFAULT_STANCES[index % DEFAULT_STANCES.length];
}

export function stanceLabel(stance: DebateStance, locale: Locale) {
  const labels = {
    support: { zh: "支持方", en: "Support" },
    oppose: { zh: "反对方", en: "Oppose" },
    neutral: { zh: "中立", en: "Neutral" },
    free: { zh: "自由立场", en: "Free stance" },
  };

  return labels[stance][locale];
}

export function sideLabel(stance: DebateStance, locale: Locale) {
  return stanceLabel(stance, locale);
}

export function createParticipant(kind: ProviderKind, index: number, locale: Locale): ParticipantConfig {
  const meta = PROVIDER_CATALOG[kind];
  const stance = defaultStance(index);

  return {
    id: crypto.randomUUID(),
    provider: kind,
    label: `${meta.label[locale]} ${index + 1}`,
    roleName: stanceLabel(stance, locale),
    stance,
    model: meta.defaultModel,
    apiKey: "",
    baseUrl: meta.defaultBaseUrl,
    enableSearch: true,
    persona: index % 2 === 0 ? "balanced_standard" : "pragmatist",
    personaDescription: locale === "zh" ? "请用清晰、连贯、易读的方式表达观点。" : "Use a clear, coherent, and readable style.",
    includeInFinalSummary: true,
    systemPrompt: "",
  };
}

export function duplicateParticipant(source: ParticipantConfig, locale: Locale) {
  return {
    ...source,
    id: crypto.randomUUID(),
    label: locale === "zh" ? `${source.label} 副本` : `${source.label} copy`,
  };
}

export function providerSupportsNativeSearch(kind: ProviderKind) {
  return PROVIDER_CATALOG[kind].supportsNativeSearch;
}

export function providerLabel(kind: ProviderKind, locale: Locale) {
  return PROVIDER_CATALOG[kind].label[locale];
}
