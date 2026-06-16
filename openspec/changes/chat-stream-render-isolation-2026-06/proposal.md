# Proposal: Chat Stream Render Isolation 2026-06

## Why

`useThreadsReducer.ts` (2343 行) + `useThreadEventHandlers.ts` (2747 行) + `useThreads.ts` (2347 行) 共同构成 chat 主面板的 renderer hot path。review pass(2026-06-16)对齐源码后,真实代码事实如下:

- `useThreadsReducer.ts` 中 `INCREMENTAL_DERIVATION_ENABLED` 守卫实际覆盖 5/19 case(`appendAgentDelta` 行 1068 / `appendReasoningSummary` 行 1631 / `appendReasoningSummaryBoundary` 行 1693 / `appendReasoningContent` 行 1876 / `appendToolOutput` 行 1953),等价文本走 `return state` 直接收敛。真正仍走 `prepareThreadItems` 全量 O(n) 重计算的是 `completeAgentMessage`(行 1141-1248)和 `upsertItem`(行 1251-1448)两条 streaming 主路径,以及 `dropReasoningItems` / `applyNormalizedRealtimeEvent` 等低频路径。
- `Messages.tsx` 的 `shouldVirtualizeTimelineRows`(`messagesTimelineVirtualization.ts:13-18`)在 `isThinking === true` 且未命中 `hasHighRenderDensity` 时会返回 false;即使 `rowCount >= TIMELINE_VIRTUALIZATION_MIN_ROWS(200)`,主分支也会被 `!isThinking` 阻断,意味着长 worktree fork + 长会话 streaming 期间 timeline 可能全部展开,DOM 节点随 row 数线性增长。
- `MessagesRows.tsx:1017-1054` 的 `analyzeStreamingMarkdownComplexity` 对每个 `displayText` 跑 `split(/\r?\n/)` + 3 个正则(`^#{1,6}\s+` / `^(?:[-*+]|\d+[.)])\s+` / `^```),1k token reply 会有 100~200 次全量 O(n) 扫描。

题目边界(codex / claude 双引擎并行 + 不串线 + 实时运行缓存不无限增长)与代码事实存在三处具体 gap,review pass 已逐条核验:

1. `turnDiagnosticsRef` / `quarantinedCodexTurnsRef` / `assistantSnapshotIngressLengthRef` 在 `interruptTurn` 走 fallback 路径时不清 diagnostic,长 worktree fork 会堆积;**30 分钟 TTL 缺失**是真实问题,跟 `useThreadStorage` 已有 `autoTitlePendingRef` 5s 清理机制不对称。
2. `useThreads.ts` 顶部实际 21 个 `useRef`(原提案误记 18),其中 6 个跨 workspace 串线风险:`pendingMemoryCaptureRef` / `pendingAssistantCompletionRef` / `recentThreadErrorsRef` 是 `Record<string, T>` 结构,`pendingInterruptsRef` / `interruptedThreadsRef` / `handledClaudeExitPlanToolIdsRef` 是 `Set<string>` 结构。`Set` 不带 workspace 维度,workspace 切换后旧 set 里的 threadId 仍然命中,是真实 bug。**注意:`codex` 引擎不串线由 `isClaudeSessionBootstrapThreadId`(`claudeForkThread.ts`)保障,跟 `claude-pending-` / `gemini-pending-` / `opencode-pending-` 前缀的 `threadPendingResolution.ts:18` 路径并列存在**,原提案 evidence point 误写 `codex-pending-` 前缀,本次 review 已修正。
3. streaming 期间 `MessagesTimeline` 不虚拟化导致 DOM 节点随 row 数线性增长,在长会话 + 多 thread 并行 streaming 时 React reconciliation 时间帧爆炸;复杂度缓存 `streamingMarkdownComplexityCacheRef` 当前仅在 `isHuge` 分支命中,中等长度 streaming 期间每次都全量扫描。

## Code Facts / 现状事实(已 review pass 对齐)

