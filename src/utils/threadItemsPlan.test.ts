import { describe, expect, it } from "vitest";
import {
  extractImplementPlanActionId,
  formatPlanSteps,
} from "./threadItemsPlan";

describe("threadItemsPlan", () => {
  it("formats structured plan steps with optional statuses", () => {
    expect(
      formatPlanSteps([
        { status: "pending", step: "Read files" },
        { title: "Run tests" },
        { text: "Summarize" },
        { step: "" },
        null,
      ]),
    ).toBe("- [pending] Read files\n- Run tests\n- Summarize");
  });

  it("returns empty text for non-array plans", () => {
    expect(formatPlanSteps("not a plan")).toBe("");
  });

  it("extracts implementation action ids from direct, nested, or list fields", () => {
    expect(extractImplementPlanActionId({ action_id: "direct" })).toBe("direct");
    expect(extractImplementPlanActionId({ action: { actionId: "nested" } })).toBe(
      "nested",
    );
    expect(
      extractImplementPlanActionId({
        actions: [{ label: "skip" }, { id: "from-list" }],
      }),
    ).toBe("from-list");
  });
});
