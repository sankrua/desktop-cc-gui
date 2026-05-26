## Why

The Project Map footer exposes Auto Ingestion controls, but the current implementation is only partially wired: it persists settings and can create regex-derived conversation candidates, while `checkIntervalMinutes`, `autoApplyEvidenceBacked`, and the real generation queue contract are not operational.

This creates a misleading product surface. Users see a scheduler-like control, but enabling it does not create the AI analysis run required by the Project Map spec.

## 目标与边界

- Wire the existing Auto Ingestion footer controls into the Project Map generation queue.
- Make `checkIntervalMinutes` and `memoryCursor.lastCheckedAt` control when Project Memory is scanned.
- Keep default behavior conservative: automatic ingestion creates candidates for human review, not direct active-map mutation.
- Preserve existing Project Memory and Project Map storage formats where possible.

## 非目标

- Do not introduce a native daemon worker in this change.
- Do not invent a new graph/map generation engine.
- Do not enable fully automatic active-map writes without an explicit, evidence-gated implementation.
- Do not scan arbitrary conversation history outside the Project Memory surface.

## What Changes

- Auto Ingestion will enqueue a real Project Map `auto` run when enabled and the unprocessed Project Memory count reaches the configured threshold.
- The scheduler will respect `checkIntervalMinutes`, last check time, active queued/running auto runs, and React StrictMode remounts.
- The auto run will carry Project Memory evidence into the worker prompt and use the existing Project Map queue/active-slot lifecycle.
- Default `createCandidate` mode will keep generated updates as candidate nodes for manual confirm/reject.
- `autoApplyEvidenceBacked` remains visible as an advanced option only if it has an explicit path; otherwise it must not silently disable ingestion.

## 技术方案对比

### Option A: Keep the current lightweight regex candidate path

Pros: small code diff and no extra worker prompts.

Cons: it bypasses the generation queue, ignores interval settings, does not create AI analysis runs, and diverges from the spec. It also creates a fake `completed` run even though no Project Map worker executed.

### Option B: Reuse the existing Project Map run queue and worker

Pros: one lifecycle for manual and automatic generation, existing Task drawer visibility, existing parser/merge/evidence gates, and no new daemon substrate.

Cons: requires the worker prompt and request model to accept Project Memory evidence.

### Decision

Use Option B. It is the least surprising architecture: Auto Ingestion becomes another scoped Project Map generation request, not a separate hidden write path.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `project-xray-panel`: Auto Ingestion settings must create real queued AI analysis runs, respect interval/threshold scheduling, and default to candidate review before active-map writes.

## Impact

- Affected frontend code:
  - `src/features/project-map/hooks/useProjectMapDataset.ts`
  - `src/features/project-map/services/projectMapGenerationWorker.ts`
  - `src/features/project-map/utils/autoIngestion.ts`
  - `src/features/project-map/utils/generationRequests.ts`
  - `src/features/project-map/components/ProjectMapPanel.tsx`
  - `src/features/project-map/types.ts`
  - `src/i18n/locales/*.part5.ts`
- Affected behavior:
  - Auto Ingestion footer settings become operational.
  - Automatic work is visible in the Project Map background task drawer.
  - Project Memory messages are marked processed only after a successful auto run.
- Dependencies:
  - No new external dependency.

## 验收标准

- Enabling Auto Ingestion with enough unprocessed Project Memory entries queues a `kind="auto"` Project Map run.
- Auto Ingestion does not queue again before `checkIntervalMinutes` has elapsed.
- Auto Ingestion does not queue duplicate auto runs while one is pending or running.
- Successful auto runs mark consumed Project Memory messages processed; failed runs do not.
- Default `createCandidate` mode produces candidate state requiring manual confirmation rather than silently mutating active map facts.
