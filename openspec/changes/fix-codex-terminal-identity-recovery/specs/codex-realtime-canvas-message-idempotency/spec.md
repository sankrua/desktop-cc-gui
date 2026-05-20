## ADDED Requirements

### Requirement: Codex Terminal Completion MUST Recover From Missing Thread Identity Using Turn Ownership

When a Codex `turn/completed` event lacks explicit thread identity but carries a `turnId`, the frontend MUST recover terminal routing only from thread-owned turn evidence. It MUST NOT route the event to the currently highlighted Codex thread solely because that thread is active in the UI.

#### Scenario: missing-thread completion resolves from recorded turn ownership

- **WHEN** a Codex turn previously emitted a thread-owned event with `threadId=A` and `turnId=T`
- **AND** a later `turn/completed` event carries `turnId=T` but no `threadId`
- **THEN** the client MUST settle or reconcile thread `A`
- **AND** it MUST NOT consult highlighted-thread fallback for terminal mutation

#### Scenario: unowned missing-thread completion remains ignored

- **WHEN** a Codex `turn/completed` event lacks `threadId`
- **AND** no recorded ownership or unique active-turn ownership exists for its `turnId`
- **THEN** the client MUST NOT settle any thread
- **AND** it MUST NOT use the highlighted Codex thread as a fallback

### Requirement: Codex Assistant Completion Without Turn Identity MUST Trigger Thread-Scoped Reconciliation

When a Codex assistant completion event is tied to a concrete thread but lacks `turnId`, the frontend MUST schedule a bounded thread-scoped reconciliation instead of dropping the evidence. The assistant completion MUST NOT directly clear processing.

#### Scenario: thread-owned assistant completion without turn id schedules reconcile

- **WHEN** a processing Codex thread receives assistant completion evidence with `threadId=A`
- **AND** the event lacks `turnId`
- **THEN** the client MUST schedule at most one bounded reconciliation for thread `A`
- **AND** processing MUST be cleared only after the existing terminal-drift settlement guard confirms final assistant evidence and no active work