- `useThreadsReducer.ts` 102 行 `INCREMENTAL_DERIVATION_ENABLED = isIncrementalDerivationEnabled()`,默认 true(`realtimePerfFlags.ts:75-82` `defaultValue: true` / `testDefaultValue: true`)。5 处守卫位于行 1068 / 1631 / 1693 / 1876 / 1953。
- `useThreadsReducer.ts` 行 883/959/1121/1231/1298/1412/1468/1498/1663/1725/1745/1760/1786/1814/1842/1908/1922/1943/1977 共 19 处 `prepareThreadItems` 调用,每次走 `coalesceIndexByKey` + `mergeSameKindItem` + `annotateGeneratedImageAnchor` + `normalizeAskUserQuestionHistoryItems` + `summarizeExploration` + 旧 tool output 截断的 O(n) 链路(`utils/threadItems.ts:789-880`)。
- `useThreads.ts` 行 223-247 集中声明 21 个 `useRef`(原提案 18,review pass 实测 21),涵盖 `loadedThreadsRef` / `threadStatusByIdRef` / `itemsByThreadRef` / `activeTurnIdByThreadRef` / `threadsByWorkspaceRef` / `activeWorkspaceRef` / `activeThreadIdRef` / `loadedThreadLastRefreshAtRef` / `lazyResumeTimerByWorkspaceRef` / `historyLoadingThreadByWorkspaceRef` / `activeThreadIdByWorkspaceRef` / `replaceOnResumeRef` / `pendingInterruptsRef`(Set) / `interruptedThreadsRef`(Set) / `codexCompactionInFlightByThreadRef` / `pendingMemoryCaptureRef` / `pendingAssistantCompletionRef` / `recentThreadErrorsRef` / `handledClaudeExitPlanToolIdsRef`(Set) / `sharedSessionSyncTimerByThreadRef` / `sharedSessionLastSignatureByThreadRef`。另外 5 个 `Record<string, T>` 类型 ref 是潜在 workspace 串线源(`loadedThreadLastRefreshAtRef` / `historyLoadingThreadByWorkspaceRef` / `codexCompactionInFlightByThreadRef` / `sharedSessionLastSignatureByThreadRef` / `sharedSessionSyncTimerByThreadRef`),本次只做 6 个核心 workspace-scope 候选,5 个标为 follow-up。
- `useThreads.ts` 行 380-405 5 个连续 `useEffect` 把 `state.activeThreadIdByWorkspace` / `state.threadsByWorkspace`(写盘) / `state.threadStatusById` / `state.itemsByThread` / `state.activeTurnIdByThread` 同步进 ref,每个 dispatch 触发的 re-render 都会跑这 5 个 effect。
- `useThreads.ts` 行 107-108 `THREAD_ITEM_CACHE_MAX = 12` + `THREAD_ITEM_CACHE_TRIM_WATERMARK = 2`,固定常量,无内存自适应;行 1787-1866 的 LRU eviction 触发 `dispatch({ type: "evictThreadItems", threadIds })` 是同步 action,会跑整条 reducer 链。
- `useThreadEventHandlers.ts` 行 130-150 9 个 `useRef<Map | Set>` 状态机:`threadLifecycleSnapshotRef`(Map) / `turnDiagnosticsRef`(Map) / `turnFirstDeltaTimerRef`(Map<number>) / `turnStallTimerRef`(Map<number>) / `codexNoProgressTimerRef`(Map<number>) / `reconciliationQueryInFlightRef`(Set) / `flushDeferredTurnCompletionRef`(callback ref) / `assistantSnapshotIngressLengthRef`(Map) / `quarantinedCodexTurnsRef`(Map)。`turnDiagnosticsRef` 的 `activeExecutionItems` 是 `Set`,无上限无 sample。`Set` 类型 3 个 + `Map` 类型 6 个(2 个 callback ref 1 个 Set 计入 Set)。
- `useThreadEventHandlers.ts` 行 2670-2745 32 个 callback 顶层 `useMemo`(原提案 23 实测 32)串成单一 `handlers` 对象,会造成 `handlers` object identity churn;但 `useAppServerEvents` 实际已通过 `handlersRef.current` + 空依赖 `useEffect` 保持 stable subscription(`src/features/app/hooks/useAppServerEvents.ts:2776-2888`),所以"订阅抖动"不是事实。本 change 不改 `useAppServerEvents` public signature,只把 handlers 拆分列为 follow-up research。
- `useThreadEventHandlers.ts` 行 73 `THREE_EVIDENCE_RECONCILIATION_QUERY_TIMEOUT_MS = 15_000`,`useThreadEventHandlers.ts` 行 365 `buildReconciliationQueryKey` 是 6 维字符串拼接。
- `messagesTimelineVirtualization.ts:13-18` `shouldVirtualizeTimelineRows` 实际逻辑:
  ```typescript
  const hasHighRenderDensity = renderWeight >= 96 && renderWeight > rowCount * 2;
  if (hasHighRenderDensity) return true; // 不受 isThinking 影响
  return rowCount >= 200 && !isThinking;  // 短会话 + thinking 时返回 false
  ```
  本 change 移除 `!isThinking` 守卫,但保留 `hasHighRenderDensity` 提前 return 路径,新增 `TIMELINE_VIRTUALIZATION_DURING_STREAMING_ENABLED = true` 常量作为逃生口。
