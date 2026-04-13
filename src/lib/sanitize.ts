import type { ProviderKind } from "@/types/debate";
import { PROVIDER_CATALOG } from "@/lib/provider-catalog";

export function normalizeAsciiPunctuation(value: string) {
  return value
    .replace(/：/g, ":")
    .replace(/／/g, "/")
    .replace(/．/g, ".")
    .replace(/，/g, ",")
    .replace(/　/g, " ");
}

export function sanitizeApiKeyInput(value: string) {
  return normalizeAsciiPunctuation(value)
    .replace(/[^\x21-\x7E]/g, "")
    .trim()
    .replace(/^api(?:\s|-|_)?key\s*[:：]\s*/i, "")
    .replace(/^bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

export function sanitizeBaseUrlInput(value: string, provider: ProviderKind, allowEmpty = true) {
  const normalized = normalizeAsciiPunctuation(value)
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .replace(/^base\s*url\s*[:：]\s*/i, "");

  if (!normalized) {
    return allowEmpty ? "" : PROVIDER_CATALOG[provider].defaultBaseUrl;
  }

  try {
    return new URL(normalized).toString();
  } catch {
    return normalized;
  }
}
