import type { SearchMode } from "@/types/debate";

export function shouldCreateSharedSearch(mode: SearchMode) {
  return mode === "shared_once" || mode === "hybrid";
}

export function shouldUseNativeSearch(mode: SearchMode, providerHasNativeSearch: boolean, searchEnabled: boolean, continuePerRound = false) {
  return searchEnabled && providerHasNativeSearch && (mode === "per_participant" || mode === "hybrid" || continuePerRound);
}

export function shouldUseIndependentSearch(mode: SearchMode, providerHasNativeSearch: boolean, searchEnabled: boolean, continuePerRound = false) {
  return searchEnabled && !providerHasNativeSearch && (mode === "per_participant" || mode === "hybrid" || continuePerRound);
}