- `Messages.tsx` 实际 6 个 ref + 1 个局部 raf:`scrollThrottleRef`(行 369,setTimeout) / `assistantFinalizingTimerRef`(行 320,setTimeout) / `anchorUpdateRafRef`(行 281,RAF) / `historyStickyUpdateRafRef`(行 282,RAF) / `copyTimeoutRef`(行 316,setTimeout) / `planPanelFocusRafRef`(行 317,RAF) / `planPanelFocusTimeoutRef`(行 318,setTimeout),还有局部 raf(行 1750)。`previousAssistantThreadIdRef`(行 328)/ `frozenItemsRef`(行 329)是 thread-key 的 ref 切换源,**也应在 setActiveThreadId 切换前清理**,提案本次不纳入,标 follow-up。
- `MessagesRows.tsx:1017-1054` `streamingMarkdownComplexityCacheRef` 仅在 `isHuge` 命中,中等长度 streaming 期间每次都全量扫描。
- `analyzeStreamingMarkdownComplexity`(`messagesStreamingComplexity.ts:55-101`)实际用 1 个 `split(/\r?\n/)` + 3 个正则(`^#{1,6}\s+` / `^(?:[-*+]|\d+[.)])\s+` / `^\`\`\``),不是提案说的 6 类正则。
- `threadPendingResolution.ts:18` 实际是 `if (engine === "claude") return isClaudeSessionBootstrapThreadId(threadId);`,engines 列表 `claude | gemini | opencode`,**没有 `codex-pending-` 前缀**;codex 走 `isClaudeSessionBootstrapThreadId`(`claudeForkThread.ts`)。codex/claude 并行会话不串线由 `claudeForkThread` 路径保障,本 change 不动。
- `runtime-performance-evidence-gates` 既有 spec 在 `openspec/specs/runtime-performance-evidence-gates/spec.md`,既有 baseline.json 已编入 `S-LL` / `S-CI` / `S-RS` / `S-CS` 命名空间(`docs/perf/baseline.json`),无 `S-CHAT-*` 已存在,新增 5 条 `S-CHAT-100..104` 是干净 namespace。
- `rendererDiagnostics`(`src/services/rendererDiagnostics.ts`)既有 label 命名空间是 `renderer/` / `perf.*` / `events.` / `listeners.` / `media.`,无 `chat-stream/` 前缀;新增 3 类 entry `chat-stream/evict-thread` / `chat-stream/ref-cleanup-skipped` / `chat-stream/streaming-complexity-cache-miss` 安全。
- `useThreadsReducer.append-agent-delta-fast-path.test.ts`(232 行)/ `useThreadsReducer.claude-fast-path.test.ts`(278 行)真实存在,验证 `prepareThreadItemsCallCount` 在 fast path 等价分支为 0,作为 sub-task 1 的测试模板。

## Problem

题目边界"聊天流式帧率改善 / stale 状态收敛"对应三个具体 gap:

- **Gap-1 reducer 路径不对称**:`completeAgentMessage` / `upsertItem` 走 `prepareThreadItems` 全量,长会话 streaming 期间 200+ dispatch/turn 累计 O(n²) 重建成本。
- **Gap-2 streaming 虚拟化短路**:`!isThinking` 守卫 + `rowCount < 200` 条件组合,长会话 thinking 阶段 200+ row 全部展开,React reconciliation 时间帧爆炸。
- **Gap-3 workspace 串线 + 缓存无限增长**:`Set` 类型 3 个 ref + 6 个 workspace-scope 候选 ref,LRU eviction 路径不清理 workspace-scope ref,长 worktree fork 切换会跨 workspace 命中;`turnDiagnosticsRef` / `quarantinedCodexTurnsRef` 无 TTL,30 分钟内不会自动清空。

## Goals

