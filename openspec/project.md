# Project Context

- Type: OpenSpec Workspace
- Updated At: 2026-05-28T00:00:00+08:00
- Scope: governance snapshot for the current `mossx` repository workspace

## Domain

OpenSpec workflow and governance for `mossx`, covering change lifecycle, main spec maintenance, validation, sync, and archive discipline.

## Architecture

- Spec artifacts: `openspec/specs/*`
- Change workflow artifacts: `openspec/changes/<change-id>/{proposal,design,tasks,verification}.md`
- Archive: `openspec/changes/archive/*`
- Current workspace state: active changes = `4`, archive changes = `370`, main specs = `291`

## Entry Surfaces

- `openspec/README.md`
  - concise navigation and common commands
- `openspec/project.md`
  - detailed governance overview and current workspace snapshot
- `openspec/changes/<change-id>/*`
  - change-local truth for proposal, design, tasks, and verification
- `openspec/specs/*`
  - mainline capability truth after sync/archive

## Governance Model

- `AGENTS.md`
  - repo entry, rule priority, global gates, minimal reading path
- `.trellis/spec/**`
  - implementation rules and executable contracts
- `openspec/**`
  - behavior specs, change workflow, archive, and workspace governance
- `.claude/**` / `.codex/**`
  - host hooks, commands, and adapter glue
- `.omx/**` and other local runtime state
  - runtime artifacts, not repository truth

## Active Changes

### Archive Closure Snapshot (2026-05-28)

Current implementation branch for this workspace snapshot is `feature/v0.5.4`. This archive pass moved 51 explicitly verified active changes into `openspec/changes/archive/2026-05-28-*` across closure batches and synced main specs where the delta had not already been incorporated.

Archived changes:

- `add-email-driven-session-continuation`
- `add-engine-task-output-inspector`
- `add-file-markdown-math-preview`
- `add-memory-reference-persistent-mode`
- `adjust-git-worktree-checkbox-placement`
- `desktop-editor-split-left-composer`
- `dynamic-project-governance-evidence`
- `fix-bottom-status-dock-collapse-stability`
- `fix-claude-custom-model-fact-source-normalization`
- `fix-codex-deferred-completion-after-assistant-ingress`
- `fix-codex-empty-draft-stale-thread-auto-replay`
- `fix-codex-stale-history-fork-shortcut`
- `fix-claude-issue529-second-turn-blank-session`
- `fix-composer-file-reference-at-white-screen`
- `fix-composer-file-reference-without-file-tree-open`
- `fix-composer-tool-popover-stability`
- `fix-long-live-assistant-stream-recovery`
- `fix-markdown-preview-auto-refresh`
- `fix-project-map-auto-ingestion-background-scheduler`
- `fix-session-folder-intent-and-worktree-move-menu`
- `fix-stale-thread-recovery-confidence-gates`
- `harden-claude-sidebar-list-timeout-fallback`
- `improve-email-mail-session-list-controls`
- `improve-project-map-drag-and-root-visual`
- `integrate-openspec-trellis-bridge-into-status-panel`
- `refactor-workspace-session-management`
- `stabilize-core-runtime-and-realtime-contracts`
- `stabilize-file-markdown-preview-render-architecture`
- `stabilize-markdown-preview-awareness-and-large-rendering`
- `stabilize-session-management-truth-boundaries`
- `advance-harness-governance-to-90`
- `optimize-bundle-chunking`
- `optimize-long-list-virtualization`
- `optimize-realtime-event-batching`
- `refactor-file-open-rendering-scheduler`
- `refactor-mega-hub-split`
- `stabilize-composer-control-surface`
- `fix-reasoning-effort-engine-switch-staleness`
- `unify-context-ledger-toggle-position`
- `add-project-xray-panel`
- `sharpen-project-map-generation-prompts`
- `add-project-map-candidate-review-actions`
- `improve-project-map-inspector-evidence-ux`
- `improve-project-map-interactive-layout`
- `add-project-map-node-diagram-artifacts`
- `wire-project-map-auto-ingestion`
- `stabilize-project-map-incremental-generation`
- `stabilize-project-map-for-v0-5-4`
- `unify-claude-workspace-session-catalog`
- `stabilize-runtime-performance-evidence-gates`
- `fix-user-input-dismiss-settlement`

