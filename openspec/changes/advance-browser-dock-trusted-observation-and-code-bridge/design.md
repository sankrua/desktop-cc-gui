## Context

Browser Dock Phase 2 established the current baseline: a right-side companion Browser Dock with multi-tab UI, one native WebView renderer, active-tab-only capture, Snapshot v2, sanitizer, composer preview, live/history Browser Context cards, and a canonical engine-agnostic `<browser_context_v2>` injection path.

The remaining gap is trust and action readiness. A model can now receive browser facts, but the product does not yet make every capture's reliability, freshness, degradation, visual limitation, and code-candidate confidence sufficiently explicit. Without that layer, moving directly into browser actions would create a black-box automation surface.

Phase 3 therefore treats Browser Dock as an evidence system first:

```text
Browser Dock -> Trusted Observation -> Evidence Inspector -> Code Bridge -> Authorized Action Preview
```

Only after observation and evidence are reliable should higher-risk mutating browser actions become eligible for future phases.

## Related Documents

- Proposal: `openspec/changes/advance-browser-dock-trusted-observation-and-code-bridge/proposal.md`
- Behavior delta: `openspec/changes/advance-browser-dock-trusted-observation-and-code-bridge/specs/browser-agent-page-understanding/spec.md`
- Task breakdown: `openspec/changes/advance-browser-dock-trusted-observation-and-code-bridge/tasks.md`
- Implementation plan: `docs/plans/2026-06-01-browser-dock-phase3.md`
- Trellis execution task: `.trellis/tasks/06-01-browser-dock-phase3-observation-core/prd.md`

## Design Goals

- Preserve the existing Browser Dock runtime baseline and active-tab source of truth.
- Make observation trust explicit and reusable across composer, messages, TaskRun, orchestration, and AI payloads.
- Use one canonical read-only capture script implementation.
- Improve local page-to-code candidate quality without overclaiming certainty.
- Add visual evidence only as opt-in supplemental context.
- Introduce action preview/audit contracts before enabling mutating automation.
- Keep Browser Dock and Composer thin.

## Architecture Overview

```text
BrowserDock
  owns: sessions, tabs, active session, renderer binding, WebView lifecycle
  emits: ActiveBrowserContext

Observation Service
  owns: capture request, transport result, stale reason reconciliation, diagnostics
  returns: BrowserObservation

Evidence Builder
  owns: sanitized BrowserEvidence, sectioned evidence view model, copy-safe summary
  returns: BrowserContextAttachment + BrowserEvidenceViewModel

Code Bridge
  owns: workspace-local candidate generation, confidence, source evidence, open affordance
  returns: BrowserCodeCandidate[]

Visual Evidence
  owns: screenshot/OCR/vision opt-in references, budget, privacy confirmation
  returns: BrowserVisualEvidenceRef[]

Action Preview
  owns: proposed action, risk, confirmation, before/after snapshot refs, audit entry
  returns: BrowserActionPreview / BrowserActionAuditEntry
```

## Core Contracts

### BrowserObservation

`BrowserObservation` is the trust envelope around a page capture.

Required fields:

- `observationId`
- `schemaVersion`
- `browserSessionId`
- `workspaceId`
- `capturedAt`
- `state`: `available | degraded | stale | expired | unsupported`
- `staleReasons`: array of explicit reasons
- `transport`: `webview_dom | metadata_fallback | screenshot_ocr | external_provider | unavailable`
- `rendererBinding`: `matched | mismatched | unavailable`
- `source`: URL, title, tab label, page type
- `budget`: char limits, omitted counts, truncation state
- `privacy`: omitted/redacted kinds
- `diagnostics`: user-visible and AI-visible messages
- `omittedCapabilities`: e.g. `iframe`, `shadow_dom`, `canvas`, `cross_origin_frame`, `visual_binary`, `authenticated_region`

`screenshot_ocr` MUST only appear after explicit user authorization. It is never an automatic fallback for default read-only text capture. `external_provider` is reserved for a future optional provider path and is not the Phase 3 default transport.

### BrowserEvidenceViewModel

The UI must not render raw snapshot objects directly. It should consume a sectioned view model:

- `overview`
- `primaryContent`
- `readableBlocks`
- `interactiveElements`
- `visualEvidence`
- `codeCandidates`
- `diagnostics`
- `privacyBudget`

Each section has:

- `title`
- `state`
- `items`
- `truncated`
- `copySafeText`
- `emptyReason`

### BrowserCodeCandidate v2

Candidates must be explainable:

- `candidateId`
- `filePath`
- `symbolName`
- `reason`
- `confidence`: `high | medium | low`
- `matchedText`
- `sourceEvidence`
- `explanation`
- `openAction`

Allowed reasons:

- `route_match`
- `file_name_match`
- `visible_text_match`
- `heading_match`
- `button_label_match`
- `form_label_match`
- `aria_label_match`
- `test_id_match`
- `component_symbol_match`

### BrowserActionPreview

All actions are preview-first:

- `actionId`
- `browserSessionId`
- `action`: `navigate | reload | scroll | click | type | select | submit`
- `targetDescription`
- `valuePreview`
- `reason`
- `riskLevel`: `low | medium | high`
- `requiresUserConfirmation`
- `blockedByDefault`
- `beforeSnapshotId`
- `expectedEffect`
- `privacyNotice`

Phase 3 may execute confirmed low-risk actions only:

- `navigate`
- `reload`
- `scroll`

These remain disabled if settings or platform capability disallow them. Mutating actions stay preview-only/blocked.

## Data Flow

### Attach browser context