1. **G1 帧率改善**: 长会话(500 row)+ 2 thread 并行 streaming 时 chat 主面板 visible-lag P95 较 baseline 下降 ≥ 30%(baseline 由 sub-task 0 测量,见 Validation §0)。
2. **G2 stale 状态收敛**: 6 个 workspace-scope ref 在 LRU eviction 路径后 0 orphan;`turnDiagnosticsRef` / `quarantinedCodexTurnsRef` / `assistantSnapshotIngressLengthRef` 在 settled 30 分钟后自动清理。
3. **G3 不破坏现有能力**: codex / claude / gemini / opencode 四引擎并行会话不串线;`claude-pending-` / `gemini-pending-` / `opencode-pending-` 前缀路径不破坏;`isClaudeSessionBootstrapThreadId` codex 路径不破坏;reducer 5/19 fast path 现有 case 不退化;`useAppServerEvents` 现有 stable subscription contract 不改变。
4. **G4 streaming 体感**: 长会话(500 row)streaming 期间 timeline 虚拟化 always-on,`data-timeline-virtualized="true"` 在 `isThinking === true` 时出现;复杂度分析命中 delta 路径,等价 delta 时 `analyzeStreamingMarkdownComplexityCallCount` 不增。
5. **G5 evidence 闭环**: 5 条 `S-CHAT-100..104` budget 编入 `docs/perf/baseline.json`,`npm run check:runtime-evidence-gates` pass,3 类 `chat-stream/*` entry schema 在 `rendererDiagnostics` 通过。

## Non-Goals

- **N1 冷启动优化** — 用户在 turn 2 明确排除。
- **N2 全面替换 store 模型为 Zustand / Jotai** — 触及 > 5000 行 store + 200+ tests,blast radius 爆炸。
- **N2.5 修改 backend Rust 代码** — 前端 only change。
- **N3 修改 `INCREMENTAL_DERIVATION_ENABLED` 默认值** — 保持 `true`(`realtimePerfFlags.ts:75-82`)。
- **N4 修改 `prepareThreadItems` 公开签名** — 只新增 `fastPathForAppendAgentDelta` helper,不替换 19 处调用为 helper 调用。
- **N5 改 codex / claude engine 路由** — 引擎路由逻辑不动,只对 ref 不串线做改造。
- **N6 改 `useAppServerEvents` 现有单 handlers 调用** — 当前 `useAppServerEvents` 已用 `handlersRef` 避免 subscription churn;本 change 禁止新增 `{ turnLifecycle, itemStream, runtimeEvent, approvalFlow }` public signature,避免为低确定收益引入 200+ 测试 blast radius。
- **N7 把 5 个额外 `Record<string, T>` ref 也改 workspace-scope** — `loadedThreadLastRefreshAtRef` / `historyLoadingThreadByWorkspaceRef` / `codexCompactionInFlightByThreadRef` / `sharedSessionLastSignatureByThreadRef` / `sharedSessionSyncTimerByThreadRef` 标 follow-up,本次只做 6 个核心。
- **N8 改 `previousAssistantThreadIdRef` / `frozenItemsRef` 跨 thread 清理** — 标 follow-up。
- **N9 把 chat.stream.* budget 从 `proxy` 升级为 `measured`** — 需真实 Tauri/WebView 会话,沙盒内做不了,follow-up 11.1。

## Delivery Boundaries (11 项)

- **DB-1** 扩展 `INCREMENTAL_DERIVATION_ENABLED` 守卫到 `completeAgentMessage` 和 `upsertItem` 的等价文本分支,新增 `fastPathForAppendAgentDelta` helper export。
- **DB-2** 引入 `createWorkspaceScopedMap<T>(label)` factory,把 6 个核心 ref(`pendingMemoryCaptureRef` / `pendingAssistantCompletionRef` / `recentThreadErrorsRef` + 3 个 `Set<string>`)改造为 `Map<workspaceId, Map<threadId, T>>`。
- **DB-3** 引入 `cleanupThreadScopedRefs(workspaceId, threadId)` 和 `cleanupThreadTransientState(workspaceId, threadId)` helper,LRU eviction 路径在 `dispatch({ type: "evictThreadItems" })` 之前调用。
- **DB-4** `messagesTimelineVirtualization.ts:18` 移除 `!isThinking` 守卫,新增 `TIMELINE_VIRTUALIZATION_DURING_STREAMING_ENABLED = true` 常量,`overscan` 在 streaming 期间从 12 提升到 24。
- **DB-5** 拆出 `analyzeStreamingMarkdownComplexityDelta(prev, prevText, deltaText)` helper,`MessageRow` 维护增量 state,跨代码 fence 边界 5 个分支独立测试。
- **DB-6** 删除 public multi-handlers 改造。`useThreadEventHandlers.ts:2670-2745` 可在 follow-up 内部重组为局部 helper,但本 change MUST NOT 修改 `useAppServerEvents(handlers, options)` 签名;只允许补 1 个 regression test 证明 `handlers` identity 变化不会触发 resubscribe。
- **DB-7** `useThreads` 顶部 5 个 ref-sync effect 合并为 1 个(单一依赖收集),`saveSidebarSnapshotThreads` 写盘加 250ms debounce。
- **DB-8** `THREAD_ITEM_CACHE_MAX` 改为 `computeThreadItemCacheMax(inFlightCount) = Math.max(12, inFlightCount * 2 + 6)`,0 in-flight 退回 12(向后兼容)。
- **DB-9** `turnDiagnosticsRef` / `quarantinedCodexTurnsRef` / `assistantSnapshotIngressLengthRef` 加 30min TTL,基于 settled timestamp 清理;60s sweep 放在持有这些 refs 的 `useThreadEventHandlers.ts` 内,并抽 pure helper 便于单测。不要放 `useThreadStorage.ts`,因为 `useThreadStorage` 当前拿不到 handler-side refs。
- **DB-10** `Messages` 内部用 local previous-thread ref 清理自身 7 个 RAF/timeout,不新增 `useThreads.registerTransientTimer` / `previousActiveThreadIdRef` API。`ref.current` 变化不会触发 React render,用它做跨组件通知是错误方向。
- **DB-11** 5 条 `S-CHAT-100..104` budget 编入 `docs/perf/baseline.json`,3 类 `chat-stream/*` entry schema 编进 `rendererDiagnostics`;`npm run check:runtime-evidence-gates` pass。

