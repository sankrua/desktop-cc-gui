# Tasks: Chat Stream Render Isolation 2026-06

> Review pass 2026-06-16 重排序:把 blast radius 大的 handlers 拆分(5)和 workspace-scope 改造(2)放到所有非 breaking sub-task 之后;sub-task 1 范围从 3 case 压缩为 2 case(completeAgentMessage + upsertItem,因为 appendAgentDelta 已有 fast path);增加 B-0 baseline 测量子任务。

## 0. Baseline Measurement (前置,B-0 / P0)

- [ ] 0.1 [P0][depends:none][input: `realtime-runtime-evidence.json` 现有 S-RS-VL / S-RS-RA / S-RS-FD / S-RS-TS schema + `realtimePerfExtendedFixture.ts` 现有 fixture][output: `realtime-runtime-evidence.json` 加 1 条 `S-RS-VL2/visibleTextLagP95Streaming` (evidence `proxy`);跑 500 row + 2 thread 并行 streaming 5min 真实 trace,记录 P95 / P99 基线值][validation: 报告有 `S-RS-VL2` 字段,值非 `unsupported`] Measure streaming P95 baseline.
- [ ] 0.2 [P0][depends:0.1][input: 0.1 测得的 P95 / P99 基线值][output: `docs/perf/baseline.json` 5 条 `S-CHAT-100..104` budget 的 `target` / `hard fail` 数字由基线 × 0.7 / × 1.4 推得(target: `baseline * 0.7` ms,hard fail: `baseline * 1.4` ms)][validation: 5 条 `S-CHAT-100..104` 字段都有非 `unsupported` 数值] Compute budget targets.

## 1. Reducer Fast Path Completion (Sub-task 1/8, P0)

> Review pass 修正:`appendAgentDelta`(行 1068)已有 fast path,不要动。本 sub-task 只覆盖 `completeAgentMessage`(行 1141-1248)+ `upsertItem`(行 1251-1448)两个 case。

- [ ] 1.1 [P0][depends:0.2][input: `useThreadsReducer.ts` 行 1141-1248 `completeAgentMessage` case + `mergeCompletedAgentText` 函数 + 现有 `useThreadsReducer.append-agent-delta-fast-path.test.ts` 模板][output: `fastPathForAppendAgentDelta` helper 导出(见 design.md §1);`completeAgentMessage` case 在 `INCREMENTAL_DERIVATION_ENABLED` 守卫下,等价文本分支走 helper 返回 prior state reference;`prepareThreadItemsCallCount` 在等价分支不增][validation: `useThreadsReducer.append-agent-delta-fast-path.test.ts` + `useThreadsReducer.completed-duplicate.test.ts` + `useThreadsReducer.normalized-realtime.test.ts` 全部 pass,等价 delta 不再调用 `prepareThreadItems`] Add fast path to completeAgentMessage.
- [ ] 1.2 [P0][depends:1.1][input: `useThreadsReducer.ts` 行 1251-1448 `upsertItem` case + 现有 `upsertItem` 内部 `findMatchingReview` / `dropLatestLocalReviewStart` 守卫][output: `upsertItem` case 在 `INCREMENTAL_DERIVATION_ENABLED` 守卫下,等价 item 路径走 helper 返回 prior state reference;非等价路径(generated image 替换 / user message 重命名)继续走 `prepareThreadItems`][validation: `useThreadsReducer.test.ts` + `useThreadsReducer.approvals.test.ts` + `useThreadsReducer.context-compaction.test.ts` + `useThreadsReducer.history-restore.test.ts` 全部 pass] Add fast path to upsertItem.
- [ ] 1.3 [P0][depends:1.2][input: `useThreadsReducer` 19 处 `prepareThreadItems` 调用 + 5 处 `INCREMENTAL_DERIVATION_ENABLED` 守卫(行 1068 / 1631 / 1693 / 1876 / 1953)][output: 把 1.1 + 1.2 完成后未被 fast path 覆盖的 case 列表输出,确认剩余 case 仍走 `prepareThreadItems` 是合理的(non-streaming / coerce / replace / drop / filter 路径);5 处已有 fast path 守卫**不要碰**][validation: 输出剩余 case 列表 + 各自的合理性说明] Audit remaining cases.

## 2. Streaming Virtualization (Sub-task 2/8, P0)

