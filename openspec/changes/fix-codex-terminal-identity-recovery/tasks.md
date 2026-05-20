## 1. Implementation

- [x] 1.1 Record bounded `turnId -> threadId` ownership from thread-owned Codex realtime events.
- [x] 1.2 Resolve missing-thread `turn/completed` from ownership or unique active-turn resolver, never from highlighted thread fallback.
- [x] 1.3 Schedule thread-scoped Codex reconcile for assistant completion without `turnId`.

## 2. Regression Coverage

- [x] 2.1 Cover missing-thread terminal completion resolved from prior ownership.
- [x] 2.2 Cover missing-thread terminal completion resolved from active-turn ownership resolver.
- [x] 2.3 Cover assistant completion without `turnId` scheduling reconcile and clearing only through terminal-drift settlement.

## 3. Validation

- [x] 3.1 Run focused Vitest suites for touched hooks.
- [x] 3.2 Run frontend typecheck.
- [x] 3.3 Run OpenSpec strict validation.
