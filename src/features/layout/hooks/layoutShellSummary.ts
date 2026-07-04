import type { ConversationItem } from "../../../types";

export type ShellThreadStatusSummary = {
  isProcessing?: boolean;
  hasUnread?: boolean;
  isReviewing?: boolean;
  isContextCompacting?: boolean;
};

export type ShellRuntimeSummary = {
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  isActiveThreadProcessing: boolean;
  isActiveThreadReviewing: boolean;
  isActiveThreadContextCompacting: boolean;
  hasActiveThreadUnread: boolean;
  canCopyActiveThread: boolean;
  sidebarSubagentItems: ConversationItem[];
};

export type BuildShellRuntimeSummaryInput = {
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  activeItems: ConversationItem[];
  activeThreadStatus: ShellThreadStatusSummary | null | undefined;
};

export const EMPTY_SIDEBAR_SUBAGENT_ITEMS: ConversationItem[] = [];

function isClaudeThreadId(threadId: string | null | undefined): boolean {
  return Boolean(
    threadId?.startsWith("claude:") ||
      threadId?.startsWith("claude-pending-"),
  );
}

// 单条活动线程的工具项子集缓存：稳定引用，避免纯文本 token 让 Sidebar memo 失效。
// buildShellRuntimeSummary 是纯函数、只服务当前 activeThreadId，故单槽缓存足够。
let lastSidebarSubagentResult: {
  threadId: string | null;
  items: ConversationItem[];
} | null = null;

function selectSidebarSubagentItems(
  activeThreadId: string | null,
  activeItems: ConversationItem[],
): ConversationItem[] {
  if (!isClaudeThreadId(activeThreadId)) {
    return EMPTY_SIDEBAR_SUBAGENT_ITEMS;
  }
  const toolItems = activeItems.filter((item) => item.kind === "tool");
  if (toolItems.length === 0) {
    return EMPTY_SIDEBAR_SUBAGENT_ITEMS;
  }
  // 工具项对象在 reducer 里不可变（未变即同引用；appendAgentDelta 只 slice 数组、
  // 保留元素引用）。若本次过滤出的工具项与上次逐个 === 相等，返回上一份数组引用，
  // 使纯文本 token（不新增/不改动工具项）不再产生新引用击穿 Sidebar 的 memo。
  // 工具项状态/输出变化时其对象引用会变，签名失配 → 重新计算，子代理行照常更新。
  const cached = lastSidebarSubagentResult;
  if (
    cached &&
    cached.threadId === activeThreadId &&
    cached.items.length === toolItems.length &&
    cached.items.every((item, index) => item === toolItems[index])
  ) {
    return cached.items;
  }
  lastSidebarSubagentResult = { threadId: activeThreadId, items: toolItems };
  return toolItems;
}

export function buildShellRuntimeSummary({
  activeWorkspaceId,
  activeThreadId,
  activeItems,
  activeThreadStatus,
}: BuildShellRuntimeSummaryInput): ShellRuntimeSummary {
  return {
    activeWorkspaceId,
    activeThreadId,
    isActiveThreadProcessing: activeThreadStatus?.isProcessing ?? false,
    isActiveThreadReviewing: activeThreadStatus?.isReviewing ?? false,
    isActiveThreadContextCompacting:
      activeThreadStatus?.isContextCompacting ?? false,
    hasActiveThreadUnread: activeThreadStatus?.hasUnread ?? false,
    canCopyActiveThread: activeItems.length > 0,
    sidebarSubagentItems: selectSidebarSubagentItems(
      activeThreadId,
      activeItems,
    ),
  };
}
