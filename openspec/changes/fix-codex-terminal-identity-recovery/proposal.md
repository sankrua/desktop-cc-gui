## Why

Codex 偶发出现“assistant final 已经可见，但 composer 仍停在正在生成响应”的状态。前两次修复分别收紧了 stale child blocker 和 background terminal routing，但把兜底边界收得过窄：

- `turn/completed` 缺 `threadId` 时完全丢弃，无法利用已知 `turnId -> threadId` ownership。
- `completeAgentMessage` / `item/completed agentMessage` 缺 `turnId` 时不触发 bounded reconcile。

这会让真实完成的 Codex turn 没有任何后续清算路径。

## What Changes

- Track thread-owned turn identity from `turn/started` and realtime item/message events.
- When `turn/completed` lacks `threadId`, resolve it only from recorded `turnId -> threadId` ownership or a thread-state resolver for the same active turn.
- Keep the hard ban on highlighted active-thread fallback for terminal mutation.
- Let thread-owned assistant completion without `turnId` schedule a bounded Codex reconcile using an unknown-turn key; it still must not directly clear processing.
- Add regression tests for missing-thread terminal completion and missing-turn assistant completion.

## Non-Goals

- No runtime protocol rewrite.
- No broad timeout-window changes.
- No direct success settlement from assistant text alone.
- No non-Codex behavior change.

## Impact

- `src/features/app/hooks/useAppServerEvents.ts`
- `src/features/threads/hooks/useThreadRealtimeHistoryReconcile.ts`
- `src/features/threads/hooks/useThreads.ts`
- Focused Vitest coverage in the affected hooks.
