## ADDED Requirements

### Requirement: Tauri Batch Sink MUST Remain Lossless While Bypassing Cadence For Critical Events

The Tauri `BatchedTauriEventSink` MUST continue to deliver every accepted event to the webview without dropping or reordering. Critical methods (`turn/completed`, `turn/error`, `runtime/ended`, `item/tool/requestUserInput`, `approval/request`, `collaboration/modeBlocked`, `collaboration/modeResolved`) MUST bypass the 40ms cadence interval and emit in their own flush as soon as they arrive. The sink MUST NOT introduce byte budgets that would drop queued events.

#### Scenario: 1024 non-critical events accumulate without loss
- **WHEN** the sink accumulates 1024 non-critical events from a single workspace
- **THEN** every one of the 1024 events MUST eventually be emitted in one or more `app-server-event-batch` payloads
- **AND** no event MUST be dropped from the per-workspace queue.

#### Scenario: critical event bypasses cadence without loss
- **WHEN** the sink receives a `turn/completed` event while non-critical events are still queued
- **THEN** the sink MUST emit a flush containing the critical event without waiting for the next 40ms tick
- **AND** the previously queued non-critical events MUST remain in the per-workspace queue for the next regular flush
- **AND** the critical event MUST NOT be lost or coalesced.

### Requirement: Backend Snapshot Throttle MUST Reduce Source-Side Snapshot Bursts

The backend emit path for `item/updated` text snapshots MUST apply a 32ms per-`(workspaceId, itemId, kind)` throttle. Snapshots for the same key arriving within 32ms of the previous emit MUST replace that key's pending snapshot with the latest complete snapshot and emit that latest snapshot on the next available window. Terminal events (`item/completed`, `turn/completed`, `turn/error`) MUST force flush all pending snapshots. The throttle MUST NOT concatenate complete snapshot strings; append-buffering is reserved for raw `outputDelta` events.

#### Scenario: 10 text snapshots in 100ms for one tool item
- **WHEN** the backend emits 10 `item/updated` text snapshots for the same `(workspaceId, itemId, "commandExecution")` within 100ms
- **THEN** the sink MUST emit at most 4 snapshots to the webview (one per ~32ms)
- **AND** the final emitted text MUST equal the latest complete snapshot for that key.

#### Scenario: terminal event flushes pending snapshots
- **WHEN** the sink receives an `item/completed` or `turn/completed` event
- **THEN** the backend snapshot throttle MUST flush all pending snapshots for all keys
- **AND** the flushed text MUST be emitted before the terminal event itself.

#### Scenario: critical events never throttled
- **WHEN** the backend evaluates whether to throttle
- **THEN** critical methods (`turn/completed`, `turn/error`, `runtime/ended`, `item/tool/requestUserInput`, `approval/request`) MUST NEVER be throttled
- **AND** `item/commandExecution/outputDelta` and `item/fileChange/outputDelta` MUST NEVER be throttled
- **AND** only `item/updated` text snapshots MUST be subject to throttling.

### Requirement: Sink MUST Emit Batch Stats To The Webview

The sink MUST publish `BatchStats` snapshots to a dedicated Tauri channel every 1 second so the webview can correlate backpressure behavior with renderer performance.

#### Scenario: stats channel receives at least one payload per second
- **WHEN** the application has been running for >= 5 seconds with active streaming
- **THEN** the webview MUST have received at least 4 `app-server-event-batch-stats` payloads
- **AND** each payload MUST include `queued_bytes`, `flush_count`, `critical_bypass_count`, `snapshot_throttle_count`, `last_flush_duration_ms`, `last_flush_size_bytes` fields.

#### Scenario: snapshot throttle count is exposed
- **WHEN** the backend snapshot throttle dropped N snapshots between two stats payloads
- **THEN** the next stats payload's `snapshot_throttle_count` MUST reflect the cumulative throttled snapshot count
- **AND** the latest throttled snapshot MUST still be delivered to the webview before terminal completion.

### Requirement: Webview `appServerEventDeliverHub` MUST Use Per-Event Backpressure

The webview MUST subscribe to `app-server-event-batch`, split each batch into individual `AppServerEvent` entries, and route each event through a `createEventBackpressure<AppServerEvent>` instance. The `createEventHub` helper MUST expose an internal `publish(payload)` method (or an equivalent internal method) for already-received batch entries so implementation does not invent an ad-hoc subscription-style delivery API. The per-event backpressure MUST apply `maxEventsPerFlush = 256`, `maxBytesPerFlush = 512 KiB`, and `maxQueueDepth = 4000`. Its `coalesceKey` MUST be limited to idempotent status events such as `processing/heartbeat`, `thread/tokenUsage/updated`, `thread/compacting`, `turn/diff/updated`, and `account/rateLimits/updated`.

