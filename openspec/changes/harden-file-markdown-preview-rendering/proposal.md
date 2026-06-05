## Why

当前文件模块 Markdown preview 已经有 block segmentation、heavy-block lazy render、render budget 等保护，但主路径仍由 `ReactMarkdown + remark/rehype + React component overrides` 承担整份文档渲染。大 Markdown 文档会把 parse、sanitize、syntax highlight、table/code/math/diagram component reconciliation 集中压到主线程，导致预览滚动、切换、注释输入和客户端交互出现卡顿。

`yn` 的 Markdown preview 给出了更适合文档阅读 surface 的方向：Markdown 先编译成 HTML/VNode 文档 DOM，再用事件委托和局部插件增强处理交互。mossx 应复刻该架构思想，而不是照搬其插件全集。

## 目标与边界

- 将文件 Markdown preview 重构为 fast document renderer 架构：React 负责 preview shell、状态和交互岛；Markdown 主体优先作为 sanitized HTML document surface 挂载。
- 引入 Markdown compile cache / render cache，使相同 document snapshot、content hash、renderer profile 的预览复用已编译结果。
- 参考 `yn` 的 token-derived outline：从 Markdown parser token/source-line metadata 生成大纲，而不是从已经挂载的 React/HAST 节点树反复扫描。
- 保留当前 file-preview GitHub-style 语义：frontmatter、code highlight、table overflow、Mermaid Source/Render tab、KaTeX、annotation source line mapping、large-doc budget、readable fallback。
- 为后续 Worker 化保留明确 contract：第一阶段可在主线程落地 fast HTML renderer，第二阶段可把 compile/sanitize 前置工作迁入 Worker。

## 非目标

- 不迁移 chat/message Markdown renderer；`src/features/messages/components/Markdown.tsx` 继续遵守 streaming render contract。
- 不引入 `yn` 的完整插件系统、extension manager、macro/code-run/mindmap/drawio/luckysheet 等能力。
- 不改变 Tauri 文件读取、external sync、live edit preview 的 backend contract。
- 不把大文档退化为纯文本作为默认目标；plain text 只能作为异常或预算兜底。
- 不以机器测速作为主策略选择依据；策略选择仍基于 deterministic metrics。

## What Changes

- Add a fast file Markdown renderer path inspired by `yn`:
  - compile Markdown into sanitized HTML document fragments;
  - mount the Markdown body through a stable HTML surface;
  - hydrate only interaction-heavy islands such as Mermaid, math fallback, annotation affordances, and table scroll state.
- Add a token-derived outline/Toc pipeline:
  - derive outline entries from Markdown parser tokens and source line ranges;
  - keep outline independent from rendered DOM queries;
  - support jump-to-line / scroll-to-heading behavior without causing full preview rebuilds.
- Modify existing render architecture requirements so the renderer may choose ReactMarkdown fallback or fast HTML renderer by deterministic profile.
- Preserve all existing large-document and annotation stability guarantees.
- Add tests and performance sentries for large Markdown preview, outline generation, source-line mapping, Mermaid/math/table/code behavior, and fallback isolation.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `file-markdown-preview-render-architecture`: define fast document renderer, HTML compile cache, interaction islands, Worker-ready boundary, and parser-token outline contract.
- `file-view-markdown-github-preview`: preserve GitHub-style feature parity while allowing the file preview renderer to use sanitized HTML document output instead of per-block ReactMarkdown.

## 技术方案对比

| 方案 | 描述 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| A. 继续调优 ReactMarkdown | 保持当前 `ReactMarkdown` block map，继续增加阈值、memo、lazy | 改动小，风险低 | 本质仍是 React 管整棵 Markdown DOM；大文档收益有限 | 不选作主线，仅保留为 fallback |
| B. 主线程 fast HTML renderer | 用 `markdown-it` 类 parser 编译 sanitized HTML，React 只挂载 document surface | 能快速验证 `yn` 架构收益；改动可控 | parse/sanitize 仍可能有主线程尖峰 | 作为第一阶段主线 |
| C. Worker fast renderer | Worker 编译 Markdown tokens/HTML/outline，主线程只消费 sanitized result 并 hydrate islands | 最符合长期性能目标；降低主线程卡顿 | 需要设计 async cache、cancel、fallback contract | 作为第二阶段闭环目标 |

取舍：本 change 以 B 为可落地 MVP，以 C 为架构闭环，保留 A 作为失败回退路径。这样既能快速降低卡顿，也不会把实现锁死在主线程。

## Impact

- Affected frontend code:
  - `src/features/files/components/FileMarkdownPreview.tsx`
  - `src/features/files/utils/fileMarkdownDocument.ts`
  - new file-preview Markdown renderer utility/service files under `src/features/files/**` or `src/features/markdown/**`
  - file preview outline / file view surface components, if outline currently lives outside Markdown preview
  - Markdown preview CSS under `src/styles/**`
  - focused tests for file Markdown preview, outline, and renderer fallback
- APIs/dependencies:
  - May add `markdown-it` and a sanitizer if not already available in the dependency graph.
  - No Tauri command signature change.
  - No backend storage format change.
- Systems:
  - File preview becomes a document-renderer surface rather than a ReactMarkdown component tree surface.
  - Message Markdown and live conversation streaming remain isolated.

## 验收标准

- Large Markdown preview remains scrollable and interactive under deterministic render budgets.
- Same-content annotation typing does not recompile or remount the Markdown document body.
- Mermaid rendered tab, table scroll, and annotation draft state survive same-content rerenders.
- Outline entries are produced from parser/token/source-line metadata and can jump to rendered headings without DOM-wide rescans.
- Fast renderer failures fail closed to the existing readable file-preview fallback.
- Chat/message Markdown surfaces remain visually and structurally unchanged.
