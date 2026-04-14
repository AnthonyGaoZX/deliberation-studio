import type { Locale } from "@/types/debate";

export type HelpSection = {
  id: string;
  title: Record<Locale, string>;
  body: Record<Locale, string[]>;
};

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "quick-start",
    title: { zh: "快速开始", en: "Quick Start" },
    body: {
      zh: [
        "1. 在页面顶部输入你想讨论的问题。",
        "2. 在“全局大模型配置”里填入你要使用的 API Key。",
        "3. 如果你的 Key 来自第三方中转站，还要把对应的 Base URL 填进去。",
        "4. 然后在下方选择模型、讨论模式和角色设置，最后点击“开始讨论”。",
        "5. 页面下半部分会显示完整讨论过程、联网说明、裁判总结和导出按钮。",
      ],
      en: [
        "1. Enter the question you want to discuss at the top of the page.",
        "2. Fill in the API keys you want to use in Global Model Settings.",
        "3. If your key comes from a relay service, also fill in the matching Base URL.",
        "4. Then choose the models, discussion mode, and role settings below, and click Start discussion.",
        "5. The lower half of the page shows the debate log, search notes, judge summary, and export actions.",
      ],
    },
  },
  {
    id: "global-config",
    title: { zh: "什么是全局配置", en: "What Global Configuration Means" },
    body: {
      zh: [
        "全局配置的意思是：每家厂商的 API Key 和 Base URL 只需要在顶部填写一次。",
        "填好之后，下面的辩手和裁判卡片只负责选择“用哪家模型、哪个变体”，不用反复粘贴同一个密钥。",
        "这样更省事，也更不容易填错。比如你已经填好了 OpenAI 的 Key，下面切换 GPT 的不同变体时会自动复用顶部配置。",
      ],
      en: [
        "Global configuration means each provider API key and Base URL is entered once at the top of the page.",
        "After that, debater and judge cards only choose which provider and model variant to use. You do not need to paste the same key again and again.",
        "This is simpler and less error-prone. For example, once your OpenAI key is filled in above, changing GPT variants below will automatically reuse that connection.",
      ],
    },
  },
  {
    id: "base-url",
    title: { zh: "什么是 Base URL（非常重要）", en: "What Base URL Means (Very Important)" },
    body: {
      zh: [
        "Base URL 可以理解成“请求要发到哪里去”。",
        "如果你直接在官方平台购买 API，一般保持默认官方地址即可。",
        "如果你的 Key 来自第三方中转站，比如 OhMyGPT，就必须把 Base URL 改成中转站给你的代理地址，否则程序可能会报“模型不存在”“鉴权失败”或“参数不支持”等错误。",
        "OhMyGPT 的常见示例：Base URL = https://api.ohmygpt.com/v1",
        "一句话记忆：官方买的 Key 通常配官方 Base URL；中转站买的 Key 通常配中转站 Base URL。",
      ],
      en: [
        "Base URL means “where your API request is sent.”",
        "If you bought API access directly from the official provider, you can usually keep the default official URL.",
        "If your key comes from a relay service such as OhMyGPT, you must replace Base URL with the relay address. Otherwise requests may fail with errors like model not found, auth failure, or unsupported parameters.",
        "Common OhMyGPT example: Base URL = https://api.ohmygpt.com/v1",
        "Easy rule of thumb: official key -> official Base URL; relay key -> relay Base URL.",
      ],
    },
  },
  {
    id: "security",
    title: { zh: "安全提醒", en: "Security Warning" },
    body: {
      zh: [
        "这个项目默认在你自己的浏览器和本地环境中运行，不会把你的 Key 上传给作者代你调用。",
        "但你的 Key 依然非常敏感。不要把带有 Key 的截图发给别人，也不要把 .env.local 上传到 GitHub。",
        "公开分享项目时，只提交 .env.example，不要提交你自己的真实密钥文件。",
      ],
      en: [
        "This project is designed to run in your own browser and local environment. It does not send your key to the author for proxy billing.",
        "Your keys are still sensitive. Do not share screenshots that contain keys, and do not upload .env.local to GitHub.",
        "When publishing the project, commit .env.example only. Never commit your real secret file.",
      ],
    },
  },
  {
    id: "modes",
    title: { zh: "如何选择模式", en: "How to Choose a Mode" },
    body: {
      zh: [
        "多模型模式：适合比较不同厂商模型的观点，比如 GPT、Claude、Gemini 同时讨论同一个问题。",
        "单 API 多人格模式：适合你只有一个 Key，但仍然希望看到多个角度的讨论。系统会让同一个模型扮演多个不同角色。",
        "定论模式：适合你希望最后得到一个更明确的建议。",
        "分析模式：适合你接受“不同场景下都可能成立”的结论。",
        "研究模式：重点在查证、反驳和持续验证，不让讨论太早收敛。",
        "娱乐模式：适合看更有戏剧张力、更有趣的人设对话。",
      ],
      en: [
        "Multi-model mode compares viewpoints across providers like GPT, Claude, and Gemini.",
        "Single-API multi-persona mode is for cases where you only have one key but still want multiple perspectives. The same model plays different roles.",
        "Conclusion mode is for getting a clearer final recommendation.",
        "Analysis mode is for scenario-dependent answers where multiple options may remain valid.",
        "Research mode focuses on verification, challenge, and continued checking before convergence.",
        "Entertainment mode is for more dramatic and playful debate styles.",
      ],
    },
  },
  {
    id: "search",
    title: { zh: "联网搜索怎么工作", en: "How Web Search Works" },
    body: {
      zh: [
        "你可以选择不联网、统一搜索一次、每位角色独立搜索，或者混合模式。",
        "OpenAI、Claude、Gemini 和 Grok 会优先使用各自的原生联网；DeepSeek 会通过外部搜索增强联网。",
        "如果某一轮联网失败，系统会明确告诉你“本轮主要基于模型已有知识生成”，而不是让整场讨论直接崩掉。",
      ],
      en: [
        "You can choose no search, shared-once search, per-role search, or hybrid mode.",
        "OpenAI, Claude, Gemini, and Grok prefer their own native web search first. DeepSeek uses external search augmentation.",
        "If a search step fails, the app clearly tells you that the round relied mainly on built-in model knowledge instead of crashing the whole session.",
      ],
    },
  },
  {
    id: "vercel",
    title: { zh: "如何免费部署到 Vercel", en: "How to Deploy Free on Vercel" },
    body: {
      zh: [
        "如果你不想自己买服务器，最简单的方式就是部署到 Vercel。",
        "大致流程是：把项目上传到 GitHub -> 注册并登录 Vercel -> 让 Vercel 连接你的 GitHub 仓库 -> 点击部署。",
        "Vercel 会自动识别这是一个 Next.js 项目，通常不需要你手动配置服务器。",
        "部署完成后，你会得到一个属于自己的网页地址。以后每次更新 GitHub，Vercel 还可以自动重新部署。",
      ],
      en: [
        "If you do not want to manage a server, the easiest option is Vercel.",
        "The usual flow is: push the project to GitHub -> sign in to Vercel -> connect your GitHub repository -> click Deploy.",
        "Vercel automatically detects this as a Next.js project, so you usually do not need to configure a server manually.",
        "After deployment, you get your own web URL. Future GitHub updates can also trigger automatic redeploys.",
      ],
    },
  },
  {
    id: "official-links",
    title: { zh: "官方 API 页面（外部链接）", en: "Official API Pages (External Links)" },
    body: {
      zh: ["OpenAI、Anthropic、Gemini、DeepSeek 和 xAI 的官方入口会在本帮助面板下方统一展示。"],
      en: ["Official pages for OpenAI, Anthropic, Gemini, DeepSeek, and xAI are listed below in this help panel."],
    },
  },
];