- [ ] 2.1 [P0][depends:none][input: `messagesTimelineVirtualization.ts:13-18` 现有 `shouldVirtualizeTimelineRows` + `MessagesTimeline.tsx:312` `useVirtualizer` 配置][output: `TIMELINE_VIRTUALIZATION_DURING_STREAMING_ENABLED = true` 常量;`shouldVirtualizeTimelineRows` 只移除 `rowCount >= 200` 主分支上的 `!isThinking` 阻断,保留 `hasHighRenderDensity`(行 13-16)提前 return true 路径;短会话 `rowCount < 200` 且 renderWeight 普通时仍返回 false;`useVirtualizer` 的 `count` 保持 `shouldVirtualizeTimeline ? timelineProjectionRows.length : 0`,不要改成所有 row 都 enabled][validation: `messagesTimelineVirtualization.test.ts` 6 套测试 pass(覆盖 isThinking true/false × rowCount 50/200/500)] Remove streaming gate.
- [ ] 2.2 [P0][depends:2.1][input: `MessagesTimeline.tsx` `useVirtualizer` 配置 + `classifyTimelineVirtualizerStability` 已有逻辑][output: `overscan` 在 `isThinking || isWorking` 时提升到 24,其他场景保持 12;`classifyTimelineVirtualizerStability` 的 `streamingActive` 参数在虚拟化 always-on 时仍工作][validation: `Messages.long-conversation.test.tsx` 模拟 500 row + streaming,断言 `data-timeline-virtualized="true"` 在 `isThinking === true` 时出现,虚拟化 row 集合非空,DOM 节点数 ≤ 49] Streaming overscan bump.

## 3. Complexity Delta (Sub-task 3/8, P0)

- [ ] 3.1 [P0][depends:none][input: `messagesStreamingComplexity.ts:55-101` `analyzeStreamingMarkdownComplexity` 全量实现 + `MessagesRows.tsx:1017-1054` 现有 `streamingMarkdownComplexityCacheRef`][output: `analyzeStreamingMarkdownComplexityDelta(prev: StreamingMarkdownComplexity, prevText: string, deltaText: string): StreamingMarkdownComplexity` helper 导出;支持空 delta / 长度跳跃 / inside fence / 跨多 line / 中文文本 5 个分支;prev 末位 insideCodeFence 状态维护正确][validation: `messagesStreamingComplexity.delta.test.ts` 5 个分支独立 pass,空 delta 返回 prev] Implement delta helper.
- [ ] 3.2 [P0][depends:3.1][input: `MessagesRows.tsx:1014-1056` 现有 cache ref + `analyzeStreamingMarkdownComplexity` 调点][output: `MessageRow` 用 `analyzeStreamingMarkdownComplexityDelta` 替换 `analyzeStreamingMarkdownComplexity`,维护 `(prev.trimmedText, prev.complexity)` 增量 state;`analyzeStreamingMarkdownComplexityCallCount` 等价 delta 时不增][validation: `MessagesRows` 集成测试断言等价 delta 时复杂度缓存命中,call count 不增] Wire delta in MessageRow.

## 4. Ref-Sync Consolidation (Sub-task 4/8, P0)

- [ ] 4.1 [P0][depends:none][input: `useThreads.ts` 行 380-405 5 个连续 `useEffect` 同步 `state.*` 到 `ref.current` + 行 387 `saveSidebarSnapshotThreads` 同步写盘][output: 5 个 ref-sync effect 合并为 1 个(单一依赖收集,见 design.md §9);`saveSidebarSnapshotThreads` 加 250ms debounce;每次 dispatch 触发的 re-render 仅跑 1 次 ref-sync effect(用 ref-counter 验证)][validation: `useThreads.integration.test.tsx` 跑通,ref-counter 显示 effect 触发次数 ≤ dispatch 次数] Consolidate ref-sync effects.

## 5. LRU Adaptive (Sub-task 5/8, P0)

- [ ] 5.1 [P0][depends:none][input: `useThreads.ts` 行 107-108 `THREAD_ITEM_CACHE_MAX = 12` + LRU eviction effect 行 1787-1866 + `state.threadStatusById`][output: `computeThreadItemCacheMax(inFlightCount) = Math.max(12, inFlightCount * 2 + 6)` 公式导出;LRU eviction effect 用公式替换固定 12;0 in-flight 退回 12(向后兼容)][validation: `useThreads.eviction.test.tsx` 覆盖 inFlightCount 0/8/20 三档,assert keepableSlots 正确] Compute LRU adaptive cap.