Main spec sync status:

- The second closure batch synced 28 additional completed changes into main specs, including session management, markdown preview, stale-thread recovery, runtime stability, governance evidence, file reference, email controls, and related UI/runtime capabilities.
- `add-email-driven-session-continuation` and `fix-composer-tool-popover-stability` were archived with `--skip-specs` because their stale MODIFIED delta headers no longer matched the current main spec headings; their change-local artifacts remain preserved in archive for traceability.
- `openspec archive` synced new or still-pending delta specs for harness governance, performance gates, file rendering scheduler, composer control surface, reasoning effort, workspace session catalog, and runtime evidence gates.
- `fix-user-input-dismiss-settlement` synced the user-input card lifecycle contract so local collapse remains presentation-only while explicit skip settles the runtime request with an empty-answer response.
- Project Map and context-ledger changes whose requirement headings were already present in main specs were archived with `--skip-specs` to avoid duplicate requirement writes.
- Remaining active changes are either in-progress, deferred, or not yet fully approved for archive.

### Branch Calibration Snapshot (2026-05-27)

Current implementation branch for this workspace snapshot is `feature/v0.5.3`. This refresh reconciles the Project Knowledge Map code facts, proposal artifacts, change-local specs, and main specs after the 2026-05-26 to 2026-05-27 implementation burst.

Project Map implementation commits covered by this calibration:

- `092508cd` `feat(project-map): 接入项目知识地图基础能力`
- `869520f8` `feat(project-map): 优化知识地图生成与交互`
- `05e9cb9d` `feat(project-map): 稳定知识地图增量生成与证据链交互`
- `7c855a90` `feat(project-map): 收口增量生成与交互图谱`
- `cf34960b` `fix(project-map): 稳定知识地图节点选择视口`
- `ee43559b` `fix(project-map): 打磨知识地图头部折叠工具栏`
- `cca81f59` `feat(project-map): 接通自动补充队列`
- `709d62bd` `fix(project-map): 稳定知识地图生成链路`
- `0e4dc68f` `feat(project-map): 记忆画布工具折叠态`

Main spec sync status:

- `openspec/specs/project-xray-panel/spec.md` now includes the completed Project Knowledge Map base contract, prompt hardening, candidate review, inspector/evidence UX, interactive layout, diagram artifacts, Auto Ingestion queue lifecycle, structured-output repair, adaptive dialogs, and canvas controls collapsed preference.
- `openspec/specs/project-map-incremental-generation/spec.md` now records incremental global merge, scoped node merge, evidence-aware merge semantics, manual pruning, evidence file navigation, button-specific prompts, and robust model-output/evidence-path normalization.

Strict OpenSpec validation should be rerun after this calibration. This snapshot is doc/spec-only; no `src/**` code was changed.

### Branch Calibration Snapshot (2026-05-24)

Current implementation branch for this workspace snapshot is `feature/v0.5.2`. This refresh reconciles OpenSpec proposal/project documents against current code facts, records a small hygiene cleanup for stale comments / whitespace, adds runtime evidence-gate reporting, and includes one narrow Messages timeline teardown-stability runtime fix.

Strict OpenSpec validation after the runtime evidence-gate refresh passed: `openspec validate --all --strict --no-interactive` reported 303 passed, 0 failed.

Detailed proposal triage lives in `openspec/docs/proposal-refresh-2026-05-23.md`.
Session-management closeout and manual-QA qualifiers live in `openspec/docs/session-management-refactor-closeout-2026-05-24.md`.
Runtime evidence and archive-readiness classification lives in `openspec/docs/runtime-evidence-gates-2026-05-24.md`.

### Inventory

