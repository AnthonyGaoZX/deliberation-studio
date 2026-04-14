import type { SearchMode } from "@/types/debate";

export function shouldCreateSharedSearch(mode: SearchMode, hasExternalSearchParticipants = true) {
  return hasExternalSearchParticipants && (mode === "shared_once" || mode === "hybrid");
}

export function shouldUseNativeSearch(mode: SearchMode, providerHasNativeSearch: boolean, searchEnabled: boolean, continuePerRound = false) {
  if (!searchEnabled || !providerHasNativeSearch) return false;
  // Native-search-capable providers should always use their own search for richer, unique results.
  // In shared_once mode, shared evidence is still injected into the system prompt for context,
  // but the provider also runs its own native search to produce unique citations.
  return mode === "per_participant" || mode === "hybrid" || mode === "shared_once" || continuePerRound;
}

export function shouldUseIndependentSearch(mode: SearchMode, providerHasNativeSearch: boolean, searchEnabled: boolean, continuePerRound = false) {
  return searchEnabled && !providerHasNativeSearch && (mode === "per_participant" || mode === "hybrid" || continuePerRound);
}

export function shouldUseExternalSearchAugmentation(
  mode: SearchMode,
  providerHasNativeSearch: boolean,
  searchEnabled: boolean,
) {
  return searchEnabled && mode !== "off" && !providerHasNativeSearch;
}

export function shouldUseSharedSearchBriefing(
  mode: SearchMode,
  providerHasNativeSearch: boolean,
  searchEnabled: boolean,
) {
  return searchEnabled && providerHasNativeSearch && (mode === "shared_once" || mode === "hybrid");
}
