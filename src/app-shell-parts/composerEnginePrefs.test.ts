import { describe, expect, it } from "vitest";
import {
  EMPTY_COMPOSER_ENGINE_PREF,
  getComposerEnginePref,
  normalizeComposerEnginePrefsRecord,
  upsertComposerEnginePref,
} from "./composerEnginePrefs";

describe("composerEnginePrefs", () => {
  it("returns a fully populated empty pref for unknown engines", () => {
    expect(getComposerEnginePref(undefined, "claude")).toEqual(
      EMPTY_COMPOSER_ENGINE_PREF,
    );
    expect(getComposerEnginePref({}, "gemini")).toEqual(
      EMPTY_COMPOSER_ENGINE_PREF,
    );
  });

  it("merges a partial patch without touching other fields", () => {
    const start = { claude: { modelId: "fable-5", effort: "high", accessMode: null, collaborationModeId: null } };
    const next = upsertComposerEnginePref(start, "claude", {
      accessMode: "read-only",
    });
    expect(next.claude).toEqual({
      modelId: "fable-5",
      effort: "high",
      accessMode: "read-only",
      collaborationModeId: null,
    });
  });

  it("keeps other engines intact when patching one engine", () => {
    const start = {
      claude: { modelId: "fable-5", effort: null, accessMode: null, collaborationModeId: null },
    };
    const next = upsertComposerEnginePref(start, "gemini", {
      modelId: "gemini-pro",
    });
    expect(next.claude?.modelId).toBe("fable-5");
    expect(next.gemini?.modelId).toBe("gemini-pro");
  });

  it("returns the same reference when the patch changes nothing", () => {
    const start = {
      claude: { modelId: "fable-5", effort: null, accessMode: null, collaborationModeId: null },
    };
    expect(upsertComposerEnginePref(start, "claude", { modelId: "fable-5" })).toBe(
      start,
    );
  });

  it("does not wipe a stored model when only effort is patched", () => {
    const start = {
      claude: { modelId: "fable-5", effort: "high", accessMode: null, collaborationModeId: null },
    };
    const next = upsertComposerEnginePref(start, "claude", { effort: "low" });
    expect(next.claude).toEqual({
      modelId: "fable-5",
      effort: "low",
      accessMode: null,
      collaborationModeId: null,
    });
  });

  it("drops unknown engines and malformed fields when normalizing", () => {
    const normalized = normalizeComposerEnginePrefsRecord({
      claude: { modelId: "fable-5", effort: 42, accessMode: "bogus", collaborationModeId: "plan" },
      martian: { modelId: "x" },
    });
    expect(normalized.claude).toEqual({
      modelId: "fable-5",
      effort: null,
      accessMode: null,
      collaborationModeId: "plan",
    });
    expect("martian" in normalized).toBe(false);
  });

  it("seeds the codex entry from legacy composer fields when absent", () => {
    const normalized = normalizeComposerEnginePrefsRecord(
      { claude: { modelId: "fable-5" } },
      { modelId: "gpt-5.5", effort: "high" },
    );
    expect(normalized.codex).toEqual({
      modelId: "gpt-5.5",
      effort: "high",
      accessMode: null,
      collaborationModeId: null,
    });
    expect(normalized.claude?.modelId).toBe("fable-5");
  });

  it("does not override an existing codex entry with legacy fields", () => {
    const normalized = normalizeComposerEnginePrefsRecord(
      { codex: { modelId: "gpt-5.4" } },
      { modelId: "gpt-5.5", effort: "high" },
    );
    expect(normalized.codex?.modelId).toBe("gpt-5.4");
  });
});
