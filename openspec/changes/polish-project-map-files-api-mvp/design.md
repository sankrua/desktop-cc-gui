## Context

Project Map relationship surfaces currently expose four major modes: Graph, Files, Read, and API. The API contract detail view already has a three-pane structure and export path, the Graph view already has Files/Canvas/Inspector panes, and the Files view already supports relationship navigation and low-level filtering. The remaining MVP issue is user perception: controls feel dense, pane proportions are not always task-fit, scan-derived data can look more authoritative than it is, and “noise” wording makes useful governance sources feel disposable.

## Goals / Non-Goals

**Goals:**

- Make Files and API first-screen hierarchy easier to understand.
- Make Graph/Files/Inspector pane proportions adjustable without changing the relationship graph data model.
- Preserve existing data flow and scan artifacts.
- Make low-confidence, fallback, and scan-derived API details explicit.
- Refine Java/Spring method-chain extraction so Method chain is scoped to the selected endpoint handler.
- Make API endpoint detail sections and Graph node titles more readable through layout/style refinements.
- Keep Project Map relationship storage, API contract graph, and semantic graph boundaries intact.

**Non-Goals:**

- No new dependencies.
- No new Project Map workspace mode.
- No storage migration.

## Decisions

### Decision 1: Polish existing surfaces instead of adding a new UX layer

Alternative A was to add a dedicated “API Quality” or “Governance Files” panel. That would make the concepts explicit but would add another decision point. Alternative B is to refine the current Files/API surfaces with copy, hierarchy, and confidence cues. This change chooses B because the MVP problem is clarity, not missing capability.

### Decision 2: Treat noise as low-signal projection, not path blacklist

Files under governance/documentation roots can be critical in this product. The low-signal predicate will continue to suppress skipped/unknown/style/infra-like entries by default, but it will not hide `openspec/`, `.trellis/`, or `docs/` solely because of their path.

### Decision 3: Separate primary and advanced API filters

The API toolbar will keep filtering power, but the visual hierarchy will make module/controller/confidence the primary decision path. Protocol/language/framework remain available as advanced filters so users are not forced to parse six equal-weight selectors at once.

### Decision 4: Resolve Java method chains from handler bodies before improving visual depth

The earlier Method chain fallback scanned a fixed range after the handler line, which could attach sibling-method calls to the selected endpoint. This change indexes Java class methods, injected collaborator fields, and method body line ranges with local scanner logic. Java/Spring Method chain now starts from the selected handler body, extracts receiver calls such as `goodBasicService.shelfBatch(...)`, resolves scanned target methods when possible, and emits target file/line anchors. Unresolved explicit collaborator calls can remain medium confidence, while proximity-only fallback is not used for Java endpoint chains.

### Decision 5: Keep API detail readable through compact composition, not new routes

The API tab remains one workspace. The default pane ratio is tuned toward detail reading, export/scan actions move under advanced filters, and opening evidence or method-chain file anchors enters a detail-focused mode that hides list panes. A visible restore action returns to the list/detail layout. Responses are rendered as structured response blocks so status/content-type/schema/field rows do not collapse into narrow columns.

### Decision 6: Render Method chain as a layered tree

Flat call cards make endpoint chains feel noisy and unrelated. The UI builds a local tree from `sourceSymbol -> targetSymbol` edges and renders a bounded hierarchy from the selected handler symbol. Resolved call sites expose both call and definition anchors, while unresolved collaborator calls remain visibly lower confidence.

### Decision 7: Resize Graph panes without changing graph projection

Graph pane resizing is a view-only CSS variable over the existing Files/Canvas/Inspector grid. Resize handles adjust left and right pane widths, while the graph canvas projection, pan, zoom, and node/edge coordinates remain unchanged. Later CSS overrides must also consume the same variables so focused relationship layouts do not reset to fixed widths.

### Decision 8: Treat graph node filename as primary content

The Graph node basename is the primary identifier. Filename title wrapping is allowed for the node `strong` element, while secondary metadata (`language`, `layer`, relation metrics) can remain single-line and truncated. This preserves scan density without hiding the file identity.

## Risks / Trade-offs

- Low-signal filtering may reveal more files in governance-heavy repositories → mitigate with role/module grouping and low-signal toggle copy.
- API contracts may still be mistaken for official API docs → mitigate with scan-derived export and inspector caveat copy.
- Java method-chain resolution is static and heuristic, not compiler-classpath complete → mitigate by only treating resolved target method anchors as high confidence.
- Graph pane resizing can be broken by later CSS overrides → mitigate by centralizing resize variables in all focused/non-focused Graph grid rules.
- Longer Graph filenames can increase node height → mitigate by only wrapping the title while keeping secondary metadata compact.
- CSS polish may be limited → mitigate through class hooks, copy hierarchy, and narrow visual changes first; deeper redesign can follow if needed.

## Migration Plan

- Update frontend projection/UI/i18n, graph/API CSS, and Java API method-chain scanner refinement.
- Roll back by restoring the previous low-signal predicate, toolbar grouping, copy keys, graph fixed pane widths, and flat method-chain/response rendering.

## Open Questions

None for MVP. Deeper visual redesign can follow after user feedback on the polished Files/API surfaces.