## Budgets (5 条 + 1 baseline 测量前置)

> **B-0 baseline 测量前置步骤**(关键):sub-task 1 之前,先在 `realtime-runtime-evidence.json` 加 1 条 `S-RS-VL2/visibleTextLagP95Streaming`(证据类 `proxy`),跑 500 row + 2 thread 并行 streaming 5min 真实 trace,记录基线 P95 / P99 值;`S-CHAT-100` 的 `target` / `hard fail` 数字由基线 × 0.7 / × 1.4 推得(基线测出后填),不允许直接拍脑袋写 16ms / 32ms。

- **B-1 `S-CHAT-100/longConversationFrameP95`**: target `<= baseline × 0.7`,hard fail `> baseline × 1.4`,evidence `proxy`
- **B-2 `S-CHAT-101/reducerFastPathHitRate`**: target `>= 0.85`,hard fail `< 0.6`,evidence `proxy`
- **B-3 `S-CHAT-102/virtualizerActiveDuringStreaming`**: target `true`,hard fail `false`,evidence `proxy`
- **B-4 `S-CHAT-103/workspaceScopedRefEvictions`**: target `0`,hard fail `> 0`,evidence `proxy`
- **B-5 `S-CHAT-104/transientTimerCleanups`**: target `100%`,hard fail `< 100%`,evidence `proxy`

## Risks

- **R-1 误删 existing fast path 覆盖**: `appendAgentDelta` 已有 fast path,sub-task 1 实施时只动 `completeAgentMessage` 和 `upsertItem` 两个 case,不要碰 `appendReasoning*` / `appendToolOutput` / `appendAgentDelta`(行 1068/1631/1693/1876/1953),否则会破坏现有等价 delta 路径。**测试守门**:`useThreadsReducer.append-agent-delta-fast-path.test.ts` / `useThreadsReducer.claude-fast-path.test.ts` 跑通即可证明未破坏。
- **R-2 workspace-scope 改造的 Set 语义变更**: `pendingInterruptsRef` / `interruptedThreadsRef` / `handledClaudeExitPlanToolIdsRef` 当前是 `Set<string>`,改为 `Map<workspaceId, Map<threadId, boolean>>` 后语义升级,所有读 ref 的代码路径(实际查: `interruptedThreadsRef` 在 `useThreadEventHandlers.ts:871,974,1020,1032` 至少 4 处使用,`pendingInterruptsRef` 在行 116,966,1020,1032,1369,871 至少 6 处)都要改,blash radius 大,**放到所有非 breaking sub-task 之后**。
- **R-3 useAppServerEvents 误改风险**:当前 `useAppServerEvents` 已通过 ref 保持订阅稳定,引入 multi-handlers public signature 属于收益未证明的大改。**本 change 明确禁止修改该 public signature**;若后续要拆,必须独立 proposal + profiler 证据。
- **R-4 streaming 虚拟化 always-on 引起 overscan 节点变多**: `overscan` 从 12 提升到 24,DOM 节点从 `12*2+1=25` 涨到 `24*2+1=49`,长会话 streaming 期间总节点数明显变多,与"长会话不卡顿"目标平衡。**测试守门**:`Messages.long-conversation.test.tsx` 500 row fixture 跑通,断言总 DOM 节点数 ≤ 49 + 边界节点。
- **R-5 30min TTL 实现位置**:`CodexQuarantinedTurn` 已有 `settledAt` 字段,但 `TurnDiagnosticState` 没有 `settledAt`,只有 `completedAt` / `errorAt` / `assistantCompletedAt`。TTL helper 必须用 `completedAt ?? errorAt ?? assistantCompletedAt` 作为 settled timestamp,active turn 不清理。
- **R-6 useThreads 顶部 ref 改造的耦合**: useThreadEventHandlers.ts 也持有 interruptedThreadsRef / pendingInterruptsRef / handledClaudeExitPlanToolIdsRef 的引用(通过 props 透传),改造后这 3 个 ref 变成 workspace-scope,但 props 透传路径不变(传的还是 ref 对象),实际改动可控,但要在 design.md 加一段"props 透传路径未变,ref 内部数据结构升级"的说明,避免 reviewer 误以为要改 hooks 间 wiring。
- **R-7 transient timer register API 方向错误**:7 个 RAF/timeout ref 都在 `Messages` component 内部,跨到 `useThreads` 会新增不必要 API;并且 `previousActiveThreadIdRef.current` 变化不触发 render。正确方案是 `Messages` 自己用 local previous active thread ref 在 `activeThreadId`/`threadId` 变化时 clear。