## 6. Evidence Gates (Sub-task 6/8, P0)

- [ ] 6.1 [P0][depends:0.2,1.3,2.2,3.2,4.1,5.1][input: 0.2 算出的 5 条 `S-CHAT-*` budget 数值 + `docs/perf/baseline.json` 现有 schema + `runtime-performance-evidence-gates` 现有 schema + `rendererDiagnostics` 现有 schema][output: 5 条 `S-CHAT-100..104` budget 编进 `docs/perf/baseline.json`;3 类 `chat-stream/*` entry schema 编进 `rendererDiagnostics`(label 命名空间 `chat-stream/evict-thread` / `chat-stream/ref-cleanup-skipped` / `chat-stream/streaming-complexity-cache-miss`)];`appendRendererDiagnostic` 用例:eviction 后写 `chat-stream/evict-thread`,30min TTL sweep 写 `chat-stream/ref-cleanup-skipped`,complexity cache miss 写 `chat-stream/streaming-complexity-cache-miss`][validation: `npm run check:runtime-evidence-gates` pass,5 条 budget 出现在 `docs/perf/baseline.md` 表格] Encode budgets.
- [ ] 6.2 [P0][depends:6.1][input: `scripts/perf-archive-readiness.mjs` 现有 `BUDGET_RESIDUALS` 表 + 5 条 `S-CHAT-*` budget 编码][output: `BUDGET_RESIDUALS` 同步:5 条 `S-CHAT-*` budget 编完后从 residual 表移除;`npm run perf:archive-readiness -- --json` `budgetMissingCount` 减少 5,`hardFailures` 保持 ≤ 现有][validation: JSON 报告 `budgetMissingCount` 数值符合预期,`hardFailures` 不增] Sync residuals.
- [ ] 6.3 [P1][depends:6.1][input: `rendererDiagnostics` 现有 3 类 chat-stream entry][output: 3 类 entry 在 `useThreads.eviction.test.tsx` / `useThreads.workspace-scope.test.tsx` / `MessagesRows` 集成测试中触发命中;`rendererDiagnostics.chat-stream.test.ts` schema 校验 pass][validation: 3 类 entry 至少各被 1 套测试触发,schema 校验拒绝异常 payload] Schema validate.

## 7. Transient Timer (Sub-task 7/8, P0)

> Review pass 修正:提案原文选方案 A(`useThreads` 顶部 Map 注册),blast radius 较大;`previousActiveThreadIdRef` 方案也错误,因为 ref 变化不触发 render/effect。Design.md §6.7 已拍板方案 C:`Messages` local owner 自己监听 active thread change 并清理自身 7 个 RAF/timeout。

- [ ] 7.1 [P0][depends:6.3][input: `Messages.tsx` active thread prop + 7 个 RAF/timeout ref(`scrollThrottleRef` 行 369 / `assistantFinalizingTimerRef` 行 320 / `anchorUpdateRafRef` 行 281 / `historyStickyUpdateRafRef` 行 282 / `copyTimeoutRef` 行 316 / `planPanelFocusRafRef` 行 317 / `planPanelFocusTimeoutRef` 行 318)][output: `Messages` 内部新增 `clearMessageTransientTimers(previousThreadId)` helper + local previous thread ref;active thread 变化时清理前一个 thread 的 7 个 RAF/timeout;`appendRendererDiagnostic("chat-stream/transient-timer-cleanup", { threadId, cleanedCount })` 命中;不新增 `useThreads` public API][validation: `Messages.transient-timer.test.tsx` 4 套测试 pass,切换 active thread 时前一个 thread 7 个 ref 全清] Add local transient cleanup.

## 8. Workspace-Scope Refactor (Sub-task 8/8, P0)

> Blast radius 最大。3 个 `Set<string>` ref 改 workspace-scope 后,所有读 ref 的代码路径都要改(实际查: `interruptedThreadsRef` 在 `useThreadEventHandlers.ts:871,974,1020,1032` 至少 4 处使用,`pendingInterruptsRef` 在行 116,966,1020,1032,1369,871 至少 6 处)。**放到所有非 breaking sub-task 之后**。

