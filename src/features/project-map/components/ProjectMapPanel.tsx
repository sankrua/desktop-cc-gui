import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent, WheelEvent } from "react";
import { useTranslation } from "react-i18next";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import ArrowDownRightFromCircle from "lucide-react/dist/esm/icons/arrow-down-right-from-circle";
import ArrowUpLeftFromCircle from "lucide-react/dist/esm/icons/arrow-up-left-from-circle";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import Crosshair from "lucide-react/dist/esm/icons/crosshair";
import Folder from "lucide-react/dist/esm/icons/folder";
import Globe2 from "lucide-react/dist/esm/icons/globe-2";
import HardDrive from "lucide-react/dist/esm/icons/hard-drive";
import Lightbulb from "lucide-react/dist/esm/icons/lightbulb";
import ListChecks from "lucide-react/dist/esm/icons/list-checks";
import ListFilter from "lucide-react/dist/esm/icons/list-filter";
import Network from "lucide-react/dist/esm/icons/network";
import RadioTower from "lucide-react/dist/esm/icons/radio-tower";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import ZoomIn from "lucide-react/dist/esm/icons/zoom-in";
import ZoomOut from "lucide-react/dist/esm/icons/zoom-out";

import { cn } from "../../../lib/utils";
import type { EngineType, ModelOption, WorkspaceInfo } from "../../../types";
import {
  buildProjectMapOrchestrationTaskDraft,
  loadOrchestrationTaskStore,
  saveOrchestrationTaskStore,
  upsertOrchestrationTask,
} from "../../agent-orchestration";
import { useProjectMapDataset } from "../hooks/useProjectMapDataset";
import type { ProjectMapDatasetController } from "../hooks/useProjectMapDataset";
import {
  PROJECT_MAP_DEFAULT_FOCUS_ZOOM,
  PROJECT_MAP_DEFAULT_OVERVIEW_ZOOM,
  PROJECT_MAP_GRAPH_HEIGHT,
  PROJECT_MAP_GRAPH_WIDTH,
  clampProjectMapGraphZoom,
  buildInteractiveProjectMapLayout,
  buildProjectMapMiniMapProjection,
  buildProjectMapNodeIndex,
  buildProjectMapViewState,
  calculateProjectMapFitViewport,
  getProjectMapCoreNode,
  getSortedProjectMapChildren,
  getVisibleProjectMapLenses,
  normalizeProjectMapProjectionNodes,
  resetProjectMapViewState,
  resolveVisibleProjectMapNodes,
  settleProjectMapLayout,
  type ProjectMapGraphNodePosition,
  type ProjectMapGraphViewport,
} from "../utils/interactiveLayout";
import {
  formatProjectMapDateTime,
  getProjectMapGenerationQueue,
  getProjectMapRecentRuns,
  translateProjectMapNodeKind,
} from "../utils/display";
import { buildProjectMapExplainPack } from "../utils/contextBuilder";
import { buildProjectMapImpactAnalysis } from "../utils/impactAnalysis";
import {
  getProjectMapNodeStaleReasons,
  classifyProjectMapRefresh,
} from "../utils/refreshClassifier";
import {
  repairProjectMapGraphIntegrity,
  validateProjectMapGraphIntegrity,
} from "../utils/graphIntegrity";
import {
  explainProjectMapAssociationPath,
  buildProjectMapShortestPath,
  searchProjectMapNodes,
  searchProjectMapGrouped,
} from "../utils/navigation";
import { buildProjectMapActivityProjection } from "../utils/activityProjection";
import {
  buildProjectMapHighlightProjection,
} from "../utils/highlightProjection";
import {
  buildProjectMapAdvisorHints,
} from "../utils/advisorProjections";
import {
  buildProjectMapRelationIndex,
  filterProjectMapRelations,
  type ProjectMapRelationDirectionFilter,
} from "../utils/relationIndex";
import { getProjectMapUnassignedDiscoveryChildren } from "../services/projectMapNodeOrganizer";
import {
  readProjectMapRelationships,
  scanProjectMapRelationships,
} from "../services/projectMapPersistence";
import { type ProjectMapTraceTarget } from "./ProjectMapTraceChips";
import {
  ProjectMapGenerationTaskDrawer,
} from "./ProjectMapTaskDrawer";
import {
  ProjectMapAdvisorHintsPanel,
  ProjectMapGroupedQueryPanel,
  ProjectMapNavigationHistoryChips,
  ProjectMapRecentActivityPanel,
  type ProjectMapNavigationHistoryItem,
} from "./ProjectMapWorkbenchPanels";
import {
  DeleteNodeConfirmDialog,
  DetailPanel,
  GenerationConfirmationDialog,
  ProjectMapNavigationPanel,
  ProjectMapRelationLegendPanel,
  ProjectMapSettingsPanel,
} from "./ProjectMapPanelSurfaces";
import {
  buildProjectMapEvidenceFileIndex,
} from "../utils/evidenceFileIndex";
import type { ProjectMapHierarchyRelationView } from "./ProjectMapPanelSurfaces";
import type {
  ProjectMapDataset,
  ProjectMapGraphRepairSummary,
  ProjectMapCandidate,
  ProjectMapLens,
  ProjectMapLayoutPreset,
  ProjectMapNode,
  ProjectMapImpactSourceMetadata,
  ProjectMapFileRelation,
  ProjectMapRelationshipReadResponse,
  ProjectMapRelationshipModuleSummary,
  ProjectMapRelationshipRepairIssue,
  ProjectMapRelationshipScanResponse,
  ProjectMapRelationshipHotspot,
  ProjectMapRelationshipImpactSummary,
  ProjectMapRelationshipAgentReadPlan,
  ProjectMapScannedFile,
  ProjectMapPreferredLanguage,
  ProjectMapProfile,
  ProjectMapQuickFilterId,
  ProjectMapAdvisorHint,
  ProjectMapQueryResult,
} from "../types";

type ProjectMapPanelProps = {
  activeWorkspace?: WorkspaceInfo | null;
  workspaceName?: string | null;
  selectedEngine?: EngineType | null;
  selectedModelId?: string | null;
  models?: ModelOption[];
  dataset?: ProjectMapDataset;
  datasetController?: ProjectMapDatasetController;
  changedFilePaths?: string[];
  changedFileSource?: ProjectMapImpactSourceMetadata;
  sourceFocusNodeId?: string | null;
  onOpenEvidenceFile?: (path: string, location?: { line: number; column: number }) => void;
  onOpenOrchestrationTask?: (taskId: string) => void;
};

type GraphViewport = ProjectMapGraphViewport;

type GraphViewSnapshot = {
  focusNodeId: string | null;
  selectedNodeId: string | null;
};

type ProjectMapOrchestrationDraftState =
  | { status: "idle" }
  | {
      status: "created";
      nodeId: string;
      taskId: string;
      taskStatus: string;
      evidenceCount: number;
      riskCount: number;
    }
  | {
      status: "failed";
      nodeId: string;
      reason: "missing-workspace" | "missing-node";
    };

type ProjectMapVisibleSectionState = {
  navigation: boolean;
  query: boolean;
  activity: boolean;
  evidence: boolean;
  fileRelations: boolean;
  relations: boolean;
  advisor: boolean;
  health: boolean;
};

type GraphNodeDragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  nodeIds: string[];
  originPositions: Map<string, ProjectMapGraphNodePosition>;
  previewPositions: Map<string, ProjectMapGraphNodePosition>;
  didMove: boolean;
};

type ProjectMapRelationshipScanState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "success"; summary: ProjectMapRelationshipScanResponse }
  | { status: "failed"; message: string };

type ProjectMapRelationshipDashboardData = {
  files: ProjectMapScannedFile[];
  relations: ProjectMapFileRelation[];
  modules: ProjectMapRelationshipModuleSummary[];
  hotspots: ProjectMapRelationshipHotspot[];
  impactSummary: ProjectMapRelationshipImpactSummary | null;
  contextPack: ProjectMapRelationshipAgentReadPlan | null;
  repairIssues: ProjectMapRelationshipRepairIssue[];
  readErrors: Array<{ path: string; message: string }>;
};

type ProjectMapRelationshipDashboardViewMode = "board" | "list" | "neighborhood";

const ZOOM_STEP = 0.1;
const MINI_MAP_SIZE = { width: 180, height: 118 };
const DETAIL_PANEL_FOCUS_OFFSET_MIN = 160;
const DETAIL_PANEL_FOCUS_OFFSET_MAX = 240;
const CANVAS_CONTROLS_COLLAPSED_STORAGE_KEY = "ccgui.projectMap.canvasControlsCollapsed";
const PROJECT_MAP_RELATION_FILTER_ALL = "all";
const PROJECT_MAP_RELATIONSHIP_LIST_LIMIT = 120;
const PROJECT_MAP_RELATIONSHIP_EDGE_LIMIT = 80;
const PROJECT_MAP_LOCAL_HISTORY_LIMIT = 6;
const PROJECT_MAP_RELATIONSHIP_ROLE_PRIORITY: Record<string, number> = {
  controller: 10,
  route: 15,
  service: 20,
  repository: 30,
  entity: 35,
  component: 40,
  hook: 45,
  command: 50,
  module: 55,
  type: 60,
  test: 70,
  manifest: 80,
  config: 90,
  document: 100,
  infra: 110,
  migration: 120,
  style: 130,
  unknown: 140,
};
const PROJECT_MAP_RELATIONSHIP_TYPE_PRIORITY: Record<string, number> = {
  imports: 10,
  bridges_to: 20,
  tested_by: 30,
  specified_by: 40,
  documents: 50,
  configures: 60,
  styled_by: 70,
  contains: 80,
  exports: 90,
  related: 100,
};
const PROJECT_MAP_QUICK_FILTERS: ProjectMapQuickFilterId[] = [
  "changed",
  "affected",
  "stale",
  "candidate",
  "low-confidence",
  "inferred-relations",
];

function normalizeLocalHistoryLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function appendUniqueLocalHistory<T>(
  current: T[],
  nextItem: T,
  getKey: (item: T) => string,
): T[] {
  const nextKey = getKey(nextItem);
  if (!nextKey) {
    return current;
  }
  return [
    nextItem,
    ...current.filter((item) => getKey(item) !== nextKey),
  ].slice(0, PROJECT_MAP_LOCAL_HISTORY_LIMIT);
}

function readCanvasControlsCollapsedPreference(): boolean {
  if (typeof window === "undefined" || !window.localStorage) {
    return true;
  }

  try {
    const storedValue = window.localStorage.getItem(CANVAS_CONTROLS_COLLAPSED_STORAGE_KEY);
    return storedValue === null ? true : storedValue === "true";
  } catch {
    return true;
  }
}

function writeCanvasControlsCollapsedPreference(collapsed: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(CANVAS_CONTROLS_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // UI preference persistence is best-effort.
  }
}

function resolveProjectMapOrchestrationWorkspaceId(input: {
  activeWorkspace: WorkspaceInfo | null;
  dataset: ProjectMapDataset;
  workspaceName?: string | null;
}): string | null {
  const ownedRunWorkspaceId =
    input.dataset.runs.find((run) => run.ownership?.workspaceId)?.ownership?.workspaceId ?? null;
  const candidates = [
    input.activeWorkspace?.id,
    ownedRunWorkspaceId,
    input.dataset.manifest.storageKey,
    input.workspaceName,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

function resolveSelectedGenerationModel(
  selectedModelId: string | null | undefined,
  models: ModelOption[] | undefined,
): string | null {
  const trimmedSelection = selectedModelId?.trim() ?? "";
  if (!trimmedSelection) {
    return null;
  }
  const matchedModel = models?.find(
    (model) => model.id === trimmedSelection || model.model === trimmedSelection,
  );
  return matchedModel?.model ?? trimmedSelection;
}

function getDetailPanelFocusOffset(input: {
  canvasElement: HTMLDivElement | null;
  isDetailCollapsed: boolean;
}): number {
  if (input.isDetailCollapsed) {
    return 0;
  }

  const detailPanel = input.canvasElement?.querySelector<HTMLElement>(".project-map-detail-panel");
  const detailWidth = detailPanel?.getBoundingClientRect().width ?? 0;
  const fallbackWidth = 478;
  const offset = Math.max(
    DETAIL_PANEL_FOCUS_OFFSET_MIN,
    (detailWidth > 0 ? detailWidth : fallbackWidth) / 2,
  );
  return -Math.min(DETAIL_PANEL_FOCUS_OFFSET_MAX, offset);
}

function buildLensIndex(lenses: ProjectMapLens[]): Map<string, ProjectMapLens> {
  return new Map(lenses.map((lens) => [lens.id, lens]));
}

function buildNeighborSet(
  nodes: ProjectMapNode[],
  selectedNodeId: string | null,
  hoverNodeId: string | null,
  isFocusedView: boolean,
): Set<string> {
  const focusNodeId = hoverNodeId ?? (isFocusedView ? selectedNodeId : null);
  if (!focusNodeId) {
    return new Set(nodes.map((node) => node.id));
  }
  const focusedNode = nodes.find((node) => node.id === focusNodeId);
  if (!focusedNode) {
    return new Set(nodes.map((node) => node.id));
  }
  return new Set([
    focusedNode.id,
    focusedNode.parentId ?? "",
    ...focusedNode.children,
    ...nodes
      .filter((node) => node.children.includes(focusedNode.id))
      .map((node) => node.id),
  ].filter(Boolean));
}

function getDescendantStats(
  node: ProjectMapNode,
  nodeIndex: Map<string, ProjectMapNode>,
): {
  count: number;
  stale: number;
  candidate: number;
} {
  const children = getSortedProjectMapChildren(node, nodeIndex);
  return {
    count: children.length,
    stale: children.filter((child) => child.stale).length,
    candidate: children.filter((child) => child.candidate).length,
  };
}

function getProfileSummary(profile: Partial<ProjectMapProfile> | null | undefined): {
  language: string;
  shapes: string;
} {
  const language = profile?.primaryLanguage ?? "unknown";
  const shapes = profile?.shapes?.length ? profile.shapes.join(" · ") : "unknown";
  return { language, shapes };
}
function resolveProjectMapPreferredLanguage(
  language: string | null | undefined,
): ProjectMapPreferredLanguage {
  return language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function normalizeProjectMapRelationshipError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown relationship scan failure.";
}

function isProjectMapRelationshipRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readProjectMapRelationshipString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field : null;
}

function readProjectMapRelationshipNumber(
  value: Record<string, unknown>,
  key: string,
): number {
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : 0;
}

function normalizeProjectMapRelationshipReadSummary(
  response: ProjectMapRelationshipReadResponse,
): ProjectMapRelationshipScanResponse | null {
  const manifest = response.manifest;
  if (!response.exists || !isProjectMapRelationshipRecord(manifest)) {
    return null;
  }
  const scanRunId = readProjectMapRelationshipString(manifest, "scanRunId");
  const generatedAt = readProjectMapRelationshipString(manifest, "generatedAt");
  if (!scanRunId || !generatedAt) {
    return null;
  }

  return {
    storageKey:
      readProjectMapRelationshipString(manifest, "storageKey") ?? response.storageKey,
    storageDir: response.storageDir,
    scanRunId,
    generatedAt,
    scannedRoot: readProjectMapRelationshipString(manifest, "scannedRoot") ?? "",
    fileCount: readProjectMapRelationshipNumber(manifest, "fileCount"),
    relationCount: readProjectMapRelationshipNumber(manifest, "relationCount"),
    ignoredCount: readProjectMapRelationshipNumber(manifest, "ignoredCount"),
    repairIssueCount: readProjectMapRelationshipNumber(manifest, "repairIssueCount"),
  };
}

function readProjectMapRelationshipStringArray(
  value: Record<string, unknown>,
  key: string,
): string[] {
  const field = value[key];
  if (!Array.isArray(field)) {
    return [];
  }
  return field.filter((item): item is string => typeof item === "string");
}

function normalizeProjectMapRelationshipConfidence(
  value: unknown,
): ProjectMapFileRelation["confidence"] {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function normalizeProjectMapRelationshipType(value: unknown): ProjectMapFileRelation["type"] {
  const normalized = typeof value === "string" ? value : "related";
  switch (normalized) {
    case "imports":
    case "exports":
    case "contains":
    case "tested_by":
    case "styled_by":
    case "specified_by":
    case "documents":
    case "configures":
    case "bridges_to":
    case "related":
      return normalized;
    default:
      return "related";
  }
}

function normalizeProjectMapScannedFiles(value: unknown): ProjectMapScannedFile[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isProjectMapRelationshipRecord(item)) {
      return [];
    }
    const id = readProjectMapRelationshipString(item, "id");
    const path = readProjectMapRelationshipString(item, "path");
    if (!id || !path) {
      return [];
    }
    return [{
      id,
      path,
      basename: readProjectMapRelationshipString(item, "basename") ?? path.split("/").pop() ?? path,
      extension: readProjectMapRelationshipString(item, "extension") ?? "",
      language: (readProjectMapRelationshipString(item, "language") ?? "unknown") as ProjectMapScannedFile["language"],
      layer: (readProjectMapRelationshipString(item, "layer") ?? "unknown") as ProjectMapScannedFile["layer"],
      role: (readProjectMapRelationshipString(item, "role") ?? "unknown") as ProjectMapScannedFile["role"],
      sizeBytes: readProjectMapRelationshipNumber(item, "sizeBytes"),
      lineCount: readProjectMapRelationshipNumber(item, "lineCount"),
      contentHash: readProjectMapRelationshipString(item, "contentHash") ?? "",
      parseStatus: (readProjectMapRelationshipString(item, "parseStatus") ?? "skipped") as ProjectMapScannedFile["parseStatus"],
    }];
  });
}

