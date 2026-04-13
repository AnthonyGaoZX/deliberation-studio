import type { DebateConfig, Locale, ProviderKind } from "@/types/debate";

export type ReadingTheme = "warm-light" | "soft-dark" | "graphite" | "paper";

export type ToggleOption<T extends string> = { value: T; label: string };

export type ProviderConnection = {
  apiKey: string;
  baseUrl: string;
};

export type ProviderConnectionMap = Record<ProviderKind, ProviderConnection>;

export type ParticipantCheckState = {
  status: "idle" | "loading" | "success" | "error";
  mode: "output" | "search";
  message: string;
};

export type AppStorage = {
  config?: DebateConfig;
  theme?: "light" | "dark";
  locale?: Locale;
  providerConnections?: ProviderConnectionMap;
};