- [ ] 8.1 [P0][depends:7.1][input: `useThreads.ts` 行 223-247 21 个 `useRef` + 6 个核心 workspace-scope 候选(`pendingMemoryCaptureRef` / `pendingAssistantCompletionRef` / `recentThreadErrorsRef` + `pendingInterruptsRef` / `interruptedThreadsRef` / `handledClaudeExitPlanToolIdsRef` 3 个 `Set<string>`)][output: `createWorkspaceScopedMap<T>(label)` factory 函数 + 6 个 workspace-scope ref 改造完成(见 design.md §2);`pendingInterruptsRef` / `interruptedThreadsRef` / `handledClaudeExitPlanToolIdsRef` 3 个 `Set<string>` 改 `Map<workspaceId, Map<threadId, boolean>>`;**props 透传路径未变**,useThreadEventHandlers.ts 仍通过 props 接收 ref 对象,ref 内部数据结构升级][validation: `useThreads.workspace-scope.test.tsx` 6 个 test pass,二级 Map 读写 + deleteWorkspace + cross-workspace 不串线一致] Build workspace-scoped map.
- [ ] 8.2 [P0][depends:8.1][input: `useThreads.ts` 行 1787-1866 LRU eviction 路径 + 6 个 workspace-scope ref][output: eviction 路径在 `dispatch({ type: "evictThreadItems" })` 之前调 `cleanupThreadScopedRefs(workspaceId, threadId)`,清理 6 个 ref;同时调 `cleanupThreadTransientState(workspaceId, threadId)` 清理 handler 侧 3 个 ref(`turnDiagnosticsRef` / `quarantinedCodexTurnsRef` / `assistantSnapshotIngressLengthRef`);`appendRendererDiagnostic("chat-stream/evict-thread", { workspaceId, threadId, evictedCount, cleanedRefCount })`][validation: `useThreads.eviction.test.tsx` 5 套测试 pass,evict 后无 orphan ref + diagnostic entry 命中] Wire eviction cleanup.
- [ ] 8.3 [P0][depends:8.2][input: `useThreadEventHandlers.ts` 行 130-150 9 个 `useRef<Map>` 状态机 + `interruptTurn` 行 871 fallback 路径 + `threadEventDiagnostics.ts` `CodexQuarantinedTurn` / `TurnDiagnosticState` 类型][output: `cleanupThreadTransientState(workspaceId, threadId, refs)` helper 导出(见 design.md §3),清理 `turnDiagnosticsRef` / `quarantinedCodexTurnsRef` / `assistantSnapshotIngressLengthRef` 3 个 handler 侧 ref;`interruptTurn` fallback 路径不再留 orphan diagnostic;`TurnDiagnosticState` settled timestamp 用 `completedAt ?? errorAt ?? assistantCompletedAt` 推导][validation: `useThreadEventHandlers.cleanup.test.ts` 3 套测试 pass,`interruptTurn` fallback 路径不再留 orphan diagnostic] Wire handler cleanup.
- [ ] 8.4 [P1][depends:8.3][input: `useThreadEventHandlers.ts` 持有的 3 个 transient refs + 30min TTL 提案(见 design.md §4)][output: `turnDiagnosticsRef` / `quarantinedCodexTurnsRef` / `assistantSnapshotIngressLengthRef` 加 30min TTL,60s 周期 sweep 放到 `useThreadEventHandlers.ts`;抽 `sweepThreadTransientState(refs, now)` pure helper;不要改 `useThreadStorage`][validation: 单测模拟 30min 跳过清理路径 + 30min 触发清理路径,cleanup 后 stale ref 被清;active turn(无 settled timestamp)不被清理] Add 30min TTL.

## 10. Final Validation (gate, P0)

