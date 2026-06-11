# markdown-off-main-thread-pipeline

## Why

roadmap `P1-04 大 Markdown 离主线程解析` 的真实背景是：P0 `lazy-markdown-runtime` 已经把 `react-markdown` / remark / rehype full runtime 放到 lazy boundary，live streaming 也已有 lightweight path，但 final rich Markdown 仍可能在主线程执行高成本 segmentation、math detection、tool-call parsing、rich runtime render scheduling。仓库同时已经存在 `src/features/markdown/fastMarkdownRenderer/fastMarkdown.worker.ts`、`workerAdapter.ts`、`FileMarkdownFastPreview` 和 `FullMarkdownRuntime.tsx`。因此本 change 不应从零造 worker，也不应承诺在 worker 里执行 ReactMarkdown/DOM 渲染；合理目标是把可 worker 化的 heavy precompute/fast compile 移出主线程，并为 rich render 建立 threshold、cache、stale guard、fallback 和 evidence。

## Code Facts / 现状事实

- `src/features/messages/components/Markdown.tsx` lazy-loads `FullMarkdownRuntime` and uses `LightweightMarkdown` for live/progressive behavior.
- `src/features/messages/components/FullMarkdownRuntime.tsx` still renders ReactMarkdown with `remark-gfm` / `remark-math` / `remarkFileLinks` / `rehype-raw` / `rehype-sanitize` / optional KaTeX on the main React render path.
- `src/features/markdown/fastMarkdownRenderer/workerAdapter.ts` already implements shared worker creation, request ids, fallback to main-thread `compileFastMarkdown`, and stale-capable request ids for file preview usage.
- Existing `message-markdown-streaming-compatibility` spec requires incomplete live streams to avoid full parser execution for every fragment and completed messages to converge with history restore.

## Problem / 问题

- Large completed assistant messages can still trigger main-thread work before or during rich Markdown rendering.
- Worker substrate exists for file preview fast markdown, but message final rendering does not have a clear off-main-thread precompute / cache / evidence contract.
- Stale async results can appear when a message changes while background parsing/precompute is still running.
- Worker failure or unsupported environments need safe fallback without breaking final readable Markdown.

## Goals / 目标

- Define a message Markdown parse/precompute pipeline with thresholds, source version, content hash, timeout, cancellation/stale guard, and diagnostics.
- Reuse existing fast markdown worker substrate where possible for heavy non-React work: block scan, heading/heavy-block metadata, safe fast HTML/segments, content hash, or other serializable precompute.
- Keep full rich ReactMarkdown rendering on the main React path when rich features require React components, but schedule it behind lazy boundary / transition / fallback as appropriate.
- Cache parse/precompute results by `rendererProfile + messageId + contentHash + optionsHash`.
- Preserve live lightweight path and existing final/history convergence requirements.
- Feed markdown parse/precompute mode, duration, fallback reason, cache state, and evidence class into `runtime-performance-evidence-gates`.

## Non-Goals / 非目标

- 不替换 `react-markdown` / remark / rehype / KaTeX / Mermaid 选型。
- 不在 worker 中执行 React component rendering、DOM mutation、Tauri API 或 unsafe HTML rendering。
- 不改变 live streaming progressive reveal / lightweight renderer 语义。
- 不把 file preview fast renderer 与 message renderer 强行合并成一个视觉实现。

## Delivery Boundaries / 交付边界

1. **Audit current pipeline**：确认 message live/final/history restore paths and file-preview worker capabilities。
2. **Protocol reuse**：扩展或复用 fast markdown worker message protocol，只传 serializable inputs/outputs。
3. **Threshold/cache/stale guard**：大 final message 才走 worker precompute；小消息保持 main path，避免 worker startup overhead。
4. **Rich render fallback**：worker unsupported/timeout/error 时回到 existing main-thread render，并记录 fallback evidence。
5. **Evidence gate**：输出 `mode=worker-precompute|main|cache-hit|fallback`、duration、threshold reason、content-safe ids。

## Initial Budgets / 初始预算

- Worker precompute threshold SHOULD start at `>= 10_000` characters or equivalent heavy-block/math/tool-call complexity trigger; exact threshold may be tuned by evidence.
- Worker timeout target `<= 2_000ms`; timeout falls back to main path with `fallbackReason=timeout`.
- Cache key MUST include message id, content hash, renderer profile, feature flags/options hash, and schema version.
- Diagnostics MUST NOT include markdown body content; content hash and length/counts are allowed.

## Risks / 风险

- Worker output must be serializable and sanitized on the correct side; unsafe HTML must not be trusted because it came from a worker.
- If cache key omits renderer options, stale or wrong markdown structure can appear after feature flag/theme/profile changes.
- Worker fallback to main thread is safe functionally but may still be slow; evidence must classify this honestly.
- Final rich render still uses React on main thread for React components; this change reduces precompute pressure but is not a promise that every rich render cost leaves the main thread.

## Acceptance Criteria / 验收口径

- Large final message path has documented threshold, cache key, stale guard, timeout, and fallback behavior.
- Worker/precompute results never replace newer message content; stale results are dropped by source version/content hash.
- Worker failure/unsupported/timeout falls back to readable final Markdown and records fallback evidence.
- Live streaming path remains on lightweight/progressive behavior and does not load full parser for every partial fragment.
- `runtime-performance-evidence-gates` outputs markdown parse/precompute budget fields with accurate evidence class.

## Validation / 验证

- Worker/precompute protocol tests for success, timeout, failure, unsupported worker, and stale result.
- Cache tests for hit/miss/options hash/schema version invalidation.
- Live path regression tests from `message-markdown-streaming-compatibility`.
- Large final message fixture test with content-safe diagnostics.
- Existing Markdown rich feature tests: file links, math, code blocks, tool-call fallback.
- `npm run perf:realtime:extended-baseline`
- `npm run check:runtime-evidence-gates`
- `npm run typecheck`
- `npm run lint`
- `openspec validate markdown-off-main-thread-pipeline --strict --no-interactive`