function normalizeProjectMapFileRelations(value: unknown): ProjectMapFileRelation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isProjectMapRelationshipRecord(item)) {
      return [];
    }
    const id = readProjectMapRelationshipString(item, "id");
    const sourceFileId = readProjectMapRelationshipString(item, "sourceFileId");
    const targetFileId = readProjectMapRelationshipString(item, "targetFileId");
    if (!id || !sourceFileId || !targetFileId) {
      return [];
    }
    const relationType = item.type ?? item.relationType;
    const evidence = Array.isArray(item.evidence)
      ? item.evidence.flatMap((entry) => {
          if (!isProjectMapRelationshipRecord(entry)) {
            return [];
          }
          const path = readProjectMapRelationshipString(entry, "path");
          if (!path) {
            return [];
          }
          return [{
            path,
            line: readProjectMapRelationshipNumber(entry, "line") || undefined,
            excerpt: readProjectMapRelationshipString(entry, "excerpt") ?? undefined,
            extractorVersion:
              readProjectMapRelationshipString(entry, "extractorVersion") ?? undefined,
            observedAt: readProjectMapRelationshipString(entry, "observedAt") ?? undefined,
          }];
        })
      : [];

    return [{
      id,
      sourceFileId,
      targetFileId,
      type: normalizeProjectMapRelationshipType(relationType),
      direction: "forward",
      confidence: normalizeProjectMapRelationshipConfidence(item.confidence),
      sourceKind: "deterministic",
      evidence,
      fingerprint: readProjectMapRelationshipString(item, "fingerprint") ?? undefined,
    }];
  });
}

function normalizeProjectMapRelationshipModules(
  value: unknown,
): ProjectMapRelationshipModuleSummary[] {
  if (!isProjectMapRelationshipRecord(value) || !Array.isArray(value.modules)) {
    return [];
  }
  return value.modules.flatMap((item) => {
    if (!isProjectMapRelationshipRecord(item)) {
      return [];
    }
    const id = readProjectMapRelationshipString(item, "id");
    const label = readProjectMapRelationshipString(item, "label");
    if (!id || !label) {
      return [];
    }
    return [{
      id,
      label,
      fileIds: readProjectMapRelationshipStringArray(item, "fileIds"),
      fileCount: readProjectMapRelationshipNumber(item, "fileCount"),
      relationCount: readProjectMapRelationshipNumber(item, "relationCount"),
    }];
  });
}

function normalizeProjectMapRelationshipHotspotReason(
  value: string,
): ProjectMapRelationshipHotspot["reason"] {
  switch (value) {
    case "many-dependents":
    case "cross-layer-hub":
    case "missing-test":
    case "stale":
    case "large-file":
      return value;
    default:
      return "many-dependents";
  }
}

function normalizeProjectMapRelationshipHotspots(value: unknown): ProjectMapRelationshipHotspot[] {
  if (!isProjectMapRelationshipRecord(value) || !Array.isArray(value.hotspots)) {
    return [];
  }
  return value.hotspots.flatMap((item) => {
    if (!isProjectMapRelationshipRecord(item)) {
      return [];
    }
    const fileId = readProjectMapRelationshipString(item, "fileId");
    const reason = readProjectMapRelationshipString(item, "reason");
    if (!fileId || !reason) {
      return [];
    }
    return [{
      fileId,
      reason: normalizeProjectMapRelationshipHotspotReason(reason),
      score: readProjectMapRelationshipNumber(item, "score"),
      rationale: readProjectMapRelationshipString(item, "rationale") ?? undefined,
    }];
  });
}

function normalizeProjectMapRelationshipRiskFlags(
  value: unknown,
): ProjectMapRelationshipImpactSummary["riskFlags"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isProjectMapRelationshipRecord(item)) {
      return [];
    }
    const id = readProjectMapRelationshipString(item, "id");
    const label = readProjectMapRelationshipString(item, "label");
    if (!id || !label) {
      return [];
    }
    const severity = readProjectMapRelationshipString(item, "severity");
    return [{
      id,
      label,
      severity: severity === "critical" || severity === "warning" ? severity : "info",
      nodeId: readProjectMapRelationshipString(item, "nodeId")
        ?? readProjectMapRelationshipString(item, "fileId")
        ?? undefined,
    }];
  });
}

function normalizeProjectMapRelationshipImpactSummary(
  value: unknown,
): ProjectMapRelationshipImpactSummary | null {
  if (!isProjectMapRelationshipRecord(value)) {
    return null;
  }
  const generatedAt = readProjectMapRelationshipString(value, "generatedAt");
  if (!generatedAt) {
    return null;
  }
  return {
    schemaVersion: 1,
    generatedAt,
    inputFiles: readProjectMapRelationshipStringArray(value, "inputFiles"),
    changedFiles: readProjectMapRelationshipStringArray(value, "changedFiles"),
    directlyAffectedFiles: readProjectMapRelationshipStringArray(value, "directlyAffectedFiles"),
    transitivelyAffectedFiles: readProjectMapRelationshipStringArray(value, "transitivelyAffectedFiles"),
    unmappedFiles: readProjectMapRelationshipStringArray(value, "unmappedFiles"),
    ignoredFiles: readProjectMapRelationshipStringArray(value, "ignoredFiles"),
    riskFlags: normalizeProjectMapRelationshipRiskFlags(value.riskFlags),
  };
}

function normalizeProjectMapRelationshipContextPack(
  value: unknown,
): ProjectMapRelationshipAgentReadPlan | null {
  if (!isProjectMapRelationshipRecord(value)) {
    return null;
  }
  const generatedAt = readProjectMapRelationshipString(value, "generatedAt");
  const provenance = isProjectMapRelationshipRecord(value.provenance) ? value.provenance : null;
  const scanRunId = provenance
    ? readProjectMapRelationshipString(provenance, "scanRunId")
    : null;
  if (!generatedAt || !scanRunId) {
    return null;
  }
  return {
    schemaVersion: 1,
    generatedAt,
    mustReadFiles: readProjectMapRelationshipStringArray(value, "mustReadFiles"),
    relatedFiles: readProjectMapRelationshipStringArray(value, "relatedFiles"),
    testTargets: readProjectMapRelationshipStringArray(value, "testTargets"),
    contracts: readProjectMapRelationshipStringArray(value, "contracts"),
    riskFlags: normalizeProjectMapRelationshipRiskFlags(value.riskFlags),
    staleReason: readProjectMapRelationshipString(value, "staleReason") ?? undefined,
    provenance: {
      scanRunId,
      relationIds: provenance ? readProjectMapRelationshipStringArray(provenance, "relationIds") : [],
      fileIds: provenance ? readProjectMapRelationshipStringArray(provenance, "fileIds") : [],
    },
  };
}

function normalizeProjectMapRelationshipRepairIssues(
  value: unknown,
): ProjectMapRelationshipRepairIssue[] {
  if (!isProjectMapRelationshipRecord(value) || !Array.isArray(value.issues)) {
    return [];
  }
  return value.issues.flatMap((item) => {
    if (!isProjectMapRelationshipRecord(item)) {
      return [];
    }
    const id = readProjectMapRelationshipString(item, "id");
    const message = readProjectMapRelationshipString(item, "message");
    if (!id || !message) {
      return [];
    }
    return [{
      id,
      kind: (readProjectMapRelationshipString(item, "kind") ?? "unresolved-target") as ProjectMapRelationshipRepairIssue["kind"],
      severity: (readProjectMapRelationshipString(item, "severity") ?? "warning") as ProjectMapRelationshipRepairIssue["severity"],
      message,
      fileId: readProjectMapRelationshipString(item, "fileId") ?? undefined,
      relationId: readProjectMapRelationshipString(item, "relationId") ?? undefined,
      path: readProjectMapRelationshipString(item, "path") ?? undefined,
      action: (readProjectMapRelationshipString(item, "action") ?? "ignored") as ProjectMapRelationshipRepairIssue["action"],
    }];
  });
}

function normalizeProjectMapRelationshipDashboardData(
  response: ProjectMapRelationshipReadResponse,
): ProjectMapRelationshipDashboardData {
  return {
    files: normalizeProjectMapScannedFiles(response.files),
    relations: normalizeProjectMapFileRelations(response.relations),
    modules: normalizeProjectMapRelationshipModules(response.modules),
    hotspots: normalizeProjectMapRelationshipHotspots(response.modules),
    impactSummary: normalizeProjectMapRelationshipImpactSummary(response.impact),
    contextPack: normalizeProjectMapRelationshipContextPack(response.contextPack),
    repairIssues: normalizeProjectMapRelationshipRepairIssues(response.repair),
    readErrors: response.readErrors ?? [],
  };
}

function getProjectMapRelationshipRoleRank(role: string): number {
  return PROJECT_MAP_RELATIONSHIP_ROLE_PRIORITY[role] ?? 150;
}

function getProjectMapRelationshipTypeRank(type: string): number {
  return PROJECT_MAP_RELATIONSHIP_TYPE_PRIORITY[type] ?? 120;
}

function getProjectMapRelationshipConfidenceRank(confidence: ProjectMapFileRelation["confidence"]): number {
  switch (confidence) {
    case "high":
      return 10;
    case "medium":
      return 20;
    default:
      return 30;
  }
}

function isProjectMapRelationshipNoiseFile(file: ProjectMapScannedFile): boolean {
  const path = file.path.toLowerCase();
  if (
    path.startsWith(".agents/")
    || path.startsWith(".codex/")
    || path.startsWith(".claude/")
    || path.startsWith(".trellis/")
    || path.startsWith("openspec/")
    || path.startsWith("docs/")
  ) {
    return true;
  }
  return file.parseStatus === "skipped"
    || file.role === "document"
    || file.role === "infra"
    || file.role === "style"
    || file.role === "unknown";
}

function buildProjectMapRelationshipSentence(input: {
  relation: ProjectMapFileRelation;
  sourceFile?: ProjectMapScannedFile;
  targetFile?: ProjectMapScannedFile;
}): string {
  const source = input.sourceFile?.basename ?? input.relation.sourceFileId;
  const target = input.targetFile?.basename ?? input.relation.targetFileId;
  switch (input.relation.type) {
    case "imports":
      return `${source} imports ${target}`;
    case "bridges_to":
      return `${source} calls command in ${target}`;
    case "tested_by":
      return `${source} is tested by ${target}`;
    case "documents":
      return `${source} documents ${target}`;
    case "configures":
      return `${source} configures ${target}`;
    case "styled_by":
      return `${source} is styled by ${target}`;
    case "specified_by":
      return `${source} is specified by ${target}`;
    case "contains":
      return `${source} contains ${target}`;
    case "exports":
      return `${source} exports symbols`;
    default:
      return `${source} relates to ${target}`;
  }
}

