# Proposal: Project Map Relationship Dashboard

## 中文导读

这份 proposal 的核心是定义“Project Map Relationship Dashboard”的产品与工程边界：
我们不做体验上的花架子，先把关系事实变成可以稳定消费的 `deterministic substrate`。
按钮、扫描、持久化、仪表盘、impact、stale、repair、Agent Read Plan 都是同一主线的连续链路，不允许做成“有 UI 没有闭环”。

## Context / 背景

当前 Project Map 关系能力虽然已有部分基础，但与实际执行需求（agent read 优先级、变更影响、跨层桥接）之间存在差距：
- 多数关系是非确定性来源。
- 无全局统一扫描入口。
- Dashboard 目前更偏展示，不足以支撑 execution surface。

## Why now / 为什么现在做

- `Task Center`、`Project Map`、`AI generation` 需要统一关系底座，否则上层动作会出现“读文件集合不稳定”。
- 项目规模增长时，LLM-based 推断容易引入不可重复关系。
- 用户明确要求 `Project Map` 深挖，不做 Browser Dock 的支线。

## Goals / 目标

1. 在 Project Map 视图中增加 `Scan Relationships` action。
2. 实现 deterministic scan pipeline（files / imports / exports / tests / styles / specs / docs / bridge）。
3. 将扫描结果写入磁盘 `project-map-relations`，采用分层存储。
4. 显示 relationship dashboard（selected file neighborhood, module/hotspot, impact, stale, repair）。
5. 产出 Agent Read Plan 并持久化。
6. 保留 UA 的有价值 skill 观念（understand/dashboard/diff/explain/onboard/chat/domain）但不引入 UA schema。
7. 实现 full scope（分批交付），不缩范围。

## Non-goals / 非目标

- 不处理 Browser Dock trusted observation。
- 不引入 Understand-Anything 的持久化 schema。
- 不引入第三方 graph storage。
- 不在本轮实现全量行为能力（只做关系 substrate + consumption contracts 的完整闭环）。

## Solution summary / 方案摘要

采用 `storage + scanner + dashboard + context pack` 的四层实现：
- Scanner 产出 deterministic facts。
- Storage 进行 atomic 写入与 repair。
- Dashboard 消费 index summary。
- Agent Context 使用 context-pack 作为默认输入。

## 关键能力映射（Capability Mapping）

- `project-map-relationship-storage`
  - 定义 storage root、manifest、写入边界、schema 与 artifact 集合。
- `project-xray-panel`
  - 提供关系扫描按钮与交互状态、文件邻域、impact 与 stale/repair。
- `project-map-incremental-generation`
  - 将关系 scan 作为 generation 的事实输入，禁止覆写。
- `composer-context-project-resource-discovery`
  - 复用 context packs，避免重复广域扫描。

## Design options（方案对比）

### Option 1: 全量复用现有 `project-map` dataset

- 优点：改动最小。
- 风险：事实与语义混合，难做 repair/stale/incremental。

### Option 2: 引入 UA `knowledge-graph.json`

- 优点：可快速拿到 graph model。
- 风险：绑定外部 schema、维护耦合、迁移负担。

### Option 3: 自有 `project-map-relations` 层（推荐）

- 优点：保持 mossx 领域契约，分层存储。
- 优点：关系事实可单独治理，稳定驱动 dashboard 与 Agent。
- 缺点：初期实现量略大，但可控且可分批。

### 选择

选择 Option 3。

## Product behavior（用户体验）

- 空态：无扫描数据时 dashboard 显示引导 CTA。
- 扫描中：显示运行阶段、文件扫描计数、忽略数量。
- 扫描失败：分类错误（permission/path/parser/storage/timeout）。
- 有数据：展示 selected-file graph neighborhood + filters + hotspots + impact。

## Risk control / 风险控制

- Path safety：强制 root 白名单，拒绝越界。
- ID 稳定性：canonical id。
- Dangling edge：repair quarantined，不污染主索引。
- Stale：manifest + fingerprint + commit。
- 错误处理：可恢复错误给出重试建议。

## Success criteria（验收标准）

- 成功扫描 active workspace 并持久化关键 artifact。
- Dashboard 可展示 selected file neighborhood。
- Impact overlay 可标注 changed / affected / unmapped。
- Stale/repair 可见且可理解。
- Composer 可消费 context pack。
- 与现有 Project Map 数据兼容，不出现高风险破坏。

## 规模与交付承诺 / Scope & Commitment

- 这不是 MVP 裁剪版。虽然可分 batch 并行推进，但 scope 保持完整。
- 文档层面同步后，下一步可直接进入 implementation。

## 阶段性评估 / Stage Assessment（2026-06-05）

### 中文导读

本节记录当前 implementation 与原 proposal/design/tasks 的对齐校准。
结论：当前方向没有跑偏，仍然围绕 `scan -> persist -> dashboard -> impact/read-plan -> consume` 主链路推进。
但当前仍属于 `Alpha closure candidate`，不是最终验收完成态；剩余风险主要集中在 stale、UA-style actions、Composer consumption 与 validation。

