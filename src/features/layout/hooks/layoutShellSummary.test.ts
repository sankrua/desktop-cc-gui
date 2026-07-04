import { describe, expect, it } from "vitest";

import type { ConversationItem } from "../../../types";
import {
  EMPTY_SIDEBAR_SUBAGENT_ITEMS,
  buildShellRuntimeSummary,
} from "./layoutShellSummary";

function assistantItem(id: string, text: string): ConversationItem {
  return {
    id,
    kind: "message",
    role: "assistant",
    text,
  };
}

function toolItem(id: string): ConversationItem {
  return {
    id,
    kind: "tool",
    toolType: "agent",
    title: "Tool: Agent",
    detail: JSON.stringify({ task_id: id, description: "Inspect" }),
    status: "running",
  };
}

describe("layoutShellSummary", () => {
  it("keeps non-Claude realtime streams out of sidebar subagent items", () => {
    const summary = buildShellRuntimeSummary({
      activeWorkspaceId: "ws-1",
      activeThreadId: "codex:thread-1",
      activeItems: [assistantItem("assistant-1", "streaming")],
      activeThreadStatus: { isProcessing: true },
    });

    expect(summary.isActiveThreadProcessing).toBe(true);
    expect(summary.canCopyActiveThread).toBe(true);
    expect(summary.sidebarSubagentItems).toBe(EMPTY_SIDEBAR_SUBAGENT_ITEMS);
  });

  it("passes only Claude tool items needed for live subagent rows", () => {
    const tool = toolItem("tool-1");
    const summary = buildShellRuntimeSummary({
      activeWorkspaceId: "ws-1",
      activeThreadId: "claude:thread-1",
      activeItems: [assistantItem("assistant-1", "ignored"), tool],
      activeThreadStatus: {
        hasUnread: true,
        isReviewing: true,
        isContextCompacting: true,
      },
    });

    expect(summary.hasActiveThreadUnread).toBe(true);
    expect(summary.isActiveThreadReviewing).toBe(true);
    expect(summary.isActiveThreadContextCompacting).toBe(true);
    expect(summary.sidebarSubagentItems).toEqual([tool]);
  });

  it("reuses the same sidebar subagent array reference when tool items are unchanged across text tokens", () => {
    const tool = toolItem("tool-1");
    const first = buildShellRuntimeSummary({
      activeWorkspaceId: "ws-1",
      activeThreadId: "claude:thread-stable",
      activeItems: [assistantItem("assistant-1", "chunk 1"), tool],
      activeThreadStatus: { isProcessing: true },
    });
    // 模拟纯文本 token：assistant 消息换新对象、activeItems 是新数组，但工具项对象不变。
    const second = buildShellRuntimeSummary({
      activeWorkspaceId: "ws-1",
      activeThreadId: "claude:thread-stable",
      activeItems: [assistantItem("assistant-1", "chunk 1 更多"), tool],
      activeThreadStatus: { isProcessing: true },
    });
    expect(second.sidebarSubagentItems).toBe(first.sidebarSubagentItems);
  });

  it("returns a fresh sidebar subagent array when a tool item changes", () => {
    const runningTool = toolItem("tool-1");
    const first = buildShellRuntimeSummary({
      activeWorkspaceId: "ws-1",
      activeThreadId: "claude:thread-change",
      activeItems: [runningTool],
      activeThreadStatus: { isProcessing: true },
    });
    // 子代理进展：工具项换成新对象 → 应产生新引用，驱动 Sidebar 更新 live subagent 行。
    const updatedTool = { ...runningTool, title: "Tool: Agent (done)" };
    const second = buildShellRuntimeSummary({
      activeWorkspaceId: "ws-1",
      activeThreadId: "claude:thread-change",
      activeItems: [updatedTool],
      activeThreadStatus: { isProcessing: true },
    });
    expect(second.sidebarSubagentItems).not.toBe(first.sidebarSubagentItems);
    expect(second.sidebarSubagentItems).toEqual([updatedTool]);
  });
});