export function ProjectMapPanel({
  activeWorkspace = null,
  workspaceName,
  selectedEngine = null,
  selectedModelId = null,
  models,
  dataset: controlledDataset,
  datasetController: providedDatasetController,
  changedFilePaths = [],
  changedFileSource,
  sourceFocusNodeId = null,
  onOpenEvidenceFile,
  onOpenOrchestrationTask,
}: ProjectMapPanelProps) {
  const { t, i18n } = useTranslation();
  const preferredLanguage = resolveProjectMapPreferredLanguage(
    i18n.resolvedLanguage ?? i18n.language,
  );
  const selectedGenerationModel = useMemo(
    () => resolveSelectedGenerationModel(selectedModelId, models),
    [models, selectedModelId],
  );
  const generationDefaults = useMemo(
    () => ({
      engine: selectedEngine,
      model: selectedGenerationModel,
    }),
    [selectedEngine, selectedGenerationModel],
  );
  const internalDatasetController = useProjectMapDataset(
    controlledDataset || providedDatasetController ? null : activeWorkspace,
    { generationDefaults, preferredLanguage },
  );
  const datasetController = providedDatasetController ?? internalDatasetController;
  const dataset = controlledDataset ?? datasetController.dataset;
  const projectionNodes = useMemo(
    () => normalizeProjectMapProjectionNodes(dataset.nodes),
    [dataset.nodes],
  );
  const nodeIndex = useMemo(() => buildProjectMapNodeIndex(projectionNodes), [projectionNodes]);
  const visibleLenses = useMemo(() => getVisibleProjectMapLenses(dataset), [dataset]);
  const lensIndex = useMemo(() => buildLensIndex(dataset.lenses), [dataset.lenses]);
  const rootNode = getProjectMapCoreNode(dataset);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    () => rootNode?.id ?? null,
  );
  const [deleteConfirmNodeId, setDeleteConfirmNodeId] = useState<string | null>(null);
  const [viewHistory, setViewHistory] = useState<GraphViewSnapshot[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [relationTypeFilter, setRelationTypeFilter] = useState(PROJECT_MAP_RELATION_FILTER_ALL);
  const [relationSourceKindFilter, setRelationSourceKindFilter] = useState(PROJECT_MAP_RELATION_FILTER_ALL);
  const [relationDirectionFilter, setRelationDirectionFilter] =
    useState<ProjectMapRelationDirectionFilter>("all");
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(null);
  const [pathSourceNodeId, setPathSourceNodeId] = useState<string | null>(null);
  const [pathTargetNodeId, setPathTargetNodeId] = useState<string | null>(null);
  const pathEndpointsEditedByUserRef = useRef(false);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [isLensStripCollapsed, setIsLensStripCollapsed] = useState(true);
  const [isProjectMapChromeCollapsed, setIsProjectMapChromeCollapsed] = useState(false);
  const [isNavigationPanelExpanded, setIsNavigationPanelExpanded] = useState(false);
  const [isQueryPanelExpanded, setIsQueryPanelExpanded] = useState(false);
  const [isActivityPanelExpanded, setIsActivityPanelExpanded] = useState(false);
  const [isFileRelationPanelExpanded, setIsFileRelationPanelExpanded] = useState(false);
  const [isRelationPanelExpanded, setIsRelationPanelExpanded] = useState(false);
  const [isAdvisorPanelExpanded, setIsAdvisorPanelExpanded] = useState(false);
  const [isGraphHealthExpanded, setIsGraphHealthExpanded] = useState(false);
  const [isCanvasControlsCollapsed, setIsCanvasControlsCollapsed] = useState(
    readCanvasControlsCollapsedPreference,
  );
  const [isDetailCollapsed, setIsDetailCollapsed] = useState(false);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const [candidateBatchMessage, setCandidateBatchMessage] = useState<string | null>(null);
  const [orchestrationDraftState, setOrchestrationDraftState] =
    useState<ProjectMapOrchestrationDraftState>({ status: "idle" });
  const [graphRepairSummary, setGraphRepairSummary] =
    useState<ProjectMapGraphRepairSummary | null>(dataset.graphRepair ?? null);
  const [isConfirmingAllCandidates, setIsConfirmingAllCandidates] = useState(false);
  const [selectedGraphNodeIds, setSelectedGraphNodeIds] = useState<Set<string>>(new Set());
  const [activeQuickFilters, setActiveQuickFilters] = useState<Set<ProjectMapQuickFilterId>>(new Set());
  const [selectedAdvisorHintId, setSelectedAdvisorHintId] = useState<string | null>(null);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [navigationHistory, setNavigationHistory] = useState<ProjectMapNavigationHistoryItem[]>([]);
  const [relationshipScanState, setRelationshipScanState] =
    useState<ProjectMapRelationshipScanState>({ status: "idle" });
  const [relationshipDashboardData, setRelationshipDashboardData] =
    useState<ProjectMapRelationshipDashboardData | null>(null);
  const [relationshipDashboardQuery, setRelationshipDashboardQuery] = useState("");
  const [relationshipDashboardTypeFilter, setRelationshipDashboardTypeFilter] =
    useState<string>(PROJECT_MAP_RELATION_FILTER_ALL);
  const [relationshipDashboardRoleFilter, setRelationshipDashboardRoleFilter] =
    useState<string>(PROJECT_MAP_RELATION_FILTER_ALL);
  const [showRelationshipNoiseFiles, setShowRelationshipNoiseFiles] = useState(false);
  const [relationshipDashboardViewMode, setRelationshipDashboardViewMode] =
    useState<ProjectMapRelationshipDashboardViewMode>("board");
  const [selectedRelationshipFileId, setSelectedRelationshipFileId] = useState<string | null>(null);
  const [dragPreviewPositions, setDragPreviewPositions] = useState<
    Record<string, ProjectMapGraphNodePosition>
  >({});
  const [viewport, setViewport] = useState<GraphViewport>({
    zoom: PROJECT_MAP_DEFAULT_OVERVIEW_ZOOM,
    pan: { x: 0, y: 0 },
  });
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const panStartRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const nodeDragRef = useRef<GraphNodeDragState | null>(null);
  const suppressNextNodeClickRef = useRef(false);
  const lastAutoFitGraphKeyRef = useRef<string | null>(null);
  const lastSourceFocusNodeIdRef = useRef<string | null>(null);
  const visibleNodes = useMemo(
    () => resolveVisibleProjectMapNodes(dataset, focusNodeId),
    [dataset, focusNodeId],
  );
  const visibleNodeIdSignature = useMemo(
    () => visibleNodes.map((node) => node.id).join("|"),
    [visibleNodes],
  );
  const autoFitGraphKey = useMemo(
    () =>
      [
        dataset.manifest.storageKey,
        focusNodeId ?? "overview",
        dataset.viewState?.layoutPreset ?? "radial",
        visibleNodeIdSignature,
        isDetailCollapsed ? "detail-collapsed" : "detail-open",
      ].join("::"),
    [
      dataset.manifest.storageKey,
      dataset.viewState?.layoutPreset,
      focusNodeId,
      isDetailCollapsed,
      visibleNodeIdSignature,
    ],
  );
  const selectedNode =
    (selectedNodeId ? nodeIndex.get(selectedNodeId) : null) ??
    (focusNodeId ? nodeIndex.get(focusNodeId) : rootNode) ??
    visibleNodes[0] ??
    null;
  const selectedNavigationNodeId = selectedNode?.id ?? null;
  const fallbackPathTargetNodeId = useMemo(() => {
    if (!selectedNavigationNodeId) {
      return null;
    }
    if (rootNode?.id && rootNode.id !== selectedNavigationNodeId) {
      return rootNode.id;
    }
    return visibleNodes.find((node) => node.id !== selectedNavigationNodeId)?.id ?? null;
  }, [rootNode?.id, selectedNavigationNodeId, visibleNodes]);
  const selectedExplainPackNodeId = selectedNode?.id ?? null;
  const selectedExplainPack = useMemo(
    () =>
      selectedExplainPackNodeId
        ? buildProjectMapExplainPack({ dataset, nodeId: selectedExplainPackNodeId })
        : null,
    [dataset, selectedExplainPackNodeId],
  );
  const searchResults = useMemo(
    () => searchProjectMapNodes({ dataset, query: searchQuery, limit: 8 }),
    [dataset, searchQuery],
  );
  const activityProjection = useMemo(
    () =>
      buildProjectMapActivityProjection({
        dataset,
        changedFilePaths,
        source: changedFileSource,
      }),
    [changedFilePaths, changedFileSource, dataset],
  );
  const evidenceFileIndex = useMemo(
    () => buildProjectMapEvidenceFileIndex({ dataset }),
    [dataset],
  );
  const groupedQueryResults = useMemo(
    () =>
      searchProjectMapGrouped({
        dataset,
        query: searchQuery,
        activityProjection,
        evidenceFileIndex,
      }),
    [activityProjection, dataset, evidenceFileIndex, searchQuery],
  );
  const advisorHints = useMemo(
    () =>
      buildProjectMapAdvisorHints({
        dataset,
        activityProjection,
        queryResults: groupedQueryResults,
        selectedNodeId: selectedNode?.id ?? null,
        changedFilePaths,
      }),
    [activityProjection, changedFilePaths, dataset, groupedQueryResults, selectedNode?.id],
  );
  const selectedAdvisorHint = useMemo(
    () => advisorHints.find((hint) => hint.id === selectedAdvisorHintId) ?? null,
    [advisorHints, selectedAdvisorHintId],
  );
  const pathNodeOptions = useMemo(
    () => [...projectionNodes].sort((left, right) => left.title.localeCompare(right.title)),
    [projectionNodes],
  );
  const pathResult = useMemo(
    () =>
      buildProjectMapShortestPath({
        dataset,
        sourceNodeId: pathSourceNodeId,
        targetNodeId: pathTargetNodeId,
        emptyMessage: t("projectMap.navigation.path.empty"),
        foundMessage: t("projectMap.navigation.path.found"),
        notFoundMessage: t("projectMap.navigation.path.notFound"),
      }),
    [dataset, pathSourceNodeId, pathTargetNodeId, t],
  );
  const associationExplanation = useMemo(
    () =>
      explainProjectMapAssociationPath({
        sourceNodeId: pathSourceNodeId,
        targetNodeId: pathTargetNodeId,
        pathResult,
      }),
    [pathResult, pathSourceNodeId, pathTargetNodeId],
  );
  const refreshSummary = useMemo(
    () => classifyProjectMapRefresh({ dataset, changedFiles: changedFilePaths }),
    [changedFilePaths, dataset],
  );
  const graphIntegrityIssues = useMemo(
    () => validateProjectMapGraphIntegrity(dataset),
    [dataset],
  );
  const activeGraphRepairSummary = graphRepairSummary ?? dataset.graphRepair ?? null;
  const impactAnalysis = useMemo(
    () => buildProjectMapImpactAnalysis({ dataset, changedFilePaths, source: changedFileSource }),
    [changedFilePaths, changedFileSource, dataset],
  );
  const relationIndex = useMemo(
    () => buildProjectMapRelationIndex(dataset),
    [dataset],
  );
  const relationTypeOptions = useMemo(
    () => relationIndex.typeCounts.map((item) => item.key),
    [relationIndex.typeCounts],
  );
  const relationSourceKindOptions = useMemo(
    () => relationIndex.sourceKindCounts.map((item) => item.key),
    [relationIndex.sourceKindCounts],
  );
  const selectedNodeRelationBucket = selectedNode?.id
    ? relationIndex.byNodeId.get(selectedNode.id) ?? null
    : null;
  const filteredRelations = useMemo(
    () =>
      filterProjectMapRelations({
        relationIndex,
        selectedNodeId: selectedNode?.id ?? null,
        typeFilter: relationTypeFilter,
        sourceKindFilter: relationSourceKindFilter,
        directionFilter: relationDirectionFilter,
      }),
    [
      relationDirectionFilter,
      relationIndex,
      relationSourceKindFilter,
      relationTypeFilter,
      selectedNode?.id,
    ],
  );
  const selectedRelation = selectedRelationId
    ? relationIndex.relations.find((item) => item.relation.id === selectedRelationId) ?? null
    : null;
  const selectedNodeExplainHint = useMemo(
    () =>
      selectedNode
        ? advisorHints.find((hint) => hint.kind === "node-explain") ?? null
        : null,
    [advisorHints, selectedNode],
  );
  const hierarchyRelations = useMemo<ProjectMapHierarchyRelationView[]>(
    () =>
      dataset.nodes.flatMap((child) => {
        if (!child.parentId) {
          return [];
        }
        const parent = nodeIndex.get(child.parentId);
        return parent
          ? [
              {
                id: `hierarchy:${parent.id}:${child.id}`,
                parent,
                child,
              },
            ]
          : [];
      }),
    [dataset.nodes, nodeIndex],
  );
  const filteredHierarchyRelations = useMemo(() => {
    const matchesType =
      relationTypeFilter === PROJECT_MAP_RELATION_FILTER_ALL || relationTypeFilter === "hierarchy";
    const matchesSourceKind =
      relationSourceKindFilter === PROJECT_MAP_RELATION_FILTER_ALL ||
      relationSourceKindFilter === "map-tree";
    if (!matchesType || !matchesSourceKind) {
      return [];
    }
    if (!selectedNode?.id) {
      return hierarchyRelations;
    }
    if (relationDirectionFilter === "all") {
      return hierarchyRelations.filter(
        (relation) => relation.parent.id === selectedNode.id || relation.child.id === selectedNode.id,
      );
    }
    if (relationDirectionFilter === "incoming") {
      return hierarchyRelations.filter((relation) => relation.child.id === selectedNode.id);
    }
    return hierarchyRelations.filter((relation) => relation.parent.id === selectedNode.id);
  }, [
    hierarchyRelations,
    relationDirectionFilter,
    relationSourceKindFilter,
    relationTypeFilter,
    selectedNode?.id,
  ]);
  const relationFilteredNodeIds = useMemo(
    () =>
      new Set(
        filteredRelations.flatMap((item) => [
          item.relation.sourceNodeId,
          item.relation.targetNodeId,
        ]),
      ),
    [filteredRelations],
  );
  const selectedRelationNodeIds = useMemo(
    () =>
      new Set(
        selectedRelation
          ? [selectedRelation.relation.sourceNodeId, selectedRelation.relation.targetNodeId]
          : [],
      ),
    [selectedRelation],
  );
  const hasGraphRepairAttention = graphIntegrityIssues.length > 0;
  const visibleSectionState = useMemo<ProjectMapVisibleSectionState>(
    () => ({
      navigation: isNavigationPanelExpanded,
      query: isQueryPanelExpanded,
      activity: isActivityPanelExpanded,
      evidence: false,
      fileRelations: isFileRelationPanelExpanded,
      relations: isRelationPanelExpanded,
      advisor: isAdvisorPanelExpanded,
      health: isGraphHealthExpanded,
    }),
    [
      isActivityPanelExpanded,
      isAdvisorPanelExpanded,
      isFileRelationPanelExpanded,
      isGraphHealthExpanded,
      isNavigationPanelExpanded,
      isQueryPanelExpanded,
      isRelationPanelExpanded,
    ],
  );
  const selectedNodeStaleReasons = useMemo(
    () =>
      selectedNode
        ? getProjectMapNodeStaleReasons({
            dataset,
            nodeId: selectedNode.id,
            refreshSummary,
          })
        : [],
    [dataset, refreshSummary, selectedNode],
  );
  const deleteConfirmNode = deleteConfirmNodeId ? nodeIndex.get(deleteConfirmNodeId) ?? null : null;
  const graphLayout = useMemo(
    () =>
      buildInteractiveProjectMapLayout({
        dataset,
        visibleNodes,
        focusNodeId,
      }),
    [dataset, focusNodeId, visibleNodes],
  );
  const renderGraphLayout = useMemo(() => {
    const previewById = new Map(Object.entries(dragPreviewPositions));
    if (previewById.size === 0) {
      return graphLayout;
    }

    const positions = graphLayout.positions.map((position) => previewById.get(position.id) ?? position);
    const positionById = new Map(positions.map((position) => [position.id, position]));
    const edges = graphLayout.edges.flatMap((edge) => {
      const source = positionById.get(edge.source.id);
      const target = positionById.get(edge.target.id);
      return source && target ? [{ ...edge, source, target }] : [];
    });
    return {
      ...graphLayout,
      positions,
      edges,
    };
  }, [dragPreviewPositions, graphLayout]);
  const relationRenderEdges = useMemo(() => {
    const positionById = new Map(renderGraphLayout.positions.map((position) => [position.id, position]));
    return filteredRelations.flatMap((indexedRelation) => {
      const source = positionById.get(indexedRelation.relation.sourceNodeId);
      const target = positionById.get(indexedRelation.relation.targetNodeId);
      if (!source || !target) {
        return [];
      }
      return [{ indexedRelation, source, target }];
    });
  }, [filteredRelations, renderGraphLayout.positions]);
  const highlightProjection = useMemo(
    () =>
      buildProjectMapHighlightProjection({
        dataset,
        selectedNodeId: selectedNode?.id ?? null,
        selectedRelationId,
        pathResult,
        queryResults: groupedQueryResults,
        activityProjection,
        advisorHints: selectedAdvisorHint ? [selectedAdvisorHint] : [],
        quickFilters: activeQuickFilters,
        baseNodeIds: visibleNodes.map((node) => node.id),
        baseRelationIds: [
          ...renderGraphLayout.edges.map((edge) => edge.id),
          ...relationRenderEdges.map(({ indexedRelation }) => indexedRelation.relation.id),
        ],
      }),
    [
      activeQuickFilters,
      activityProjection,
      dataset,
      groupedQueryResults,
      pathResult,
      relationRenderEdges,
      renderGraphLayout.edges,
      selectedNode?.id,
      selectedAdvisorHint,
      selectedRelationId,
      visibleNodes,
    ],
  );
  const miniMapProjection = useMemo(() => {
    if (!renderGraphLayout.rootNodeId) {
      return null;
    }
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    return buildProjectMapMiniMapProjection({
      positions: renderGraphLayout.positions,
      nodes: visibleNodes,
      rootNodeId: renderGraphLayout.rootNodeId,
      viewport,
      canvasSize: {
        width: canvasRect?.width && canvasRect.width > 0 ? canvasRect.width : 1100,
        height: canvasRect?.height && canvasRect.height > 0 ? canvasRect.height : 680,
      },
      miniMapSize: MINI_MAP_SIZE,
    });
  }, [renderGraphLayout, viewport, visibleNodes]);
  const neighborNodeIds = useMemo(
    () => buildNeighborSet(visibleNodes, selectedNode?.id ?? null, hoverNodeId, Boolean(focusNodeId)),
    [focusNodeId, hoverNodeId, selectedNode?.id, visibleNodes],
  );
  const projectName = workspaceName?.trim() || dataset.manifest.projectName;
  const candidateCount =
    dataset.nodes.filter((node) => node.candidate).length +
    (dataset.candidates ?? []).filter((candidate) => candidate.status === "pending").length;
  const unassignedDiscoveryCount = useMemo(
    () => getProjectMapUnassignedDiscoveryChildren(dataset).length,
    [dataset],
  );
  const firstCandidateNode = useMemo(
    () => dataset.nodes.find((node) => node.candidate) ?? null,
    [dataset.nodes],
  );
  const firstPendingReviewCandidate = useMemo(
    () => (dataset.candidates ?? []).find((candidate) => candidate.status === "pending") ?? null,
    [dataset.candidates],
  );
  const pendingCandidateByNodeId = useMemo(() => {
    const entries = new Map<string, ProjectMapCandidate>();
    for (const candidate of dataset.candidates ?? []) {
      if (candidate.status !== "pending") {
        continue;
      }
      const targetNodeId = candidate.targetNodeId ?? candidate.patch.nodeId;
      if (!entries.has(targetNodeId)) {
        entries.set(targetNodeId, candidate);
      }
    }
    return entries;
  }, [dataset.candidates]);
  const staleCount = dataset.nodes.filter((node) => node.stale).length;
  const generationQueue = useMemo(() => getProjectMapGenerationQueue(dataset.runs), [dataset.runs]);
  const recentRuns = useMemo(() => getProjectMapRecentRuns(dataset.runs), [dataset.runs]);
  const activeGenerationRun = generationQueue[0] ?? null;
  const queuedGenerationRuns = generationQueue.slice(1);
  const previousGenerationQueueCountRef = useRef(generationQueue.length);
  const hubNodes = rootNode ? getSortedProjectMapChildren(rootNode, nodeIndex) : [];
  const detectedLensCount = visibleLenses.filter((lens) => lens.status === "detected").length;
  const candidateLensCount = visibleLenses.filter((lens) => lens.status === "candidate").length;
  const activeLens = selectedNode ? lensIndex.get(selectedNode.lensId) ?? null : null;
  const isPersistenceBacked = Boolean(activeWorkspace?.id) && !controlledDataset;
  const profileSummary = getProfileSummary(dataset.profile);
  const groupedQueryResultCount = groupedQueryResults.groups.reduce(
    (total, group) => total + group.results.length,
    0,
  );
  const activityItemCount = activityProjection.items.length;
  const previousViewSnapshot = viewHistory.at(-1) ?? null;
  const hasBackToParentFallback = Boolean(focusNodeId);
  const backToPreviousLabel = previousViewSnapshot
    ? t("projectMap.backToPrevious")
    : t("projectMap.backToParent");
  const fitGraphToViewport = useCallback(() => {
    if (!graphLayout.rootNodeId) {
      return;
    }

    const bounds = graphLayout.bounds;
    if (!bounds) {
      return;
    }

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const canvasSize = {
      width: canvasRect?.width && canvasRect.width > 0 ? canvasRect.width : 1100,
      height: canvasRect?.height && canvasRect.height > 0 ? canvasRect.height : 680,
    };
    const fallbackZoom = focusNodeId
      ? PROJECT_MAP_DEFAULT_FOCUS_ZOOM
      : PROJECT_MAP_DEFAULT_OVERVIEW_ZOOM;
    const fittedViewport = calculateProjectMapFitViewport(bounds, canvasSize, fallbackZoom);
    const detailFocusOffset = getDetailPanelFocusOffset({
      canvasElement: canvasRef.current,
      isDetailCollapsed,
    });
    setViewport({
      ...fittedViewport,
      pan: {
        ...fittedViewport.pan,
        x: Number((fittedViewport.pan.x + detailFocusOffset).toFixed(2)),
      },
    });
  }, [focusNodeId, graphLayout.bounds, graphLayout.rootNodeId, isDetailCollapsed]);

  const persistGraphPositions = useCallback(
    async (input: {
      positions: ProjectMapGraphNodePosition[];
      preset?: ProjectMapLayoutPreset;
      pinnedNodeIds: Set<string>;
      updatedAt: string;
    }) => {
      const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
      await datasetController.updateDataset((currentDataset) => {
        const currentLayouts = currentDataset.viewState?.nodeLayouts ?? {};
        const retainedLayouts = Object.fromEntries(
          Object.entries(currentLayouts).filter(([nodeId]) => !visibleNodeIds.has(nodeId)),
        );
        return {
          ...currentDataset,
          manifest: {
            ...currentDataset.manifest,
            updatedAt: input.updatedAt,
          },
          viewState: {
            ...buildProjectMapViewState({
              current: currentDataset.viewState,
              preset: input.preset,
              positions: input.positions,
              pinnedNodeIds: input.pinnedNodeIds,
              updatedAt: input.updatedAt,
            }),
            nodeLayouts: {
              ...retainedLayouts,
              ...buildProjectMapViewState({
                current: currentDataset.viewState,
                preset: input.preset,
                positions: input.positions,
                pinnedNodeIds: input.pinnedNodeIds,
                updatedAt: input.updatedAt,
              }).nodeLayouts,
            },
          },
        };
      });
    },
    [datasetController, visibleNodes],
  );

  const clearGraphInteractionDraft = useCallback(() => {
    nodeDragRef.current = null;
    panStartRef.current = null;
    suppressNextNodeClickRef.current = false;
    setDragPreviewPositions({});
  }, []);

  const handleCanvasControlsToggle = useCallback(() => {
    setIsCanvasControlsCollapsed((current) => {
      const nextCollapsed = !current;
      writeCanvasControlsCollapsedPreference(nextCollapsed);
      return nextCollapsed;
    });
  }, []);

  const handleAutoLayout = useCallback(() => {
    if (!renderGraphLayout.rootNodeId) {
      return;
    }
    clearGraphInteractionDraft();
    const currentPinnedNodeIds = new Set(
      Object.entries(dataset.viewState?.nodeLayouts ?? {})
        .filter(([, layout]) => layout.pinned === true)
        .map(([nodeId]) => nodeId),
    );
    const settledPositions = settleProjectMapLayout({
      positions: renderGraphLayout.positions,
      nodes: visibleNodes,
      rootNodeId: renderGraphLayout.rootNodeId,
      preservePinned: true,
    });
    void persistGraphPositions({
      positions: settledPositions,
      pinnedNodeIds: currentPinnedNodeIds,
      updatedAt: new Date().toISOString(),
    });
  }, [clearGraphInteractionDraft, dataset.viewState?.nodeLayouts, persistGraphPositions, renderGraphLayout, visibleNodes]);

  const handleResetLayout = useCallback(() => {
    const updatedAt = new Date().toISOString();
    clearGraphInteractionDraft();
    void datasetController.updateDataset((currentDataset) => ({
      ...currentDataset,
      manifest: {
        ...currentDataset.manifest,
        updatedAt,
      },
      viewState: resetProjectMapViewState(currentDataset.viewState, updatedAt),
    }));
    setSelectedGraphNodeIds(new Set());
  }, [clearGraphInteractionDraft, datasetController]);

  const handleLayoutPresetChange = useCallback(
    (preset: ProjectMapLayoutPreset) => {
      clearGraphInteractionDraft();
      const currentPinnedNodeIds = new Set(
        Object.entries(dataset.viewState?.nodeLayouts ?? {})
          .filter(([, layout]) => layout.pinned === true)
          .map(([nodeId]) => nodeId),
      );
      const presetLayout = buildInteractiveProjectMapLayout({
        dataset: {
          ...dataset,
          viewState: {
            layoutPreset: preset,
            nodeLayouts: Object.fromEntries(
              Object.entries(dataset.viewState?.nodeLayouts ?? {}).filter(
                ([, layout]) => layout.pinned === true,
              ),
            ),
            updatedAt: dataset.viewState?.updatedAt,
          },
        },
        visibleNodes,
        focusNodeId,
        preset,
      });
      void persistGraphPositions({
        positions: presetLayout.positions,
        preset,
        pinnedNodeIds: currentPinnedNodeIds,
        updatedAt: new Date().toISOString(),
      });
    },
    [clearGraphInteractionDraft, dataset, focusNodeId, persistGraphPositions, visibleNodes],
  );

  useEffect(() => {
    if (generationQueue.length > previousGenerationQueueCountRef.current) {
      setIsTaskDrawerOpen(true);
    }
    previousGenerationQueueCountRef.current = generationQueue.length;
  }, [generationQueue.length]);

  useEffect(() => {
    if (!graphLayout.rootNodeId || !graphLayout.bounds) {
      return;
    }
    if (lastAutoFitGraphKeyRef.current === autoFitGraphKey) {
      return;
    }
    lastAutoFitGraphKeyRef.current = autoFitGraphKey;
    fitGraphToViewport();
  }, [autoFitGraphKey, fitGraphToViewport, graphLayout.bounds, graphLayout.rootNodeId]);

  useEffect(() => {
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
    setSelectedGraphNodeIds((current) => {
      const nextSelection = new Set(
        [...current].filter((nodeId) => visibleNodeIds.has(nodeId)),
      );
      return nextSelection.size === current.size ? current : nextSelection;
    });
  }, [visibleNodes]);

  useEffect(() => {
    if (pathEndpointsEditedByUserRef.current) {
      return;
    }
    if (!selectedNavigationNodeId) {
      return;
    }
    setPathSourceNodeId((current) =>
      current === selectedNavigationNodeId ? current : selectedNavigationNodeId,
    );
    setPathTargetNodeId((current) => {
      if (current && current !== selectedNavigationNodeId && nodeIndex.has(current)) {
        return current;
      }
      return fallbackPathTargetNodeId;
    });
  }, [fallbackPathTargetNodeId, nodeIndex, selectedNavigationNodeId]);

  useEffect(() => {
    if (
      relationTypeFilter !== PROJECT_MAP_RELATION_FILTER_ALL &&
      !relationTypeOptions.includes(relationTypeFilter)
    ) {
      setRelationTypeFilter(PROJECT_MAP_RELATION_FILTER_ALL);
    }
  }, [relationTypeFilter, relationTypeOptions]);

  useEffect(() => {
    if (
      relationSourceKindFilter !== PROJECT_MAP_RELATION_FILTER_ALL &&
      !relationSourceKindOptions.includes(relationSourceKindFilter)
    ) {
      setRelationSourceKindFilter(PROJECT_MAP_RELATION_FILTER_ALL);
    }
  }, [relationSourceKindFilter, relationSourceKindOptions]);

  useEffect(() => {
    if (
      selectedRelationId &&
      !relationIndex.relations.some((item) => item.relation.id === selectedRelationId)
    ) {
      setSelectedRelationId(null);
    }
  }, [relationIndex.relations, selectedRelationId]);

  useEffect(() => {
    setGraphRepairSummary(dataset.graphRepair ?? null);
  }, [dataset.graphRepair]);

  useEffect(() => {
    setPathSourceNodeId((current) =>
      current && nodeIndex.has(current)
        ? current
        : rootNode?.id ?? pathNodeOptions[0]?.id ?? null,
    );
    setPathTargetNodeId((current) =>
      current && nodeIndex.has(current)
        ? current
        : selectedNode?.id ?? pathNodeOptions.find((node) => node.id !== rootNode?.id)?.id ?? null,
    );
  }, [nodeIndex, pathNodeOptions, rootNode?.id, selectedNode?.id]);

  const handlePathSourceNodeChange = useCallback((nodeId: string | null) => {
    pathEndpointsEditedByUserRef.current = true;
    setPathSourceNodeId(nodeId);
  }, []);

  const handlePathTargetNodeChange = useCallback((nodeId: string | null) => {
    pathEndpointsEditedByUserRef.current = true;
    setPathTargetNodeId(nodeId);
  }, []);

  const handleQuickFilterToggle = useCallback((filterId: ProjectMapQuickFilterId) => {
    setActiveQuickFilters((current) => {
      const nextFilters = new Set(current);
      if (nextFilters.has(filterId)) {
        nextFilters.delete(filterId);
      } else {
        nextFilters.add(filterId);
      }
      return nextFilters;
    });
  }, []);

  const rememberQuery = useCallback((query: string) => {
    const normalizedQuery = normalizeLocalHistoryLabel(query);
    if (!normalizedQuery) {
      return;
    }
    setQueryHistory((current) =>
      appendUniqueLocalHistory(current, normalizedQuery, (item) => item),
    );
  }, []);

  const handleSearchQueryChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const rememberNavigationItem = useCallback((item: ProjectMapNavigationHistoryItem) => {
    setNavigationHistory((current) =>
      appendUniqueLocalHistory(current, item, (historyItem) => historyItem.id),
    );
  }, []);

  const handleNodeSelect = (node: ProjectMapNode) => {
    setHoverNodeId(null);
    setSelectedNodeId(node.id);
    setIsDetailCollapsed(false);
    setSelectedGraphNodeIds(new Set([node.id]));
  };

  const rememberCurrentView = useCallback(() => {
    const snapshot: GraphViewSnapshot = {
      focusNodeId,
      selectedNodeId,
    };
    setViewHistory((current) => {
      const lastSnapshot = current.at(-1);
      if (
        lastSnapshot?.focusNodeId === snapshot.focusNodeId &&
        lastSnapshot.selectedNodeId === snapshot.selectedNodeId
      ) {
        return current;
      }
      return [...current.slice(-7), snapshot];
    });
  }, [focusNodeId, selectedNodeId]);

  const focusNavigationNode = useCallback((nodeId: string | null) => {
    if (!nodeId) {
      return;
    }
    const targetNode = nodeIndex.get(nodeId);
    if (!targetNode) {
      return;
    }
    rememberCurrentView();
    setHoverNodeId(null);
    setSelectedNodeId(targetNode.id);
    rememberNavigationItem({
      id: `node:${targetNode.id}`,
      kind: "node",
      label: targetNode.title,
      nodeId: targetNode.id,
    });
    setFocusNodeId(
      targetNode.parentId && targetNode.parentId !== rootNode?.id
        ? targetNode.parentId
        : null,
    );
    setIsDetailCollapsed(false);
    setSelectedGraphNodeIds(new Set([targetNode.id]));
  }, [nodeIndex, rememberCurrentView, rememberNavigationItem, rootNode?.id]);

  const activateWorkbenchTarget = useCallback((target: {
    nodeIds: string[];
    relationIds: string[];
  }) => {
    const focusableNodeId = target.nodeIds.find((nodeId) => nodeIndex.has(nodeId)) ?? null;
    if (focusableNodeId) {
      focusNavigationNode(focusableNodeId);
      return;
    }
    const selectableRelationId = target.relationIds.find((relationId) =>
      relationIndex.relations.some((item) => item.relation.id === relationId),
    ) ?? null;
    if (selectableRelationId) {
      setSelectedRelationId(selectableRelationId);
      setIsRelationPanelExpanded(true);
    }
  }, [focusNavigationNode, nodeIndex, relationIndex.relations]);

  const handleQueryResultActivate = useCallback((result: ProjectMapQueryResult) => {
    rememberQuery(searchQuery);
    activateWorkbenchTarget(result);
  }, [activateWorkbenchTarget, rememberQuery, searchQuery]);

  const handleAdvisorHintActivate = useCallback((hint: ProjectMapAdvisorHint) => {
    setSelectedAdvisorHintId(hint.id);
    activateWorkbenchTarget(hint);
  }, [activateWorkbenchTarget]);

  const handlePathNavigationRemember = useCallback(() => {
    const sourceNode = pathSourceNodeId ? nodeIndex.get(pathSourceNodeId) ?? null : null;
    const targetNode = pathTargetNodeId ? nodeIndex.get(pathTargetNodeId) ?? null : null;
    if (!sourceNode || !targetNode) {
      return;
    }
    rememberNavigationItem({
      id: `path:${sourceNode.id}:${targetNode.id}`,
      kind: "path",
      label: `${sourceNode.title} → ${targetNode.title}`,
      sourceNodeId: sourceNode.id,
      targetNodeId: targetNode.id,
    });
  }, [nodeIndex, pathSourceNodeId, pathTargetNodeId, rememberNavigationItem]);

  useEffect(() => {
    if (!pathEndpointsEditedByUserRef.current) {
      return;
    }
    handlePathNavigationRemember();
  }, [handlePathNavigationRemember]);

  const handleNavigationHistoryActivate = useCallback((item: ProjectMapNavigationHistoryItem) => {
    if (item.kind === "path") {
      pathEndpointsEditedByUserRef.current = true;
      setPathSourceNodeId(item.sourceNodeId ?? null);
      setPathTargetNodeId(item.targetNodeId ?? null);
      setIsNavigationPanelExpanded(true);
      return;
    }
    focusNavigationNode(item.nodeId ?? null);
  }, [focusNavigationNode]);

  useEffect(() => {
    if (!sourceFocusNodeId || lastSourceFocusNodeIdRef.current === sourceFocusNodeId) {
      return;
    }

    lastSourceFocusNodeIdRef.current = sourceFocusNodeId;
    if (!nodeIndex.has(sourceFocusNodeId)) {
      setFocusNodeId(null);
      setSelectedNodeId(rootNode?.id ?? null);
      setSelectedGraphNodeIds(new Set());
      setSelectedRelationId(null);
      return;
    }

    focusNavigationNode(sourceFocusNodeId);
  }, [focusNavigationNode, nodeIndex, rootNode?.id, sourceFocusNodeId]);

  const handleRelationFocusNode = (nodeId: string) => {
    focusNavigationNode(nodeId);
  };

  const handleRelationSelect = (relationId: string) => {
    setSelectedRelationId(relationId);
  };

  const handleDrillIn = (node: ProjectMapNode | null) => {
    if (!node || node.children.length === 0 || node.id === rootNode?.id || focusNodeId === node.id) {
      return;
    }
    rememberCurrentView();
    setHoverNodeId(null);
    setSelectedNodeId(node.id);
    setFocusNodeId(node.id);
  };

  const handleDrillUp = (node: ProjectMapNode | null) => {
    if (!node?.parentId || node.parentId === rootNode?.id) {
      handleBackToOverview();
      return;
    }

    setHoverNodeId(null);
    setSelectedNodeId(node.parentId);
    setFocusNodeId(node.parentId);
  };

  const handleBackToOverview = () => {
    setFocusNodeId(null);
    setSelectedNodeId(rootNode?.id ?? null);
    setHoverNodeId(null);
    setViewHistory([]);
  };

  const handleBackToPreviousView = () => {
    if (previousViewSnapshot) {
      setFocusNodeId(previousViewSnapshot.focusNodeId);
      setSelectedNodeId(previousViewSnapshot.selectedNodeId ?? rootNode?.id ?? null);
      setHoverNodeId(null);
      setViewHistory((current) => current.slice(0, -1));
      return;
    }

    if (!focusNodeId) {
      return;
    }

    handleDrillUp(nodeIndex.get(focusNodeId) ?? null);
  };

  const handleCandidateReviewClick = () => {
    const targetNodeId =
      firstPendingReviewCandidate?.targetNodeId ??
      firstPendingReviewCandidate?.patch.nodeId ??
      firstCandidateNode?.id ??
      null;
    if (!targetNodeId) {
      return;
    }
    const targetNode = nodeIndex.get(targetNodeId) ?? null;
    if (!targetNode) {
      return;
    }

    setHoverNodeId(null);
    setSelectedNodeId(targetNode.id);
    setFocusNodeId(
      targetNode.parentId && targetNode.parentId !== rootNode?.id
        ? targetNode.parentId
        : null,
    );
    setIsDetailCollapsed(false);
  };

  const handleConfirmAllCandidatesClick = async () => {
    setIsConfirmingAllCandidates(true);
    setCandidateBatchMessage(null);
    try {
      const result = await datasetController.confirmAllCandidates();
      setCandidateBatchMessage(
        t("projectMap.confirmAllCandidatesResult", {
          confirmed: result.confirmed,
          skipped: result.skipped,
        }),
      );
    } finally {
      setIsConfirmingAllCandidates(false);
    }
  };

  const handleRepairGraphIntegrity = async () => {
    let latestSummary: ProjectMapGraphRepairSummary | null = null;
    await datasetController.updateDataset((currentDataset) => {
      const repaired = repairProjectMapGraphIntegrity({ dataset: currentDataset });
      latestSummary = repaired.summary;
      return repaired.dataset;
    });
    setGraphRepairSummary(latestSummary);
  };

  const handleRequestDeleteSelectedNode = () => {
    if (!selectedNode) {
      return;
    }
    setDeleteConfirmNodeId(selectedNode.id);
  };

  const handleCreateOrchestrationTaskDraft = useCallback(() => {
    if (!selectedNode) {
      return;
    }
    const workspaceId = resolveProjectMapOrchestrationWorkspaceId({
      activeWorkspace,
      dataset,
      workspaceName,
    });
    if (!workspaceId) {
      setOrchestrationDraftState({
        status: "failed",
        nodeId: selectedNode.id,
        reason: "missing-workspace",
      });
      return;
    }
    const draft = buildProjectMapOrchestrationTaskDraft({
      workspaceId,
      dataset,
      nodeId: selectedNode.id,
    });
    if (!draft) {
      setOrchestrationDraftState({
        status: "failed",
        nodeId: selectedNode.id,
        reason: "missing-node",
      });
      return;
    }
    saveOrchestrationTaskStore(upsertOrchestrationTask(loadOrchestrationTaskStore(), draft));
    setOrchestrationDraftState({
      status: "created",
      nodeId: selectedNode.id,
      taskId: draft.taskId,
      taskStatus: draft.status,
      evidenceCount: draft.evidenceRefs.length,
      riskCount: draft.riskMarkers.length,
    });
    onOpenOrchestrationTask?.(draft.taskId);
  }, [activeWorkspace, dataset, onOpenOrchestrationTask, selectedNode, workspaceName]);

  const handleConfirmDeleteNode = async () => {
    if (!deleteConfirmNode) {
      setDeleteConfirmNodeId(null);
      return;
    }

    const parentId = deleteConfirmNode.parentId ?? null;
    const deleted = await datasetController.deleteNode(deleteConfirmNode.id);
    if (!deleted) {
      return;
    }
    setHoverNodeId(null);
    setSelectedNodeId(parentId);
    setFocusNodeId(parentId && parentId !== rootNode?.id ? parentId : null);
    if (!parentId) {
      setViewHistory([]);
    }
    setDeleteConfirmNodeId(null);
  };

  const handleOpenTraceTarget = useCallback(
    (target: ProjectMapTraceTarget) => {
      onOpenEvidenceFile?.(
        target.path,
        target.line ? { line: target.line, column: 1 } : undefined,
      );
    },
    [onOpenEvidenceFile],
  );

  const updateZoom = (nextZoom: number) => {
    setViewport((current) => ({
      ...current,
      zoom: clampProjectMapGraphZoom(nextZoom),
    }));
  };

  const handleCanvasPointerDown = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if ((event.target as HTMLElement).closest("button, aside, .project-map-node")) {
      return;
    }
    panStartRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewport.pan.x,
      originY: viewport.pan.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const updateNodeDragPreview = (
    event: PointerEvent<HTMLDivElement>,
  ): boolean => {
    const nodeDrag = nodeDragRef.current;
    if (!nodeDrag || nodeDrag.pointerId !== event.pointerId) {
      return false;
    }

    const deltaX = (event.clientX - nodeDrag.startClientX) / viewport.zoom;
    const deltaY = (event.clientY - nodeDrag.startClientY) / viewport.zoom;
    nodeDrag.didMove = nodeDrag.didMove || Math.hypot(deltaX, deltaY) > 3;
    const previewEntries = nodeDrag.nodeIds.flatMap((nodeId) => {
      const originPosition = nodeDrag.originPositions.get(nodeId);
      if (!originPosition) {
        return [];
      }
      return [
        [
          nodeId,
          {
            ...originPosition,
            x: Number((originPosition.x + deltaX).toFixed(2)),
            y: Number((originPosition.y + deltaY).toFixed(2)),
            pinned: true,
          },
        ] as const,
      ];
    });
    nodeDrag.previewPositions = new Map(previewEntries);
    setDragPreviewPositions(
      Object.fromEntries(previewEntries),
    );
    return true;
  };

  const finishNodeDrag = (event: PointerEvent<HTMLDivElement>): boolean => {
    const nodeDrag = nodeDragRef.current;
    if (!nodeDrag || nodeDrag.pointerId !== event.pointerId) {
      return false;
    }

    nodeDragRef.current = null;
    const draggedPositions = nodeDrag.nodeIds.flatMap((nodeId) => {
      const previewPosition = nodeDrag.previewPositions.get(nodeId);
      const originPosition = nodeDrag.originPositions.get(nodeId);
      return previewPosition ?? originPosition ?? [];
    });
    setSelectedGraphNodeIds(new Set(nodeDrag.nodeIds));
    suppressNextNodeClickRef.current = nodeDrag.didMove;
    if (draggedPositions.length > 0) {
      void persistGraphPositions({
        positions: draggedPositions,
        pinnedNodeIds: new Set(nodeDrag.nodeIds),
        updatedAt: new Date().toISOString(),
      }).finally(() => {
        setDragPreviewPositions({});
      });
    } else {
      setDragPreviewPositions({});
    }
    return true;
  };

  const handleCanvasPointerMove = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (updateNodeDragPreview(event)) {
      return;
    }

    const start = panStartRef.current;
    if (!start || start.pointerId !== event.pointerId) {
      return;
    }
    setViewport((current) => ({
      ...current,
      pan: {
        x: start.originX + event.clientX - start.startX,
        y: start.originY + event.clientY - start.startY,
      },
    }));
  };

  const handleCanvasPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (finishNodeDrag(event)) {
      return;
    }

    if (panStartRef.current?.pointerId === event.pointerId) {
      panStartRef.current = null;
    }
  };

  const handleCanvasWheel = (event: WheelEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, aside")) {
      return;
    }

    event.preventDefault();
    const canvasRect = event.currentTarget.getBoundingClientRect();
    const anchor = {
      x: event.clientX - canvasRect.left - canvasRect.width / 2,
      y: event.clientY - canvasRect.top - canvasRect.height / 2,
    };
    const zoomDelta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;

    setViewport((current) => {
      const nextZoom = clampProjectMapGraphZoom(current.zoom + zoomDelta);
      if (nextZoom === current.zoom) {
        return current;
      }

      const anchoredGraphPoint = {
        x: (anchor.x - current.pan.x) / current.zoom,
        y: (anchor.y - current.pan.y) / current.zoom,
      };

      return {
        zoom: nextZoom,
        pan: {
          x: Number((anchor.x - anchoredGraphPoint.x * nextZoom).toFixed(2)),
          y: Number((anchor.y - anchoredGraphPoint.y * nextZoom).toFixed(2)),
        },
      };
    });
  };

  const handleNodeKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    node: ProjectMapNode,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    handleNodeSelect(node);
  };

  const handleNodePointerDown = (
    event: PointerEvent<HTMLDivElement>,
    node: ProjectMapNode,
  ) => {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }
    event.stopPropagation();
    const positionById = new Map(renderGraphLayout.positions.map((position) => [position.id, position]));
    const nodeIds = selectedGraphNodeIds.has(node.id)
      ? [...selectedGraphNodeIds].filter((nodeId) => positionById.has(nodeId))
      : [node.id];
    const originPositions = new Map(
      nodeIds.flatMap((nodeId) => {
        const position = positionById.get(nodeId);
        return position ? [[nodeId, position]] : [];
      }),
    );
    if (originPositions.size === 0) {
      return;
    }

    nodeDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      nodeIds,
      originPositions,
      previewPositions: new Map(),
      didMove: false,
    };
    setSelectedNodeId(node.id);
    setIsDetailCollapsed(false);
    setSelectedGraphNodeIds(new Set(nodeIds));
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleNodePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (updateNodeDragPreview(event)) {
      event.stopPropagation();
    }
  };

  const handleNodePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (finishNodeDrag(event)) {
      event.stopPropagation();
    }
  };

  const handleNodeClick = (
    event: MouseEvent<HTMLDivElement>,
    node: ProjectMapNode,
  ) => {
    if (suppressNextNodeClickRef.current) {
      suppressNextNodeClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.shiftKey || event.metaKey) {
      setHoverNodeId(null);
      setSelectedNodeId(node.id);
      setIsDetailCollapsed(false);
      setSelectedGraphNodeIds((current) => {
        const nextSelection = new Set(current);
        if (nextSelection.has(node.id)) {
          nextSelection.delete(node.id);
        } else {
          nextSelection.add(node.id);
        }
        if (nextSelection.size === 0) {
          nextSelection.add(node.id);
        }
        return nextSelection;
      });
      return;
    }

    handleNodeSelect(node);
  };

  const handleMiniMapClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!miniMapProjection) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const graphPoint = miniMapProjection.unprojectPoint({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
    const graphCenter = {
      x: PROJECT_MAP_GRAPH_WIDTH / 2,
      y: PROJECT_MAP_GRAPH_HEIGHT / 2,
    };
    setViewport((current) => ({
      ...current,
      pan: {
        x: Number((-(graphPoint.x - graphCenter.x) * current.zoom).toFixed(2)),
        y: Number((-(graphPoint.y - graphCenter.y) * current.zoom).toFixed(2)),
      },
    }));
  };

  const handleRelationshipScanClick = useCallback(() => {
    if (!activeWorkspace?.id || relationshipScanState.status === "running") {
      return;
    }

    setRelationshipScanState({ status: "running" });
    void scanProjectMapRelationships({
      workspaceId: activeWorkspace.id,
      options: {
        maxFiles: 10_000,
        includeIgnoredHints: true,
        changedFiles: changedFilePaths.length ? changedFilePaths : undefined,
      },
      storageLocation: datasetController.activeReadLocation,
    })
      .then(async (summary) => {
        setRelationshipScanState({ status: "success", summary });
        setIsFileRelationPanelExpanded(true);
        try {
          const response = await readProjectMapRelationships({
            workspaceId: activeWorkspace.id,
            storageLocation: datasetController.activeReadLocation,
          });
          setRelationshipDashboardData(normalizeProjectMapRelationshipDashboardData(response));
          setSelectedRelationshipFileId(null);
        } catch {
          setRelationshipDashboardData(null);
        }
      })
      .catch((error) => {
        setRelationshipScanState({
          status: "failed",
          message: normalizeProjectMapRelationshipError(error),
        });
      });
  }, [
    activeWorkspace?.id,
    changedFilePaths,
    datasetController.activeReadLocation,
    relationshipScanState.status,
  ]);

  useEffect(() => {
    if (!activeWorkspace?.id) {
      setRelationshipScanState({ status: "idle" });
      setRelationshipDashboardData(null);
      setSelectedRelationshipFileId(null);
      return;
    }

    let cancelled = false;
    void readProjectMapRelationships({
      workspaceId: activeWorkspace.id,
      storageLocation: datasetController.activeReadLocation,
    })
      .then((response) => {
        if (cancelled) {
          return;
        }
        const summary = normalizeProjectMapRelationshipReadSummary(response);
        const dashboardData = normalizeProjectMapRelationshipDashboardData(response);
        setRelationshipDashboardData(summary ? dashboardData : null);
        setRelationshipScanState((current) => {
          if (current.status === "running") {
            return current;
          }
          if (!summary) {
            return { status: "idle" };
          }
          if (current.status === "success" && current.summary.scanRunId === summary.scanRunId) {
            return current;
          }
          return { status: "success", summary };
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const message = normalizeProjectMapRelationshipError(error);
        setRelationshipDashboardData(null);
        setRelationshipScanState((current) =>
          current.status === "running" ? current : { status: "failed", message },
        );
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspace?.id, datasetController.activeReadLocation]);

  const relationshipDashboardFileIndex = useMemo(() => {
    const index = new Map<string, ProjectMapScannedFile>();
    relationshipDashboardData?.files.forEach((file) => {
      index.set(file.id, file);
    });
    return index;
  }, [relationshipDashboardData]);

  const relationshipDashboardModuleByFileId = useMemo(() => {
    const index = new Map<string, string>();
    relationshipDashboardData?.modules.forEach((module) => {
      module.fileIds.forEach((fileId) => {
        index.set(fileId, module.label);
      });
    });
    return index;
  }, [relationshipDashboardData]);

  const relationshipDashboardTypeOptions = useMemo(() => {
    const types = new Set<string>();
    relationshipDashboardData?.relations.forEach((relation) => {
      types.add(relation.type);
    });
    return Array.from(types).sort((left, right) => (
      getProjectMapRelationshipTypeRank(left) - getProjectMapRelationshipTypeRank(right)
      || left.localeCompare(right)
    ));
  }, [relationshipDashboardData]);

  const relationshipDashboardRelationCountByFile = useMemo(() => {
    const counts = new Map<string, number>();
    relationshipDashboardData?.relations.forEach((relation) => {
      counts.set(relation.sourceFileId, (counts.get(relation.sourceFileId) ?? 0) + 1);
      counts.set(relation.targetFileId, (counts.get(relation.targetFileId) ?? 0) + 1);
    });
    return counts;
  }, [relationshipDashboardData]);

  const relationshipDashboardDirectionCountByFile = useMemo(() => {
    const counts = new Map<string, { incoming: number; outgoing: number }>();
    relationshipDashboardData?.relations.forEach((relation) => {
      const sourceCount = counts.get(relation.sourceFileId) ?? { incoming: 0, outgoing: 0 };
      sourceCount.outgoing += 1;
      counts.set(relation.sourceFileId, sourceCount);
      const targetCount = counts.get(relation.targetFileId) ?? { incoming: 0, outgoing: 0 };
      targetCount.incoming += 1;
      counts.set(relation.targetFileId, targetCount);
    });
    return counts;
  }, [relationshipDashboardData]);

  const relationshipDashboardRoleOptions = useMemo(() => {
    if (!relationshipDashboardData) {
      return [];
    }
    const roles = new Set<string>();
    relationshipDashboardData.files.forEach((file) => {
      if (showRelationshipNoiseFiles || !isProjectMapRelationshipNoiseFile(file)) {
        roles.add(file.role);
      }
    });
    return Array.from(roles).sort((left, right) => (
      getProjectMapRelationshipRoleRank(left) - getProjectMapRelationshipRoleRank(right)
      || left.localeCompare(right)
    ));
  }, [relationshipDashboardData, showRelationshipNoiseFiles]);

  const relationshipDashboardFilteredFiles = useMemo(() => {
    if (!relationshipDashboardData) {
      return [];
    }
    const query = relationshipDashboardQuery.trim().toLowerCase();
    const filtered = relationshipDashboardData.files
      .filter((file) => showRelationshipNoiseFiles || !isProjectMapRelationshipNoiseFile(file))
      .filter((file) => (
        relationshipDashboardRoleFilter === PROJECT_MAP_RELATION_FILTER_ALL
        || file.role === relationshipDashboardRoleFilter
      ))
      .filter((file) => {
        if (!query) {
          return true;
        }
          const moduleLabel = relationshipDashboardModuleByFileId.get(file.id) ?? "";
          return [
            file.path,
            file.basename,
            file.language,
            file.layer,
            file.role,
            moduleLabel,
          ].some((value) => value.toLowerCase().includes(query));
      })
      .sort((left, right) => {
        const leftRank = getProjectMapRelationshipRoleRank(left.role);
        const rightRank = getProjectMapRelationshipRoleRank(right.role);
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        const leftCount = relationshipDashboardRelationCountByFile.get(left.id) ?? 0;
        const rightCount = relationshipDashboardRelationCountByFile.get(right.id) ?? 0;
        if (leftCount !== rightCount) {
          return rightCount - leftCount;
        }
        return left.path.localeCompare(right.path);
      });
    return filtered.slice(0, PROJECT_MAP_RELATIONSHIP_LIST_LIMIT);
  }, [
    relationshipDashboardData,
    relationshipDashboardModuleByFileId,
    relationshipDashboardQuery,
    relationshipDashboardRelationCountByFile,
    relationshipDashboardRoleFilter,
    showRelationshipNoiseFiles,
  ]);

  const relationshipDashboardVisibleFileTotal = useMemo(() => {
    if (!relationshipDashboardData) {
      return 0;
    }
    const query = relationshipDashboardQuery.trim().toLowerCase();
    return relationshipDashboardData.files
      .filter((file) => showRelationshipNoiseFiles || !isProjectMapRelationshipNoiseFile(file))
      .filter((file) => (
        relationshipDashboardRoleFilter === PROJECT_MAP_RELATION_FILTER_ALL
        || file.role === relationshipDashboardRoleFilter
      ))
      .filter((file) => {
        if (!query) {
          return true;
        }
        const moduleLabel = relationshipDashboardModuleByFileId.get(file.id) ?? "";
        return [
          file.path,
          file.basename,
          file.language,
          file.layer,
          file.role,
          moduleLabel,
        ].some((value) => value.toLowerCase().includes(query));
      }).length;
  }, [
    relationshipDashboardData,
    relationshipDashboardModuleByFileId,
    relationshipDashboardQuery,
    relationshipDashboardRoleFilter,
    showRelationshipNoiseFiles,
  ]);

  const selectedRelationshipFile = useMemo(() => {
    if (!relationshipDashboardData?.files.length) {
      return null;
    }
    if (selectedRelationshipFileId) {
      const selectedFile = relationshipDashboardFileIndex.get(selectedRelationshipFileId);
      if (selectedFile) {
        return selectedFile;
      }
    }
    return relationshipDashboardFilteredFiles[0] ?? relationshipDashboardData.files[0] ?? null;
  }, [
    relationshipDashboardData,
    relationshipDashboardFileIndex,
    relationshipDashboardFilteredFiles,
    selectedRelationshipFileId,
  ]);

  const relationshipDashboardBoardGroups = useMemo(() => {
    const groups = new Map<string, ProjectMapScannedFile[]>();
    relationshipDashboardFilteredFiles.forEach((file) => {
      const roleGroup = file.role || "unknown";
      const files = groups.get(roleGroup) ?? [];
      files.push(file);
      groups.set(roleGroup, files);
    });
    return Array.from(groups.entries())
      .sort(([left], [right]) => (
        getProjectMapRelationshipRoleRank(left) - getProjectMapRelationshipRoleRank(right)
        || left.localeCompare(right)
      ))
      .slice(0, 8)
      .map(([role, files]) => ({
        role,
        files: files.slice(0, 18),
        total: files.length,
      }));
  }, [relationshipDashboardFilteredFiles]);

  const selectedRelationshipRelations = useMemo(() => {
    if (!relationshipDashboardData || !selectedRelationshipFile) {
      return [];
    }
    return relationshipDashboardData.relations
      .filter((relation) => {
        const isSelectedEdge =
          relation.sourceFileId === selectedRelationshipFile.id
          || relation.targetFileId === selectedRelationshipFile.id;
        const typeMatches =
          relationshipDashboardTypeFilter === PROJECT_MAP_RELATION_FILTER_ALL
          || relation.type === relationshipDashboardTypeFilter;
        return isSelectedEdge && typeMatches;
      })
      .sort((left, right) => (
        getProjectMapRelationshipTypeRank(left.type) - getProjectMapRelationshipTypeRank(right.type)
        || getProjectMapRelationshipConfidenceRank(left.confidence) - getProjectMapRelationshipConfidenceRank(right.confidence)
        || left.id.localeCompare(right.id)
      ))
      .slice(0, PROJECT_MAP_RELATIONSHIP_EDGE_LIMIT);
  }, [relationshipDashboardData, relationshipDashboardTypeFilter, selectedRelationshipFile]);

  const relationshipDashboardTopHotspots = useMemo(() => (
    [...(relationshipDashboardData?.hotspots ?? [])]
      .sort((left, right) => right.score - left.score || left.fileId.localeCompare(right.fileId))
      .slice(0, 5)
  ), [relationshipDashboardData]);

  const handleNodeDrillClick = (
    event: MouseEvent<HTMLButtonElement>,
    node: ProjectMapNode,
  ) => {
    event.stopPropagation();
    handleNodeSelect(node);
    handleDrillIn(node);
  };

  const handleNodeDrillUpClick = (
    event: MouseEvent<HTMLButtonElement>,
    node: ProjectMapNode,
  ) => {
    event.stopPropagation();
    handleDrillUp(node);
  };

  return (
    <section
      className={cn("project-map-panel", isProjectMapChromeCollapsed && "is-chrome-collapsed")}
      aria-label={t("projectMap.panelTitle")}
    >
      <header className={cn("project-map-topbar", isProjectMapChromeCollapsed && "is-collapsed")}>
        {isProjectMapChromeCollapsed ? (
          <>
            <div className="project-map-compact-title">
              <strong>{projectName}</strong>
              <span>{t("projectMap.compactSummary", { nodes: dataset.nodes.length, lenses: detectedLensCount })}</span>
            </div>
            <button
              className="project-map-toolbar-action project-map-chrome-toggle"
              type="button"
              aria-expanded={false}
              onClick={() => setIsProjectMapChromeCollapsed(false)}
            >
              <ChevronDown aria-hidden />
              {t("projectMap.expandChrome")}
            </button>
          </>
        ) : (
          <>
            <div className="project-map-header-copy">
              <div className="project-map-title-line">
                <span className="project-map-eyebrow">{t("projectMap.eyebrow")}</span>
                <h2>{t("projectMap.title", { projectName })}</h2>
              </div>
              <div className="project-map-meta-row">
                <span className="project-map-meta-pill is-primary">
                  {t("projectMap.lastGenerated", {
                    value: formatProjectMapDateTime(dataset.manifest.updatedAt),
                  })}
                </span>
                <span className="project-map-meta-pill">
                  {t("projectMap.storageKey", { value: dataset.manifest.storageKey })}
                </span>
                <span className="project-map-meta-pill is-profile">
                  {t("projectMap.profileSummary", {
                    language: profileSummary.language,
                    shapes: profileSummary.shapes,
                  })}
                </span>
              </div>
            </div>
            <div className="project-map-actions" role="group" aria-label={t("projectMap.chromeControls")}>
              <button
                className="project-map-toolbar-action project-map-chrome-toggle"
                type="button"
                aria-expanded
                onClick={() => setIsProjectMapChromeCollapsed(true)}
              >
                <ChevronUp aria-hidden />
                {t("projectMap.collapseChrome")}
              </button>
              {isPersistenceBacked ? (
                <div
                  className="project-map-storage-switch"
                  role="group"
                  aria-label={t("projectMap.storage.readLocation")}
                >
                  <span className="project-map-storage-label">
                    <HardDrive aria-hidden />
                    {t("projectMap.storage.readLocation")}
                  </span>
                  <button
                    type="button"
                    className={cn(datasetController.activeReadLocation === "global" && "is-active")}
                    aria-pressed={datasetController.activeReadLocation === "global"}
                    onClick={() => datasetController.switchReadLocation("global")}
                  >
                    <Globe2 aria-hidden />
                    {t("projectMap.storage.global")}
                  </button>
                  <button
                    type="button"
                    className={cn(datasetController.activeReadLocation === "project" && "is-active")}
                    aria-pressed={datasetController.activeReadLocation === "project"}
                    onClick={() => datasetController.switchReadLocation("project")}
                  >
                    <Folder aria-hidden />
                    {t("projectMap.storage.project")}
                  </button>
                </div>
              ) : null}
              {candidateCount > 0 ? (
                <>
                  <button
                    className="project-map-candidate-badge"
                    type="button"
                    onClick={handleCandidateReviewClick}
                    title={t("projectMap.candidateBadgeHint")}
                  >
                    {t("projectMap.candidateBadge", { count: candidateCount })}
                  </button>
                  <button
                    className="project-map-confirm-all-candidates"
                    type="button"
                    onClick={() => {
                      void handleConfirmAllCandidatesClick();
                    }}
                    disabled={isConfirmingAllCandidates}
                    title={t("projectMap.confirmAllCandidatesHint")}
                  >
                    {isConfirmingAllCandidates
                      ? t("projectMap.confirmingAllCandidates")
                      : t("projectMap.confirmAllCandidates")}
                  </button>
                </>
              ) : null}
              <button
                className="project-map-toolbar-action project-map-profile-action"
                type="button"
                onClick={handleRelationshipScanClick}
                disabled={!activeWorkspace?.id || relationshipScanState.status === "running"}
                title={
                  activeWorkspace?.id
                    ? t("projectMap.relationship.scanHint")
                    : t("projectMap.relationship.disabledNoWorkspace")
                }
              >
                <RefreshCw aria-hidden />
                {relationshipScanState.status === "running"
                  ? t("projectMap.relationship.scanning")
                  : t("projectMap.relationship.scan")}
              </button>
              <button
                className={cn(
                  "project-map-toolbar-action project-map-task-button",
                  generationQueue.length > 0 && "has-active-task",
                )}
                type="button"
                aria-expanded={isTaskDrawerOpen}
                onClick={() => setIsTaskDrawerOpen((current) => !current)}
              >
                <ListChecks aria-hidden />
                {t("projectMap.tasks.button")}
                <span>{generationQueue.length}</span>
              </button>
              <button
                className="project-map-toolbar-action project-map-profile-action"
                type="button"
                onClick={datasetController.openGlobalCollection}
              >
                <Sparkles aria-hidden />
                {t("projectMap.collectFramework")}
              </button>
              {unassignedDiscoveryCount > 0 ? (
                <button
                  className="project-map-toolbar-action project-map-profile-action"
                  type="button"
                  onClick={() => {
                    datasetController.openUnassignedOrganizer();
                  }}
                >
                  <Sparkles aria-hidden />
                  {t("projectMap.organizeUnassigned", { count: unassignedDiscoveryCount })}
                </button>
              ) : null}
            </div>
          </>
        )}
      </header>

      <main className="project-map-stage" aria-label={t("projectMap.stageAria")}>
        {!isProjectMapChromeCollapsed ? (
          <div className={cn("project-map-lens-shell", isLensStripCollapsed && "is-collapsed")}>
            <div className="project-map-stage-toolbar">
              <div className="project-map-breadcrumb" aria-label={t("projectMap.breadcrumb")}>
                <span className="project-map-breadcrumb-root">
                  <Network aria-hidden />
                  {t("projectMap.breadcrumbRoot")}
                </span>
                {activeLens && focusNodeId ? (
                  <>
                    <span>/</span>
                    <strong>{activeLens.title}</strong>
                  </>
                ) : null}
              </div>
              <div className="project-map-stage-stats">
                <span>{t("projectMap.totalNodes", { count: dataset.nodes.length })}</span>
                <span>{t("projectMap.lensStats", { detected: detectedLensCount, candidate: candidateLensCount })}</span>
                <span>{t("projectMap.staleNodes", { count: staleCount })}</span>
                <span>{t("projectMap.candidateNodes", { count: candidateCount })}</span>
                {relationshipScanState.status === "success" ? (
                  <span>
                    {t("projectMap.relationship.summary", {
                      files: relationshipScanState.summary.fileCount,
                      relations: relationshipScanState.summary.relationCount,
                      ignored: relationshipScanState.summary.ignoredCount,
                    })}
                  </span>
                ) : null}
                {relationshipScanState.status === "failed" ? (
                  <span className="project-map-inline-status is-error">
                    {t("projectMap.relationship.failed", {
                      message: relationshipScanState.message,
                    })}
                  </span>
                ) : null}
                <button
                  className={cn(
                    "project-map-health-chip",
                    graphIntegrityIssues.length > 0 && "has-issues",
                    isGraphHealthExpanded && "is-active",
                  )}
                  type="button"
                  aria-expanded={isGraphHealthExpanded}
                  onClick={() => {
                    setIsGraphHealthExpanded((current) => !current);
                    setIsDetailCollapsed(false);
                  }}
                >
                  {t("projectMap.repair.title")}
                  <strong>
                    {graphIntegrityIssues.length}/
                    {activeGraphRepairSummary?.actions.length ?? 0}
                  </strong>
                </button>
                <button
                  className="project-map-lens-toggle"
                  type="button"
                  aria-expanded={!isLensStripCollapsed}
                  onClick={() => setIsLensStripCollapsed((current) => !current)}
                >
                  {isLensStripCollapsed ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}
                  {isLensStripCollapsed ? t("projectMap.expandLenses") : t("projectMap.collapseLenses")}
                </button>
              </div>
              <section
                className="project-map-investigation-strip"
                role="toolbar"
                aria-label={t("projectMap.viewIa.modesAria")}
              >
                  <button
                    className={cn(
                      "project-map-investigation-mode",
                      (visibleSectionState.navigation || visibleSectionState.query) && "is-active",
                    )}
                    type="button"
                    aria-label={t("projectMap.viewIa.navigationMode")}
                    aria-pressed={visibleSectionState.navigation || visibleSectionState.query}
                    aria-expanded={visibleSectionState.navigation || visibleSectionState.query}
                    onClick={() => {
                      const nextExpanded = !(visibleSectionState.navigation || visibleSectionState.query);
                      rememberQuery(searchQuery);
                      setIsNavigationPanelExpanded(nextExpanded);
                      setIsQueryPanelExpanded(nextExpanded);
                    }}
                  >
                    <ListFilter aria-hidden />
                    <span><strong>{t("projectMap.viewIa.navigationMode")}</strong></span>
                    <b>{searchResults.length + groupedQueryResultCount}</b>
                  </button>
                  <button
                    className={cn("project-map-investigation-mode", visibleSectionState.activity && "is-active")}
                    type="button"
                    aria-label={t("projectMap.viewIa.activityMode")}
                    aria-pressed={visibleSectionState.activity}
                    aria-expanded={visibleSectionState.activity}
                    onClick={() => setIsActivityPanelExpanded((current) => !current)}
                  >
                    <RadioTower aria-hidden />
                    <span><strong>{t("projectMap.viewIa.activityMode")}</strong></span>
                    <b>{activityItemCount}</b>
                  </button>
                  <button
                    className={cn("project-map-investigation-mode", visibleSectionState.fileRelations && "is-active")}
                    type="button"
                    aria-label={t("projectMap.viewIa.fileRelationsMode")}
                    aria-pressed={visibleSectionState.fileRelations}
                    aria-expanded={visibleSectionState.fileRelations}
                    onClick={() => setIsFileRelationPanelExpanded((current) => !current)}
                  >
                    <Network aria-hidden />
                    <span><strong>{t("projectMap.viewIa.fileRelationsMode")}</strong></span>
                    <b>{relationshipScanState.status === "success" ? relationshipScanState.summary.relationCount : 0}</b>
                  </button>
                  <button
                    className={cn("project-map-investigation-mode", visibleSectionState.relations && "is-active")}
                    type="button"
                    aria-label={t("projectMap.viewIa.relationsMode")}
                    aria-pressed={visibleSectionState.relations}
                    aria-expanded={visibleSectionState.relations}
                    onClick={() => setIsRelationPanelExpanded((current) => !current)}
                  >
                    <Network aria-hidden />
                    <span><strong>{t("projectMap.viewIa.relationsMode")}</strong></span>
                  <b>{filteredRelations.length + filteredHierarchyRelations.length}</b>
                  </button>
                  <button
                    className={cn("project-map-investigation-mode", visibleSectionState.advisor && "is-active")}
                    type="button"
                    aria-label={t("projectMap.viewIa.advisorMode")}
                    aria-pressed={visibleSectionState.advisor}
                    aria-expanded={visibleSectionState.advisor}
                    onClick={() => setIsAdvisorPanelExpanded((current) => !current)}
                  >
                    <Lightbulb aria-hidden />
                    <span><strong>{t("projectMap.viewIa.advisorMode")}</strong></span>
                    <b>{advisorHints.length}</b>
                  </button>
                  <button
                    className={cn(
                      "project-map-investigation-mode",
                      "is-health",
                      visibleSectionState.health && "is-active",
                      hasGraphRepairAttention && "requires-attention",
                    )}
                    type="button"
                    aria-label={t("projectMap.viewIa.healthMode")}
                    aria-pressed={visibleSectionState.health}
                    aria-expanded={visibleSectionState.health}
                    onClick={() => {
                      setIsGraphHealthExpanded((current) => !current);
                      setIsDetailCollapsed(false);
                    }}
                  >
                    <Crosshair aria-hidden />
                    <span><strong>{t("projectMap.viewIa.healthMode")}</strong></span>
                    <b>{graphIntegrityIssues.length}</b>
                  </button>
              </section>
            </div>

            {visibleSectionState.navigation ? (
              <ProjectMapNavigationPanel
                searchQuery={searchQuery}
                expanded={visibleSectionState.navigation}
                pathNodeOptions={pathNodeOptions}
                pathSourceNodeId={pathSourceNodeId}
                pathTargetNodeId={pathTargetNodeId}
                pathResult={pathResult}
                associationExplanation={associationExplanation}
                onSearchQueryChange={handleSearchQueryChange}
                onFocusNode={focusNavigationNode}
                onPathSourceNodeChange={handlePathSourceNodeChange}
                onPathTargetNodeChange={handlePathTargetNodeChange}
              />
            ) : null}

            <ProjectMapNavigationHistoryChips
              items={navigationHistory}
              onActivate={handleNavigationHistoryActivate}
              onClear={() => setNavigationHistory([])}
            />

            {visibleSectionState.query ? (
              <ProjectMapGroupedQueryPanel
                results={groupedQueryResults}
                expanded={visibleSectionState.query}
                queryHistory={queryHistory}
                onActivateResult={handleQueryResultActivate}
                onRestoreQuery={handleSearchQueryChange}
                onClearQueryHistory={() => setQueryHistory([])}
              />
            ) : null}

            {visibleSectionState.activity ? (
              <ProjectMapRecentActivityPanel
                activity={activityProjection}
                expanded={visibleSectionState.activity}
                onActivateTarget={activateWorkbenchTarget}
              />
            ) : null}

            {visibleSectionState.fileRelations ? (
                <section className="project-map-relationship-scan-panel">
                  <header>
                    <Network aria-hidden />
                    <div>
                      <h4>{t("projectMap.relationship.dashboardTitle")}</h4>
                      <p>
                        {relationshipScanState.status === "success"
                          ? t("projectMap.relationship.dashboardReady", {
                              runId: relationshipScanState.summary.scanRunId,
                            })
                          : t("projectMap.relationship.dashboardEmpty")}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="project-map-toolbar-action"
                      onClick={handleRelationshipScanClick}
                      disabled={!activeWorkspace?.id || relationshipScanState.status === "running"}
                    >
                      <RefreshCw aria-hidden />
                      {relationshipScanState.status === "running"
                        ? t("projectMap.relationship.scanning")
                        : t("projectMap.relationship.scan")}
                    </button>
                  </header>
                  {relationshipScanState.status === "success" ? (
                    <div className="project-map-relationship-scan-metrics">
                      <span>
                        <strong>{relationshipScanState.summary.fileCount}</strong>
                        {t("projectMap.relationship.metricFiles")}
                      </span>
                      <span>
                        <strong>{relationshipScanState.summary.relationCount}</strong>
                        {t("projectMap.relationship.metricRelations")}
                      </span>
                      <span>
                        <strong>{relationshipScanState.summary.ignoredCount}</strong>
                        {t("projectMap.relationship.metricIgnored")}
                      </span>
                      <span>
                        <strong>{relationshipScanState.summary.repairIssueCount}</strong>
                        {t("projectMap.relationship.metricRepair")}
                      </span>
                    </div>
                  ) : null}
                  {relationshipDashboardData ? (
                    <div className="project-map-relationship-dashboard">
                      <div className="project-map-relationship-dashboard-rule">
                        <strong>{t("projectMap.relationship.snapshotLabel")}</strong>
                        <span>{t("projectMap.relationship.snapshotRule")}</span>
                      </div>
                      <div className="project-map-relationship-dashboard-controls">
                        <label>
                          <span>{t("projectMap.relationship.searchLabel")}</span>
                          <input
                            value={relationshipDashboardQuery}
                            onChange={(event) => setRelationshipDashboardQuery(event.target.value)}
                            placeholder={t("projectMap.relationship.searchPlaceholder")}
                          />
                        </label>
                        <label>
                          <span>{t("projectMap.relationship.typeFilterLabel")}</span>
                          <select
                            value={relationshipDashboardTypeFilter}
                            onChange={(event) => setRelationshipDashboardTypeFilter(event.target.value)}
                          >
                            <option value={PROJECT_MAP_RELATION_FILTER_ALL}>
                              {t("projectMap.relationship.allTypes")}
                            </option>
                            {relationshipDashboardTypeOptions.map((type) => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>{t("projectMap.relationship.roleFilterLabel")}</span>
                          <select
                            value={relationshipDashboardRoleFilter}
                            onChange={(event) => setRelationshipDashboardRoleFilter(event.target.value)}
                          >
                            <option value={PROJECT_MAP_RELATION_FILTER_ALL}>
                              {t("projectMap.relationship.allRoles")}
                            </option>
                            {relationshipDashboardRoleOptions.map((role) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className={cn(
                            "project-map-relationship-noise-toggle",
                            showRelationshipNoiseFiles && "is-active",
                          )}
                          onClick={() => {
                            setRelationshipDashboardRoleFilter(PROJECT_MAP_RELATION_FILTER_ALL);
                            setShowRelationshipNoiseFiles((current) => !current);
                          }}
                        >
                          {showRelationshipNoiseFiles
                            ? t("projectMap.relationship.hideNoise")
                            : t("projectMap.relationship.showNoise")}
                        </button>
                      </div>
                      <div className="project-map-relationship-view-switch">
                        {(["board", "list", "neighborhood"] as ProjectMapRelationshipDashboardViewMode[]).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            className={cn(relationshipDashboardViewMode === mode && "is-active")}
                            onClick={() => setRelationshipDashboardViewMode(mode)}
                          >
                            {t(`projectMap.relationship.view.${mode}`)}
                          </button>
                        ))}
                      </div>
                      {relationshipDashboardData.impactSummary
                        || relationshipDashboardTopHotspots.length
                        || relationshipDashboardData.contextPack ? (
                          <div className="project-map-relationship-insight-grid">
                            <section className="project-map-relationship-insight-card">
                              <h5>{t("projectMap.relationship.impactTitle")}</h5>
                              {relationshipDashboardData.impactSummary ? (
                                <>
                                  <div className="project-map-relationship-insight-metrics">
                                    <span>
                                      <strong>{relationshipDashboardData.impactSummary.changedFiles.length}</strong>
                                      {t("projectMap.relationship.impactChanged")}
                                    </span>
                                    <span>
                                      <strong>{relationshipDashboardData.impactSummary.directlyAffectedFiles.length}</strong>
                                      {t("projectMap.relationship.impactDirect")}
                                    </span>
                                    <span>
                                      <strong>{relationshipDashboardData.impactSummary.transitivelyAffectedFiles.length}</strong>
                                      {t("projectMap.relationship.impactTransitive")}
                                    </span>
                                    <span>
                                      <strong>{relationshipDashboardData.impactSummary.unmappedFiles.length}</strong>
                                      {t("projectMap.relationship.impactUnmapped")}
                                    </span>
                                  </div>
                                  {relationshipDashboardData.impactSummary.riskFlags.length ? (
                                    <div className="project-map-relationship-chip-list">
                                      {relationshipDashboardData.impactSummary.riskFlags.slice(0, 3).map((flag) => (
                                        <span key={flag.id}>
                                          {flag.severity} · {flag.label}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </>
                              ) : (
                                <p>{t("projectMap.relationship.impactEmpty")}</p>
                              )}
                            </section>
                            <section className="project-map-relationship-insight-card">
                              <h5>{t("projectMap.relationship.hotspotTitle")}</h5>
                              {relationshipDashboardTopHotspots.length ? (
                                <div className="project-map-relationship-chip-list">
                                  {relationshipDashboardTopHotspots.map((hotspot) => {
                                    const file = relationshipDashboardFileIndex.get(hotspot.fileId);
                                    return (
                                      <span key={`${hotspot.fileId}:${hotspot.reason}`}>
                                        {hotspot.reason} · {hotspot.score} · {file?.basename ?? hotspot.fileId}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p>{t("projectMap.relationship.hotspotEmpty")}</p>
                              )}
                            </section>
                            <section className="project-map-relationship-insight-card">
                              <h5>{t("projectMap.relationship.readPlanTitle")}</h5>
                              {relationshipDashboardData.contextPack ? (
                                <>
                                  <div className="project-map-relationship-insight-metrics">
                                    <span>
                                      <strong>{relationshipDashboardData.contextPack.mustReadFiles.length}</strong>
                                      {t("projectMap.relationship.readPlanMustRead")}
                                    </span>
                                    <span>
                                      <strong>{relationshipDashboardData.contextPack.relatedFiles.length}</strong>
                                      {t("projectMap.relationship.readPlanRelated")}
                                    </span>
                                    <span>
                                      <strong>{relationshipDashboardData.contextPack.testTargets.length}</strong>
                                      {t("projectMap.relationship.readPlanTests")}
                                    </span>
                                    <span>
                                      <strong>{relationshipDashboardData.contextPack.contracts.length}</strong>
                                      {t("projectMap.relationship.readPlanContracts")}
                                    </span>
                                  </div>
                                  <div className="project-map-relationship-chip-list">
                                    {relationshipDashboardData.contextPack.mustReadFiles.slice(0, 3).map((path) => (
                                      <span key={path}>{path}</span>
                                    ))}
                                  </div>
                                </>
                              ) : (
                                <p>{t("projectMap.relationship.readPlanEmpty")}</p>
                              )}
                            </section>
                          </div>
                        ) : null}
                      {relationshipDashboardViewMode === "board" ? (
                        <div className="project-map-relationship-tile-board">
                          {relationshipDashboardBoardGroups.map((group) => (
                            <section key={group.role} className="project-map-relationship-tile-lane">
                              <header>
                                <strong>{group.role}</strong>
                                <span>{t("projectMap.relationship.laneStats", {
                                  visible: group.files.length,
                                  total: group.total,
                                })}</span>
                              </header>
                              <div className="project-map-relationship-tile-grid">
                                {group.files.map((file) => {
                                  const directionCount =
                                    relationshipDashboardDirectionCountByFile.get(file.id)
                                    ?? { incoming: 0, outgoing: 0 };
                                  return (
                                    <button
                                      key={file.id}
                                      type="button"
                                      className={cn(
                                        "project-map-relationship-file-tile",
                                        selectedRelationshipFile?.id === file.id && "is-active",
                                      )}
                                      onClick={() => {
                                        setSelectedRelationshipFileId(file.id);
                                        setRelationshipDashboardViewMode("neighborhood");
                                      }}
                                    >
                                      <span>{file.role}</span>
                                      <strong>{file.basename}</strong>
                                      <em>{file.language} · {file.layer}</em>
                                      <small>
                                        {t("projectMap.relationship.tileStats", {
                                          incoming: directionCount.incoming,
                                          outgoing: directionCount.outgoing,
                                          total: relationshipDashboardRelationCountByFile.get(file.id) ?? 0,
                                        })}
                                      </small>
                                    </button>
                                  );
                                })}
                              </div>
                            </section>
                          ))}
                        </div>
                      ) : null}
                      <div
                        className={cn(
                          "project-map-relationship-dashboard-grid",
                          relationshipDashboardViewMode === "board" && "is-hidden",
                          relationshipDashboardViewMode === "neighborhood" && "is-neighborhood-mode",
                        )}
                      >
                        <div className="project-map-relationship-dashboard-column">
                          <h5>{t("projectMap.relationship.filesTitle")}</h5>
                          <div className="project-map-relationship-role-strip">
                            {relationshipDashboardRoleOptions.slice(0, 8).map((role) => (
                              <button
                                key={role}
                                type="button"
                                className={cn(
                                  relationshipDashboardRoleFilter === role && "is-active",
                                )}
                                onClick={() => setRelationshipDashboardRoleFilter(role)}
                              >
                                {role}
                              </button>
                            ))}
                          </div>
                          <div className="project-map-relationship-module-strip">
                            {relationshipDashboardData.modules.slice(0, 6).map((module) => (
                              <span key={module.id}>
                                <strong>{module.label}</strong>
                                {t("projectMap.relationship.moduleStats", {
                                  files: module.fileCount,
                                  relations: module.relationCount,
                                })}
                              </span>
                            ))}
                          </div>
                          <div className="project-map-relationship-file-list">
                            {relationshipDashboardFilteredFiles.map((file) => (
                              <button
                                key={file.id}
                                type="button"
                                className={cn(
                                  "project-map-relationship-file-row",
                                  selectedRelationshipFile?.id === file.id && "is-active",
                                )}
                                onClick={() => setSelectedRelationshipFileId(file.id)}
                              >
                                <strong>{file.basename}</strong>
                                <span>{file.path}</span>
                                <em>
                                  {file.language} · {file.role} · {file.parseStatus} · {t("projectMap.relationship.edgeCount", {
                                    count: relationshipDashboardRelationCountByFile.get(file.id) ?? 0,
                                  })}
                                </em>
                              </button>
                            ))}
                            {relationshipDashboardVisibleFileTotal > relationshipDashboardFilteredFiles.length ? (
                              <p className="project-map-relationship-list-cap">
                                {t("projectMap.relationship.listCap", {
                                  visible: relationshipDashboardFilteredFiles.length,
                                  total: relationshipDashboardVisibleFileTotal,
                                })}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="project-map-relationship-dashboard-column">
                          <h5>{t("projectMap.relationship.neighborhoodTitle")}</h5>
                          {selectedRelationshipFile ? (
                            <div className="project-map-relationship-selected-file">
                              <strong>{selectedRelationshipFile.path}</strong>
                              <span>
                                {selectedRelationshipFile.role} · {selectedRelationshipFile.language} · {relationshipDashboardModuleByFileId.get(selectedRelationshipFile.id) ?? selectedRelationshipFile.layer} · {t("projectMap.relationship.edgeCount", {
                                  count: relationshipDashboardRelationCountByFile.get(selectedRelationshipFile.id) ?? 0,
                                })}
                              </span>
                            </div>
                          ) : null}
                          <div className="project-map-relationship-edge-list">
                            {selectedRelationshipRelations.length ? (
                              selectedRelationshipRelations.map((relation) => {
                                const sourceFile = relationshipDashboardFileIndex.get(relation.sourceFileId);
                                const targetFile = relationshipDashboardFileIndex.get(relation.targetFileId);
                                const directionLabel =
                                  relation.sourceFileId === selectedRelationshipFile?.id
                                    ? t("projectMap.relationship.outgoing")
                                    : t("projectMap.relationship.incoming");
                                const evidence = relation.evidence[0];
                                const relationSentence = buildProjectMapRelationshipSentence({
                                  relation,
                                  sourceFile,
                                  targetFile,
                                });
                                return (
                                  <article key={relation.id} className="project-map-relationship-edge-row">
                                    <header>
                                      <span>{relation.type}</span>
                                      <em>{directionLabel} · {relation.confidence}</em>
                                    </header>
                                    <p>{relationSentence}</p>
                                    <small>
                                      {sourceFile?.path ?? relation.sourceFileId}
                                      {" -> "}
                                      {targetFile?.path ?? relation.targetFileId}
                                    </small>
                                    {evidence ? (
                                      <small>
                                        {evidence.path}
                                        {evidence.line ? `:${evidence.line}` : ""}
                                        {evidence.excerpt ? ` · ${evidence.excerpt}` : ""}
                                      </small>
                                    ) : null}
                                  </article>
                                );
                              })
                            ) : (
                              <p className="project-map-relationship-empty">
                                {t("projectMap.relationship.noNeighborhood")}
                              </p>
                            )}
                            {selectedRelationshipRelations.length >= PROJECT_MAP_RELATIONSHIP_EDGE_LIMIT ? (
                              <p className="project-map-relationship-list-cap">
                                {t("projectMap.relationship.edgeCap", {
                                  limit: PROJECT_MAP_RELATIONSHIP_EDGE_LIMIT,
                                })}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      {relationshipDashboardData.repairIssues.length || relationshipDashboardData.readErrors.length ? (
                        <div className="project-map-relationship-repair-strip">
                          <strong>{t("projectMap.relationship.repairTitle")}</strong>
                          {relationshipDashboardData.repairIssues.slice(0, 4).map((issue) => (
                            <span key={issue.id}>
                              {issue.severity} · {issue.kind} · {issue.path ?? issue.message}
                            </span>
                          ))}
                          {relationshipDashboardData.readErrors.slice(0, 2).map((error) => (
                            <span key={error.path}>
                              read-error · {error.path} · {error.message}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {relationshipScanState.status === "failed" ? (
                    <p className="project-map-relationship-scan-error">
                      {t("projectMap.relationship.failed", {
                        message: relationshipScanState.message,
                      })}
                    </p>
                  ) : null}
                </section>
            ) : null}

            {visibleSectionState.relations ? (
                <section className="project-map-semantic-relations-panel">
                  <header className="project-map-semantic-relations-header">
                    <div>
                      <strong>{t("projectMap.relationship.semanticTitle")}</strong>
                      <p>{t("projectMap.relationship.semanticDescription")}</p>
                    </div>
                    <span>{t("projectMap.relationship.semanticBadge")}</span>
                  </header>
                  <ProjectMapRelationLegendPanel
                    relationIndex={relationIndex}
                    hierarchyRelations={filteredHierarchyRelations}
                    hierarchyRelationTotalCount={filteredHierarchyRelations.length}
                    expanded={visibleSectionState.relations}
                    typeFilter={relationTypeFilter}
                    sourceKindFilter={relationSourceKindFilter}
                    directionFilter={relationDirectionFilter}
                    typeOptions={relationTypeOptions}
                    sourceKindOptions={relationSourceKindOptions}
                    selectedNodeId={selectedNode?.id ?? null}
                    onTypeFilterChange={setRelationTypeFilter}
                    onSourceKindFilterChange={setRelationSourceKindFilter}
                    onDirectionFilterChange={setRelationDirectionFilter}
                    onClearSelectedRelation={() => setSelectedRelationId(null)}
                    onFocusNode={focusNavigationNode}
                  />
                </section>
            ) : null}

            {visibleSectionState.advisor ? (
              <ProjectMapAdvisorHintsPanel
                hints={advisorHints}
                expanded={visibleSectionState.advisor}
                selectedHintId={selectedAdvisorHintId}
                onActivateHint={handleAdvisorHintActivate}
                onClearHint={() => setSelectedAdvisorHintId(null)}
              />
            ) : null}

            {!isLensStripCollapsed ? (
              <div className="project-map-domain-strip" aria-label={t("projectMap.domainStrip")}>
                <button
                  className={cn("project-map-domain-chip", !focusNodeId && "is-active")}
                  type="button"
                  onClick={handleBackToOverview}
                >
                  <span>{t("projectMap.breadcrumbRoot")}</span>
                </button>
                {hubNodes.map((node) => (
                  <button
                    key={node.id}
                    className={cn("project-map-domain-chip", focusNodeId === node.id && "is-active")}
                    type="button"
                    onClick={() => {
                      handleNodeSelect(node);
                      handleDrillIn(node);
                      setIsLensStripCollapsed(true);
                    }}
                  >
                    <span>{lensIndex.get(node.lensId)?.shortTitle ?? node.lensId}</span>
                    <strong>{node.title}</strong>
                    <em>{t(`projectMap.lensStatus.${lensIndex.get(node.lensId)?.status ?? "candidate"}`)}</em>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {candidateBatchMessage ? (
          <div className="project-map-inline-status" role="status">
            {candidateBatchMessage}
          </div>
        ) : null}

        {datasetController.status === "error" && !controlledDataset ? (
          <div className="project-map-empty-state">
            <Crosshair aria-hidden />
            <h3>{t("projectMap.loadErrorTitle")}</h3>
            <p>{datasetController.error}</p>
            <button className="project-map-primary-button" type="button" onClick={datasetController.reload}>
              <RefreshCw aria-hidden />
              {t("projectMap.retryLoad")}
            </button>
          </div>
        ) : visibleNodes.length === 0 ? (
          <div className="project-map-empty-state">
            <Crosshair aria-hidden />
            <h3>{t("projectMap.emptyTitle")}</h3>
            <p>{t("projectMap.emptyDescription")}</p>
            <button
              className="project-map-empty-action"
              type="button"
              onClick={datasetController.openGlobalCollection}
            >
              <Sparkles aria-hidden />
              {t("projectMap.collectFramework")}
            </button>
          </div>
        ) : (
          <div
            ref={canvasRef}
            className="project-map-graph-canvas"
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerEnd}
            onPointerCancel={handleCanvasPointerEnd}
            onWheel={handleCanvasWheel}
          >
            <div
              className={cn(
                "project-map-canvas-control-group",
                isCanvasControlsCollapsed && "is-collapsed",
              )}
              role="group"
              aria-label={t("projectMap.canvasControls")}
            >
              <button
                type="button"
                className="project-map-canvas-controls-toggle"
                onClick={handleCanvasControlsToggle}
                aria-expanded={!isCanvasControlsCollapsed}
                aria-label={
                  isCanvasControlsCollapsed
                    ? t("projectMap.expandCanvasControls")
                    : t("projectMap.collapseCanvasControls")
                }
              >
                {isCanvasControlsCollapsed ? <ChevronRight aria-hidden /> : <ChevronDown aria-hidden />}
                <span>{t("projectMap.layoutPreset")}</span>
              </button>
              {!isCanvasControlsCollapsed ? (
                <div className="project-map-canvas-controls-content">
                  <button
                    type="button"
                    onClick={() => updateZoom(viewport.zoom - ZOOM_STEP)}
                    aria-label={t("projectMap.zoomOut")}
                  >
                    <ZoomOut aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={fitGraphToViewport}
                  >
                    {t("projectMap.resetView")}
                  </button>
                  <button
                    type="button"
                    onClick={handleAutoLayout}
                  >
                    {t("projectMap.autoLayout")}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetLayout}
                  >
                    {t("projectMap.resetLayout")}
                  </button>
                  <label className="project-map-layout-preset">
                    <span>{t("projectMap.layoutPreset")}</span>
                    <select
                      value={dataset.viewState?.layoutPreset ?? "radial"}
                      aria-label={t("projectMap.layoutPreset")}
                      onChange={(event) =>
                        handleLayoutPresetChange(event.currentTarget.value as ProjectMapLayoutPreset)
                      }
                    >
                      <option value="radial">{t("projectMap.layoutPresetRadial")}</option>
                      <option value="tree">{t("projectMap.layoutPresetTree")}</option>
                      <option value="force">{t("projectMap.layoutPresetForce")}</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => updateZoom(viewport.zoom + ZOOM_STEP)}
                    aria-label={t("projectMap.zoomIn")}
                  >
                    <ZoomIn aria-hidden />
                  </button>
                  {previousViewSnapshot || hasBackToParentFallback ? (
                    <button
                      type="button"
                      onClick={handleBackToPreviousView}
                    >
                      <ArrowLeft aria-hidden />
                      {backToPreviousLabel}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div
              className="project-map-quick-filters"
              role="toolbar"
              aria-label={t("projectMap.quickFilters.title")}
            >
              {PROJECT_MAP_QUICK_FILTERS.map((filterId) => {
                const isActive = activeQuickFilters.has(filterId);
                return (
                  <button
                    key={filterId}
                    type="button"
                    className={cn("project-map-quick-filter-chip", isActive && "is-active")}
                    aria-pressed={isActive}
                    onClick={() => handleQuickFilterToggle(filterId)}
                  >
                    {t(`projectMap.quickFilters.${filterId}`)}
                  </button>
                );
              })}
            </div>
            <div
              className="project-map-graph-viewport"
              style={{
                transform: `translate(${viewport.pan.x}px, ${viewport.pan.y}px) scale(${viewport.zoom})`,
              }}
            >
              <svg
                className="project-map-graph-lines"
                viewBox={`0 0 ${PROJECT_MAP_GRAPH_WIDTH} ${PROJECT_MAP_GRAPH_HEIGHT}`}
                aria-hidden
              >
                {renderGraphLayout.edges.map((edge) => {
                  const isFocused =
                    neighborNodeIds.has(edge.source.id) &&
                    neighborNodeIds.has(edge.target.id);
                  const relationState = highlightProjection.relationStates.get(edge.id);
                  const isPathEdge = pathResult.edgeKeys.has(`${edge.source.id}::${edge.target.id}`);
                  const isFilterEdge = highlightProjection.filterRelationIds.has(edge.id);
                  const isAdvisorEdge = highlightProjection.advisorRelationIds.has(edge.id);
                  return (
                    <line
                      key={edge.id}
                      x1={edge.source.x}
                      y1={edge.source.y}
                      x2={edge.target.x}
                      y2={edge.target.y}
                      className={cn(
                        "project-map-edge",
                        isFocused && "is-focused",
                        isPathEdge && "is-path-edge",
                        isFilterEdge && "is-filter-edge",
                        isAdvisorEdge && "is-advisor-edge",
                        relationState?.primary && `is-highlight-${relationState.primary}`,
                      )}
                    />
                  );
                })}
                {relationRenderEdges.map(({ indexedRelation, source, target }) => {
                  const isSelectedRelation = selectedRelationId === indexedRelation.relation.id;
                  const relationState = highlightProjection.relationStates.get(indexedRelation.relation.id);
                  return (
                    <line
                      key={`relation:${indexedRelation.relation.id}:${source.id}:${target.id}`}
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      className={cn(
                        "project-map-edge",
                        "is-relation-edge",
                        indexedRelation.degraded && "is-degraded",
                        isSelectedRelation && "is-selected-relation",
                        highlightProjection.pathRelationIds.has(indexedRelation.relation.id) && "is-path-edge",
                        highlightProjection.filterRelationIds.has(indexedRelation.relation.id) && "is-filter-edge",
                        highlightProjection.advisorRelationIds.has(indexedRelation.relation.id) && "is-advisor-edge",
                        relationState?.primary && `is-highlight-${relationState.primary}`,
                      )}
                    />
                  );
                })}
              </svg>
              {renderGraphLayout.positions.map((position) => {
                const node = nodeIndex.get(position.id);
                if (!node) {
                  return null;
                }
                const isSelected = selectedNode?.id === node.id;
                const isGroupSelected = selectedGraphNodeIds.has(node.id);
                const isFocused = neighborNodeIds.has(node.id);
                const isHub = node.parentId === rootNode?.id;
                const nodeHighlightState = highlightProjection.nodeStates.get(node.id);
                const isImpactChanged = highlightProjection.activityChangedNodeIds.has(node.id);
                const isImpactAffected = highlightProjection.activityAffectedNodeIds.has(node.id);
                const isSearchMatch = highlightProjection.searchNodeIds.has(node.id);
                const isPathNode = highlightProjection.pathNodeIds.has(node.id);
                const isQuickFilterMatch = highlightProjection.filterNodeIds.has(node.id);
                const isAdvisorMatch = highlightProjection.advisorNodeIds.has(node.id);
                const isRelationFilteredNode = relationFilteredNodeIds.has(node.id);
                const isSelectedRelationNode = selectedRelationNodeIds.has(node.id);
                const isNavigationHighlighted =
                  isSearchMatch ||
                  isPathNode ||
                  isImpactChanged ||
                  isImpactAffected ||
                  isQuickFilterMatch ||
                  isAdvisorMatch ||
                  isRelationFilteredNode ||
                  isSelectedRelationNode;
                const descendantStats = getDescendantStats(node, nodeIndex);
                return (
                  <div
                    key={node.id}
                    className={cn(
                      "project-map-node",
                      isHub && "is-hub",
                      node.id === rootNode?.id && "is-core",
                      `confidence-${node.confidence}`,
                      node.stale && "is-stale",
                      node.candidate && "is-candidate",
                      isImpactChanged && "is-impact-changed",
                      isImpactAffected && "is-impact-affected",
                      isSearchMatch && "is-search-match",
                      isPathNode && "is-path-node",
                      isQuickFilterMatch && "is-filter-match",
                      isAdvisorMatch && "is-advisor-match",
                      nodeHighlightState?.primary && `is-highlight-${nodeHighlightState.primary}`,
                      isRelationFilteredNode && "is-relation-filtered-node",
                      isSelectedRelationNode && "is-selected-relation-node",
                      isSelected && "is-selected",
                      isGroupSelected && "is-group-selected",
                      position.pinned && "is-pinned",
                      !isFocused && !isNavigationHighlighted && "is-dimmed",
                    )}
                    role="button"
                    tabIndex={0}
                    style={{ left: position.x, top: position.y }}
                    onPointerDown={(event) => handleNodePointerDown(event, node)}
                    onPointerMove={handleNodePointerMove}
                    onPointerUp={handleNodePointerEnd}
                    onPointerCancel={handleNodePointerEnd}
                    onClick={(event) => handleNodeClick(event, node)}
                    onKeyDown={(event) => handleNodeKeyDown(event, node)}
                    onDoubleClick={() => handleDrillIn(node)}
                    onMouseEnter={() => setHoverNodeId(node.id)}
                    onMouseLeave={() => setHoverNodeId(null)}
                    aria-pressed={isSelected}
                    aria-label={`${t("projectMap.nodeAria", { title: node.title })}: ${node.title}`}
                  >
                    <span className="project-map-node-kind">
                      {translateProjectMapNodeKind(t, node.nodeKind)}
                    </span>
                    <strong>{node.title}</strong>
                    <span>{lensIndex.get(node.lensId)?.shortTitle ?? node.lensId}</span>
                    <span className="project-map-node-status">
                      {node.stale ? t("projectMap.status.stale") : t("projectMap.status.current")}
                      {" · "}
                      {t(`projectMap.confidence.${node.confidence}`)}
                      {isImpactChanged || isImpactAffected ? (
                        <>
                          {" · "}
                          {isImpactChanged
                            ? t("projectMap.impact.changed", { defaultValue: "Changed" })
                            : t("projectMap.impact.affected", { defaultValue: "Affected" })}
                        </>
                      ) : null}
                      {isSearchMatch || isPathNode || isSelectedRelationNode ? (
                        <>
                          {" · "}
                          {isSelectedRelationNode
                            ? t("projectMap.relations.badge")
                            : isPathNode
                            ? t("projectMap.navigation.path.badge")
                            : t("projectMap.navigation.search.badge")}
                        </>
                      ) : null}
                      {isQuickFilterMatch ? (
                        <>
                          {" · "}
                          {t("projectMap.quickFilters.badge")}
                        </>
                      ) : null}
                      {isAdvisorMatch ? (
                        <>
                          {" · "}
                          {t("projectMap.advisor.badge")}
                        </>
                      ) : null}
                    </span>
                    {descendantStats.count > 0 ? (
                      <span className="project-map-node-counts">
                        {t("projectMap.nodeCounts", {
                          count: descendantStats.count,
                          stale: descendantStats.stale,
                          candidate: descendantStats.candidate,
                        })}
                      </span>
                    ) : null}
                    <span className="project-map-node-drill-actions">
                      {focusNodeId === node.id && node.parentId ? (
                        <button
                          className="project-map-node-drill-action is-up"
                          type="button"
                          onClick={(event) => handleNodeDrillUpClick(event, node)}
                          aria-label={t("projectMap.drillUpNode", { title: node.title })}
                          title={t("projectMap.drillUp")}
                        >
                          <ArrowUpLeftFromCircle aria-hidden />
                        </button>
                      ) : null}
                      {node.children.length > 0 && node.id !== rootNode?.id ? (
                        <button
                          className="project-map-node-drill-action is-down"
                          type="button"
                          onClick={(event) => handleNodeDrillClick(event, node)}
                          aria-label={t("projectMap.drillDownNode", { title: node.title })}
                          title={t("projectMap.drillDown")}
                        >
                          <ArrowDownRightFromCircle aria-hidden />
                        </button>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
            {miniMapProjection ? (
              <button
                className="project-map-mini-map"
                type="button"
                aria-label={t("projectMap.miniMap")}
                onClick={handleMiniMapClick}
                style={{
                  width: MINI_MAP_SIZE.width,
                  height: MINI_MAP_SIZE.height,
                }}
              >
                <svg
                  viewBox={`0 0 ${MINI_MAP_SIZE.width} ${MINI_MAP_SIZE.height}`}
                  aria-hidden
                >
                  <rect
                    className="project-map-mini-map-viewport"
                    x={miniMapProjection.viewport.left}
                    y={miniMapProjection.viewport.top}
                    width={Math.max(
                      8,
                      miniMapProjection.viewport.right - miniMapProjection.viewport.left,
                    )}
                    height={Math.max(
                      8,
                      miniMapProjection.viewport.bottom - miniMapProjection.viewport.top,
                    )}
                  />
                  {miniMapProjection.dots.map((dot) => (
                    <circle
                      key={dot.id}
                      className={cn(
                        "project-map-mini-map-dot",
                        dot.pinned && "is-pinned",
                        selectedGraphNodeIds.has(dot.id) && "is-selected",
                      )}
                      cx={dot.x}
                      cy={dot.y}
                      r={selectedGraphNodeIds.has(dot.id) ? 4 : 3}
                    />
                  ))}
                </svg>
              </button>
            ) : null}

            <DetailPanel
              node={selectedNode}
              dataset={dataset}
              pendingCandidate={
                selectedNode ? pendingCandidateByNodeId.get(selectedNode.id) ?? null : null
              }
              lens={selectedNode ? lensIndex.get(selectedNode.lensId) ?? null : null}
              explainPack={selectedExplainPack}
              relationBucket={selectedNodeRelationBucket}
              activityProjection={activityProjection}
              nodeExplainHint={selectedNodeExplainHint}
              selectedRelationId={selectedRelationId}
              impactAnalysis={impactAnalysis}
              refreshSummary={refreshSummary}
              nodeStaleReasons={selectedNodeStaleReasons}
              graphIntegrityIssues={graphIntegrityIssues}
              graphRepairSummary={activeGraphRepairSummary}
              isGraphHealthExpanded={isGraphHealthExpanded}
              orchestrationDraftState={orchestrationDraftState}
              staleCount={staleCount}
              unassignedDiscoveryCount={unassignedDiscoveryCount}
              pendingReviewCandidateCount={(dataset.candidates ?? []).filter((candidate) => candidate.status === "pending").length}
              canDrill={Boolean(selectedNode?.children.length && selectedNode.id !== rootNode?.id)}
              collapsed={isDetailCollapsed}
              onCollapsedChange={setIsDetailCollapsed}
              onBack={focusNodeId ? handleBackToOverview : null}
              onBackToPrevious={previousViewSnapshot || hasBackToParentFallback ? handleBackToPreviousView : null}
              backToPreviousLabel={backToPreviousLabel}
              onDrill={() => handleDrillIn(selectedNode)}
              onCompleteNode={() => selectedNode ? datasetController.openNodeGeneration("node", selectedNode) : undefined}
              onCalibrateNode={() => selectedNode ? datasetController.openNodeGeneration("calibrate", selectedNode) : undefined}
              onCreateOrchestrationTask={handleCreateOrchestrationTaskDraft}
              onOrganizeUnassigned={datasetController.openUnassignedOrganizer}
              onConfirmCandidate={(candidateId) => {
                void datasetController.confirmCandidate(candidateId);
              }}
              onRejectCandidate={(candidateId) => {
                void datasetController.rejectCandidate(candidateId);
              }}
              onConfirmNodeCandidate={(nodeId) => {
                void datasetController.confirmNodeCandidate(nodeId);
              }}
              onRejectNodeCandidate={(nodeId) => {
                void datasetController.rejectNodeCandidate(nodeId);
              }}
              onDeleteNode={selectedNode ? handleRequestDeleteSelectedNode : null}
              onOpenTrace={onOpenEvidenceFile ? handleOpenTraceTarget : undefined}
              onFocusRelationNode={handleRelationFocusNode}
              onSelectRelation={handleRelationSelect}
              onGraphHealthExpandedChange={setIsGraphHealthExpanded}
              onRepairGraph={handleRepairGraphIntegrity}
            />
          </div>
        )}
      </main>
      <ProjectMapSettingsPanel
        activeWorkspace={activeWorkspace}
        dataset={dataset}
        disabled={!isPersistenceBacked}
        onUpdate={datasetController.updateDataset}
      />
      <GenerationConfirmationDialog
        activeWorkspace={activeWorkspace}
        request={datasetController.pendingRequest}
        storageKey={dataset.manifest.storageKey}
        onCancel={datasetController.closeGenerationRequest}
        onConfirm={datasetController.confirmGenerationRequest}
      />
      <DeleteNodeConfirmDialog
        node={deleteConfirmNode}
        onCancel={() => setDeleteConfirmNodeId(null)}
        onConfirm={() => {
          void handleConfirmDeleteNode();
        }}
      />
      {isTaskDrawerOpen ? (
        <ProjectMapGenerationTaskDrawer
          activeRun={activeGenerationRun}
          queuedRuns={queuedGenerationRuns}
          recentRuns={recentRuns}
          nodeIndex={nodeIndex}
          onCancelRun={datasetController.cancelGenerationRun}
          onClearFinished={datasetController.clearFinishedRuns}
          onClose={() => setIsTaskDrawerOpen(false)}
        />
      ) : null}
    </section>
  );
}