- Active changes: `4`
- Archive changes: `370`
- Main specs: `291`
- Completed task sets still active: `3`
- In-progress task sets: `1`

### In-Progress Changes

- `add-codex-structured-launch-profile`
  - Task state: `6/7`.
  - Current code fact: backend preview contract, doctor resolution alignment, settings global/workspace Launch Configuration UX, daemon/remote passthrough, i18n, and targeted tests are implemented.
  - Action: keep active until the desktop manual validation matrix is completed.

### Deferred Completed Proposals

- `add-cross-workspace-cost-admin-view`
  - Deferred Product P2; current cost-budget substrate exists, but cross-workspace admin view, retention, storage, and export are intentionally not implemented in this governance pass.
- `add-engine-plugin-onboarding-kit`
  - Deferred Tooling P2; capability-matrix substrate exists, but scaffolder/templates/dry-run onboarding are intentionally not implemented in this governance pass.

### Completed Active Changes Pending Verification / Archive Decision

- `preserve-editor-on-topbar-session-switch`

This change has a fully checked task list but still reports `design: ready` rather than `done`; keep it active until artifact status is explicitly closed.

### Code Fact Snapshot (2026-05-24)

Current-branch code inventory shows proposal substrate in:

- Email continuation: `src/features/threads/utils/conversationCompletionEmail.ts`, `src/features/threads/hooks/useMailDrivenSessionContinuation.ts`, `src-tauri/src/email/session_continuation.rs`.
- Markdown preview stability/math/rendering: `src/features/files/components/FileMarkdownPreview.tsx`, `src/features/files/utils/fileMarkdownDocument.ts`, `src/features/files/hooks/useFileExternalSync.ts`, `src/features/markdown/markdownMath.ts`.
- Governance/status panel: `src/features/status-panel/components/StatusPanel.tsx`, `src/features/status-panel/components/CheckpointPanel.tsx`, `src/features/governance/evidence/*`, `scripts/check-governance-evidence-bridge.mjs`, `scripts/check-agent-domain-event-adoption.mjs`.
- Workspace session catalog: `src-tauri/src/session_management*.rs`, `src-tauri/src/engine/claude_history_inline_tests.rs`, `src/services/tauri/sessionManagement.ts`, `src/services/tauri.test.ts`.
- Thread recovery and sidebar catalog hydration: `src/features/threads/hooks/useThreadActions*.ts*`, `src/app-shell-parts/useWorkspaceThreadListHydration.ts`, `src/features/threads/utils/threadStorage.ts`, `src/features/threads/utils/streamLatencyDiagnostics.ts`.
- Runtime/realtime/perf gates: `src/features/threads/contracts/realtimeEventBatcher.ts`, `src/features/threads/contracts/realtimeReplayHarness.ts`, `scripts/realtime-perf-report.ts`, `vite.config.ts`, `scripts/check-bundle-chunking.mjs`.
- Runtime evidence gates: `scripts/generate-runtime-evidence-report.mjs`, `docs/perf/runtime-evidence-gates.{json,md}`, `openspec/docs/runtime-evidence-gates-2026-05-24.md`.
- Composer/editor surfaces: `src/features/composer/components/ChatInputBox/*`, `src/app-shell-parts/threadEditorPreservation.ts`, `src/features/layout/components/DesktopLayout.tsx`.

This snapshot is evidence-oriented. It does not claim full product QA for each change; archive notes must record the exact focused tests, manual checks, and skipped/platform qualifiers.

2026-05-24 qualifier: local dev-build manual QA for the affected Claude Sidebar / Session Management flows is recorded as temporarily passing, but Windows + Claude manual QA is not covered in this environment. Do not convert that platform gap into a passing claim during archive.

Compatibility boundary: `listClaudeSessions`, `listProjectRelatedCodexSessions`, legacy bare-session metadata lookup, and legacy cursor parsing remain intentional compatibility / diagnostic paths. They are not the Sidebar membership truth source and should not be deleted as unused without a dedicated compatibility-removal change.

