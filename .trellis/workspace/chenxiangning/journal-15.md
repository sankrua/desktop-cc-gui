# Journal - chenxiangning (Part 15)

> Continuation from `journal-14.md` (archived at ~2000 lines)
> Started: 2026-05-20

---



## Session 521: Fix Codex deferred completion after assistant ingress

**Date**: 2026-05-20
**Task**: Fix Codex deferred completion after assistant ingress
**Branch**: `feature/v0.5.0-md`

### Summary

修复 Codex 长会话尾部 assistant 输出已可见但 processing spinner 不结束的问题。

### Main Changes

- Root cause: Codex `turn/completed` could be deferred behind stale `collabAgentToolCall` / `wait_agent` blockers, and if final assistant completion evidence never arrived, the parent thread stayed `isProcessing=true`.
- Change: `useThreadEventHandlers` now bypasses Codex deferred completion when parent `turn/completed` arrives after assistant stream ingress (`firstDeltaAt` or `deltaCount`), while preserving no-output child blocker deferral.
- Diagnostics: bypass still emits `turn-completed-deferred-bypassed` with `remainingBlockers`, `deltaCount`, and `firstDeltaAtMs`.
- Tests: added hook regression for assistant delta + stale child blocker + `turn/completed` clearing processing.
- Validation passed: targeted Vitest, typecheck, lint, OpenSpec strict validate. Full `npm run test` was attempted and stopped in unrelated settings session catalog tests already affected by current workspace WIP.


### Git Commits

| Hash | Message |
|------|---------|
| `1b75eb0b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