#### Scenario: 2000 events keep per-event queue bounded
- **WHEN** 2000 individual `AppServerEvent` entries arrive within 100ms
- **THEN** `appServerEventBackpressure.queueDepth` MUST remain <= 4000
- **AND** events exceeding `maxEventsPerFlush = 256` per RAF MUST be deferred to subsequent flushes.

#### Scenario: tool output deltas stay protected from generic coalesce
- **WHEN** 1000 `item/commandExecution/outputDelta` events for the same `(workspaceId, itemId)` arrive within 1 second
- **THEN** the per-event backpressure `coalesceKey` MUST return `null` for those events
- **AND** no generic last-write replacement MUST occur
- **AND** downstream throttling MUST be handled only by `useToolOutputTailGate` append-buffer semantics.

#### Scenario: critical event bypasses backpressure
- **WHEN** an event with method in `CRITICAL_METHODS` arrives
- **THEN** the backpressure MUST classify the event as `critical`
- **AND** MUST deliver it to subscribers without applying the queue cap or coalesce.

#### Scenario: item/updated snapshots never coalesced
- **WHEN** an `item/updated` text snapshot arrives
- **THEN** the backpressure MUST NOT coalesce it (return `null` from `coalesceKey`)
- **AND** the snapshot MUST be delivered as a distinct event in arrival order.

#### Scenario: maxQueueDepth overflow drops only eligible snapshots
- **WHEN** the per-event backpressure queue exceeds 4000
- **THEN** only events classified by `dropPolicy(event)` as `drop-eligible-snapshot` MAY be dropped
- **AND** `droppedSnapshotCount` MUST increment by the dropped count
- **AND** `item/started`, `item/completed`, raw `itemOutputDelta`, terminal events, lifecycle events, and critical events MUST NEVER be dropped.

### Requirement: Per-Event Dispatch MUST Yield To Idle Callback

The per-event dispatch loop in `useAppServerEvents` MUST use a `useRenderScheduler` hook to yield between chunks via `requestIdleCallback(processNextChunk, { timeout: 50 })` and apply a per-chunk wall-clock budget of 8ms so the main thread can breathe between chunks.

#### Scenario: 200-event queue yields after 8ms
- **WHEN** the dispatch loop processes a 200-event queue
- **AND** processing the first chunk exceeds 8ms
- **THEN** the dispatcher MUST yield via `requestIdleCallback`
- **AND** the remaining events MUST be deferred to subsequent idle callbacks.

#### Scenario: input pending forces yield
- **WHEN** the dispatcher is processing a chunk
- **AND** `navigator.scheduling?.isInputPending?.()` returns `true` (or a `pointerdown` / `keydown` / `wheel` capture listener fires)
- **THEN** the current chunk MUST complete
- **AND** the next chunk MUST be deferred at least 32ms or to the next idle callback.

#### Scenario: idle callback missing falls back to setTimeout
- **WHEN** `requestIdleCallback` is not available
- **THEN** the dispatcher MUST fall back to `setTimeout(processNextChunk, 0)`
- **AND** the 8ms wall-clock budget MUST still apply.

### Requirement: Lossless Sink And Per-Event Backpressure MUST Be Compatible

The combination of lossless Tauri sink, backend snapshot throttle, and per-event webview backpressure MUST preserve the contract from `conversation-realtime-cpu-stability` by separating physical delivery from derived-state convergence: source emission and Tauri sink accepted events remain lossless; the webview MAY drop only explicitly eligible derived snapshots when overloaded; final visible conversation state MUST reconverge through the next retained snapshot or terminal flush.

#### Scenario: snapshot drop reconverges in next cadence
- **WHEN** the webview drops N `item/updated` snapshots due to `maxQueueDepth` overflow
- **THEN** the next `realtimeEventBatcher` cadence flush MUST resolve to the latest snapshot content
- **AND** `droppedSnapshotCount` MUST equal the number of snapshots skipped between two adjacent retained snapshots.

#### Scenario: 10000 deltas over 10 minutes
- **WHEN** a single tool call produces 10000 deltas over 10 minutes
- **THEN** the `main_thread_long_task_count_during_stream` MUST NOT increase compared to the v0.5.13 baseline (relativity defined by task 0.1)
- **AND** `reducer_dispatches_per_active_turn_per_sec` MUST NOT increase compared to baseline.

#### Scenario: critical event preservation
- **WHEN** the three-layer pacing is active
- **AND** critical events (`turn/completed`, `turn/error`, `runtime/ended`, `item/tool/requestUserInput`, `approval/request`) are emitted
- **THEN** every critical event MUST reach the reducer
- **AND** MUST NOT be dropped, coalesced, or delayed by idle yield.