## Acceptance (12 项)

- **AC-1** `useThreadsReducer.completeAgentMessage` 等价文本分支 `prepareThreadItemsCallCount === 0`,`state === prevState`(引用相等)。
- **AC-2** `useThreadsReducer.upsertItem` 等价 item 路径返回 prior state reference。
- **AC-3** 6 个 workspace-scope ref 在 LRU eviction 路径后 `pendingMemoryCaptureRef[ws][threadId] === undefined`,无 orphan;`appendRendererDiagnostic("chat-stream/evict-thread", { evictedCount, cleanedRefCount })` 命中。
- **AC-4** 30min TTL: `quarantinedCodexTurnsRef` 用 `settledAt`,`turnDiagnosticsRef` 用 `completedAt ?? errorAt ?? assistantCompletedAt` 推导 settled timestamp;注入 older-than-31min entry 后 60s sweep 被清理,newer-than-29min entry 不被清理;active turn(无 settled timestamp)不被清理。
- **AC-5** `shouldVirtualizeTimelineRows` 在 `isThinking === true && rowCount === 500` 时返回 `true`,`data-timeline-virtualized="true"` 出现,DOM 节点数 ≤ 49。
- **AC-6** `analyzeStreamingMarkdownComplexityDelta(prev, prevText, "")` 返回 prev,等价 delta 时 `analyzeStreamingMarkdownComplexityCallCount` 不增;5 个边界分支(空 delta / 长度跳跃 / inside fence / 跨多 line / 中文文本)独立测试。
- **AC-7** `useAppServerEvents` public signature 不变;新增 regression test 证明 rerender 传入新 `handlers` object 不会重复订阅底层 app-server channel。
- **AC-8** 5 个 ref-sync effect 合并为 1 个后,每次 dispatch 仅跑 1 次 effect(用 ref-counter 验证)。
- **AC-9** `computeThreadItemCacheMax(0) === 12`,`computeThreadItemCacheMax(8) === 22`,`computeThreadItemCacheMax(20) === 46`。
- **AC-10** `Messages` active thread 从 `threadIdA` 切到 `threadIdB` 后,local cleanup effect 清理 `threadIdA` 的 7 个 RAF/timeout ref;`appendRendererDiagnostic("chat-stream/transient-timer-cleanup", { cleanedCount })` 命中。不要要求 `setActiveThreadId` dispatch 前跨组件清理。
- **AC-11** codex / claude / gemini / opencode 四引擎并行 streaming 集成测试 pass,`claude-pending-` / `gemini-pending-` / `opencode-pending-` 前缀各自独立,`isClaudeSessionBootstrapThreadId` codex 路径独立。
- **AC-12** `S-CHAT-100/longConversationFrameP95` 在 500 row + 2 thread 并行 streaming 5min 真实 trace 下 `<= baseline × 0.7`(G1 量化目标)。

## Validation / 验证

