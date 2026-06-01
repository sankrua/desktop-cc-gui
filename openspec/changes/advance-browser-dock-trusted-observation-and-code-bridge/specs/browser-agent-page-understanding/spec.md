## Related Documents

- Proposal: `openspec/changes/advance-browser-dock-trusted-observation-and-code-bridge/proposal.md`
- Technical design: `openspec/changes/advance-browser-dock-trusted-observation-and-code-bridge/design.md`
- Task breakdown: `openspec/changes/advance-browser-dock-trusted-observation-and-code-bridge/tasks.md`
- Implementation plan: `docs/plans/2026-06-01-browser-dock-phase3.md`
- First Trellis execution task: `.trellis/tasks/06-01-browser-dock-phase3-observation-core/prd.md`

## ADDED Requirements

### Requirement: Phase 3 exposes trusted browser observation state
Browser Agent Page Understanding SHALL expose a Browser Observation state for each capture that distinguishes page facts from capture trust.

#### Scenario: Capture succeeds with full page facts
- **WHEN** the active Browser Dock tab is ready and bound to the active renderer
- **THEN** the observation SHALL be marked `available` and include source, capture time, transport, budget, privacy, and diagnostics metadata

#### Scenario: Capture cannot collect complete facts
- **WHEN** platform, page policy, renderer, timeout, or transport limitations prevent complete capture
- **THEN** the observation SHALL be marked `degraded`, `stale`, `expired`, or `unsupported` with explicit diagnostics

### Requirement: Browser context stale reasons are explicit
Browser Agent Page Understanding SHALL represent stale state as one or more explicit stale reasons rather than only a boolean flag.

#### Scenario: Active tab changes after capture
- **WHEN** the user captures browser context and then switches Browser Dock active tab
- **THEN** the attachment SHALL include `active_tab_changed` as a stale reason

#### Scenario: Renderer binding mismatches requested session
- **WHEN** a capture request targets a session that is not bound to the active single native renderer
- **THEN** the system SHALL not capture another page and SHALL include `renderer_mismatch` as a stale or degraded reason

#### Scenario: Snapshot exceeds TTL
- **WHEN** the attachment age exceeds the configured stale threshold
- **THEN** the attachment SHALL include `ttl_expired` as a stale reason

### Requirement: Capture script has one canonical source
Browser Agent Page Understanding SHALL use a single canonical read-only capture script source for Browser Dock page extraction.

#### Scenario: Capture extraction logic changes
- **WHEN** extraction for headings, readable blocks, primary content, visual evidence, forms, links, or buttons changes
- **THEN** the change SHALL update the canonical capture script source and fixture regression coverage rather than duplicating logic in separate frontend and backend files

### Requirement: Browser Context Evidence Inspector is sectioned
Browser Agent Page Understanding SHALL present browser context evidence through a sectioned inspector rather than a single undifferentiated detail block.

#### Scenario: User inspects attached browser context before sending
- **WHEN** Browser Context is attached in Composer
- **THEN** the user SHALL be able to inspect overview, primary content, readable blocks, interactive elements, visual evidence, code candidates, diagnostics, and privacy/budget sections

#### Scenario: Evidence contains long text
- **WHEN** primary content or readable blocks exceed compact display limits
- **THEN** the inspector SHALL keep the default surface compact and expose long evidence in bounded expandable sections

### Requirement: Workspace-local page-to-code candidates are explainable
Browser Agent Page Understanding SHALL generate workspace-local code candidates with reason, confidence, matched text, source evidence, explanation, and open action.

#### Scenario: Local route maps to source files
- **WHEN** the active tab is a workspace-local development URL
- **THEN** the code bridge MAY generate route, file name, visible text, heading, button label, form label, ARIA label, test id, or component symbol candidates

#### Scenario: Candidate confidence is low
- **WHEN** evidence for a candidate is weak or indirect
- **THEN** the candidate SHALL be labelled low confidence and SHALL NOT be described as definitive ownership

#### Scenario: External site is captured
- **WHEN** the active tab is an external website
- **THEN** Browser Agent SHALL NOT generate local code candidates unless a later explicit manual mapping capability is introduced

### Requirement: Code candidate navigation reuses existing file navigation
Browser Agent Page Understanding SHALL delegate candidate open/inspect actions to existing file-view or code-intelligence navigation surfaces.

#### Scenario: User opens a code candidate
- **WHEN** the user selects a Browser Code Candidate
- **THEN** the app SHALL open the file through existing navigation contracts and SHALL NOT implement a separate Browser Agent-specific file navigator

### Requirement: Visual evidence is opt-in for model injection
Browser Agent Page Understanding SHALL treat screenshot, OCR, and multimodal visual evidence as opt-in supplemental context.

#### Scenario: Page includes images or screenshots
- **WHEN** Browser Context includes visual evidence metadata
- **THEN** the default AI payload MAY include safe labels, alt text, origin, and nearby text but SHALL NOT include image binary content by default

#### Scenario: User authorizes visual model input
- **WHEN** the user explicitly confirms screenshot/OCR/vision attachment
- **THEN** the payload SHALL include budget, privacy, source, and redaction metadata for the visual evidence

### Requirement: Browser actions are preview-first and audited
Browser Agent Page Understanding SHALL require browser actions to be previewed and confirmed before execution.

#### Scenario: Safe navigation action is proposed
- **WHEN** an action such as navigate, reload, or scroll is proposed
- **THEN** the app SHALL show action, target, reason, risk, expected effect, confirmation requirement, and privacy notice before execution

#### Scenario: User confirms safe action
- **WHEN** the user confirms an enabled safe action
- **THEN** the app SHALL capture a before snapshot, execute the action, capture an after snapshot when possible, and store an audit entry

#### Scenario: Safe action is disabled by settings or platform capability
- **WHEN** navigation actions are disabled by settings or unavailable on the current platform
- **THEN** confirmation SHALL NOT execute the action and SHALL surface a blocked or degraded diagnostic

#### Scenario: Mutating action is proposed
- **WHEN** click, type, select, or submit is proposed in Phase 3
- **THEN** the action SHALL remain blocked by default and SHALL NOT execute without a later explicit behavior change

### Requirement: Browser action audit does not expose secrets
Browser Agent Page Understanding SHALL redact sensitive values in action previews and audit records.

#### Scenario: Type or submit action contains a value
- **WHEN** a preview or audit record references typed or submitted values
- **THEN** the value preview SHALL be redacted and SHALL NOT expose password, token, Authorization, cookie, or secret-like content

### Requirement: Browser evidence state is consistent across surfaces
Browser Agent Page Understanding SHALL use consistent observation and evidence states across Composer preview, sent message cards, TaskRun evidence, orchestration dispatch, and AI payload formatting.

#### Scenario: Attachment is degraded
- **WHEN** a degraded Browser Context attachment is present
- **THEN** Composer, messages, TaskRun, orchestration, and AI payload SHALL all expose degraded state and diagnostics consistently

#### Scenario: Attachment is removed before send
- **WHEN** the user removes Browser Context from Composer
- **THEN** the next AI request SHALL NOT include the removed observation, evidence, or fallback prompt block
