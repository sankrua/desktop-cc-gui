# workspace-tree-and-large-file-listing-budget

## Why

roadmap `P1-13 Workspace 文件树与打开路径性能` 指出打开大 workspace 时 file tree 不应一次性把全树和全部 metadata 传给 renderer。当前仓库已经有 `src-tauri/src/workspaces/files.rs` 的 `limit_hit` / `scan_state` / partial response 语义、`useWorkspaceFiles` 的 snapshot cache、`FileTreePanel` 的 virtual rows 和 lazy directory children hook 入口，也有 `npm run perf:long-list:*` 作为长列表 proxy baseline。本 change 的目标不是从零重写 file tree，而是把现有 partial 能力升级为明确的 listing budget、subtree on-demand contract、shared index 与 evidence gate。

## Code Facts / 现状事实

- `src-tauri/src/workspaces/files.rs` 已有 `MAX_WORKSPACE_FILE_ENTRIES`、`limit_hit`、`scan_state: partial|complete` 和多组 Rust tests。
- `src/features/workspaces/hooks/useWorkspaceFiles.ts` 已缓存 workspace file snapshot，并维护 `scanState` / `limitHit` / `directoryMetadata`。
- `src/features/files/components/FileTreePanel.tsx` 已使用 virtualizer、expanded folder state 和 `loadLazyDirectoryChildren`，但 listing budget 仍未成为跨前后端契约。
- `search-index-and-bounded-hydration` 是独立 active change，本 change 只能定义与它共享 per-workspace file index 的 contract，不能假装其未完成部分已经存在。

## Problem / 问题

- 大 workspace 初次打开时，file listing 的 depth / item / payload budget 没有稳定契约，前端难以区分完整、partial、subtree missing。
- 展开目录时如果缺 subtree contract，容易退回全树刷新或重复 scan。
- File tree 与 search hydration 各自维护候选来源时，会产生重复 IO 与 stale 结果分叉。
- 当前 perf evidence 偏 long-list UI proxy，缺 file listing duration、item-count、payload-size、cache hit/miss 的 structured fields。

## Goals / 目标

- 将 workspace file listing 明确为 bounded initial listing + on-demand directory children 两段 contract。
- 保留现有 `scan_state` / `limit_hit` 语义，并补充 `sourceVersion`、`budget`、`payloadBytes`、`cacheState` metadata。
- Directory expand 只加载 requested subtree，不触发 full-tree refresh。
- File watcher 或 mtime signature 变化时，仅失效 affected subtree / sourceVersion；漏报时有 full refresh fallback。
- File tree 与 search hydration 共享 per-workspace file index contract：path tokens、directory tokens、sourceVersion、freshness。
- 将 workspace listing metrics 接入 `runtime-performance-evidence-gates`，区分 proxy UI evidence 与 backend listing measured/proxy evidence。

## Non-Goals / 非目标

- 不重做 file tree 视觉、拖拽、rename、context menu 或 detached file tree。
- 不替换 watcher implementation。
- 不做全文搜索；shared index 仅覆盖 path / filename / directory tokens。
- 不在本 change 完成 `search-index-and-bounded-hydration` 的全部 backlog。

## Delivery Boundaries / 交付边界

1. **Contract audit**：盘点当前 `list_workspace_files`、directory children、`useWorkspaceFiles` snapshot cache 和 FileTreePanel partial UI。
2. **Budget metadata**：先给现有 response 增加 budget / sourceVersion / payload metrics，保持 backward-compatible。
3. **Subtree loading**：把 expand directory contract 固化为 requested subtree only，并添加 stale guard。
4. **Shared index bridge**：定义并接入 file tree/search 共用 index 的最小字段；若 search change 未完成，则以 adapter + feature flag 连接。
5. **Evidence gate**：将 duration、item-count、payloadBytes、partial/full、cacheState 输出到 runtime evidence。

## Initial Budgets / 初始预算

- Initial listing default depth SHOULD be `2` 或等价 visible-first 层级；超过 budget MUST return `scan_state=partial`。
- Initial listing item target `<= 2000` entries，hard fail `> 5000` entries unless explicit debug opt-out。
- Single invoke payload target `<= 1 MiB`, hard fail `> 4 MiB` for listing metadata.
- Directory expand SHOULD request only one subtree and target `<= 500` returned entries per response, large subtree MAY paginate.
- `S-LL-1000` scroll evidence remains proxy unless browser/CDP scroll gate reports measured evidence.

## Risks / 风险

- Budget 过严会让用户误以为目录为空，partial UI 必须清晰展示 loading / truncated / retry。
- Shared index 若 sourceVersion guard 不严格，会让 file tree/search 显示已删除或已移动文件。
- Watcher 漏报不可完全避免，mtime signature fallback 和 manual refresh 必须保留。
- Existing tests may assume full tree availability; migration must keep compatibility path until UI is fully partial-aware.

## Acceptance Criteria / 验收口径

- 打开大 workspace 时 initial file listing response 带有 budget metadata，并能在 partial state 下先渲染 visible tree。
- 展开目录只请求该 subtree，未触发全树刷新；stale subtree response 不覆盖新 sourceVersion。
- File tree/search 共享 index contract 生效或在 feature flag 关闭时明确记录 unsupported/adapter-only evidence。
- File watcher changed paths 使 affected subtree/index 失效；漏报 fallback 可通过 mtime/full refresh 恢复。
- `runtime-performance-evidence-gates` 输出 file listing duration、item-count、payloadBytes、cacheState、partial/full 与 evidence class。

## Validation / 验证

- Rust tests 覆盖 listing budget、partial response、directory subtree response、payload metadata。
- Frontend tests 覆盖 FileTreePanel partial UI、expand subtree stale-drop、workspace switch cleanup。
- Shared index contract test 覆盖 file tree/search 同 sourceVersion 一致性。
- `npm run perf:long-list:baseline`
- `npm run perf:long-list:browser-scroll`
- `npm run check:runtime-evidence-gates`
- `npm run typecheck`
- `npm run lint`
- `openspec validate workspace-tree-and-large-file-listing-budget --strict --no-interactive`
