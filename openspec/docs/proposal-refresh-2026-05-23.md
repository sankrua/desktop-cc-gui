# Proposal Refresh Audit - 2026-05-23

## Scope

This pass updates OpenSpec proposal documentation against the current `feature/v0.5.2` branch. It is documentation-only: no `src/**`, `src-tauri/**`, `scripts/**`, package config, or runtime code files are modified.

## Workspace Facts

- Current branch: `feature/v0.5.2`
- Active changes: 28
- Main specs: 271
- Archive changes: 318
- Strict validation before writing: `openspec validate --all --strict --no-interactive` passed 299 items.
- Active change status: 26 completed task sets, 2 in-progress task sets.

## Triage Table

| Change | Tasks | Status | Recommendation |
|---|---:|---|---|
| `add-codex-structured-launch-profile` | 0/7 | In progress / planning only | 继续实施前置项 |
| `add-cross-workspace-cost-admin-view` | 6/6 | Completed as deferred Product P2 | 延后，不进当前治理批次 |
| `add-email-driven-session-continuation` | 57/57 | Completed / pending verify-archive | 候选 verify/archive |
| `add-engine-plugin-onboarding-kit` | 6/6 | Completed as deferred Tooling P2 | 延后，不进当前治理批次 |
| `add-file-markdown-math-preview` | 12/12 | Completed / pending verify-archive | 候选 verify/archive |
| `add-memory-reference-persistent-mode` | 13/13 | Completed / pending verify-archive | 候选 verify/archive |
| `adjust-git-worktree-checkbox-placement` | 15/15 | Completed / pending verify-archive | 候选 verify/archive |
| `advance-harness-governance-to-90` | 51/51 | Completed / pending verify-archive | 候选 verify/archive |
| `desktop-editor-split-left-composer` | 8/8 | Completed / pending verify-archive | 候选 verify/archive |
| `dynamic-project-governance-evidence` | 34/34 | Completed / pending verify-archive | 候选 verify/archive |
| `fix-bottom-status-dock-collapse-stability` | 11/11 | Completed / pending verify-archive | 候选 verify/archive |
| `fix-codex-deferred-completion-after-assistant-ingress` | 7/7 | Completed / pending verify-archive | 候选 verify/archive |
| `fix-codex-empty-draft-stale-thread-auto-replay` | 11/11 | Completed / pending verify-archive | 候选 verify/archive |
| `fix-markdown-preview-auto-refresh` | 8/8 | Completed / pending verify-archive | 候选 verify/archive |
| `harden-claude-sidebar-list-timeout-fallback` | 25/30 | In progress / implementation mostly complete, final gates open | 继续收尾 |
| `improve-email-mail-session-list-controls` | 21/21 | Completed / pending verify-archive | 候选 verify/archive |
| `integrate-openspec-trellis-bridge-into-status-panel` | 18/18 | Completed / pending verify-archive | 候选 verify/archive |
| `optimize-bundle-chunking` | 14/14 | Completed / pending verify-archive | 候选 verify/archive |
| `optimize-long-list-virtualization` | 16/16 | Completed / pending verify-archive | 候选 verify/archive |
| `optimize-realtime-event-batching` | 17/17 | Completed / pending verify-archive | 候选 verify/archive |
| `preserve-editor-on-topbar-session-switch` | 7/7 | Completed / pending verify-archive | 候选 verify/archive |
| `refactor-mega-hub-split` | 16/16 | Completed / pending verify-archive | 候选 verify/archive |
| `refactor-workspace-session-management` | 62/62 | Completed / pending verify-archive | 候选 verify/archive |
| `stabilize-composer-control-surface` | 22/22 | Completed / pending verify-archive | 候选 verify/archive |
| `stabilize-core-runtime-and-realtime-contracts` | 32/32 | Completed / pending verify-archive | 候选 verify/archive |
| `stabilize-file-markdown-preview-render-architecture` | 26/26 | Completed / pending verify-archive | 候选 verify/archive |
| `stabilize-markdown-preview-awareness-and-large-rendering` | 15/15 | Completed / pending verify-archive | 候选 verify/archive |
| `unify-claude-workspace-session-catalog` | 55/55 | Completed / pending verify-archive | 候选 verify/archive |

## Cross-Cutting Findings

1. The project-level OpenSpec snapshot was stale: `openspec/project.md` still described the 2026-05-20 `feature/v0.5.0-md` branch with active=15. The current workspace is `feature/v0.5.2` with active=28.
2. Most active changes are already task-complete but not archived. The next work is not broad implementation; it is closure hygiene: verification notes, strict validation, evidence qualifiers, sync/archive decisions.
3. Two proposals must remain active:
   - `add-codex-structured-launch-profile` is still implementation-unstarted for the preview/editor contract.
   - `harden-claude-sidebar-list-timeout-fallback` has implementation evidence but still lacks final typecheck/manual/archive gates.
4. Deferred P2 proposals (`add-cross-workspace-cost-admin-view`, `add-engine-plugin-onboarding-kit`) should not be mistaken for missed implementation; their current task-complete state records deliberate deferral.
5. Harness/governance changes now have visible code substrate in `StatusPanel`, governance evidence adapters, policy audit, check scripts, realtime batching, long-list/bundle gates, and source-fact/session catalog paths. Archive notes must preserve platform/evidence qualifiers instead of claiming unobserved Windows/Linux/manual coverage.

## Code Evidence Index

- Email continuation: `src/features/threads/utils/conversationCompletionEmail.ts`, `src/features/threads/hooks/useMailDrivenSessionContinuation.ts`, `src-tauri/src/email/session_continuation.rs`.
- Markdown preview: `src/features/files/components/FileMarkdownPreview.tsx`, `src/features/files/utils/fileMarkdownDocument.ts`, `src/features/files/hooks/useFileExternalSync.ts`, `src/features/markdown/markdownMath.ts`.
- Governance/status panel: `src/features/status-panel/components/StatusPanel.tsx`, `src/features/governance/evidence/*`, `scripts/check-governance-evidence-bridge.mjs`, `scripts/check-agent-domain-event-adoption.mjs`.
- Workspace sessions: `src-tauri/src/session_management*.rs`, `src-tauri/src/engine/claude_history_inline_tests.rs`, `src/services/tauri/sessionManagement.ts`, `src/services/tauri.test.ts`.
- Runtime/realtime/perf: `src/features/threads/contracts/realtimeEventBatcher.ts`, `src/features/threads/contracts/realtimeReplayHarness.ts`, `scripts/realtime-perf-report.ts`, `vite.config.ts`, `scripts/check-bundle-chunking.mjs`.
- Composer/editor surfaces: `src/features/composer/components/ChatInputBox/*`, `src/app-shell-parts/threadEditorPreservation.ts`, `src/features/layout/components/DesktopLayout.tsx`.

## Next Closure Sequence

1. Finish `harden-claude-sidebar-list-timeout-fallback` gates: typecheck, focused sidebar tests, manual QA note, then archive prep.
2. Keep `add-codex-structured-launch-profile` in implementation queue; do not archive until preview/editor/doctor contract lands.
3. For task-complete active changes, add or update verification artifacts before archive. Use existing focused tests and current strict validation as evidence, and record skipped/manual/platform gaps explicitly.
4. Refresh `openspec/project.md` only as a low-drift inventory snapshot; keep high-detail evidence in change artifacts or this report.
