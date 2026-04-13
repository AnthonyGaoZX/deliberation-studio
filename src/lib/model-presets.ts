import { PROVIDER_CATALOG } from "@/lib/provider-catalog";
import type { Locale, ProviderKind } from "@/types/debate";

export function getModelPresets(kind: ProviderKind) {
  return PROVIDER_CATALOG[kind].modelPresets;
}

export function hasModelPreset(kind: ProviderKind, model: string) {
  return PROVIDER_CATALOG[kind].modelPresets.some((item) => item.value === model);
}

export function getModelDocsUrl(kind: ProviderKind) {
  return PROVIDER_CATALOG[kind].modelDocsUrl;
}

export function describeModelVariant(kind: ProviderKind, model: string, locale: Locale) {
  const preset = PROVIDER_CATALOG[kind].modelPresets.find((item) => item.value === model);
  return preset?.summary[locale] ?? (locale === "zh" ? "自定义模型名称。" : "Custom model name.");
}
