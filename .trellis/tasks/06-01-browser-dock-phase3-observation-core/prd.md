# Implement Browser Dock Trusted Observation Core

## Goal

执行 Browser Dock Phase 3 的第一实现切片：先建立 trusted observation contract、explicit stale reasons、sectioned evidence view model，并让 Composer preview 与 message evidence surfaces 使用一致的 observation/evidence state。

本任务只做后续实现入口和范围约束。当前状态为 planning，未开始代码实现。

## Linked OpenSpec Change

- `openspec/changes/advance-browser-dock-trusted-observation-and-code-bridge`

## Linked Plan

- `docs/plans/2026-06-01-browser-dock-phase3.md`

## Linked OpenSpec Artifacts

- Proposal: `openspec/changes/advance-browser-dock-trusted-observation-and-code-bridge/proposal.md`
- Design: `openspec/changes/advance-browser-dock-trusted-observation-and-code-bridge/design.md`
- Tasks: `openspec/changes/advance-browser-dock-trusted-observation-and-code-bridge/tasks.md`
- Spec delta: `openspec/changes/advance-browser-dock-trusted-observation-and-code-bridge/specs/browser-agent-page-understanding/spec.md`

## Scope

- Browser Observation v3 trust envelope.
- Explicit stale reason reconciliation.
- AI-visible browser context formatter/parser trust state.
- Browser Evidence view model.
- Minimum Evidence Inspector integration for Composer preview and sent/history browser context cards.
- Consistent available/stale/degraded/expired state across attachment surfaces.

## Out Of Scope

- Canonical capture script migration.
- Full workspace-aware code candidate scorer.
- Screenshot/OCR/vision execution.
- External provider capture.
- Browser action execution.
- Click/type/select/submit automation.

## Requirements

- Keep `BrowserDock` focused on session/tab/renderer lifecycle.
- Keep `Composer` as wiring only.
- Put observation/evidence/code-bridge/action logic in focused Browser Agent modules.
- Preserve engine-agnostic browser context payloads.
- Do not expose raw DOM, cookies, headers, storage, scripts, styles, password values, token values, Authorization values, hidden input values, or page secrets.
- Do not add `screenshot_ocr` as an automatic fallback.
- Do not treat code candidates as definitive ownership claims.

## Recommended First OpenSpec Tasks

- [ ] 1.1 Define Browser Observation v3 trust envelope.
- [ ] 1.2 Replace boolean-only stale handling with explicit stale reasons.
- [ ] 1.3 Make capture degradation explainable.
- [ ] 1.4 Extend canonical AI payload without engine-specific forks.
- [ ] 3.1 Create sectioned evidence view model.
- [ ] 3.2 Replace single detail block in Composer.
- [ ] 3.3 Align composer, live, and history surfaces.
- [ ] 7.1 Preserve single AI payload path.
- [ ] 7.2 Keep UI state consistent.
- [ ] 8.1 Validate behavior artifacts.
- [ ] 8.2 Verify frontend behavior.
- [ ] 8.3 Verify backend behavior.

## Acceptance Criteria

- [ ] Browser context attachment exposes observation state and explicit stale reasons.
- [ ] Formatter/parser round-trips observation state without engine-specific forks.
- [ ] Composer preview and message Browser Context card render consistent evidence state.
- [ ] Degraded/stale/expired states show diagnostics rather than hiding limitations.
- [ ] Implementation passes strict OpenSpec validation.
- [ ] Focused frontend tests cover attachment/evidence surfaces.
- [ ] Focused Rust tests cover any backend DTO changes.

## Verification

```bash
openspec validate advance-browser-dock-trusted-observation-and-code-bridge --strict --no-interactive
npx vitest run src/features/browser-agent/utils/attachment.test.ts src/features/browser-agent/components/BrowserContextPreview.test.tsx src/features/browser-agent/components/BrowserContextSummaryCard.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml browser_agent
```

