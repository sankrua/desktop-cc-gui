/**
 * Claude 上下文窗口估算。
 *
 * Claude CLI 的 stream-json 事件通常只携带 message.usage，不上报
 * context_window 总量；历史 JSONL 同样没有窗口信息。此时前端按模型
 * id 兜底估算窗口，让占用百分比可以计算（freshness 仍标记为估算）。
 * CLI 真正上报窗口时（statusline/hooks），上报值优先于这里的估算。
 */

export const DEFAULT_CLAUDE_CONTEXT_WINDOW = 200_000;

const LONG_CONTEXT_WINDOW = 1_000_000;

export function estimateClaudeContextWindow(modelId?: string | null): number {
  const normalized = (modelId ?? "").trim().toLowerCase();
  // Anthropic 的 1M 长上下文模型以 "[1m]" 后缀标识（beta long-context）。
  if (normalized.includes("[1m]")) {
    return LONG_CONTEXT_WINDOW;
  }
  return DEFAULT_CLAUDE_CONTEXT_WINDOW;
}