- **V-0 baseline 测量**(sub-task 1 之前):在 `realtime-runtime-evidence.json` 加 1 条 `S-RS-VL2/visibleTextLagP95Streaming` (evidence `proxy`),跑 500 row + 2 thread 并行 streaming 5min 真实 trace,记录 P95 / P99 基线值。
- `vitest` 新增覆盖:
  - `useThreadsReducer.completeAgentMessage` fast path 等价 / 不等价分支
  - `useThreadsReducer.upsertItem` fast path 等价分支
  - `useThreads.workspace-scope.test.tsx` 6 个 test(二级 Map 读写 + deleteWorkspace + cross-workspace 不串线)
  - `useThreads.eviction.test.tsx` 5 套测试(evict 后无 orphan ref + diagnostic entry 命中)
  - `useThreadEventHandlers.cleanup.test.ts` 3 套测试(`cleanupThreadTransientState` 单元测试)
  - `messagesStreamingComplexity.delta.test.ts` 5 个分支(空 delta / 长度跳跃 / inside fence / 跨多 line / 中文文本)
  - `messagesTimelineVirtualization.test.ts` 6 套测试(覆盖 isThinking true/false × rowCount 50/200/500)
  - `useAppServerEvents.signature-stability.test.tsx` rerender 后不重复 subscribe
  - `Messages.long-conversation.test.tsx` 500 row + streaming 集成测试
  - `useThreads.codex-claude.test.tsx` codex + claude 并行 streaming(不串线)
  - `rendererDiagnostics.chat-stream.test.ts` 3 类 entry schema 校验
- `npm run typecheck` pass
- `npm run lint` pass
- `npm run test` 现有 8 套 chat streaming 相关单测 + 新增 11 套 vitest pass,0 flake
- `npm run perf:realtime:boundary-guard` pass
- `npm run check:realtime-event-batching` pass
- `npm run check:runtime-evidence-gates` pass
- `openspec validate chat-stream-render-isolation-2026-06 --strict --no-interactive` pass
- **V-1 evidence 闭环**: `S-CHAT-100..104` 5 条 budget 在 `docs/perf/baseline.md` 表格出现;`BUDGET_RESIDUALS` 减少 5;`hardFailures` 不增

## Execution Order / 执行顺序(基于风险+收益+依赖 review pass 修正)

- **Position**: 独立 change,不与现有 P1 5 步串行链(Step 1 `composer-and-message-row-render-budget` / Step 2 `renderer-resource-backpressure` / Step 3 `backend-io-cache-and-bridge-payload-budget` / Step 4 `workspace-tree-and-large-file-listing-budget` / Step 5 `markdown-off-main-thread-pipeline`)冲突,直接补 chat streaming renderer hot path 短板。
- **Predecessors**: 无前置 change(但需要 B-0 baseline 测量)。
- **Successors**:
  - Step 2 `renderer-resource-backpressure` 若要做跨 surface timer ownership,应复用本 change 的 `Messages` local cleanup 经验,但不要假设已有全局 `clearTransientRefTimers(threadId)` API。
  - Step 5 `markdown-off-main-thread-pipeline` 在扩展 `runtime-performance-evidence-gates` 字段时,本 change 的 `chat.stream.*` 字段命名约定会作为前缀参考。
- **重排序理由**(review pass 修正):原提案 1 → 4 → 5 → 3 → 8 → 2 → 6 → 7 → 9 把 blast radius 大的 handlers 拆分(5)和 workspace-scope 改造(2)放中间,但两者都是 breaking change / 大改动,**应该放到所有非 breaking sub-task 之后**;同时把 complexity delta(4)和 streaming virtualize(3)合并到一个 PR(都是 Messages hot path 优化),节省测试 fixture。

| 序 | Sub-task | 估时 | 风险 | Breaking | 依赖 |
|---|---|---|---|---|---|
| 1 | 1.1-1.3 Reducer Fast Path(complete + upsert) | 0.5d | 低 | 否 | 无 |
| 2 | 3.1-3.2 Streaming Virtualize | 0.5d | 低 | 否 | 无 |
| 3 | 4.1-4.2 Complexity Delta | 1d | 中 | 否 | 无 |
| 4 | 6 Ref-Sync Consolidation | 0.5d | 低 | 否 | 无 |
| 5 | 7 LRU Adaptive | 0.5d | 低 | 否 | 无 |
| 6 | 6.1-6.3 Evidence Gates(含 B-0 baseline 测量) | 0.5d | 低 | 否 | 1-5 完成 |
| 7 | 7.1 Transient Timer | 0.5d | 低 | 否 | 6 完成 |
| 8 | 8.1-8.4 Workspace-Scope Ref | 2d | 高 | 否(仅内部 ref 升级) | 7 完成 |
| 9 | 10.1-10.7 Final Validation | 0.5d | 低 | 否 | 1-8 完成 |

总估时 7d。

