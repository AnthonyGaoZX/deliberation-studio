import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const PROJECT_ROOT = process.cwd();
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_TOKENS = 80;
const HELLO_PROMPT = "Please reply in Simplified Chinese with exactly one short sentence: 你好，我已连通。";
const SEARCH_PROMPT =
  "Please answer in Simplified Chinese using one or two short sentences. Summarize one important international news event from today and mention the source website if possible.";
const EXTERNAL_SEARCH_QUERY = "today major international news Reuters AP BBC";

const PROVIDERS = {
  openai: {
    label: "OpenAI / GPT",
    keyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    baseUrlEnv: "OPENAI_BASE_URL",
    defaultModel: "gpt-5.4-mini",
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  anthropic: {
    label: "Anthropic / Claude",
    keyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    baseUrlEnv: "ANTHROPIC_BASE_URL",
    defaultModel: "claude-haiku-4-5",
    defaultBaseUrl: "https://api.anthropic.com",
  },
  gemini: {
    label: "Google / Gemini",
    keyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    baseUrlEnv: "GEMINI_BASE_URL",
    defaultModel: "gemini-3.1-flash-lite-preview",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
  },
  deepseek: {
    label: "DeepSeek",
    keyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    defaultModel: "deepseek-chat",
    defaultBaseUrl: "https://api.deepseek.com",
  },
  xai: {
    label: "xAI / Grok",
    keyEnv: "XAI_API_KEY",
    modelEnv: "XAI_MODEL",
    baseUrlEnv: "XAI_BASE_URL",
    defaultModel: "grok-4",
    defaultBaseUrl: "https://api.x.ai/v1",
  },
};

loadEnvFile(path.join(PROJECT_ROOT, ".env"));
loadEnvFile(path.join(PROJECT_ROOT, ".env.local"));

const requestedProviders = parseProvidersArg(process.argv.slice(2));
const selectedProviders = requestedProviders.length
  ? requestedProviders
  : Object.keys(PROVIDERS).filter((provider) => process.env[PROVIDERS[provider].keyEnv]?.trim());

if (!selectedProviders.length) {
  console.error("No provider API keys were found. Create .env.local from .env.example first.");
  process.exit(1);
}

let hadFailures = false;

for (const provider of selectedProviders) {
  if (!PROVIDERS[provider]) {
    console.warn(`Skipping unknown provider: ${provider}`);
    hadFailures = true;
    continue;
  }

  const key = process.env[PROVIDERS[provider].keyEnv]?.trim();
  const model = process.env[PROVIDERS[provider].modelEnv]?.trim() || PROVIDERS[provider].defaultModel;
  const baseUrl = process.env[PROVIDERS[provider].baseUrlEnv]?.trim() || PROVIDERS[provider].defaultBaseUrl;

  if (!key) {
    console.warn(`Skipping ${provider}: missing ${PROVIDERS[provider].keyEnv}`);
    hadFailures = true;
    continue;
  }

  console.log(`\n========== ${PROVIDERS[provider].label} ==========\n`);
  console.log(`Model: ${model}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`API key loaded: ${maskKey(key)}`);

  const helloResult = await runHelloTest(provider, model, key, baseUrl);
  printResult("Test 1: Connectivity + Chinese text", helloResult);
  if (!helloResult.ok) {
    hadFailures = true;
    continue;
  }

  const searchResult = await runSearchTest(provider, model, key, baseUrl);
  printResult("Test 2: Live search", searchResult);
  if (!searchResult.ok) {
    hadFailures = true;
  }
}

if (hadFailures) {
  process.exitCode = 1;
} else {
  console.log("\nAll selected smoke tests completed successfully.");
}

function parseProvidersArg(args) {
  const joined = args
    .map((arg) => {
      if (arg.startsWith("--provider=")) return arg.slice("--provider=".length);
      if (arg.startsWith("--providers=")) return arg.slice("--providers=".length);
      return "";
    })
    .filter(Boolean)
    .join(",");

  return joined
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function maskKey(key) {
  if (key.length <= 10) return `${key.slice(0, 2)}***`;
  return `${key.slice(0, 4)}***${key.slice(-4)}`;
}

function shortText(value) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length > 220 ? `${clean.slice(0, 220)}...` : clean;
}

async function fetchJson(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let json = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    return { response, text, json };
  } finally {
    clearTimeout(timeout);
  }
}

function buildEndpoint(baseUrl, pathName) {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(pathName, normalized).toString();
}

function hostnameIncludes(baseUrl, expectedHost) {
  try {
    return new URL(baseUrl).hostname.toLowerCase().includes(expectedHost);
  } catch {
    return false;
  }
}

function isGatewayBase(provider, baseUrl) {
  if (provider === "openai") return !hostnameIncludes(baseUrl, "api.openai.com");
  if (provider === "anthropic") return !hostnameIncludes(baseUrl, "api.anthropic.com");
  if (provider === "gemini") return !hostnameIncludes(baseUrl, "generativelanguage.googleapis.com");
  return false;
}

function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

function extractError(json, text, status) {
  if (typeof json?.error === "string" && json.error.trim()) return json.error;
  if (json?.error?.message?.trim()) return json.error.message;
  if (json?.message?.trim()) return json.message;
  return shortText(text) || `HTTP ${status}`;
}

function collectUrls(value, bucket = new Set()) {
  if (!value) return bucket;

  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, bucket);
    return bucket;
  }

  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if ((key === "url" || key === "uri") && typeof nested === "string" && nested.startsWith("http")) {
        bucket.add(nested);
      } else {
        collectUrls(nested, bucket);
      }
    }
  }

  return bucket;
}

function extractResponsesText(json) {
  const direct = json?.output_text?.trim();
  if (direct) return direct;

  const lines = [];
  for (const item of json?.output ?? []) {
    if (typeof item?.text === "string" && item.text.trim()) {
      lines.push(item.text.trim());
    }
    for (const nested of item?.content ?? []) {
      if (typeof nested?.text === "string" && nested.text.trim()) {
        lines.push(nested.text.trim());
      }
    }
  }

  return lines.join("\n").trim();
}

function extractAnthropicText(json) {
  return (json?.content ?? [])
    .filter((block) => block?.type === "text")
    .map((block) => block?.text?.trim() || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractGeminiText(json) {
  return (json?.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part?.text?.trim() || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractChatCompletionText(json) {
  return json?.choices?.[0]?.message?.content?.trim() || "";
}

function containsSearchMarker(value) {
  if (!value) return false;
  if (typeof value === "string") return value.includes("web_search");
  if (Array.isArray(value)) return value.some((item) => containsSearchMarker(item));
  if (typeof value === "object") {
    return Object.entries(value).some(([key, nested]) => key.includes("web_search") || containsSearchMarker(nested));
  }
  return false;
}

function failureResult(error, searchStrategy) {
  return {
    ok: false,
    statusCode: 0,
    text: "",
    searchStrategy,
    searchTriggered: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

function buildExternalSearchPrompt(liveSearch) {
  return [
    "Answer in Simplified Chinese with one or two short sentences.",
    "Use the live web material below to summarize one important international news event from today.",
    "Mention the source website if possible. If the search material is weak, say that clearly.",
    `Live search summary: ${liveSearch.summary}`,
    liveSearch.sources.length ? `Sources: ${liveSearch.sources.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function runHelloTest(provider, model, apiKey, baseUrl) {
  try {
    switch (provider) {
      case "openai":
      case "anthropic":
      case "gemini":
        return isGatewayBase(provider, baseUrl)
          ? await callOpenAICompatibleProvider(provider, model, apiKey, baseUrl, HELLO_PROMPT)
          : provider === "openai"
            ? await callResponsesProvider(provider, model, apiKey, baseUrl, HELLO_PROMPT, false)
            : provider === "anthropic"
              ? await callAnthropicProvider(model, apiKey, baseUrl, HELLO_PROMPT, false)
              : await callGeminiProvider(model, apiKey, baseUrl, HELLO_PROMPT, false);
      case "xai":
        return await callResponsesProvider(provider, model, apiKey, baseUrl, HELLO_PROMPT, false);
      case "deepseek":
        return await callDeepSeekProvider(model, apiKey, baseUrl, HELLO_PROMPT);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  } catch (error) {
    return failureResult(error, "none");
  }
}

async function runSearchTest(provider, model, apiKey, baseUrl) {
  try {
    switch (provider) {
      case "openai":
        if (isGatewayBase(provider, baseUrl)) {
          const liveSearch = await performExternalSearch(EXTERNAL_SEARCH_QUERY, process.env.TAVILY_API_KEY?.trim());
          if (!liveSearch.ok) {
            return {
              ok: false,
              statusCode: liveSearch.statusCode,
              text: "",
              searchStrategy: liveSearch.searchStrategy,
              searchTriggered: false,
              error: liveSearch.error,
            };
          }

          const result = await callOpenAICompatibleProvider(provider, model, apiKey, baseUrl, buildExternalSearchPrompt(liveSearch));
          return {
            ...result,
            searchStrategy: `${liveSearch.searchStrategy}->gateway`,
            searchTriggered: true,
            searchSources: liveSearch.sources,
          };
        }

        return await callResponsesProvider(provider, model, apiKey, baseUrl, SEARCH_PROMPT, true);
      case "anthropic":
        if (isGatewayBase(provider, baseUrl)) {
          const liveSearch = await performExternalSearch(EXTERNAL_SEARCH_QUERY, process.env.TAVILY_API_KEY?.trim());
          if (!liveSearch.ok) {
            return {
              ok: false,
              statusCode: liveSearch.statusCode,
              text: "",
              searchStrategy: liveSearch.searchStrategy,
              searchTriggered: false,
              error: liveSearch.error,
            };
          }

          const result = await callOpenAICompatibleProvider(provider, model, apiKey, baseUrl, buildExternalSearchPrompt(liveSearch));
          return {
            ...result,
            searchStrategy: `${liveSearch.searchStrategy}->gateway`,
            searchTriggered: true,
            searchSources: liveSearch.sources,
          };
        }

        return await callAnthropicProvider(model, apiKey, baseUrl, SEARCH_PROMPT, true);
      case "gemini":
        if (isGatewayBase(provider, baseUrl)) {
          const liveSearch = await performExternalSearch(EXTERNAL_SEARCH_QUERY, process.env.TAVILY_API_KEY?.trim());
          if (!liveSearch.ok) {
            return {
              ok: false,
              statusCode: liveSearch.statusCode,
              text: "",
              searchStrategy: liveSearch.searchStrategy,
              searchTriggered: false,
              error: liveSearch.error,
            };
          }

          const result = await callOpenAICompatibleProvider(provider, model, apiKey, baseUrl, buildExternalSearchPrompt(liveSearch));
          return {
            ...result,
            searchStrategy: `${liveSearch.searchStrategy}->gateway`,
            searchTriggered: true,
            searchSources: liveSearch.sources,
          };
        }

        return await callGeminiProvider(model, apiKey, baseUrl, SEARCH_PROMPT, true);
      case "xai":
        return await callResponsesProvider(provider, model, apiKey, baseUrl, SEARCH_PROMPT, true);
      case "deepseek": {
        const liveSearch = await performExternalSearch(EXTERNAL_SEARCH_QUERY, process.env.TAVILY_API_KEY?.trim());
        if (!liveSearch.ok) {
          return {
            ok: false,
            statusCode: liveSearch.statusCode,
            text: "",
            searchStrategy: liveSearch.searchStrategy,
            searchTriggered: false,
            error: liveSearch.error,
          };
        }

        const result = await callDeepSeekProvider(model, apiKey, baseUrl, buildExternalSearchPrompt(liveSearch));
        return {
          ...result,
          searchStrategy: liveSearch.searchStrategy,
          searchTriggered: liveSearch.searchTriggered,
          searchSources: liveSearch.sources,
        };
      }
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  } catch (error) {
    return failureResult(error, "none");
  }
}

async function callResponsesProvider(provider, model, apiKey, baseUrl, input, useSearch) {
  const endpoint = buildEndpoint(baseUrl, "responses");
  const { response, json, text } = await fetchJson(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      tools: useSearch ? [{ type: "web_search" }] : undefined,
      include: useSearch ? ["web_search_call.action.sources"] : undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(extractError(json, text, response.status));
  }

  const output = extractResponsesText(json);
  const urls = [...collectUrls(json)];

  return {
    ok: true,
    statusCode: response.status,
    text: output,
    chineseOk: hasChinese(output),
    searchStrategy: useSearch ? "native:web_search" : "none",
    searchTriggered: useSearch ? containsSearchMarker(json) || urls.length > 0 : false,
    searchSources: urls,
  };
}

async function callAnthropicProvider(model, apiKey, baseUrl, input, useSearch) {
  const endpoint = buildEndpoint(baseUrl, "v1/messages");
  const { response, json, text } = await fetchJson(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: "user", content: input }],
      tools: useSearch ? [{ type: "web_search_20250305", name: "web_search" }] : undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(extractError(json, text, response.status));
  }

  const output = extractAnthropicText(json);
  const urls = [...collectUrls(json)];
  const nonTextBlocks = (json?.content ?? []).filter((block) => block?.type && block.type !== "text");

  return {
    ok: true,
    statusCode: response.status,
    text: output,
    chineseOk: hasChinese(output),
    searchStrategy: useSearch ? "native:web_search_20250305" : "none",
    searchTriggered: useSearch ? urls.length > 0 || nonTextBlocks.length > 0 : false,
    searchSources: urls,
  };
}

async function callGeminiProvider(model, apiKey, baseUrl, input, useSearch) {
  const endpoint = buildEndpoint(baseUrl, `models/${encodeURIComponent(model)}:generateContent`);
  const { response, json, text } = await fetchJson(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: input }] }],
      tools: useSearch ? [{ google_search: {} }] : undefined,
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(extractError(json, text, response.status));
  }

  const output = extractGeminiText(json);
  const urls = [...collectUrls(json?.candidates?.[0]?.groundingMetadata)];
  const groundingChunks = json?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

  return {
    ok: true,
    statusCode: response.status,
    text: output,
    chineseOk: hasChinese(output),
    searchStrategy: useSearch ? "native:google_search" : "none",
    searchTriggered: useSearch ? groundingChunks.length > 0 || urls.length > 0 : false,
    searchSources: urls,
  };
}

