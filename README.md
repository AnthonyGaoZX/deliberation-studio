# Deliberation Studio

[English](#english) | [中文](#中文)

Deliberation Studio is a multi-AI debate and decision-support web app for everyday users.

Instead of talking to only one model, you can let multiple AIs discuss the same question from different angles, compare their reasoning, check web evidence, and get a final summary that is much easier to read than a raw chat log.

## Highlights

- Multi-AI discussion with OpenAI, Claude, Gemini, DeepSeek, and Grok
- Single-model multi-persona mode when you only have one API key
- Four discussion types: Conclusion, Analysis, Research, and Entertainment
- Native search and external search augmentation
- Beginner mode for fast setup, Pro mode for deeper control
- Chinese and English interface
- Export discussion logs as CSV, TXT, or JSON

---

## English

### What this project is

This is not just an API playground for developers.

It is a decision-support product for normal users who want help comparing viewpoints, stress-testing ideas, and understanding disagreement before making a choice.

You ask one question, choose one or more models, and let them debate. The app then gives you:

- a readable round-by-round discussion
- search notes and source links
- a judge summary
- exportable logs for later review

### Core use cases

- Compare how different model providers think about the same problem
- Simulate multiple viewpoints even if you only have one API key
- Explore trade-offs before making a decision
- Collect debate records for research or review
- Turn a vague question into a clearer conclusion

### Beginner guide: what “Global Configuration” means

At the top of the page, there is one provider settings area.

That area is called **Global Configuration**. It means:

- you enter a provider API key once
- you enter that provider Base URL once
- below that, every debater card and judge card only needs to choose the provider and model variant

You do **not** need to paste the same key into every card.

Example:

- You fill in your OpenAI key once at the top
- Then below, you can switch between `gpt-5.4-mini` and another OpenAI model without entering the key again

This is simpler, safer, and much less error-prone.

### Beginner guide: what “Base URL” means

Base URL means: **where the app sends your API request**.

There are two common situations:

1. You bought API access directly from the official provider  
   In this case, you usually keep the official default Base URL.

2. You bought your key from a relay or proxy platform  
   In this case, you **must** replace the Base URL with the relay address they gave you.

If you forget to do that, you may see errors like:

- invalid API key
- model not found
- unsupported parameter

#### Example: OhMyGPT relay

If your key comes from OhMyGPT, a common Base URL is:

```txt
https://api.ohmygpt.com/v1
```

Simple rule:

- official key -> official Base URL
- relay key -> relay Base URL

### Security warning

- This project is meant to run in your own browser or local environment.
- Your keys stay under your control, but they are still sensitive.
- Never post screenshots that show your API keys.
- Never upload `.env.local` to GitHub.
- Only upload `.env.example`.

### Local setup for beginners

#### Windows

1. Install [Node.js](https://nodejs.org/) version 20 or newer.
2. Download or clone this project.
3. In the project folder, copy `.env.example`.
4. Rename the copy to `.env.local`.
5. Open `.env.local` with Notepad or another editor.
6. Fill in your real API keys and Base URLs.
7. Open PowerShell in the project folder.
8. Run:

```bash
npm install
npm run dev
```

9. Open your browser and visit:

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

Copy `.env.example` to `.env.local`, then fill in what you actually use.

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

### Easy deployment to Vercel

You do **not** need to buy a server to put this online.

The easiest option for most people is [Vercel](https://vercel.com/).

#### What you need

- a GitHub account
- a Vercel account

#### Simple flow

1. Upload this project to your own GitHub repository.
2. Go to [Vercel](https://vercel.com/).
3. Sign in with GitHub.
4. Click **Add New Project**.
5. Choose your GitHub repository.
6. Add your environment variables in Vercel.
7. Click **Deploy**.

Vercel usually detects this as a Next.js project automatically, so you do not need to rent or configure a server by hand.

After deployment:

- you get your own website URL
- future GitHub updates can redeploy automatically

### “Deploy to Vercel” tip

If you want a one-click deployment page later, you can add a Vercel button to your own public repository page after publishing the repo.

For most beginners, the manual flow above is already the easiest path.

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

这不是一个只给程序员测试 API 的工具。

它更像一个“多 AI 辩论与深度决策辅助引擎”，适合普通用户把同一个问题交给多个 AI 从不同角度讨论，再由系统帮你整理重点、分歧和结论。

你只需要输入一个问题，选择一个或多个模型，就可以看到：

- 一轮一轮可读的讨论过程
- 联网搜索说明和来源链接
- 裁判总结
- 可导出的完整记录

### 核心特色

- 支持 OpenAI、Claude、Gemini、DeepSeek、Grok
- 支持“单模型多人格”模拟讨论
- 支持定论 / 分析 / 研究 / 娱乐四种讨论类型
- 支持原生搜索与外部搜索增强
- 支持新手模式与专业模式
- 支持中文 / English 双语界面

### 什么是“全局配置”

页面顶部有一个统一的厂商配置区，这就是“全局配置”。

它的意思是：

- 每家厂商的 API Key 只需要填一次
- 每家厂商的 Base URL 只需要填一次
- 下面的辩手卡片和裁判卡片只负责选“用哪家模型、哪个变体”

你**不需要**每加一个辩手，就把同一个 Key 再粘贴一遍。

举个最简单的例子：

- 你在顶部填好了 OpenAI 的 Key
- 下面无论你切换 `gpt-5.4-mini` 还是别的 OpenAI 变体
- 都会自动复用同一套连接配置

这样更省事，也更不容易填错。

### 什么是 Base URL

Base URL 可以理解成：“请求到底发到哪里去”。

最常见有两种情况：

1. 你直接在官方平台买的 API  
   一般用默认官方地址，不需要改。

2. 你是在第三方中转站买的 Key  
   这种情况你**必须**把 Base URL 改成中转站给你的代理地址。

如果不改，程序就可能报：

- API Key 无效
- 模型不存在
- 参数不支持

#### 例子：OhMyGPT

如果你的 Key 是在 OhMyGPT 之类的中转平台购买的，常见写法就是：

```txt
https://api.ohmygpt.com/v1
```

你可以这样记：

- 官方买的 Key -> 通常配官方 Base URL
- 中转站买的 Key -> 通常配中转站 Base URL

### 安全提醒

- 这个工具默认是在你自己的浏览器 / 本地环境中运行。
- 你的 Key 依然非常敏感，绝对不要截图发给别人。
- 绝对不要把 `.env.local` 上传到 GitHub。
- 开源仓库里只保留 `.env.example` 就够了。

### 小白本地启动指南

#### Windows 用户

1. 先安装 [Node.js](https://nodejs.org/) 20 或更高版本。
2. 下载或克隆本项目。
3. 在项目根目录里找到 `.env.example`。
4. 复制一份，重命名为 `.env.local`。
5. 用记事本打开 `.env.local`。
6. 把你自己的 Key 和 Base URL 填进去。
7. 在项目文件夹空白处打开 PowerShell。
8. 输入：

```bash
npm install
npm run dev
```

9. 浏览器打开：

```txt
http://localhost:3000
```

#### macOS / Linux 用户

```bash
npm install
npm run dev
```

然后打开：

```txt
http://localhost:3000
```

### `.env.local` 示例

把 `.env.example` 复制成 `.env.local` 后，可以像这样填写：

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

### 最适合小白的免费部署方式：Vercel

如果你不想买服务器，也不想自己配后端，最简单的办法就是部署到 [Vercel](https://vercel.com/)。

#### 你需要准备

- 一个 GitHub 账号
- 一个 Vercel 账号

#### 最简单流程

1. 先把这个项目上传到你自己的 GitHub 仓库。
2. 打开 [Vercel](https://vercel.com/)。
3. 用 GitHub 登录。
4. 点击 **Add New Project**。
5. 选择你刚上传的 GitHub 仓库。
6. 在 Vercel 里填好环境变量。
7. 点击 **Deploy**。

Vercel 一般会自动识别这是一个 Next.js 项目，所以通常不需要你自己买服务器或手动配环境。

部署完成后：

- 你会得到一个属于自己的网页地址
- 以后只要更新 GitHub，Vercel 还可以自动重新部署

### “一键部署到 Vercel”怎么理解

很多开源项目会在仓库首页提供一个“Deploy to Vercel”按钮。

你发布到 GitHub 之后，也可以再加这个按钮。

但对大多数零基础用户来说，按上面的步骤在 Vercel 后台点几下，其实已经是最省心的方式了。

### 常用命令

```bash
npm run dev
npm run lint
npm run test
npm run build
```
