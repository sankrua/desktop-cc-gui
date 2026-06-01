## Why

Browser Dock Phase 2 has closed the read-only evidence-grade page understanding MVP: the app can attach active-tab page facts to an AI turn as a bounded BrowserContextAttachment. The next bottleneck is not "more DOM text"; it is whether the observation is trustworthy, whether page facts can point to local code with explainable confidence, and whether future browser actions can be previewed and audited before execution.

Phase 3 upgrades Browser Dock from a page snapshot attachment into a trusted observation and code-bridge substrate. This creates the safety and evidence layer required before any higher-risk browser automation such as click, type, select, or submit can be enabled.

## Related Documents

- Implementation plan: `docs/plans/2026-06-01-browser-dock-phase3.md`
- Trellis execution task: `.trellis/tasks/06-01-browser-dock-phase3-observation-core/prd.md`
- Technical design: `openspec/changes/advance-browser-dock-trusted-observation-and-code-bridge/design.md`
- Task breakdown: `openspec/changes/advance-browser-dock-trusted-observation-and-code-bridge/tasks.md`
- Behavior delta: `openspec/changes/advance-browser-dock-trusted-observation-and-code-bridge/specs/browser-agent-page-understanding/spec.md`

## 目标与边界

- Phase 3 MUST inherit the Phase 1/2 Browser Dock baseline: top toolbar entry, right companion split, draggable conversation/browser divider, multi-tab UI, single native WebView renderer, active-tab ownership, engine-agnostic attachment, settings-based enablement, cross-platform degradation, large-file governance, and privacy-safe defaults.
- Phase 3 MUST make capture trust explicit through availability, stale reasons, degradation diagnostics, budget state, privacy state, and renderer binding state.
- Phase 3 MUST treat Browser Dock as an observation surface first. Browser actions may be previewed and audited, but mutating actions remain blocked by default.
- Phase 3 MUST improve local page-to-code candidates for workspace-local pages without claiming certain ownership unless evidence is strong and explicit.
- Phase 3 MUST keep AI-visible browser context engine-agnostic across Claude, Codex, Gemini, OpenCode, and custom providers.
- Phase 3 MUST avoid growing `Composer.tsx` and `BrowserDock.tsx` with new responsibilities; observation, evidence, code-bridge, visual evidence, and action logic must live in focused Browser Agent modules.
- Phase 3 MUST continue to exclude raw DOM, cookies, headers, storage, scripts, styles, password values, token values, Authorization values, hidden input values, and page secrets from preview, evidence, storage, and AI payloads.

## 非目标

- Do not implement full Playwright/CDP-grade browser automation runtime.
- Do not allow AI to click, type, select, or submit without user confirmation.
- Do not send full screenshots, OCR output, or image binaries to models by default.
- Do not store complete HTML or raw DOM for evidence.
- Do not create a Browser Agent-specific file navigation system that bypasses existing code-intelligence/file-view navigation surfaces.
- Do not guarantee perfect understanding for iframe, shadow DOM, canvas, virtual list, heavily authenticated, or cross-origin embedded content; Phase 3 must expose degraded diagnostics instead.
- Do not convert code candidates into definitive file ownership claims. Candidates remain suggestions with evidence, reason, and confidence.

## What Changes

- Add a Browser Observation v3 contract that records capture availability, stale reasons, transport status, renderer binding, omitted capabilities, budget state, privacy state, and diagnostics.
- Consolidate read-only capture script ownership into one canonical source to prevent frontend/Rust extraction drift.
- Extend stale policy from a boolean to explicit reasons: active tab switch, renderer mismatch, URL change, title change, scroll threshold, DOM fingerprint change, TTL expiry, Browser Dock close, session close, and workspace mismatch.
- Replace the current single expanded context block with a Browser Context Evidence Inspector that separates overview, primary content, readable blocks, interactive elements, visual evidence, code candidates, diagnostics, and privacy/budget.
- Upgrade Local Page-to-Code Bridge into a workspace-aware candidate pipeline using route, file name, visible text, headings, button labels, form labels, ARIA labels, test ids, and component symbols.
- Add visual evidence MVP as an opt-in channel for screenshot thumbnails, OCR text, and multimodal references, with explicit user confirmation before model injection.
- Add an Authorized Browser Action Preview contract. Phase 3 may enable preview-confirm-audit flow for navigate, reload, and scroll; click, type, select, and submit remain blocked by default.
- Gate safe browser actions by settings and platform capability even after user confirmation.
- Add before/after snapshot comparison metadata for confirmed safe navigation actions.
- Extend Browser Context Attachment formatting so AI sees trust state and limitations before using browser facts.
- Extend evidence references so TaskRun and orchestration dispatch can show available/stale/degraded/expired browser evidence consistently.

