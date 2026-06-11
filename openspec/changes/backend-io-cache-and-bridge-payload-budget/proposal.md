# backend-io-cache-and-bridge-payload-budget

## Why

roadmap `P1-06`、`P1-07`、`P1-08`、`P1-14` 都落在同一条 backend-to-renderer pressure chain：session catalog / usage / Claude history / workspace files / git / project map 会做 filesystem scan、JSONL parsing、libgit2 或 large DTO serialization，最后通过 Tauri invoke 把大 payload 交给 renderer。当前代码已经有部分 timeout、scan limit、source status、large payload tests 和 workspace file partial state，但缺统一的 cache key、payload budget metadata、bridge evidence 和分阶段 rollout。

## Code Facts / 现状事实

- `src-tauri/src/session_management.rs`、`src-tauri/src/local_usage.rs`、`src-tauri/src/engine/claude_history.rs` 都包含 session/catalog/history scan 逻辑；`claude_history.rs` 已有 scan diagnostic、timeout、candidate cap 和 source fact cache 迹象。
- `src-tauri/src/workspaces/files.rs` 已有 listing limit / partial response，但尚未形成通用 bridge payload budget。
- `src-tauri/src/git/commands.rs` 与 frontend git hooks 真实存在；git history/diff/status 优化需要保留当前 command compatibility。
- `scripts/generate-runtime-evidence-report.mjs` 与 `runtime-performance-evidence-gates` 已支持 structured budget fields，可扩展 backend / bridge metrics。

## Problem / 问题

- 多个 backend scan path 对同一 workspace/provider/session source 重复读取，缺可审计的 hit/miss 和 invalidation reason。
- JSONL append-only 情况可增量读取，但 provider 文件被 truncate/rotate/corrupt 时必须安全失效。
- Git log/diff/status 和 project map scan 在大仓库中容易占用 blocking resources，前端只能看到“invoke 慢”。
- 大 response 没有统一 payload size / item count evidence，bridge serialization regression 不易发现。

## Goals / 目标

- 建立 backend scan cache registry / adapter：每个接入路径声明 cache key fields、freshness signature、invalidation reason 和 evidence fields。
- 对 session/catalog/history 等 scan path 先接入 diagnostics，再逐步接入 cache，避免一次性强制所有模块重构。
- JSONL scan 支持 append-only fast path，并在 inode/len/mtime/hash 不匹配、truncate、parse error 时 fallback full rescan。
- CPU-heavy filesystem/libgit2/project-map work 统一受 blocking pool / timeout / partial result policy 管理。
- Git log/diff/status 增加 pagination / truncation / cache evidence，同时保留 legacy command fallback。
- Tauri invoke high-volume response 增加 payload budget metadata：command、stable surface id、item count、estimated bytes、truncated/partial、evidence class。
- 将 backend IO / bridge payload budget 接入 `runtime-performance-evidence-gates`。

## Non-Goals / 非目标

- 不替换 libgit2 或 filesystem walker。
- 不重写 session catalog、local usage、project map 的业务数据模型。
- 不引入新的 IPC 协议族；继续使用 Tauri command，但允许新增参数/DTO metadata。
- 不把绝对路径、prompt、assistant body、terminal output 或 secrets 写入 frontend diagnostics。

## Delivery Boundaries / 交付边界

1. **Inventory first**：列出 high-volume commands 和 scan paths，标记 owner、input、output size、current timeout/limit。
2. **Diagnostics first**：为 scan / invoke 增加 content-safe timing、cacheState、payload size estimate；没有 cache 的路径标 `cacheState=unsupported`。
3. **Cache adapters**：优先接入重复 scan 高的 session/catalog/history/workspace listing path；每个 adapter 有独立 invalidation tests。
4. **Pagination/truncation**：对 git diff/log、project map relations、large file/session listing 逐项加 pagination 或 summary-first，不做破坏性全量替换。
5. **Gate integration**：runtime evidence 可以 fail payload regression，但 proxy/unsupported 不得宣称 release-grade measured。

## Initial Budgets / 初始预算

- High-volume invoke response target `<= 1 MiB` estimated JSON payload，hard fail `> 4 MiB` unless command is explicit export/download.
- List-like response target `<= 2000` items per invoke，hard fail `> 5000` unless paginated compatibility mode is explicitly enabled.
- Backend scan target logs `durationMs`, `cacheState`, `scannedFiles`, `scannedBytes` when available；unsupported fields must be null with reason.
- Git diff response SHOULD cap by file count / line count / byte estimate and include `truncated=true` plus hydration cursor when capped.
- Cache key MUST include normalized root/workspace identity, provider identity, scan options hash, and source signature; raw absolute paths must be hashed or redacted in frontend evidence.

## Risks / 风险

- Cache key 不完整会导致 stale catalog；每个 adapter 必须有 stale invalidation tests。
- JSONL append-only 假设不总成立；truncate/rotation/corruption 必须触发 full rescan。
- Blocking pool 过大可能占满 CPU，过小可能让 perceived latency 升高；需要 timeout 和 queue evidence。
- Payload truncation 若 UI 不显式展示，会造成“数据丢失”的错觉；partial/truncated 必须是用户和 diagnostics 可见状态。

## Acceptance Criteria / 验收口径

- High-volume backend command inventory 完成，并为每类路径标出 measured/proxy/unsupported evidence。
- 至少 session/history/workspace listing 中的一个重复 scan path 有 cache adapter、hit/miss/invalidation tests 和 diagnostics。
- JSONL append-only fast path 对 append、truncate、mtime/signature change、parse error 有回归测试。
- Git diff/log 或等价 high-volume command 有 pagination/truncation metadata，legacy caller fallback 不破坏。
- Tauri bridge evidence 输出 payload estimate、item count、command/surface id、partial/truncated/cacheState，且不泄漏 sensitive data。
- `runtime-performance-evidence-gates` 能读取 backend / bridge budget fields。

## Validation / 验证

- Rust unit tests: cache key hit/miss/invalidation、JSONL append/truncate/corrupt、blocking timeout partial fallback。
- Git command tests: pagination/truncation/ahead-behind cache evidence where implemented。
- Bridge DTO tests: payload metadata content-safe and stable.
- `npm run check:runtime-evidence-gates`
- `npm run typecheck`
- `npm run lint`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `openspec validate backend-io-cache-and-bridge-payload-budget --strict --no-interactive`