async function callDeepSeekProvider(model, apiKey, baseUrl, input) {
  const { response, json, text } = await fetchJson(buildEndpoint(baseUrl, "chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      stream: false,
      messages: [{ role: "user", content: input }],
    }),
  });

  if (!response.ok) {
    throw new Error(extractError(json, text, response.status));
  }

  const output = extractChatCompletionText(json);

  return {
    ok: true,
    statusCode: response.status,
    text: output,
    chineseOk: hasChinese(output),
    searchStrategy: "none",
    searchTriggered: false,
    searchSources: [],
  };
}

async function callOpenAICompatibleProvider(provider, model, apiKey, baseUrl, input) {
  const tokenBudgetField = provider === "openai" ? { max_completion_tokens: MAX_OUTPUT_TOKENS } : { max_tokens: MAX_OUTPUT_TOKENS };
  const { response, json, text } = await fetchJson(buildEndpoint(baseUrl, "chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      ...tokenBudgetField,
      temperature: 0.2,
      messages: [{ role: "user", content: input }],
    }),
  });

  if (!response.ok) {
    throw new Error(extractError(json, text, response.status));
  }

  const output = extractChatCompletionText(json);

  return {
    ok: true,
    statusCode: response.status,
    text: output,
    chineseOk: hasChinese(output),
    searchStrategy: `gateway:${provider}`,
    searchTriggered: false,
    searchSources: [],
  };
}