```text
User clicks Attach in Browser Dock header
  -> command bus requests attachment for workspace
  -> attachment hook asks Observation Service to capture active context
  -> BrowserDock active context validates session + renderer binding
  -> backend executes canonical read-only capture script or returns degraded fallback
  -> sanitizer builds bounded snapshot
  -> observation reconciles stale/degraded reasons
  -> evidence builder creates BrowserContextAttachment + EvidenceViewModel
  -> Composer preview renders Evidence Inspector summary
```

### Send message with browser context

```text
Composer send
  -> sendOptions.browserContextAttachment
  -> useThreadMessaging injects canonical browser context payload once
  -> optimistic user row stores the same attachment
  -> MessagesRows renders BrowserContextSummaryCard/Evidence Inspector
  -> history restore can parse fallback prompt block or use structured attachment
```

### Generate code candidates

```text
Observation source says workspace-local URL
  -> Code Bridge normalizes route and page facts
  -> workspace file index/search returns candidate files
  -> candidate scorer combines route, file name, text, landmarks, aria/test ids, symbols
  -> UI shows candidates with confidence and explanation
  -> open action delegates to existing file/code navigation
```

### Confirm safe browser action

```text
AI/user proposes navigate/reload/scroll
  -> Action Preview created with risk + expected effect
  -> User confirms
  -> before snapshot captured
  -> backend executes safe action if enabled
  -> after snapshot captured
  -> audit entry stores before/after refs and outcome
  -> UI reports diff/diagnostics
```

## Key Decisions

### Decision 1: Observation state is separate from Snapshot

Snapshot describes page facts. Observation describes trust in the capture. Keeping them separate prevents every page model from absorbing transport, freshness, platform, and policy logic.

### Decision 2: Single native renderer remains the default

Phase 3 does not switch to multiple child WebViews or external Chrome. The active renderer binding remains a hard gate. Renderer mismatch must produce stale/degraded diagnostics, never wrong-page capture.

### Decision 3: Visual evidence is supplemental and opt-in

Screenshot/OCR/vision can help where DOM text is insufficient, but it has higher privacy and cost. The default AI payload remains structured text evidence. Visual binary or OCR injection requires explicit user confirmation and budget metadata.

### Decision 4: Code bridge reuses existing navigation

Browser Agent may generate candidates but must not own a separate file opening/navigation stack. Candidate open actions delegate to existing file-view/code-intelligence surfaces.

### Decision 5: Actions are preview-first

Action execution must be designed as an auditable workflow before mutating actions are enabled. Phase 3 only permits low-risk safe navigation actions when confirmed.

## Module Boundary

Recommended frontend modules:

```text
src/features/browser-agent/observation/
src/features/browser-agent/evidence/
src/features/browser-agent/code-bridge/
src/features/browser-agent/visual-evidence/
src/features/browser-agent/actions/
```

Recommended backend modules:

```text
src-tauri/src/browser_agent/observation.rs
src-tauri/src/browser_agent/evidence.rs
src-tauri/src/browser_agent/actions.rs
src-tauri/src/browser_agent/visual_evidence.rs
```

Existing modules keep these responsibilities:

- `BrowserDock`: session/tab/renderer lifecycle.
- `useBrowserContextAttachment`: attachment state owner and command bus subscriber.
- `attachment.ts`: canonical AI payload formatter/parser.
- `snapshotSanitizer.ts`: privacy and budget boundary.
- `Composer`: wiring only.

## Stale Reason Model

Stale reasons should be additive:

- `active_tab_changed`
- `renderer_mismatch`
- `url_changed`
- `title_changed`
- `scroll_changed`
- `dom_fingerprint_changed`
- `ttl_expired`
- `browser_dock_closed`
- `session_closed`
- `workspace_mismatch`
- `capture_degraded`

UI must show the top reason in compact surfaces and all reasons in details.

## Privacy And Security

- All AI-visible strings must pass sanitizer.
- Screenshot/OCR/vision must be opt-in and budgeted.
- Hidden/password/token/authorization values remain omitted or redacted.
- Evidence records store bounded references and summaries, not raw DOM or complete image payloads by default.
- Private-network policy remains blocked by default except workspace-scoped local development targets.
- Action audit logs must not store typed secrets; value previews for type/submit remain redacted.

## Rollout Strategy

1. Add observation types and view models without changing existing capture behavior.
2. Move current preview/card rendering onto Evidence Inspector view models.
3. Consolidate capture script source and add fixture regression.
4. Upgrade code candidates for workspace-local pages.
5. Add visual evidence opt-in scaffolding.
6. Add safe navigation action preview/confirm/audit.
7. Keep mutating actions blocked until a later dedicated change.

## Validation Strategy

- OpenSpec strict validation for the change.
- Frontend unit tests for observation stale reasons, evidence view model, code candidate scoring, preview/card rendering, and action preview state.
- Rust tests for observation DTO serialization, renderer mismatch diagnostics, URL policy, evidence retention, and action audit records.
- Fixture tests for GitHub issue, PR diff, docs page, article page, form wizard, dashboard, SPA shell, and localhost app route.
- Large-file governance checks after implementation.
- Manual cross-platform matrix for macOS, Windows WebView2, and Linux WebKitGTK degraded behavior.

## Risks And Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Capture script drift | Frontend/Rust behavior diverges | Single canonical script source and fixture tests |
| Stale state over-noises UI | Users ignore warnings | Compact top reason plus detailed drilldown |
| Code candidates overclaim | AI edits wrong files | Confidence, source evidence, wording guard |
| Visual evidence leaks sensitive data | Privacy regression | Explicit confirmation, sanitizer, budget metadata |
| Action preview becomes accidental execution | Unsafe automation | Confirmation gate, settings gate, blocked mutating actions |
| Large files grow again | Maintainability regression | Dedicated modules and large-file governance |
