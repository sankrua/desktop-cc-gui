import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLAUDE_CONTEXT_WINDOW,
  estimateClaudeContextWindow,
} from "./claudeContextWindow";

describe("estimateClaudeContextWindow", () => {
  it("falls back to the default 200k window for regular models", () => {
    expect(estimateClaudeContextWindow("claude-opus-4-8")).toBe(
      DEFAULT_CLAUDE_CONTEXT_WINDOW,
    );
    expect(estimateClaudeContextWindow("claude-sonnet-4.5")).toBe(
      DEFAULT_CLAUDE_CONTEXT_WINDOW,
    );
    expect(estimateClaudeContextWindow(null)).toBe(
      DEFAULT_CLAUDE_CONTEXT_WINDOW,
    );
    expect(estimateClaudeContextWindow("")).toBe(DEFAULT_CLAUDE_CONTEXT_WINDOW);
  });

  it("recognizes 1M long-context models by the [1m] suffix", () => {
    expect(estimateClaudeContextWindow("claude-sonnet-4-5[1m]")).toBe(
      1_000_000,
    );
    expect(estimateClaudeContextWindow("Claude-Sonnet-4-5[1M]")).toBe(
      1_000_000,
    );
  });
});