async function performExternalSearch(query, tavilyApiKey) {
  if (tavilyApiKey) {
    try {
      const { response, json, text } = await fetchJson("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tavilyApiKey}`,
        },
        body: JSON.stringify({
          api_key: tavilyApiKey,
          query,
          search_depth: "basic",
          max_results: 3,
          include_answer: true,
          include_raw_content: false,
        }),
      });

      if (!response.ok) {
        throw new Error(extractError(json, text, response.status));
      }

      const summary = json?.answer?.trim() || "Tavily returned live search results.";
      const sources = (json?.results ?? []).map((item) => item?.url).filter((value) => typeof value === "string");

      return {
        ok: true,
        statusCode: response.status,
        summary,
        sources,
        searchStrategy: "external:tavily",
        searchTriggered: true,
      };
    } catch (error) {
      return failureResult(error, "external:tavily");
    }
  }

  try {
    const { response, text } = await fetchJson("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "DeliberationStudioSmokeTest/1.0",
      },
      body: `q=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed with HTTP ${response.status}`);
    }

    const matches = [...text.matchAll(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].slice(0, 3);
    const sources = matches.map((match) => decodeDuckUrl(match[1])).filter((url) => url.startsWith("http"));
    const titles = matches.map((match) => match[2].replace(/<[^>]+>/g, "").trim()).filter(Boolean);

    if (!sources.length) {
      throw new Error("DuckDuckGo returned no readable live results.");
    }

    return {
      ok: true,
      statusCode: response.status,
      summary: titles.length ? `Live search found: ${titles.join(" | ")}` : "DuckDuckGo returned live web pages.",
      sources,
      searchStrategy: "external:duckduckgo",
      searchTriggered: true,
    };
  } catch (error) {
    return failureResult(error, "external:duckduckgo");
  }
}

function decodeDuckUrl(url) {
  try {
    const parsed = new URL(url, "https://duckduckgo.com");
    const redirected = parsed.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : url;
  } catch {
    return url;
  }
}

function printResult(title, result) {
  console.log(`- ${title}`);
  console.log(`  Success: ${result.ok ? "yes" : "no"}`);
  console.log(`  Status: ${result.statusCode || "request_failed"}`);
  console.log(`  Search strategy: ${result.searchStrategy}`);
  console.log(`  Search triggered: ${result.searchTriggered ? "yes" : "no"}`);
  if (result.searchSources?.length) {
    console.log(`  Sources: ${result.searchSources.join(" | ")}`);
  }
  if (typeof result.chineseOk === "boolean") {
    console.log(`  Chinese text looks valid: ${result.chineseOk ? "yes" : "no"}`);
  }
  if (result.ok) {
    console.log(`  Output: ${shortText(result.text)}`);
  } else {
    console.log(`  Error: ${result.error}`);
  }
  console.log("");
}