## Namespace Policy

- Canonical prefix: `spec-hub-*`
- Compatibility prefix: `spec-platform-*` (legacy only; no new requirements)
- New proposals SHOULD use canonical prefixes unless compatibility migration requires otherwise

## Workflow Governance

- OpenSpec is the source of truth for behavior changes:
  - `openspec/changes/<change-id>/*` defines proposal/design/tasks/spec deltas.
  - behavior changes SHOULD be tracked by an OpenSpec change before implementation.
- Trellis is the execution container for delivery:
  - `.trellis/tasks/*` should map back to one OpenSpec change.
  - implementation and verification should be traceable to the linked change artifacts.
- Recommended delivery loop:
  1. Select or create an OpenSpec change.
  2. Create or activate the linked Trellis task.
  3. Implement and verify.
  4. Sync main specs and archive when the change passes gate checks.

## Key Commands

- `openspec validate --all --strict --no-interactive`
- `openspec status --change <change-id>`
- `find openspec/specs -mindepth 1 -maxdepth 1 -type d | wc -l`
- `find openspec/changes -mindepth 1 -maxdepth 1 -type d ! -name archive | wc -l`
- `find openspec/changes/archive -mindepth 1 -maxdepth 1 -type d | wc -l`
- `python3 .claude/skills/osp-openspec-sync/scripts/validate-consistency.py --project-path . --full`

## Maintenance Boundaries

- `openspec/README.md` stays concise and navigation-oriented.
- `openspec/project.md` keeps durable governance context and current inventory only.
- High-drift implementation evidence, commit matrices, and temporary backfill snapshots should live in the relevant change artifacts or archive notes, not here.
- Host-specific session-start logic belongs in `.claude/**` or `.codex/**`, not in OpenSpec workspace docs.

## Owners

- CodeMoss Team

## Update History