- [ ] 10.1 [P0][depends:8.4][input: 所有 OpenSpec artifacts + 所有 sub-task 0-8][output: `openspec validate chat-stream-render-isolation-2026-06 --strict --no-interactive` pass,无 P0 violation][validation: validate 退出 0] Run strict OpenSpec validation.
- [ ] 10.2 [P0][depends:10.1][input: TypeScript][output: `npm run typecheck` pass][validation: 退出 0] Run typecheck.
- [ ] 10.3 [P0][depends:10.1][input: ESLint][output: `npm run lint` pass][validation: 退出 0] Run lint.
- [ ] 10.4 [P0][depends:10.1][input: 新增 vitest + chat streaming 现有 vitest + `useAppServerEvents` signature stability regression][output: 相关 vitest pass,无 flake;`useAppServerEvents` rerender 后底层 subscribe 仍只注册 1 次][validation: 全 pass,0 flake] Run focused vitest.
- [ ] 10.5 [P0][depends:10.1][input: realtime 性能脚本][output: `npm run perf:realtime:boundary-guard` pass,`npm run check:realtime-event-batching` pass,`npm run check:runtime-evidence-gates` pass][validation: 3 个 script 退出 0] Run perf scripts.
- [ ] 10.6 [P1][depends:10.5][input: `docs/perf/baseline.json` + `scripts/perf-archive-readiness.mjs`][output: `npm run perf:archive-readiness -- --json` `budgetMissingCount` 比 change 前少 5,`hardFailures` 不增][validation: JSON 报告数值符合预期] Run archive-readiness.
- [ ] 10.7 [P0][depends:10.6][input: 仓库 diff][output: `git diff --stat -- 'src/**' 'src-tauri/**' 'docs/perf/**' 'openspec/changes/chat-stream-render-isolation-2026-06/**'` 不超过 1000 行产品代码改动(review pass 从 800 修正为 1000) + baseline.json + 提案文件][validation: 行数 < 1000(`proposal.md` + `design.md` + `tasks.md` + `specs/conversation-realtime-cpu-stability/spec.md` 排除)] Confirm scope.
- [ ] 10.8 [P0][depends:10.7][input: B-0 baseline 测量值 + 5 条 S-CHAT-100..104 budget][output: `S-CHAT-100/longConversationFrameP95` 在 500 row + 2 thread 并行 streaming 5min 真实 trace 下 `<= baseline × 0.7`(G1 量化目标)];`S-CHAT-101/reducerFastPathHitRate >= 0.85`;`S-CHAT-102/virtualizerActiveDuringStreaming === true`;`S-CHAT-103/workspaceScopedRefEvictions === 0`;`S-CHAT-104/transientTimerCleanups === 100%`][validation: 5 条 budget 全部命中] Run budget validation.

## 11. Follow-up Explicitly Out of Scope (follow-up)

- 11.1 [follow-up][owner:release-grade-evidence-collection] 在真实 Tauri/WebView 桌面环境采集 `chat.stream.renderFrameP95` 的 measured marker,把 5 条 budget 从 `proxy` 升级为 `measured`。
- 11.2 [follow-up][owner:renderer-resource-backpressure Step 2] 把 `useAppServerEvents` 拆为命令通道 + 事件通道两个独立 IPC,事件通道可被 batch consumer 复用。
- 11.3 [follow-up][owner:markdown-off-main-thread-pipeline Step 5] 把 `fastMarkdownRenderer` worker 复用到 streaming complexity 增量分析,做 O(1) 之外的真 off-main-thread 路径。
- 11.4 [follow-up][owner:stream-latency-diagnostics] 把 `chat.stream.*` 5 条 budget 与 `runtime-performance-evidence-gates` 的 `stream-latency` 指标合并,统一 schema。
- 11.5 [follow-up][owner:conversation-curtain-assembly-core] 把本 change 暴露的 `useThreadReducer.fastPathForAppendAgentDelta` helper 纳入 `conversation-curtain-assembly-core` 规范,作为 fast path 标准模式。
- 11.6 [follow-up][owner:chat-stream-render-isolation-next] 把 5 个额外 `Record<string, T>` ref(`loadedThreadLastRefreshAtRef` / `historyLoadingThreadByWorkspaceRef` / `codexCompactionInFlightByThreadRef` / `sharedSessionLastSignatureByThreadRef` / `sharedSessionSyncTimerByThreadRef`)也改 workspace-scope。
- 11.7 [follow-up][owner:chat-stream-render-isolation-next] 把 `previousAssistantThreadIdRef` / `frozenItemsRef` 跨 thread 清理纳入 sub-task 7.1 方案 C。
- 11.8 [follow-up][owner:chat-stream-render-isolation-next] 若需要 inactive thread eviction 也清理 UI timer,必须先设计跨 surface runtime ownership;不要用 `previousActiveThreadIdRef` 作为通知机制。
- 11.9 [follow-up][owner:chat-stream-render-isolation-next] 把 `appendRendererDiagnostic` 的 entry 名空间按 `chat-stream/evict-thread` 等 3 类拆为正式 schema(目前仅 ad-hoc)。
