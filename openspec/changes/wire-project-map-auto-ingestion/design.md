## Context

The existing footer UI writes `dataset.autoIngestionSettings`. The hook then immediately calls `projectMemoryList` whenever the dataset changes and the setting is enabled. If enough unprocessed messages exist, it builds candidates synchronously and writes a synthetic `kind="auto" status="completed"` run.

That path does not satisfy the Project Map contract. It does not use `checkIntervalMinutes`, does not use the existing generation queue, and does not run the AI worker. It also makes the footer look more capable than the backend behavior.

## Decision 1: Auto Ingestion is a queued Project Map run

Auto Ingestion MUST enqueue a `ProjectMapGenerationRequest` with:

- `kind: "auto"`
- `scope: { kind: "auto", messageHashes }`
- `generationIntent: "autoIngestion"`
- `readSources` derived from the Project Memory entries and existing map context
- `autoIngestion` metadata containing the consumed Project Memory message keys

The existing worker claim / active-slot lifecycle remains the single executor. This preserves queue visibility, cancellation, failure state, and run logs.

## Decision 2: Project Memory evidence is prompt evidence, not direct mutation

The worker prompt will include a bounded Project Memory evidence section for auto runs. These snippets are not workspace files and must be labeled as memory evidence.

The prompt rules for default `createCandidate` mode instruct the model to mark generated nodes as `candidate=true`, `confidence=low|unknown` unless code/file evidence supports stronger claims. Direct deletion remains forbidden.

## Decision 3: Scheduling is interval-gated and idempotent

The scheduler evaluates:

- Auto Ingestion enabled
- persisted Project Map dataset is available
- no existing pending/running auto run
- `now - memoryCursor.lastCheckedAt >= checkIntervalMinutes`
- unprocessed Project Memory count >= `newSessionThreshold`

If the threshold is not met, it updates only `lastCheckedAt`. If threshold is met, it persists the queued run and `pendingMessages`. Processed markers are written only when the queued run completes successfully.

## Decision 4: `autoApplyEvidenceBacked` is not a fake switch

Until a deterministic direct-apply path is implemented, auto ingestion will still route through the candidate-safe merge path. The UI copy can label the option as advanced, but the implementation must not make selecting it disable all ingestion.

The practical behavior for this change is:

- `createCandidate`: generated updates remain candidates.
- `autoApplyEvidenceBacked`: still queues a real auto run, but only evidence-backed generated facts may avoid candidate status. Unsupported/weak memory-only claims remain candidates.

## Risks

- [Risk] Auto runs could repeatedly enqueue under StrictMode. Mitigation: detect existing pending/running auto runs and persist `lastCheckedAt` before leaving the scan cycle.
- [Risk] Memory evidence could over-promote weak conversation claims. Mitigation: prompt rules and merge confidence guards keep memory-only facts conservative.
- [Risk] Failed runs could hide future ingestion. Mitigation: processed markers are written only after successful completion.

## Rollback

Revert this change to restore the previous settings-only substrate. Existing persisted `settings.json`, `memory-ingestion/cursor.json`, and `processed.json` remain compatible.