### 当前完成度 / Current progress

- OpenSpec task progress：`19 / 23`。
- 已完成主链路：
  - `Scan Relationships` action 已进入 Project Map 视图。
  - deterministic scan artifacts 已落盘到 `project-map-relations/<storage-key>/`。
  - storage artifact 已覆盖 `manifest/profile/runs/scans/files/relations/modules/impact/context-packs/repair`。
  - Relationship Dashboard 已支持 `Board / List / Neighborhood` 多视图。
  - Scan Snapshot 与现有 Project Map Semantic Relations 已视觉隔离；Semantic Relations 默认收起，避免把两个 source layer 混成一套关系图。
  - Impact summary、Hotspots、Agent Read Plan 已以 capped scan snapshot cards 方式展示。
  - `context-packs/latest.json` 已从占位 artifact 推进为 conservative Agent Read Plan artifact。

### 对齐确认 / Alignment check

| Proposal target | Current status | Calibration |
|---|---|---|
| 一键扫描 active workspace | 已实现 | 对齐。按钮、running/success/failure 基本状态已具备。 |
| deterministic scan pipeline | 已实现 Alpha | 对齐。已覆盖通用 inventory、manifest/config/docs/convention 关系和多语言增强 extractor。 |
| layered local storage | 已实现 | 对齐。仍保持 mossx-native schema，不引入 UA schema。 |
| dashboard selected neighborhood + filters | 已实现 | 对齐。并补充 UA-like board/list/neighborhood 多视图。 |
| impact overlay | 已实现 Alpha | 对齐但需注明：当前是 summary card + one-hop/transitive artifact，不是 canvas overlay。 |
| Agent Read Plan | 已实现 Alpha | 对齐但需注明：当前是 conservative context-pack artifact，还未接入 Composer/Agent 自动消费。 |
| stale/repair visibility | 部分实现 | repair/read issues 已显示；stale detection 仍在 Task 16。 |
| UA lessons 内化 | 部分实现 | dashboard/diff/read-plan 已借鉴；explain/guided read/ask/domain 仍在 Task 17。 |
| Composer resource discovery | 未完成 | Task 18 保持待办，不应提前标记 closed。 |

### 校准发现 / Calibration findings

- 未跑偏：没有把 scan result 自动注入现有 Project Map semantic graph，符合“不污染主图谱、不制造性能噪音”的边界。
- 未跑偏：没有引入 Understand-Anything schema，也没有引入第三方 graph storage。
- 已补充：`changedFiles` override contract 已校准为 `None -> git status fallback`，`Some([]) -> explicit empty scope`，避免 optional collection 语义漂移。
- 已补充：扫描结果不再挂在 `Inspect Relations / 检查关系` 里上下平铺；`File Relations / 文件关系` 承载 deterministic scan snapshot，`Inspect Relations / 检查关系` 回归现有 Project Map semantic graph。
- 需要保留为风险：large scan confirmation、扫描阶段 progress、错误类型细分目前仍不完整，不能作为最终验收完成项。
- 需要保留为风险：hotspot 当前以 `many-dependents` 为主，`cross-layer-hub / missing-test / stale / large-file` 还未完整成为 hotspot reason；其中 `missing-test` 已先进入 risk flag。
- 需要保留为风险：module summary 当前偏 `fileCount/relationCount`，尚未完整覆盖 `cross-module count / stale flag / relation density`。
- 需要保留为风险：当前未执行 focused validation；Task 19 仍必须保留。

### 当前阶段判断 / Phase judgement

当前实现可定义为：

`MVP-1.5 Alpha: deterministic scan snapshot + relationship dashboard + impact/read-plan artifacts`

它已经满足“用户可以扫描、读取、选择文件、查看关系、看到 impact/read-plan 摘要”的阶段目标；
但还没有达到“完整闭环归档”的标准，因为 context-pack 尚未被 Composer/Agent consumption path 消费，stale/incremental UX 尚未完成，UA-style actions 尚未全部内化。

### 下一阶段建议 / Next calibrated batch

1. Task 16：实现 stale detection 与 incremental refresh UX。
2. Task 17：实现 UA-style actions 的 mossx 内化入口，优先 `Explain selected file` 与 `Guided read tour`。
3. Task 18：打通 Composer/Agent resource discovery 对 `context-packs/latest.json` 的消费。
4. Task 19：执行 focused validation，并把 validation evidence 写入 change artifacts 后再考虑 verify/sync/archive。


## 中文+English 术语对照（Proposal Glossary）

- Deterministic Scan / 确定性扫描
- Relationship Substrate / 关系事实底座
- Scan Source of Truth / 关系真相源
- Project Resource Discovery / 项目资源发现
- Agent Context / 代理上下文
- Storage Root / 持久化根目录
- Run Metadata / 运行元数据
- Repair Quarantine / 修复隔离区
- Fresh / 最新可用
- Stale / 过期
- Incremental Generation / 增量生成
