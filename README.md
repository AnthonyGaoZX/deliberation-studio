# Deliberation Studio

**A multi-AI debate and decision-support engine for real questions.**

[English](#english) | [中文](#中文)

![Open Source](https://img.shields.io/badge/Open%20Source-Yes-1f6feb)
![Next.js](https://img.shields.io/badge/Built%20with-Next.js-111111)
![BYOK](https://img.shields.io/badge/API%20Mode-Bring%20Your%20Own%20Key-0f766e)
![Bilingual](https://img.shields.io/badge/Language-English%20%2F%20中文-a855f7)

Deliberation Studio helps people compare viewpoints, stress-test ideas, and make better decisions by letting multiple AIs discuss the same question in a structured, readable way.

Instead of opening five separate chat windows and manually comparing answers, you can ask one question, choose one or more models, and watch them debate, challenge, verify, and summarize.

## Why this project is different

- It is built for **decision support**, not just generic chat.
- It supports **multiple providers**: OpenAI, Claude, Gemini, DeepSeek, and Grok.
- It also supports **single-model multi-persona discussion**, so one API key is enough to simulate multiple viewpoints.
- It gives you **structured discussion logs**, not just a messy transcript.
- It supports **web search enhancement** for freshness and verification.
- It is designed for **normal users**, not only developers.

## What you can do with it

- Compare how different models respond to the same question
- Simulate multiple viewpoints with a single model
- Turn a fuzzy question into a clearer recommendation
- Explore trade-offs before making a real-life choice
- Export debate logs for later review or research

## Core features

- Multi-AI debate with OpenAI, Claude, Gemini, DeepSeek, and Grok
- Single-model multi-persona mode
- Four discussion types:
  - Conclusion
  - Analysis
  - Research
  - Entertainment
- Native and external web search enhancement
- Beginner mode and Pro mode
- Chinese and English UI
- CSV / TXT / JSON export

## Who this is for

- People comparing options before making a decision
- Researchers who want a discussion log instead of a single answer
- Creators exploring different styles or arguments
- Non-technical users who still want serious multi-model comparison

## Try it

- Local run: follow the quick-start steps below
- Public demo: deploy your own copy on Vercel in a few minutes

If you are publishing this project on GitHub, the best experience is:

1. Put this repo on GitHub  
2. Deploy it on Vercel  
3. Share the live link in this README  

---

## English

### What this project is

Deliberation Studio is a web app for multi-AI discussion, structured comparison, and decision support.

It is **not** just an API playground for developers.

It is designed for people who want to:

- compare disagreement clearly
- see how different models reason
- test assumptions
- get a final summary they can actually use

### How it works

1. Enter one question
2. Choose one or more models, or use one model with multiple personas
3. Start the discussion and read the final summary

### Discussion modes

- **Conclusion**: best when you want a clearer final recommendation
- **Analysis**: best when multiple options may remain valid depending on the scenario
- **Research**: best when you want continued verification, challenge, and evidence gathering
- **Entertainment**: best when you want a more dramatic, playful debate style

### Why “single-model multi-persona” matters

Even if you only have one API key, you can still run a meaningful discussion.

The same model can play different roles, such as:

- a balanced evaluator
- a skeptic
- a pragmatic planner
- a risk-averse critic

This makes the app useful even for low-cost personal use.

### Beginner guide: what “Global Configuration” means

At the top of the page, there is one provider settings area.

That area is called **Global Configuration**. It means:

- you enter a provider API key once
- you enter that provider Base URL once
- below that, each debater or judge card only chooses provider + model variant

You do **not** need to paste the same key into every card.

Example:

- Fill in your OpenAI key once at the top
- Then below, switch between `gpt-5.4-mini` and another OpenAI variant without entering the key again

### Beginner guide: what “Base URL” means

Base URL means: **where the app sends your API request**.

Two common cases:

1. You bought API access directly from the official provider  
   Usually you keep the official default Base URL.

2. You bought your key from a relay or proxy service  
   You **must** replace Base URL with the relay address they gave you.

If you forget this, you may see errors such as:

- invalid API key
- model not found
- unsupported parameter

#### Example: OhMyGPT relay

```txt
https://api.ohmygpt.com/v1
```

Simple rule:

- official key -> official Base URL
- relay key -> relay Base URL

### Security warning

- This project is designed to run in your own browser or local environment.
- Your keys remain under your control, but they are still sensitive.
- Never share screenshots that show your API keys.
- Never upload `.env.local` to GitHub.
- Only upload `.env.example`.

### Local setup for beginners

#### Windows

1. Install [Node.js](https://nodejs.org/) version 20 or newer
2. Download or clone this repository
3. Copy `.env.example`
4. Rename the copy to `.env.local`
5. Open `.env.local`
6. Fill in your own API keys and Base URLs
7. Open PowerShell in the project folder
8. Run:

```bash
npm install
npm run dev
```

9. Open:

```txt
http://localhost:3000
```

#### macOS / Linux

```bash
npm install
npm run dev
```

Then open:

```txt
http://localhost:3000
```

### Example `.env.local`

```env
OPENAI_API_KEY=your_openai_key
OPENAI_BASE_URL=https://api.ohmygpt.com/v1

ANTHROPIC_API_KEY=your_claude_key
ANTHROPIC_BASE_URL=https://api.ohmygpt.com/v1

GEMINI_API_KEY=your_gemini_key
GEMINI_BASE_URL=https://api.ohmygpt.com/v1

DEEPSEEK_API_KEY=your_deepseek_key
DEEPSEEK_BASE_URL=https://api.deepseek.com

XAI_API_KEY=your_xai_key
XAI_BASE_URL=https://api.x.ai/v1
```

### Provider support

- OpenAI / GPT
- Anthropic / Claude
- Google / Gemini
- DeepSeek
- xAI / Grok
- Third-party OpenAI-compatible gateways

### Easy deployment to Vercel

You do **not** need to buy a server to put this online.

The easiest option for most people is [Vercel](https://vercel.com/).

#### What you need

- a GitHub account
- a Vercel account

#### Simple flow

1. Upload this project to your own GitHub repository
2. Go to [Vercel](https://vercel.com/)
3. Sign in with GitHub
4. Click **Add New Project**
5. Choose your GitHub repository
6. Configure environment variables if your deployment mode needs them
7. Click **Deploy**

Vercel usually detects this as a Next.js project automatically.

### Helpful commands

```bash
npm run dev
npm run lint
npm run test
npm run build
```

---

## 中文

### 这是什么项目

思辨剧场是一个面向普通用户的 **多 AI 辩论与深度决策辅助引擎**。

它不是一个单纯给程序员测试 API 的面板，而是一个帮助你：

- 比较不同观点
- 看清争议点
- 查证信息
- 得到更清晰总结

的网页产品。

你输入一个问题后，可以让多个 AI 一起讨论，也可以让同一个 AI 扮演多个不同人格，最后得到一份比普通聊天记录更清楚、更容易使用的结果。

### 它和普通聊天工具有什么不同

- 它更强调“**辅助决策**”，不是只陪你聊天
- 它支持“**多模型对比**”
- 它支持“**单模型多人格讨论**”
- 它会给你“**结构化讨论过程**”和“**最终总结**”
- 它支持“**联网查证**”
- 它的界面是按普通用户来设计的，不是开发者控制台

### 你可以拿它做什么

- 比较不同模型对同一个问题的看法
- 在只有一个 API key 的情况下模拟多角度讨论
- 在做决定前先看清利弊和分歧
- 保存讨论记录，后续复盘或研究
- 把一个模糊问题变成更明确的建议

### 四种讨论类型

- **定论**：适合希望得到更明确建议
- **分析**：适合接受“不同场景下答案不同”
- **研究**：适合持续查证、反驳、验证
- **娱乐**：适合更有戏剧感、更有趣的人设讨论

### 为什么“单模型多人格”很重要

就算你只有一个 API key，也依然能用这个项目。

因为系统可以让同一个模型分别扮演：

- 最均衡的分析者
- 怀疑主义者
- 务实执行者
- 风险厌恶型角色

这样即使低成本使用，也能看到多角度讨论。

### 什么是“全局配置”

页面顶部有一个统一的厂商配置区，这就是“全局配置”。

它的意思是：

- 每家厂商的 API Key 只需要填一次
- 每家厂商的 Base URL 只需要填一次
- 下面的辩手卡片和裁判卡片只负责选择“用哪家模型、哪个变体”

你**不需要**每加一个角色，就重新粘贴一遍同样的 Key。

举个例子：

- 你在顶部填好了 OpenAI 的 Key
- 下面切换不同 GPT 变体时
- 会自动复用同一套连接配置

### 什么是 Base URL

Base URL 可以理解成：“请求到底发到哪里去”。

最常见有两种情况：

1. 你直接在官方平台购买 API  
   一般保持默认官方地址即可。

2. 你是在第三方中转站购买的 Key  
   这种情况你**必须**把 Base URL 改成中转站给你的代理地址。

如果不改，程序就可能报：

- API Key 无效
- 模型不存在
- 参数不支持

#### 例子：OhMyGPT

```txt
https://api.ohmygpt.com/v1
```

一句话记忆：

- 官方买的 Key -> 通常配官方 Base URL
- 中转站买的 Key -> 通常配中转站 Base URL

### 安全提醒

- 这个项目默认在你自己的浏览器 / 本地环境中运行
- 你的 Key 很敏感，绝对不要截图发给别人
- 绝对不要把 `.env.local` 上传到 GitHub
- 开源仓库里只保留 `.env.example`

### 小白本地启动指南

#### Windows

1. 安装 [Node.js](https://nodejs.org/) 20 或更高版本
2. 下载或克隆本项目
3. 把 `.env.example` 复制一份
4. 重命名为 `.env.local`
5. 打开 `.env.local`
6. 填入你自己的 API key 和 Base URL
7. 在项目文件夹打开 PowerShell
8. 运行：

```bash
npm install
npm run dev
```

9. 浏览器打开：

```txt
http://localhost:3000
```

#### macOS / Linux

```bash
npm install
npm run dev
```

然后打开：

```txt
http://localhost:3000
```

### `.env.local` 示例

```env
OPENAI_API_KEY=你的_OpenAI_Key
OPENAI_BASE_URL=https://api.ohmygpt.com/v1

ANTHROPIC_API_KEY=你的_Claude_Key
ANTHROPIC_BASE_URL=https://api.ohmygpt.com/v1

GEMINI_API_KEY=你的_Gemini_Key
GEMINI_BASE_URL=https://api.ohmygpt.com/v1

DEEPSEEK_API_KEY=你的_DeepSeek_Key
DEEPSEEK_BASE_URL=https://api.deepseek.com

XAI_API_KEY=你的_Grok_Key
XAI_BASE_URL=https://api.x.ai/v1
```

### 支持的模型来源

- OpenAI / GPT
- Anthropic / Claude
- Google / Gemini
- DeepSeek
- xAI / Grok
- 兼容 OpenAI 的第三方中转或网关

### 最适合小白的免费部署方式：Vercel

如果你不想买服务器，也不想自己折腾部署，最简单的办法就是 [Vercel](https://vercel.com/)。

#### 你需要准备

- 一个 GitHub 账号
- 一个 Vercel 账号

#### 最简单流程

1. 把这个项目上传到你自己的 GitHub 仓库
2. 打开 [Vercel](https://vercel.com/)
3. 用 GitHub 登录
4. 点击 **Add New Project**
5. 选择你的 GitHub 仓库
6. 如果你的部署方式需要环境变量，再去填写
7. 点击 **Deploy**

Vercel 一般会自动识别这是一个 Next.js 项目。

### 常用命令

```bash
npm run dev
npm run lint
npm run test
npm run build
```

---

## Suggested GitHub topics

If you want more discoverability on GitHub, add these repository topics:

`ai`, `llm`, `multi-agent`, `debate`, `decision-support`, `nextjs`, `openai`, `anthropic`, `gemini`, `deepseek`, `grok`