## 技术方案选项与取舍

| Option | Approach | Strength | Weakness | Decision |
|---|---|---|---|---|
| A | Keep Phase 2 snapshot shape and only improve copy/UI wording | Lowest effort, low regression risk | Does not solve trust, stale reasons, code confidence, or action readiness | Reject |
| B | Build a trusted observation layer on top of the existing single WebView renderer and BrowserContextAttachment | Preserves current architecture, improves safety, keeps engine-agnostic path | Requires careful contract and UI refactor | Choose for Phase 3 |
| C | Replace Browser Dock capture with external Playwright/CDP as the default engine | Strong automation and inspection power | Heavy dependency, distribution complexity, larger security surface, not aligned with desktop MVP | Defer as optional advanced provider |
| D | Make screenshot/vision the primary page understanding channel | Better visual layout understanding | Higher privacy cost, more expensive, weak code mapping, less deterministic than DOM facts | Use only as opt-in supplement |

Phase 3 chooses B as the main path. C and D may become provider or opt-in supplements after the trusted observation and user confirmation contracts are stable.

## Capabilities

### New Capabilities

- None. Phase 3 extends the existing Browser Agent Page Understanding capability rather than introducing a parallel browser automation capability.

### Modified Capabilities

- `browser-agent-page-understanding`: Add trusted observation state, stale reasons, evidence inspector behavior, workspace-aware code bridge, opt-in visual evidence, and authorized action preview requirements.

## Impact

- Frontend:
  - `src/features/browser-agent/**` will gain focused observation, evidence, code-bridge, visual evidence, and action-preview modules.
  - `BrowserDock` remains session/tab/renderer lifecycle only.
  - `Composer` remains wiring only and delegates browser context UI/state to Browser Agent modules.
  - Message rows and TaskRun evidence surfaces consume shared BrowserContextAttachment/BrowsingEvidence view models.
- Service bridge:
  - `src/services/tauri/browserAgent.ts` may add observation, visual evidence, and action preview commands while preserving existing snapshot commands during migration.
- Backend:
  - `src-tauri/src/browser_agent/**` will expose observation diagnostics, stale reasons, optional visual evidence references, and safe action preview/audit contracts.
- AI runtime:
  - Existing canonical browser context formatter will include trust state and limitations without creating engine-specific payloads.
- Security/privacy:
  - Existing sanitizer remains the boundary for all AI-visible strings.
  - Screenshot/OCR/model-image channels require explicit confirmation and budget metadata.
- Governance:
  - Implementation must follow Trellis frontend/backend/guides rules before code changes.
  - Validation must include strict OpenSpec validation, focused frontend tests, focused Rust tests, and large-file governance when implementation begins.

## 验收标准

- Browser observation exposes `available`, `degraded`, `stale`, `expired`, and `unsupported` states with user-visible and AI-visible diagnostics.
- Browser context stale state includes explicit reasons rather than only a boolean.
- Capture script logic has one canonical source of truth and fixture coverage prevents frontend/Rust drift.
- Composer preview, sent message card, TaskRun evidence, and orchestration dispatch use consistent observation/evidence state.
- Browser Context Evidence Inspector lets users independently inspect primary content, readable blocks, interactive elements, visual evidence, code candidates, diagnostics, and privacy/budget.
- Workspace-local pages generate explainable code candidates with reason, confidence, matched text, source evidence, and open action.
- External sites do not generate local code candidates unless a later explicit manual mapping feature is designed.
- Screenshot/OCR/vision payloads are opt-in and are not sent to AI by default.
- Navigate/reload/scroll can be previewed, confirmed, audited, and compared with before/after snapshots.
- Click/type/select/submit remain blocked by default in Phase 3.
- No browser context payload exposes raw DOM, cookies, headers, storage, scripts, styles, password/token/Authorization values, hidden input values, or page secrets.
