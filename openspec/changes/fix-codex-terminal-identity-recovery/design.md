## Context

The previous background-settlement hardening correctly rejected highlighted-thread fallback for terminal-like Codex events. The missing piece is a safe ownership substitute. The client already observes thread-owned events before terminal completion in most real runs, so it can record bounded `workspaceId + turnId -> threadId` evidence and use that instead of focus-based routing.

Assistant completion has a separate failure mode: some Codex completion events are thread-owned but omit `turnId`. Dropping those events from reconcile means visible final text cannot trigger the existing authoritative history refresh path.

## Decisions

### Decision 1: Resolve Missing Terminal Thread Identity From Turn Ownership Only

`turn/completed` may use a missing-thread fallback only when the same `turnId` is already owned by exactly one known thread path. Accepted ownership sources are:

- local event ownership recorded from prior thread-owned events;
- a thread-state resolver that finds a unique Codex thread whose active turn id matches the terminal `turnId`.

The highlighted active Codex thread remains forbidden as a terminal fallback.

### Decision 2: Missing-Turn Assistant Completion Starts Reconcile, Not Settlement

Assistant completion without `turnId` is still useful if it includes `threadId`. The handler schedules one thread-scoped reconcile with `__unknown_turn__`. Processing is cleared only if the refresh + terminal drift guard confirms final assistant evidence and no active work.

### Decision 3: Keep The Fix Frontend-Scoped

The runtime may still be normalized later, but the frontend can safely recover with current event data. This change does not modify Tauri commands or Rust event schemas.

## Risks / Trade-offs

- A stale assistant completion without `turnId` could arrive after a successor turn. Mitigation: reconciliation is thread-scoped and settlement still checks current processing window, active turn compatibility, and active work.
- A missing-thread terminal event with an unknown `turnId` remains ignored. This is intentional; no safe ownership proof exists.
- The ownership map is in-memory. This is enough for live event recovery; reload recovery remains the history/activation path.

## Validation

- Focused Vitest for `useAppServerEvents` terminal ownership.
- Focused Vitest for Codex assistant completion reconcile without `turnId`.
- Focused integration test for a processing Codex thread that receives final assistant text without `turnId`.
- OpenSpec strict validation for this change.