- 2026-05-28: Archived `fix-user-input-dismiss-settlement` after strict OpenSpec validation, focused Vitest coverage, typecheck, and lint. Workspace counts are now active=4, archive=370, specs=291; remaining active changes are one in-progress launch-profile change, one completed-but-artifact-open editor-preservation change, and two deferred completed proposals.
- 2026-05-28: Archived 20 verified changes from `feature/v0.5.4`, including the Project Map verified closure set, runtime performance evidence gates, workspace session catalog, reasoning-effort support, composer control surface, file rendering scheduler, and harness/performance governance changes. Workspace counts are now active=33, archive=339, specs=282; completed active task sets=32 and only `add-codex-structured-launch-profile` remains in-progress with desktop manual validation still open.
- 2026-05-27: Recalibrated Project Knowledge Map after the 2026-05-26 to 2026-05-27 implementation burst. Workspace counts are now active=44, archive=318, specs=273; completed active task sets=43 and only `add-codex-structured-launch-profile` remains in-progress. Synced completed Project Map deltas into main specs, including the new `project-map-incremental-generation` main spec, without touching `src/**` code.
- 2026-05-24: Added active change `stabilize-runtime-performance-evidence-gates` and detected active change `fix-claude-issue529-second-turn-blank-session` in the current workspace. Workspace counts are now active=32, archive=318, specs=271; completed active task sets=31 and only `add-codex-structured-launch-profile` remains in-progress. Runtime performance evidence is now classified as measured/proxy/unsupported/manual-only in `docs/perf/runtime-evidence-gates.{json,md}` and archive-readiness/compatibility cleanup guidance is recorded in `openspec/docs/runtime-evidence-gates-2026-05-24.md`; Messages timeline virtualizer teardown cleanup is the only runtime behavior change in this refresh.
- 2026-05-24: Recalibrated session-management and stale-thread recovery proposals after code/proposal audit. Workspace counts are now active=30, archive=318, specs=271; only `add-codex-structured-launch-profile` remains in-progress. Recorded local manual QA qualifiers and the missing Windows coverage boundary in `openspec/docs/session-management-refactor-closeout-2026-05-24.md`; retained compatibility APIs as intentional compatibility / diagnostic paths rather than dead code.
- 2026-05-23: Refreshed active proposal inventory against `feature/v0.5.2` without code changes. Historical snapshot before the 2026-05-24 calibration: active changes 28, archive 318, specs 271. Added `openspec/docs/proposal-refresh-2026-05-23.md` and injected 2026-05-23 proposal refresh notes into active proposal docs. At that time `add-codex-structured-launch-profile` and `harden-claude-sidebar-list-timeout-fallback` were the only in-progress active changes; this row is superseded by the 2026-05-24 update above.
- 2026-05-20: Added active change `advance-harness-governance-to-90` to coordinate the remaining harness governance readiness work. Calibrated the current state as first-slice foundation-ready rather than fully closed: evidence bridge, policy chain, audit surface, event runtime, batching, virtualization, chunking, and one hub split exist, but live snapshot injection, artifact-backed gate evidence, first runtime domain-event adoption, browser scroll evidence, and webview timing evidence remain open. Refreshed inventory to active=12, archive=316, specs=269.
- 2026-05-20: Upgraded `advance-harness-governance-to-90` from a 90% readiness floor to a 95%-99% governance-layer readiness plan. Added release-grade requirements for evidence provenance, deterministic replay, recovery behavior, operator handoff, Windows/macOS/Linux evidence, and sync/archive closure while preserving the existing change id for OpenSpec continuity.
- 2026-05-20: Hardened `advance-harness-governance-to-90` after production-grade review by removing a stale duplicate execution summary from `design.md`, adding explicit S1 `StatusPanel` hook/useMemo ordering constraints, requiring `check:agent-domain-event-adoption`, tightening consumed evidence provenance to MUST semantics, and defining per-platform implementation-evidence rows for 99% claims.
- 2026-05-20: Re-reviewed `advance-harness-governance-to-90` against current code facts and tightened execution semantics: S3 write set now includes the adoption checker and `package.json`; S2 defaults large-file result evidence toward structured JSON unless existing output is proven deterministic; S3 defaults first runtime producer to turn completed/failed; 95% versus 99% platform evidence gates now distinguish external-CI qualifiers from actual three-platform result evidence.
- 2026-05-20: Archived `soften-harness-governance-to-advisory-mode` after implementation review, focused validation, strict OpenSpec validation, and main spec sync. Advisory-only governance semantics are now in main specs and Trellis frontend code-spec guidance; refreshed workspace inventory to active=15, archive=318, specs=271. One unrelated session-management heavy-test residual remains documented in the archived verification notes.
- 2026-05-20: Archived nine harness governance changes (`formalize-engine-runtime-contract`, `add-engine-capability-matrix-spec`, `evolve-context-ledger-to-cost-budget`, `evolve-checkpoint-to-policy-chain`, `add-agent-domain-event-schema`, `add-capability-aware-policy-router`, `add-policy-decision-audit-surface`, `add-governance-telemetry-loop`, `wire-agent-domain-event-runtime`) after syncing delta specs into main specs and recording closure evidence. `formalize-engine-runtime-contract` carries an explicit external-CI qualifier because remote three-platform CI was not directly observable from the local closure session. Refreshed inventory to active=11, archive=316, specs=269.
- 2026-05-19: Recalibrated `project.md` against current `feature/v0.5.0-md` code and active proposal inventory. Workspace counts are now active=20, archive=307, specs=260. Harness governance is no longer described as implementation-unstarted; current-branch code traces exist and must be reconciled through fresh validation before sync/archive.
- 2026-05-19: Recalibrated the harness governance proposal set for `feature/v0.5.0-md` only. Prior `feature/v0.5` implementation artifacts are explicitly excluded from the current baseline; all harness governance implementation must be redone from the current branch facts.
- 2026-05-17: Hardened harness governance implementation constraints to v1.6 by making heavy-test-noise sentry, large-file governance sentry, and Win/macOS/Linux compatibility explicit requirements across the governance change set; corrected `formalize-engine-runtime-contract` task wording so runtime contract legislation is not confused with capability matrix work.
- 2026-05-17: Added and calibrated the harness governance design set (`formalize-engine-runtime-contract`, `add-engine-capability-matrix-spec`, `evolve-context-ledger-to-cost-budget`, `evolve-checkpoint-to-policy-chain`, `add-agent-domain-event-schema`) plus substrate blockers (`refactor-mega-hub-split`, `optimize-realtime-event-batching`, `optimize-long-list-virtualization`, `optimize-bundle-chunking`); refreshed workspace inventory after the v1.5 governance design closure (specs=258, archive=303, active=11).
- 2026-05-15: Archived eight verified changes (`fix-claude-repeat-turn-first-token-latency`, `harden-claude-stream-json-liveness`, `fix-claude-pending-transcript-reconciliation`, `repair-project-memory-reference-retrieval-integrity`, `harden-codex-silent-turn-liveness`, `harden-session-start-and-claude-list-window`, `fix-claude-sidebar-native-session-continuity`, `improve-progressive-file-tree-loading`) after syncing their delta specs into main specs; resolved the overlapping `claude-session-sidebar-state-parity` updates by preserving both sidebar continuity and configured display-window requirements; refreshed workspace inventory (specs=257, archive=302, active=1).
- 2026-05-15: Refreshed active-change inventory after adding `add-runtime-perf-baseline` and detecting `stabilize-core-runtime-and-realtime-contracts`; current workspace inventory is specs=257, archive=302, active=3.
- 2026-05-14: Archived `clean-openspec-main-spec-hygiene` after replacing archive-generated Purpose placeholders, removing the empty `claude-session-engine-resolution` capability directory, and adding main-spec hygiene governance; refreshed workspace inventory (specs=251, archive=289, active=2).
- 2026-05-14: Closed and archived the Phase 1 release set (`add-cli-one-click-installer`, `optimize-runtime-session-background-scheduling`, `fix-linux-appimage-wayland-library-pruning`, `fix-windows-codex-app-server-wrapper-launch`, `claude-code-mode-progressive-rollout`) with explicit release qualifiers for external platform/manual evidence; refreshed workspace inventory (specs=252, archive=288, active=2).
- 2026-05-14: Recorded Phase 1.2 release evidence, archived `fix-claude-native-session-continuation-race`, and refreshed workspace inventory after strict validation (specs=250, archive=283, active=7).
- 2026-05-13: Backfilled the current OpenSpec workspace snapshot after the v0.4.17 code/doc pass, including active installer, Linux AppImage, native menu, Claude continuation, and runtime scheduling changes (specs=249, archive=278, active=10).
- 2026-05-08: Archived `dynamic-claude-model-discovery` after syncing the Claude dynamic discovery spec and selector refresh requirements into the main specs (specs=235, archive=259, active=4).
- 2026-05-06: Archived `fix-conversation-curtain-visible-copy-tail` after syncing the remaining curtain visible-copy requirements into the main specs (specs=226, archive=247, active=8).
- 2026-05-06: Archived `fix-conversation-curtain-i18n-gaps` after syncing curtain i18n requirements into the main specs (specs=226, archive=246, active=7).
- 2026-05-06: Removed stale package-template references from manual Trellis entry docs and pruned `project.md` to a low-drift governance snapshot (specs=226, archive=245, active=7).
- 2026-05-02: Archived 10 completed changes after strict validation; synced missing specs for `conversation-curtain-normalization-core`, `project-memory-ui`, and `codex-composer-startup-selection-stability` before archive where needed.
- 2026-04-23: Recalibrated OpenSpec snapshot counts after archive drift and cleared the last strict validation warning on `conversation-user-path-reference-cards`.
- 2026-04-16: Added team governance for OpenSpec + Trellis collaboration, including mandatory change/task linkage and delivery loop definition.
- 2026-02-23: Initial OpenSpec workspace context import.
