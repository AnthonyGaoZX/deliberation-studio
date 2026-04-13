import { describe, expect, it } from "vitest";
import { shouldCreateSharedSearch, shouldUseIndependentSearch, shouldUseNativeSearch } from "@/lib/search-strategy";

describe("search strategy", () => {
  it("creates shared search only for shared or hybrid mode", () => {
    expect(shouldCreateSharedSearch("off")).toBe(false);
    expect(shouldCreateSharedSearch("shared_once")).toBe(true);
    expect(shouldCreateSharedSearch("hybrid")).toBe(true);
  });

  it("distinguishes native and fallback search correctly", () => {
    expect(shouldUseNativeSearch("per_participant", true, true)).toBe(true);
    expect(shouldUseIndependentSearch("per_participant", false, true)).toBe(true);
    // Native-search providers now always use native search for unique citations, even in shared_once
    expect(shouldUseNativeSearch("shared_once", true, true)).toBe(true);
  });

  it("allows continued search in later rounds when explicitly enabled", () => {
    expect(shouldUseNativeSearch("shared_once", true, true, true)).toBe(true);
    expect(shouldUseIndependentSearch("shared_once", false, true, true)).toBe(true);
  });
});
