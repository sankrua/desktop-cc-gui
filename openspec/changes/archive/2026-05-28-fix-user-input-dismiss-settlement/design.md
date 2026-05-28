## Context

The chat canvas renders live `RequestUserInput` cards through `RequestUserInputMessage`. The UX needs two separate actions:

- X/收起: presentation-only local collapse.
- 跳过并继续: runtime-visible empty-answer settlement through `respond_to_server_request`.

Claude already supports an empty-answer response: `format_ask_user_answer` turns an empty answer payload into a user-readable dismissed message and resumes the turn. The missing piece is that the production live-card close button does not call that path.

## Goals / Non-Goals

**Goals:**

- Make the explicit skip action on an actionable live user-input card settle the request through the existing response IPC.
- Keep X/收起 as a local hide affordance.
- Keep stale timeout/disconnected cleanup non-fatal.
- Keep normal answer submission and submitted audit items unchanged.
- Keep the implementation narrowly scoped to the production live-card path and its hook.

**Non-Goals:**

- Do not add a new backend command.
- Do not redesign the entire request card UI.
- Do not change approval request behavior.
- Do not rewrite history hydration beyond preventing currently closed requests from staying actionable through the live queue.

## Decisions

### Decision: Use empty-answer settlement for explicit skip

The “跳过并继续” action will reuse `handleUserInputSubmit(request, { answers: {} })` through a dedicated dismiss-settlement wrapper instead of dispatching `removeUserInputRequest` directly.

Rationale:

- It uses the same `respond_to_server_request` contract as normal submit.
- Claude backend already formats empty answers as a dismissed AskUserQuestion response.
- Codex core already treats `{ answers }` as the user-input response shape.
- It avoids a new IPC or backend migration.

Alternative considered: add a new explicit `cancel_user_input_request` command. This is semantically cleaner but larger than necessary for the current bug and would require backend support across engines.

### Decision: Keep X/收起 local

The top-right X remains a local collapse/hide action. It clears local draft and countdown state for the current card, but does not call the runtime.

Rationale:

- X buttons are widely understood as presentation dismissal, not durable runtime answers.
- Users can temporarily get the card out of the way without accidentally resuming the agent.
- The explicit skip button carries the destructive/resumptive semantics.

### Decision: Do not add submitted audit item for empty skip

Normal submit continues to insert a `requestUserInputSubmitted` audit item. Skip settlement should only remove the live pending request.

Rationale:

- Empty skip is not a meaningful answer.
- The backend/runtime transcript already receives the dismissed signal.
- Avoid adding noisy synthetic cards for users who simply skip an obsolete prompt.

Alternative considered: always write a local “dismissed” audit item. This improves local visibility but risks duplicate/noisy records during history replay.

### Decision: Preserve stale fallback behavior

If the runtime says the request is unknown, timed out, or disconnected, the frontend removes the request locally and does not fail the UI.

Rationale:

- The request is no longer actionable.
- Current stale-submit handling already follows this principle.
- This avoids reintroducing the exact stale-card residue the change is fixing.

## Risks / Trade-offs

- [Risk] Locally collapsed cards still represent pending runtime requests. → Mitigation: the explicit “跳过并继续” action is visible before collapse and remains available on new request events; timeout cleanup still settles stale cards.
- [Risk] Empty-answer settlement can resume the agent rather than fully stop it. → Mitigation: this matches existing backend semantics and fixes the current mismatch; full turn cancellation remains a separate product decision.
- [Risk] Remote backend may interpret empty answers differently. → Mitigation: use the existing response contract and keep tests focused on frontend behavior; remote parity can be validated separately if needed.

## Migration Plan

1. Update frontend dismiss hook to settle via empty-answer response.
2. Split card UI into local collapse and explicit skip actions.
3. Update card tests to assert collapse is local and skip is settlement.
4. Update hook tests to cover empty-answer dismiss success and stale fallback.
4. Run focused Vitest suites and OpenSpec validation.

Rollback: revert the hook/component test changes and this OpenSpec change. No persisted schema or dependency migration is introduced.

## Open Questions

- Should a future UX pass split the affordance into “收起” and “跳过并继续 / 结束本轮”? This change intentionally fixes the current misleading close path first.
