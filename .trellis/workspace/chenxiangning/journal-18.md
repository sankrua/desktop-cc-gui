# Journal - chenxiangning (Part 18)

> Continuation from `journal-17.md` (archived at ~2000 lines)
> Started: 2026-06-01

---



## Session 652: 收口会话恢复 Fork 入口

**Date**: 2026-06-01
**Task**: 收口会话恢复 Fork 入口
**Branch**: `feature/v0.5.4`

### Summary

将 Codex stale thread recovery 卡片的 Fork 并重发收口为纯 Fork，并回写 OpenSpec 变更记录。

### Main Changes

## Session Summary

- 将 Codex stale thread recovery 卡片主按钮从 `Fork 并重发` / `Fork and resend` 改为纯 `Fork`。
- 新增 `onThreadRecoveryFork` 传递链，复用现有 `startFork("/fork")` 能力，不重新实现 fork。
- 保留非 stale runtime reconnect/resend 行为；stale thread Fork 不再调用 `ensureRuntimeReady` 或 `onRecoverThreadRuntimeAndResend`。
- 更新 i18n 与 focused reconnect card 测试契约。
- 新增 OpenSpec change `fix-thread-recovery-fork-shortcut`，记录 proposal/tasks/spec delta。

## Validation

- 未运行测试或 OpenSpec validate；本轮按用户要求先提交收口。

## Notes

- 工作区仍存在提交前已识别的无关未提交改动：daemon/thread listing/engine hooks 与 `openspec/changes/fix-git-change-canonical-model/`，本次提交未纳入。


### Git Commits

| Hash | Message |
|------|---------|
| `e450586e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 653: 收口 Codex 线程列表和引擎切换降级修复

**Date**: 2026-06-01
**Task**: 收口 Codex 线程列表和引擎切换降级修复
**Branch**: `feature/v0.5.4`

### Summary

(Add summary)

### Main Changes

| 项目 | 内容 |
|------|------|
| 目标 | 修复 2026-05-31 error-log 中 `thread/list live timeout`、`thread/list error`、`engine/switch error` 三类问题的可感知失败路径。 |
| 代码提交 | `4ac0b0d6 fix(codex): 降级处理线程列表和引擎切换错误` |
| 后端修复 | `thread_listing.rs` 和 daemon `list_threads` 在 live Codex thread/list 超时或失败时，不再直接 fatal，而是走 bounded local session fallback，并通过 `partialSource` 标记 degraded 状态。 |
| 前端修复 | `useEngineController` 在切换 engine 前刷新 stale detection；Codex 仍不可用时调用 doctor，输出 `resolvedBinaryPath`、`pathEnvUsed`、`environmentDiagnosis` 等证据，避免只有泛化 `Engine codex is not installed`。 |
| 规范记录 | 新增 OpenSpec change `fix-codex-thread-list-engine-switch-degradation`，记录目标、设计、任务和两组 behavior spec delta。 |
| 范围排除 | `account/rateLimits/read error` 未纳入本次修复；Git diff canonical model 相关 dirty files 未暂存、未提交。 |
| 验证 | 已通过 `cargo fmt --check`、目标 Rust tests、`cargo check`、engine hook ESLint/Vitest、`npm run check:runtime-contracts`、`openspec validate --strict`；`npm run typecheck` 仍受 unrelated `RuntimeReconnectCard.tsx` 既有类型错误阻断。 |


### Git Commits

| Hash | Message |
|------|---------|
| `4ac0b0d6` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
