## Linked Documents

- Proposal: `openspec/changes/advance-browser-dock-trusted-observation-and-code-bridge/proposal.md`
- Technical design: `openspec/changes/advance-browser-dock-trusted-observation-and-code-bridge/design.md`
- Behavior delta: `openspec/changes/advance-browser-dock-trusted-observation-and-code-bridge/specs/browser-agent-page-understanding/spec.md`
- Implementation plan: `docs/plans/2026-06-01-browser-dock-phase3.md`
- First Trellis execution task: `.trellis/tasks/06-01-browser-dock-phase3-observation-core/prd.md`

## 1. Observation Contract And Stale Policy

- [ ] 1.1 [P0][input: Phase 2 BrowserContextSnapshot and active browser context][output: BrowserObservation type and shared frontend/backend DTO][validation: serialization/unit tests cover all observation states] Define Browser Observation v3 trust envelope.
- [ ] 1.2 [P0][deps:1.1][input: active tab, renderer binding, URL/title/scroll/TTL/session state][output: stale reason reconciliation utility][validation: unit tests cover each stale reason and multiple reasons] Replace boolean-only stale handling with explicit stale reasons.
- [ ] 1.3 [P0][deps:1.1][input: capture warnings and platform capability][output: user-visible and AI-visible degradation diagnostics][validation: tests cover transport timeout, renderer mismatch, unsupported platform, metadata fallback] Make capture degradation explainable.
- [ ] 1.4 [P0][deps:1.1][input: existing BrowserContextAttachment][output: attachment formatter includes observation state and stale reasons][validation: formatter/parser tests assert trust state round-trips] Extend canonical AI payload without engine-specific forks.
- [ ] 1.5 [P1][deps:1.2][input: Browser Dock lifecycle events][output: stale updates for tab switch, close, URL/title changes, and workspace mismatch][validation: component/hook tests cover active-context reconciliation] Keep Composer preview aligned with active Browser Dock state.

## 2. Canonical Capture Script And Fixture Harness

- [ ] 2.1 [P0][input: current frontend/Rust capture scripts][output: single canonical capture script source][validation: code review confirms no duplicated extraction logic remains] Consolidate read-only capture script ownership.
- [ ] 2.2 [P0][deps:2.1][input: canonical script][output: Rust embedding/loading path plus frontend test helper path][validation: unit test confirms backend and fixture harness consume same source] Prevent frontend/Rust capture drift.
- [ ] 2.3 [P0][deps:2.1][input: GitHub issue, PR diff, docs, article, form, dashboard, SPA, localhost fixtures][output: fixture regression harness for page extraction][validation: fixture tests assert primary content, readable blocks, visual evidence, forms, headings, and noise handling] Protect extraction quality.
- [ ] 2.4 [P1][deps:2.3][input: iframe/shadow/canvas/virtual-list fixtures or mocks][output: omitted capability diagnostics][validation: tests assert limitations are reported instead of overclaimed] Represent complex page gaps honestly.

## 3. Browser Context Evidence Inspector

- [ ] 3.1 [P0][input: BrowserContextAttachment and BrowserObservation][output: BrowserEvidenceViewModel builder][validation: unit tests cover overview, primary content, readable blocks, interactions, visual evidence, candidates, diagnostics, privacy/budget] Create sectioned evidence view model.
- [ ] 3.2 [P0][deps:3.1][input: Composer preview][output: compact Evidence Inspector preview][validation: component test covers collapsed/expanded sections and stale/degraded badges] Replace single detail block in Composer.
- [ ] 3.3 [P0][deps:3.1][input: sent message BrowserContextSummaryCard][output: message evidence inspector using same view model][validation: component test confirms live/history cards match preview state] Align composer, live, and history surfaces.
- [ ] 3.4 [P1][deps:3.1][input: copy-safe section text][output: copy actions for full safe summary and per-section text][validation: tests assert copied text excludes raw DOM/cookies/headers/secrets] Improve user audit workflow.
- [ ] 3.5 [P1][deps:3.1][input: TaskRun/orchestration evidence surfaces][output: shared Browser Evidence panel for dispatch and result details][validation: component tests cover available/stale/degraded/expired states] Reuse evidence state beyond conversation.

## 4. Workspace-Aware Code Bridge v2

- [ ] 4.1 [P0][input: workspace-local URL policy and workspace file index/search][output: Browser Code Candidate v2 contract][validation: type/unit tests cover reason/confidence/sourceEvidence/explanation/openAction] Define explainable candidate shape.
- [ ] 4.2 [P0][deps:4.1][input: route path and workspace files][output: route_match and file_name_match generator][validation: fixture workspace tests cover Vite/React Router/Next-like route layouts] Improve route-based candidates.
- [ ] 4.3 [P0][deps:4.1][input: primary content, readable blocks, headings][output: visible_text_match and heading_match generator][validation: tests cover bounded search terms and no external-site candidates] Add content-based candidates.
- [ ] 4.4 [P1][deps:4.1][input: buttons, forms, ARIA labels, test ids, landmarks][output: interaction landmark candidate generator][validation: tests cover button_label/form_label/aria_label/test_id reasons] Support UI bug localization.
- [ ] 4.5 [P1][deps:4.1][input: existing file-view/code-intelligence navigation][output: open candidate affordance delegating to existing navigation][validation: UI/service test confirms no duplicate navigator] Reuse code navigation.
- [ ] 4.6 [P1][deps:4.2,4.3,4.4][input: candidate list][output: scorer and wording guard for high/medium/low confidence][validation: tests assert low confidence never renders as definitive ownership] Prevent overclaiming.