- **Required Public Artifacts / 本 change 必须对外暴露**:
  1. `useThreadsReducer.fastPathForAppendAgentDelta(threadId, nextItem, prevItems)` helper,供 `completeAgentMessage` / `upsertItem` 复用。
  2. `createWorkspaceScopedMap<T>(label)` factory + `cleanupThreadScopedRefs(workspaceId, threadId)` helper,供 `useThreads.ts` LRU eviction 路径调用。
  3. `useThreadEventHandlers.cleanupThreadTransientState(workspaceId, threadId)` helper,清理 `turnDiagnosticsRef` / `quarantinedCodexTurnsRef` / `assistantSnapshotIngressLengthRef`。
  4. `messagesStreamingComplexity.analyzeStreamingMarkdownComplexityDelta(prev, prevText, deltaText)` helper,供 `MessageRow` 增量扫描。
  5. `useAppServerEvents` signature stability regression test,证明无需 multi-handlers public API。
  6. `Messages` local transient timer cleanup helper,不暴露 `useThreads` timer registry API。
  7. `runtime-performance-evidence-gates` 暴露 `chat.stream.*` 5 条 budget 字段。
- **Blocking Rule**: 本 change 不通过 `openspec validate`、B-0 baseline 测量未编进 `realtime-runtime-evidence.json`、5 条 `S-CHAT-100..104` budget 未编进 `docs/perf/baseline.json`、`cleanupThreadScopedRefs` 与 handler-side TTL sweep 未实际接入前,不视为完成。

## 技术方案取舍

| Option | Description | Pros | Cons | Decision |
|---|---|---|---|---|
| A. 全面替换为 Zustand / Jotai,重写 chat store | 把 `useThreadsReducer` 拆为多个 slice store。 | 状态订阅更细粒度,sub-hook 不再走顶层 reducer 链。 | 触及 > 5000 行 store 代码 + 200+ 测试用例,跨 change 范围爆炸,违反"最小改动"与"不替换 React state model"非目标;且与现有 INCREMENTAL_DERIVATION 优化意图不直接互补。 | Rejected |
| B. 保持 `useReducer`,在 streaming 高频 case 上加 fast path,workspace-scope ref 接入,虚拟化 always-on,complexity 增量,evidence 闭环 | 保持 store 模型,做局部稳定化;与现有 5 处 `INCREMENTAL_DERIVATION_ENABLED` 守卫 / `realtimePerfFlags` / `runtime-performance-evidence-gates` / `messagesTimelineVirtualization` 协同;5 条 `S-CHAT-100..104` 新字段 + 30min TTL。 | 改动面 < 900 行,可分 8 个 sub-task 逐个 commit;不破坏 `claude-pending-` / `gemini-pending-` / `opencode-pending-` + `isClaudeSessionBootstrapThreadId` 4 引擎不串线契约;不改 `useAppServerEvents` public API。 | fast path 等价判断必须新测覆盖;workspace-scope ref 改动面要小步推进;timer cleanup 只做 Messages local scope,不承诺跨组件 registry。 | Accepted |
| C. 仅做 fast path 扩展,其他 7 项 follow-up | 最小可见风险。 | 1 周可落地。 | 虚拟化、handlers 抖动、ref 清理、complexity 增量都遗留,长会话 streaming 体感不会有可观察改善;违反题目"聊天流式帧率改善"主线。 | Rejected |

## 后续 Follow-up(明确不在本 change 范围)

- 把 5 个额外 `Record<string, T>` ref(`loadedThreadLastRefreshAtRef` / `historyLoadingThreadByWorkspaceRef` / `codexCompactionInFlightByThreadRef` / `sharedSessionLastSignatureByThreadRef` / `sharedSessionSyncTimerByThreadRef`)也改 workspace-scope。
- 把 `previousAssistantThreadIdRef` / `frozenItemsRef` 跨 thread 清理纳入。
- 把 `chat.stream.*` 5 条 budget 升级到 `measured`(需要真实 Tauri/WebView 会话,沙盒内做不了)。
- 如果 profiler 证明 handler object churn 有实际成本,再独立评估 `useThreadEventHandlers` 内部 handler 分组;不要在本 change 改 `useAppServerEvents` public signature。
- 把 `markdown-off-main-thread-pipeline` 收口的 worker 复用到 streaming complexity 增量分析。
- 把 `appendRendererDiagnostic` 的 entry 名空间按 `chat-stream/evict-thread` 等 3 类拆为正式 schema(目前仅 ad-hoc)。
- transient timer 方案已选 C(`Messages` local cleanup);A(`registerTransientTimer`)和 B(`previousActiveThreadIdRef`)均作为反例保留在 design.md §6.7。