## 5. Visual Evidence MVP

- [ ] 5.1 [P1][input: platform capability and privacy settings][output: visual evidence capability state][validation: tests cover supported/degraded/unsupported and opt-in requirement] Define visual evidence gate.
- [ ] 5.2 [P1][deps:5.1][input: Browser Dock active renderer][output: screenshot thumbnail reference capture or degraded diagnostic][validation: backend tests/mocks cover success and failure without storing raw full-page binary by default] Add screenshot reference substrate.
- [ ] 5.3 [P1][deps:5.2][input: screenshot ref][output: optional OCR text extraction contract][validation: tests assert OCR output is budgeted and sanitized] Add OCR as optional supplement.
- [ ] 5.4 [P1][deps:5.1][input: user confirmation][output: visual model attachment confirmation UI][validation: component test confirms no visual binary is sent before confirmation] Enforce explicit opt-in.
- [ ] 5.5 [P2][deps:5.3,5.4][input: visual evidence refs][output: AI payload fields distinguishing DOM text, OCR text, image metadata, and screenshot refs][validation: formatter tests assert source separation and privacy metadata] Avoid conflating visual and DOM facts.

## 6. Authorized Browser Action Preview

- [ ] 6.1 [P0][input: existing runBrowserAgentAction skeleton][output: BrowserActionPreview v3 contract][validation: frontend/backend serialization tests cover navigate/reload/scroll/click/type/select/submit] Define preview-first action model.
- [ ] 6.2 [P0][deps:6.1][input: settings and platform capability][output: action gate resolver][validation: tests assert click/type/select/submit blocked by default] Keep mutating actions disabled.
- [ ] 6.3 [P1][deps:6.1,6.2][input: navigate/reload/scroll requests][output: confirm UI and backend execution path for enabled safe actions][validation: focused tests cover confirmation required and cancel/no-op behavior] Enable low-risk safe navigation actions.
- [ ] 6.4 [P1][deps:6.3][input: confirmed safe action][output: before/after snapshot capture and comparison metadata][validation: tests cover success, after-capture failure, and degraded comparison] Make action effects auditable.
- [ ] 6.5 [P1][deps:6.1][input: action preview/audit value fields][output: secret-redacted value previews][validation: privacy tests cover password/token/authorization/cookie-like values] Prevent action audit leakage.
- [ ] 6.6 [P2][deps:6.4][input: action audit records][output: evidence UI for action history][validation: component tests cover blocked/confirmed/failed outcomes] Show user-visible audit trail.

## 7. Cross-Surface Integration

- [ ] 7.1 [P0][deps:1.4,3.1][input: Composer send path][output: canonical browser observation attachment injected once][validation: send-path tests assert no duplicate structured+prompt injection] Preserve single AI payload path.
- [ ] 7.2 [P0][deps:3.2,3.3][input: live optimistic, queued handoff, history restore][output: consistent Browser Evidence card across all user-message surfaces][validation: regression tests cover optimistic, queued, restored browser context metadata] Keep UI state consistent.
- [ ] 7.3 [P1][deps:3.5][input: TaskRun and orchestration dispatch][output: browser observation/evidence state visible before and after task execution][validation: render tests cover fresh/stale/degraded/expired evidence] Extend evidence beyond chat.
- [ ] 7.4 [P1][deps:4.5][input: code candidate open action][output: file navigation bridge reuse][validation: integration test or documented focused manual check] Avoid duplicate navigation implementation.

## 8. Governance And Validation

- [ ] 8.1 [P0][input: completed OpenSpec artifacts][output: strict OpenSpec validation evidence][validation: `openspec validate advance-browser-dock-trusted-observation-and-code-bridge --strict --no-interactive`] Validate behavior artifacts.
- [ ] 8.2 [P0][input: frontend observation/evidence/code-bridge changes][output: focused Vitest coverage][validation: run focused Browser Agent, Composer, Messages, TaskRun tests] Verify frontend behavior.
- [ ] 8.3 [P0][input: Rust browser_agent changes][output: focused Rust tests][validation: `cargo test --manifest-path src-tauri/Cargo.toml browser_agent`] Verify backend behavior.
- [ ] 8.4 [P0][input: new/changed large files][output: large-file governance evidence][validation: `npm run check:large-files:near-threshold && npm run check:large-files:gate`] Keep module boundaries healthy.
- [ ] 8.5 [P1][input: macOS/Windows/Linux Browser Dock behavior][output: manual degraded-capability matrix][validation: matrix records WebView runtime, capture transport, visual evidence, and action preview behavior] Document cross-platform behavior.
