import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import Network from "lucide-react/dist/esm/icons/network";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";

import { cn } from "../../../lib/utils";
import type { ProjectMapDatasetController } from "../hooks/useProjectMapDataset";
import {
  getProjectMapRelationshipCallCandidate,
  getProjectMapRelationshipConfidenceRank,
  getProjectMapRelationshipRoleColor,
  getProjectMapRelationshipRoleRank,
  getProjectMapRelationshipTypeRank,
  isProjectMapRelationshipNoiseFile,
  normalizeProjectMapRelationshipDashboardData,
  normalizeProjectMapRelationshipError,
  normalizeProjectMapRelationshipReadSummary,
  type ProjectMapRelationshipDashboardData,
} from "../utils/relationshipDashboardModel";
import {
  readProjectMapRelationships,
  scanProjectMapRelationships,
} from "../services/projectMapPersistence";
import type {
  ProjectMapFileRelation,
  ProjectMapRelationshipScanResponse,
  ProjectMapRelationshipSymbol,
  ProjectMapScannedFile,
} from "../types";

export type ProjectMapRelationshipSummaryState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "success"; summary: ProjectMapRelationshipScanResponse }
  | { status: "failed"; message: string };

type ProjectMapRelationshipScanState = ProjectMapRelationshipSummaryState;
type ProjectMapRelationshipDashboardViewMode = "graph" | "files" | "read";
type ProjectMapRelationshipLayoutPreset = "radial" | "tree" | "force";

type ProjectMapRelationshipScanScope = {
  paths?: string[];
  changedFiles?: string[];
};

type ProjectMapRelationshipFileTreeGroup = {
  id: string;
  label: string;
  files: ProjectMapScannedFile[];
  relationCount: number;
};

type ProjectMapRelationshipGraphPanStart = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type ProjectMapRelationshipSectionProps = {
  activeWorkspaceId: string | null;
  activeReadLocation: ProjectMapDatasetController["activeReadLocation"];
  expanded: boolean;
  onOpenEvidenceFile?: (path: string, location?: { line: number; column: number }) => void;
  reloadRelationshipContext: () => Promise<void>;
  scanRequestId: number;
  onSummaryStateChange: (state: ProjectMapRelationshipSummaryState) => void;
};

const PROJECT_MAP_RELATION_FILTER_ALL = "all";
const PROJECT_MAP_RELATIONSHIP_LIST_LIMIT = 120;
const PROJECT_MAP_RELATIONSHIP_EDGE_LIMIT = 80;
const PROJECT_MAP_RELATIONSHIP_GRAPH_WIDTH = 1320;
const PROJECT_MAP_RELATIONSHIP_GRAPH_HEIGHT = 760;
const PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_WIDTH = 172;
const PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_X = PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_WIDTH / 2;
const PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_Y = 42;
const PROJECT_MAP_RELATIONSHIP_GRAPH_SIDE_LIMIT = 6;
const PROJECT_MAP_RELATIONSHIP_GRAPH_EXPANDED_SIDE_LIMIT = 8;
const PROJECT_MAP_RELATIONSHIP_GRAPH_SECONDARY_LIMIT = 4;
const PROJECT_MAP_RELATIONSHIP_VIEW_ORDER: ProjectMapRelationshipDashboardViewMode[] = [
  "graph",
  "files",
  "read",
];

function getProjectMapRelationshipTimestamp(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isProjectMapRelationshipStaleSummaryOlderThanScan(input: {
  scanSummary: ProjectMapRelationshipScanResponse;
  dashboardData: ProjectMapRelationshipDashboardData;
}): boolean {
  const staleSummary = input.dashboardData.staleSummary;
  if (!staleSummary || staleSummary.isFresh) {
    return false;
  }
  const staleGeneratedAt = getProjectMapRelationshipTimestamp(staleSummary.generatedAt);
  const scanGeneratedAt = getProjectMapRelationshipTimestamp(input.scanSummary.generatedAt);
  if (staleGeneratedAt !== null && scanGeneratedAt !== null) {
    return staleGeneratedAt < scanGeneratedAt;
  }
  return staleSummary.generatedAt !== input.scanSummary.generatedAt;
}

function reconcileProjectMapRelationshipDashboardDataAfterScan(input: {
  scanSummary: ProjectMapRelationshipScanResponse;
  dashboardData: ProjectMapRelationshipDashboardData;
}): ProjectMapRelationshipDashboardData {
  if (!isProjectMapRelationshipStaleSummaryOlderThanScan(input)) {
    return input.dashboardData;
  }
  return {
    ...input.dashboardData,
    staleSummary: null,
  };
}

function getProjectMapRelationshipCallTargetSymbolName(relation: ProjectMapFileRelation): string | null {
  const callCandidate = getProjectMapRelationshipCallCandidate(relation);
  if (!callCandidate) {
    return null;
  }
  const withoutArguments = callCandidate.replace(/\(.*$/, "");
  const identifiers = withoutArguments.match(/[A-Za-z_$][\w$]*/g);
  return identifiers?.at(-1) ?? null;
}

function resolveProjectMapRelationshipTargetSymbolLine(input: {
  relation: ProjectMapFileRelation;
  symbols: ProjectMapRelationshipSymbol[];
}): number | null {
  const targetSymbolName = getProjectMapRelationshipCallTargetSymbolName(input.relation);
  if (!targetSymbolName) {
    return null;
  }
  const exactSymbol = input.symbols.find((symbol) => (
    symbol.fileId === input.relation.targetFileId &&
    symbol.name === targetSymbolName
  ));
  if (exactSymbol) {
    return exactSymbol.line;
  }
  const normalizedTargetSymbolName = targetSymbolName.toLowerCase();
  return input.symbols.find((symbol) => (
    symbol.fileId === input.relation.targetFileId &&
    symbol.name.toLowerCase() === normalizedTargetSymbolName
  ))?.line ?? null;
}

export function ProjectMapRelationshipSection({
  activeWorkspaceId,
  activeReadLocation,
  expanded,
  onOpenEvidenceFile,
  reloadRelationshipContext,
  scanRequestId,
  onSummaryStateChange,
}: ProjectMapRelationshipSectionProps) {
  const { t } = useTranslation();
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
  const [isRelationshipDashboardChromeCollapsed, setIsRelationshipDashboardChromeCollapsed] = useState(true);
  const [relationshipDashboardViewMode, setRelationshipDashboardViewMode] =
    useState<ProjectMapRelationshipDashboardViewMode>("graph");
  const [relationshipDashboardLayoutPreset, setRelationshipDashboardLayoutPreset] =
    useState<ProjectMapRelationshipLayoutPreset>("tree");
  const [relationshipGraphExpandedSide, setRelationshipGraphExpandedSide] =
    useState<"incoming" | "outgoing" | null>(null);
  const [isRelationshipGraphRailCollapsed, setIsRelationshipGraphRailCollapsed] = useState(false);
  const [isRelationshipGraphInspectorCollapsed, setIsRelationshipGraphInspectorCollapsed] = useState(false);
  const [relationshipGraphPan, setRelationshipGraphPan] = useState({ x: 0, y: 0 });
  const [relationshipGraphScale, setRelationshipGraphScale] = useState(1);
  const [relationshipGraphZoom, setRelationshipGraphZoom] = useState(1);
  const [relationshipFilesZoom, setRelationshipFilesZoom] = useState(1);
  const [isRelationshipGraphPanning, setIsRelationshipGraphPanning] = useState(false);
  const [selectedRelationshipFileId, setSelectedRelationshipFileId] = useState<string | null>(null);
  const [inspectedRelationshipFileId, setInspectedRelationshipFileId] = useState<string | null>(null);
  const [selectedRelationshipRelationId, setSelectedRelationshipRelationId] = useState<string | null>(null);
  const relationshipGraphCanvasRef = useRef<HTMLDivElement | null>(null);
  const relationshipGraphPanRef = useRef<ProjectMapRelationshipGraphPanStart | null>(null);
  const lastHandledScanRequestIdRef = useRef(0);

  useEffect(() => {
    onSummaryStateChange(relationshipScanState);
  }, [onSummaryStateChange, relationshipScanState]);

  useEffect(() => {
    setRelationshipGraphExpandedSide(null);
    setRelationshipGraphPan({ x: 0, y: 0 });
  }, [selectedRelationshipFileId]);

  useEffect(() => {
    setRelationshipGraphPan({ x: 0, y: 0 });
  }, [relationshipDashboardTypeFilter]);

  useEffect(() => {
    if (relationshipDashboardViewMode !== "graph") {
      return;
    }
    const canvasElement = relationshipGraphCanvasRef.current;
    if (!canvasElement) {
      return;
    }
    const updateGraphScale = () => {
      const rect = canvasElement.getBoundingClientRect();
      const nextScale = Math.min(
        1,
        Math.max(
          0.54,
          Math.min(
            (rect.width - 28) / PROJECT_MAP_RELATIONSHIP_GRAPH_WIDTH,
            (rect.height - 28) / PROJECT_MAP_RELATIONSHIP_GRAPH_HEIGHT,
          ),
        ),
      );
      setRelationshipGraphScale(Number(nextScale.toFixed(3)));
    };

    updateGraphScale();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateGraphScale);
      return () => window.removeEventListener("resize", updateGraphScale);
    }

    const resizeObserver = new ResizeObserver(updateGraphScale);
    resizeObserver.observe(canvasElement);
    return () => resizeObserver.disconnect();
  }, [
    isRelationshipGraphInspectorCollapsed,
    isRelationshipGraphRailCollapsed,
    relationshipDashboardViewMode,
  ]);

  const runRelationshipScan = useCallback((scope?: ProjectMapRelationshipScanScope) => {
    const workspaceId = activeWorkspaceId;
    if (!workspaceId || relationshipScanState.status === "running") {
      return;
    }
    const scopedChangedFiles = scope?.changedFiles ?? [];
    const scopedPaths = scope?.paths?.filter((path) => path.trim().length > 0);

    setRelationshipScanState({ status: "running" });
    void scanProjectMapRelationships({
      workspaceId,
      options: {
        maxFiles: 10_000,
        includeIgnoredHints: true,
        paths: scopedPaths?.length ? scopedPaths : undefined,
        changedFiles: scopedChangedFiles.length ? scopedChangedFiles : undefined,
      },
      storageLocation: activeReadLocation,
      })
      .then(async (summary) => {
        setRelationshipScanState({ status: "success", summary });
        try {
          const response = await readProjectMapRelationships({
            workspaceId,
            storageLocation: activeReadLocation,
          });
          const dashboardData = normalizeProjectMapRelationshipDashboardData(response);
          setRelationshipDashboardData(reconcileProjectMapRelationshipDashboardDataAfterScan({
            scanSummary: summary,
            dashboardData,
          }));
          setSelectedRelationshipFileId(null);
          setInspectedRelationshipFileId(null);
          setSelectedRelationshipRelationId(null);
          setRelationshipDashboardViewMode("graph");
          await reloadRelationshipContext();
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
    activeWorkspaceId,
    activeReadLocation,
    reloadRelationshipContext,
    relationshipScanState.status,
  ]);

  useEffect(() => {
    if (scanRequestId <= lastHandledScanRequestIdRef.current) {
      return;
    }
    lastHandledScanRequestIdRef.current = scanRequestId;
    runRelationshipScan();
  }, [runRelationshipScan, scanRequestId]);

  const handleRelationshipScanClick = useCallback(() => {
    runRelationshipScan();
  }, [runRelationshipScan]);

  const handleRelationshipStaleRefreshClick = useCallback(() => {
    const refreshSuggestion = relationshipDashboardData?.staleSummary?.refreshSuggestion;
    const scopedFiles = refreshSuggestion?.changedFiles ?? [];
    const shouldUsePartialScope = refreshSuggestion?.mode === "partial";
    runRelationshipScan({
      paths: shouldUsePartialScope ? scopedFiles : undefined,
      changedFiles: shouldUsePartialScope && scopedFiles.length ? scopedFiles : undefined,
    });
  }, [relationshipDashboardData?.staleSummary?.refreshSuggestion, runRelationshipScan]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setRelationshipScanState({ status: "idle" });
      setRelationshipDashboardData(null);
      setSelectedRelationshipFileId(null);
      setInspectedRelationshipFileId(null);
      setSelectedRelationshipRelationId(null);
      return;
    }

    let cancelled = false;
    void readProjectMapRelationships({
      workspaceId: activeWorkspaceId,
      storageLocation: activeReadLocation,
    })
      .then((response) => {
        if (cancelled) {
          return;
        }
        const summary = normalizeProjectMapRelationshipReadSummary(response);
        const dashboardData = normalizeProjectMapRelationshipDashboardData(response);
        setRelationshipDashboardData(summary ? dashboardData : null);
        if (summary) {
          setRelationshipDashboardViewMode("graph");
        }
        void reloadRelationshipContext();
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
  }, [activeWorkspaceId, activeReadLocation, reloadRelationshipContext]);

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
      const selectedFileStillVisible = relationshipDashboardFilteredFiles.some((file) => (
        file.id === selectedRelationshipFileId
      ));
      if (selectedFile && selectedFileStillVisible) {
        return selectedFile;
      }
    }
    return relationshipDashboardFilteredFiles[0] ?? null;
  }, [
    relationshipDashboardData,
    relationshipDashboardFileIndex,
    relationshipDashboardFilteredFiles,
    selectedRelationshipFileId,
  ]);

  useEffect(() => {
    const nextSelectedRelationshipFileId = selectedRelationshipFile?.id ?? null;
    if (nextSelectedRelationshipFileId === selectedRelationshipFileId) {
      return;
    }
    setSelectedRelationshipFileId(nextSelectedRelationshipFileId);
    setSelectedRelationshipRelationId(null);
  }, [
    selectedRelationshipFile?.id,
    selectedRelationshipFileId,
  ]);

  const inspectedRelationshipFile = useMemo(() => {
    if (!relationshipDashboardData?.files.length) {
      return null;
    }
    if (inspectedRelationshipFileId) {
      const inspectedFile = relationshipDashboardFileIndex.get(inspectedRelationshipFileId);
      const inspectedFileStillVisible = relationshipDashboardFilteredFiles.some((file) => (
        file.id === inspectedRelationshipFileId
      ));
      if (inspectedFile && inspectedFileStillVisible) {
        return inspectedFile;
      }
    }
    return selectedRelationshipFile;
  }, [
    inspectedRelationshipFileId,
    relationshipDashboardData,
    relationshipDashboardFileIndex,
    relationshipDashboardFilteredFiles,
    selectedRelationshipFile,
  ]);

  const relationshipDashboardFileTreeGroups = useMemo<ProjectMapRelationshipFileTreeGroup[]>(() => {
    const groups = new Map<string, ProjectMapScannedFile[]>();
    relationshipDashboardFilteredFiles.forEach((file) => {
      const moduleLabel = relationshipDashboardModuleByFileId.get(file.id);
      const pathParts = file.path.split("/").filter((part) => part.length > 0);
      const firstPathSegment = pathParts[0] ?? file.layer ?? file.role ?? "root";
      const groupLabel = moduleLabel ?? firstPathSegment;
      const files = groups.get(groupLabel) ?? [];
      files.push(file);
      groups.set(groupLabel, files);
    });
    return Array.from(groups.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, files]) => ({
        id: label,
        label,
        files,
        relationCount: files.reduce((total, file) => (
          total + (relationshipDashboardRelationCountByFile.get(file.id) ?? 0)
        ), 0),
      }));
  }, [
    relationshipDashboardFilteredFiles,
    relationshipDashboardModuleByFileId,
    relationshipDashboardRelationCountByFile,
  ]);

  const resolveRelationshipRelationsForFile = useCallback((file: ProjectMapScannedFile | null) => {
    if (!relationshipDashboardData || !file) {
      return [];
    }
    const selectedFileId = file.id;
    return relationshipDashboardData.relations
      .filter((relation) => {
        const isSelectedEdge =
          relation.sourceFileId === selectedFileId
          || relation.targetFileId === selectedFileId;
        const typeMatches =
          relationshipDashboardTypeFilter === PROJECT_MAP_RELATION_FILTER_ALL
          || relation.type === relationshipDashboardTypeFilter;
        return isSelectedEdge && typeMatches;
      })
      .sort((left, right) => {
        const leftFlowRank =
          left.type === "calls" ? 0 : left.sourceFileId === selectedFileId ? 1 : 2;
        const rightFlowRank =
          right.type === "calls" ? 0 : right.sourceFileId === selectedFileId ? 1 : 2;
        return (
          leftFlowRank - rightFlowRank
          || getProjectMapRelationshipTypeRank(left.type) - getProjectMapRelationshipTypeRank(right.type)
          || getProjectMapRelationshipConfidenceRank(left.confidence) - getProjectMapRelationshipConfidenceRank(right.confidence)
          || left.id.localeCompare(right.id)
        );
      })
      .slice(0, PROJECT_MAP_RELATIONSHIP_EDGE_LIMIT);
  }, [relationshipDashboardData, relationshipDashboardTypeFilter]);

  const selectedRelationshipRelations = useMemo(
    () => resolveRelationshipRelationsForFile(selectedRelationshipFile),
    [resolveRelationshipRelationsForFile, selectedRelationshipFile],
  );

  const inspectedRelationshipRelations = useMemo(
    () => resolveRelationshipRelationsForFile(inspectedRelationshipFile),
    [inspectedRelationshipFile, resolveRelationshipRelationsForFile],
  );

  const selectedRelationshipRelationGroups = useMemo(() => {
    if (!inspectedRelationshipFile) {
      return [];
    }
    const groups = [
      {
        id: "calls",
        title: t("projectMap.relationship.chainGroupCalls"),
        relations: [] as ProjectMapFileRelation[],
      },
      {
        id: "outgoing",
        title: t("projectMap.relationship.chainGroupOutgoing"),
        relations: [] as ProjectMapFileRelation[],
      },
      {
        id: "incoming",
        title: t("projectMap.relationship.chainGroupIncoming"),
        relations: [] as ProjectMapFileRelation[],
      },
      {
        id: "other",
        title: t("projectMap.relationship.chainGroupOther"),
        relations: [] as ProjectMapFileRelation[],
      },
    ];
    inspectedRelationshipRelations.forEach((relation) => {
      if (relation.type === "calls") {
        groups[0].relations.push(relation);
        return;
      }
      if (relation.sourceFileId === inspectedRelationshipFile.id) {
        groups[1].relations.push(relation);
        return;
      }
      if (relation.targetFileId === inspectedRelationshipFile.id) {
        groups[2].relations.push(relation);
        return;
      }
      groups[3].relations.push(relation);
    });
    return groups.filter((group) => group.relations.length > 0);
  }, [inspectedRelationshipFile, inspectedRelationshipRelations, t]);

  const relationshipDashboardGraph = useMemo(() => {
    if (!relationshipDashboardData || !selectedRelationshipFile) {
      return null;
    }
    const selectedFileId = selectedRelationshipFile.id;
    const graphRelations = selectedRelationshipRelations.slice(0, 48);
    const allIncomingIds: string[] = [];
    const allOutgoingIds: string[] = [];
    const seenIncoming = new Set<string>();
    const seenOutgoing = new Set<string>();
    graphRelations.forEach((relation) => {
      if (relation.targetFileId === selectedFileId && !seenIncoming.has(relation.sourceFileId)) {
        seenIncoming.add(relation.sourceFileId);
        allIncomingIds.push(relation.sourceFileId);
      }
      if (relation.sourceFileId === selectedFileId && !seenOutgoing.has(relation.targetFileId)) {
        seenOutgoing.add(relation.targetFileId);
        allOutgoingIds.push(relation.targetFileId);
      }
    });

    const incomingLimit = relationshipGraphExpandedSide === "incoming"
      ? PROJECT_MAP_RELATIONSHIP_GRAPH_EXPANDED_SIDE_LIMIT
      : PROJECT_MAP_RELATIONSHIP_GRAPH_SIDE_LIMIT;
    const outgoingLimit = relationshipGraphExpandedSide === "outgoing"
      ? PROJECT_MAP_RELATIONSHIP_GRAPH_EXPANDED_SIDE_LIMIT
      : PROJECT_MAP_RELATIONSHIP_GRAPH_SIDE_LIMIT;
    const incomingIds = allIncomingIds.slice(0, incomingLimit);
    const outgoingIds = allOutgoingIds.slice(0, outgoingLimit);
    const hiddenIncomingCount = Math.max(0, allIncomingIds.length - incomingIds.length);
    const hiddenOutgoingCount = Math.max(0, allOutgoingIds.length - outgoingIds.length);
    const allNeighborIds = new Set<string>([...allIncomingIds, ...allOutgoingIds]);
    const visibleNeighborIds = new Set<string>([...incomingIds, ...outgoingIds]);
    const nodeIds = new Set<string>([selectedFileId, ...visibleNeighborIds]);
    const secondaryIds: string[] = [];
    for (const file of relationshipDashboardFilteredFiles) {
      if (secondaryIds.length >= PROJECT_MAP_RELATIONSHIP_GRAPH_SECONDARY_LIMIT) {
        break;
      }
      if (nodeIds.has(file.id) || allNeighborIds.has(file.id)) {
        continue;
      }
      nodeIds.add(file.id);
      secondaryIds.push(file.id);
    }
    const yFor = (index: number, total: number, hasAggregate: boolean) => {
      const topPadding = 92;
      const bottomPadding = hasAggregate ? 200 : 126;
      const laneBottom = PROJECT_MAP_RELATIONSHIP_GRAPH_HEIGHT - bottomPadding;
      if (total <= 1) {
        return Math.round((topPadding + laneBottom) / 2);
      }
      return Math.round(topPadding + index * ((laneBottom - topPadding) / Math.max(total - 1, 1)));
    };
    const positions = new Map<string, { x: number; y: number }>();
    const incomingX = 128;
    const selectedX = Math.round(PROJECT_MAP_RELATIONSHIP_GRAPH_WIDTH / 2 - PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_X);
    const outgoingX = PROJECT_MAP_RELATIONSHIP_GRAPH_WIDTH - incomingX - PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_WIDTH;
    const selectedY = Math.round(PROJECT_MAP_RELATIONSHIP_GRAPH_HEIGHT / 2 - PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_Y);
    positions.set(selectedFileId, { x: selectedX, y: selectedY });
    if (relationshipDashboardLayoutPreset === "radial") {
      const radialIds = [...incomingIds, ...outgoingIds, ...secondaryIds];
      const centerX = selectedX + PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_X;
      const centerY = selectedY + PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_Y;
      const radiusX = 430;
      const radiusY = 245;
      radialIds.forEach((nodeId, index) => {
        const angle = (-Math.PI / 2) + (index * 2 * Math.PI) / Math.max(radialIds.length, 1);
        positions.set(nodeId, {
          x: Math.round(centerX + Math.cos(angle) * radiusX - PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_X),
          y: Math.round(centerY + Math.sin(angle) * radiusY - PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_Y),
        });
      });
    } else if (relationshipDashboardLayoutPreset === "force") {
      const forceIds = [...incomingIds, ...outgoingIds, ...secondaryIds];
      forceIds.forEach((nodeId, index) => {
        const column = index % 4;
        const row = Math.floor(index / 4);
        positions.set(nodeId, {
          x: 150 + column * 250 + (row % 2) * 56,
          y: 92 + row * 132,
        });
      });
    } else {
      incomingIds.forEach((nodeId, index) => {
        positions.set(nodeId, { x: incomingX, y: yFor(index, incomingIds.length, hiddenIncomingCount > 0) });
      });
      outgoingIds.forEach((nodeId, index) => {
        positions.set(nodeId, { x: outgoingX, y: yFor(index, outgoingIds.length, hiddenOutgoingCount > 0) });
      });
      secondaryIds.forEach((nodeId, index) => {
        const topRow = index % 2 === 0;
        positions.set(nodeId, {
          x: 360 + (index % 3) * 210,
          y: topRow ? 58 : PROJECT_MAP_RELATIONSHIP_GRAPH_HEIGHT - 150,
        });
      });
    }

    const nodes = Array.from(nodeIds)
      .flatMap((nodeId) => {
        const file = relationshipDashboardFileIndex.get(nodeId);
        const position = positions.get(nodeId);
        if (!file || !position) {
          return [];
        }
        const directionCount =
          relationshipDashboardDirectionCountByFile.get(file.id)
          ?? { incoming: 0, outgoing: 0 };
        return [{
          file,
          x: position.x,
          y: position.y,
          incoming: directionCount.incoming,
          outgoing: directionCount.outgoing,
          total: relationshipDashboardRelationCountByFile.get(file.id) ?? 0,
          isSelected: file.id === selectedFileId,
          isNeighbor: file.id !== selectedFileId
            && (seenIncoming.has(file.id) || seenOutgoing.has(file.id)),
        }];
      });

    const selectedNode = nodes.find((node) => node.file.id === selectedFileId);
    const aggregateNodes = [
      ...(hiddenIncomingCount > 0 ? [{
        id: "aggregate-incoming",
        kind: "incoming" as const,
        count: hiddenIncomingCount,
        isExpanded: relationshipGraphExpandedSide === "incoming",
        x: incomingX,
        y: PROJECT_MAP_RELATIONSHIP_GRAPH_HEIGHT - 104,
      }] : []),
      ...(hiddenOutgoingCount > 0 ? [{
        id: "aggregate-outgoing",
        kind: "outgoing" as const,
        count: hiddenOutgoingCount,
        isExpanded: relationshipGraphExpandedSide === "outgoing",
        x: outgoingX,
        y: PROJECT_MAP_RELATIONSHIP_GRAPH_HEIGHT - 104,
      }] : []),
    ];

    const positionById = new Map(nodes.map((node) => [node.file.id, node]));
    const edges = graphRelations
      .filter((relation) => positionById.has(relation.sourceFileId) && positionById.has(relation.targetFileId))
      .slice(0, 64)
      .map((relation) => {
        const source = positionById.get(relation.sourceFileId)!;
        const target = positionById.get(relation.targetFileId)!;
        return {
          relation,
          sourceX: source.x + PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_X,
          sourceY: source.y + PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_Y,
          targetX: target.x + PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_X,
          targetY: target.y + PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_Y,
          labelX: (source.x + target.x) / 2 + PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_X,
          labelY: (source.y + target.y) / 2 + PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_Y,
          isSelected: selectedRelationshipRelationId === relation.id,
        };
      });
    const aggregateEdges = selectedNode ? aggregateNodes.map((node) => ({
      id: `${node.id}:edge`,
      kind: node.kind,
      count: node.count,
      sourceX: node.kind === "incoming"
        ? node.x + PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_X
        : selectedNode.x + PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_X,
      sourceY: node.kind === "incoming"
        ? node.y + PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_Y
        : selectedNode.y + PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_Y,
      targetX: node.kind === "incoming"
        ? selectedNode.x + PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_X
        : node.x + PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_X,
      targetY: node.kind === "incoming"
        ? selectedNode.y + PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_Y
        : node.y + PROJECT_MAP_RELATIONSHIP_GRAPH_NODE_CENTER_Y,
    })) : [];

    return { nodes, edges, aggregateNodes, aggregateEdges };
  }, [
    relationshipDashboardData,
    relationshipDashboardDirectionCountByFile,
    relationshipDashboardFileIndex,
    relationshipDashboardFilteredFiles,
    relationshipDashboardLayoutPreset,
    relationshipGraphExpandedSide,
    relationshipDashboardRelationCountByFile,
    selectedRelationshipFile,
    selectedRelationshipRelationId,
    selectedRelationshipRelations,
  ]);

  const handleRelationshipGraphPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.closest(
        "button, input, select, textarea, .project-map-relationship-graph-node, .project-map-relationship-graph-edge, .project-map-relationship-graph-canvas-header, .project-map-relationship-graph-minimap",
      )
    ) {
      return;
    }
    relationshipGraphPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: relationshipGraphPan.x,
      originY: relationshipGraphPan.y,
    };
    setIsRelationshipGraphPanning(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleRelationshipGraphPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const panStart = relationshipGraphPanRef.current;
    if (!panStart || panStart.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    setRelationshipGraphPan({
      x: panStart.originX + event.clientX - panStart.startX,
      y: panStart.originY + event.clientY - panStart.startY,
    });
  };

  const handleRelationshipGraphPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (relationshipGraphPanRef.current?.pointerId !== event.pointerId) {
      return;
    }
    relationshipGraphPanRef.current = null;
    setIsRelationshipGraphPanning(false);
  };

  const selectedRelationshipRelation = useMemo(() => {
    if (!inspectedRelationshipRelations.length) {
      return null;
    }
    if (selectedRelationshipRelationId) {
      const selectedRelation = inspectedRelationshipRelations.find(
        (relation) => relation.id === selectedRelationshipRelationId,
      );
      if (selectedRelation) {
        return selectedRelation;
      }
    }
    return inspectedRelationshipRelations.find((relation) => relation.type === "calls")
      ?? inspectedRelationshipRelations[0]
      ?? null;
  }, [inspectedRelationshipRelations, selectedRelationshipRelationId]);

  const selectedRelationshipScopeWarnings = useMemo(() => (
    relationshipDashboardData?.staleSummary?.reasons.filter(
      (reason) => reason.kind === "scan-scope-warning",
    ) ?? []
  ), [relationshipDashboardData?.staleSummary?.reasons]);

  const supportsRelationshipDashboardZoom =
    relationshipDashboardViewMode === "graph" || relationshipDashboardViewMode === "files";

  const handleRelationshipDashboardZoomOut = useCallback(() => {
    if (relationshipDashboardViewMode === "files") {
      setRelationshipFilesZoom((current) => Number(Math.max(0.7, current - 0.1).toFixed(2)));
      return;
    }
    setRelationshipGraphZoom((current) => Number(Math.max(0.7, current - 0.1).toFixed(2)));
  }, [relationshipDashboardViewMode]);

  const handleRelationshipDashboardZoomIn = useCallback(() => {
    if (relationshipDashboardViewMode === "files") {
      setRelationshipFilesZoom((current) => Number(Math.min(1.8, current + 0.1).toFixed(2)));
      return;
    }
    setRelationshipGraphZoom((current) => Number(Math.min(1.8, current + 0.1).toFixed(2)));
  }, [relationshipDashboardViewMode]);

  const handleRelationshipDashboardViewReset = useCallback(() => {
    if (relationshipDashboardViewMode === "files") {
      setRelationshipFilesZoom(1);
      return;
    }
    setRelationshipGraphPan({ x: 0, y: 0 });
    setRelationshipGraphZoom(1);
  }, [relationshipDashboardViewMode]);

  const openProjectMapRelationshipPath = useCallback((path: string | null | undefined, line?: number | null) => {
    const normalizedPath = path?.trim();
    if (!normalizedPath || !onOpenEvidenceFile) {
      return;
    }
    onOpenEvidenceFile(
      normalizedPath,
      line ? { line, column: 1 } : undefined,
    );
  }, [onOpenEvidenceFile]);

  const openProjectMapRelationshipFileWithEvidence = useCallback((input: {
    filePath: string | null | undefined;
    preferredLine?: number | null;
    evidencePath?: string | null;
    evidenceLine?: number | null;
  }) => {
    const filePath = input.filePath?.trim();
    if (!filePath) {
      return;
    }
    const evidencePath = input.evidencePath?.trim();
    const evidenceMatchesFile =
      Boolean(evidencePath)
      && (
        evidencePath === filePath
        || evidencePath?.endsWith(`/${filePath}`)
        || filePath.endsWith(`/${evidencePath}`)
      );
    openProjectMapRelationshipPath(
      filePath,
      input.preferredLine ?? (evidenceMatchesFile ? input.evidenceLine : null),
    );
  }, [openProjectMapRelationshipPath]);

  const focusProjectMapRelationshipRelation = useCallback((direction: "incoming" | "outgoing" | "total") => {
    if (!inspectedRelationshipFile) {
      return;
    }
    const selectedFileId = inspectedRelationshipFile.id;
    const relation =
      direction === "incoming"
        ? inspectedRelationshipRelations.find((item) => item.targetFileId === selectedFileId)
        : direction === "outgoing"
          ? inspectedRelationshipRelations.find((item) => item.sourceFileId === selectedFileId)
          : inspectedRelationshipRelations[0];
    if (relation) {
      setSelectedRelationshipRelationId(relation.id);
    }
  }, [inspectedRelationshipFile, inspectedRelationshipRelations]);

  if (!expanded) {
    return null;
  }

  return (
                <section className="project-map-relationship-scan-panel">
                  <header>
                    <Network aria-hidden />
                    <div className="project-map-relationship-scan-title">
                      <h4>{t("projectMap.relationship.dashboardTitle")}</h4>
                      <p>
                        {relationshipScanState.status === "success"
                          ? t("projectMap.relationship.dashboardReady", {
                              runId: relationshipScanState.summary.scanRunId,
                            })
                          : t("projectMap.relationship.dashboardEmpty")}
                      </p>
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
                    </div>
                    <button
                      type="button"
                      className="project-map-toolbar-action"
                      onClick={handleRelationshipScanClick}
                      disabled={!activeWorkspaceId || relationshipScanState.status === "running"}
                    >
                      <RefreshCw aria-hidden />
                      {relationshipScanState.status === "running"
                        ? t("projectMap.relationship.scanning")
                        : t("projectMap.relationship.scan")}
                    </button>
                  </header>
                  {relationshipDashboardData ? (
                    <div className="project-map-relationship-dashboard">
                      <div className="project-map-relationship-dashboard-topbar">
                        <div className="project-map-relationship-view-switch">
                          {PROJECT_MAP_RELATIONSHIP_VIEW_ORDER.map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              className={cn(
                                `is-${mode}`,
                                relationshipDashboardViewMode === mode && "is-active",
                              )}
                              onClick={() => setRelationshipDashboardViewMode(mode)}
                            >
                              {t(`projectMap.relationship.view.${mode}`)}
                            </button>
                          ))}
                        </div>
                        <div className="project-map-relationship-dashboard-topbar-actions">
                          {supportsRelationshipDashboardZoom ? (
                            <div className="project-map-relationship-graph-layout-controls">
                              <button
                                type="button"
                                className="is-zoom-out"
                                onClick={handleRelationshipDashboardZoomOut}
                              >
                                {t("projectMap.relationship.graphZoomOut")}
                              </button>
                              <button
                                type="button"
                                className="is-zoom-in"
                                onClick={handleRelationshipDashboardZoomIn}
                              >
                                {t("projectMap.relationship.graphZoomIn")}
                              </button>
                              {relationshipDashboardViewMode === "graph" ? (
                                <>
                                  <button
                                    type="button"
                                    className={cn(
                                      "is-files",
                                      !isRelationshipGraphRailCollapsed && "is-active",
                                    )}
                                    onClick={() => setIsRelationshipGraphRailCollapsed((current) => !current)}
                                  >
                                    {isRelationshipGraphRailCollapsed
                                      ? t("projectMap.relationship.graphShowFiles")
                                      : t("projectMap.relationship.graphHideFiles")}
                                  </button>
                                  <button
                                    type="button"
                                    className={cn(
                                      "is-inspector",
                                      !isRelationshipGraphInspectorCollapsed && "is-active",
                                    )}
                                    onClick={() => setIsRelationshipGraphInspectorCollapsed((current) => !current)}
                                  >
                                    {isRelationshipGraphInspectorCollapsed
                                      ? t("projectMap.relationship.graphShowInspector")
                                      : t("projectMap.relationship.graphHideInspector")}
                                  </button>
                                </>
                              ) : null}
                              <button
                                type="button"
                                className="is-reset"
                                onClick={handleRelationshipDashboardViewReset}
                              >
                                {t("projectMap.relationship.graphResetView")}
                              </button>
                              <label className="project-map-relationship-layout-preset">
                                <span>{t("projectMap.layoutPreset")}</span>
                                <select
                                  value={relationshipDashboardLayoutPreset}
                                  aria-label={t("projectMap.layoutPreset")}
                                  onChange={(event) => (
                                    setRelationshipDashboardLayoutPreset(
                                      event.currentTarget.value as ProjectMapRelationshipLayoutPreset,
                                    )
                                  )}
                                >
                                  <option value="radial">{t("projectMap.layoutPresetRadial")}</option>
                                  <option value="tree">{t("projectMap.layoutPresetTree")}</option>
                                  <option value="force">{t("projectMap.layoutPresetForce")}</option>
                                </select>
                              </label>
                            </div>
                          ) : null}
                          <div className={cn(
                            "project-map-relationship-dashboard-chrome-header",
                            isRelationshipDashboardChromeCollapsed && "is-collapsed",
                          )}>
                            <button
                              type="button"
                              className="project-map-relationship-dashboard-chrome-toggle"
                              onClick={() => setIsRelationshipDashboardChromeCollapsed((current) => !current)}
                            >
                              {isRelationshipDashboardChromeCollapsed
                                ? t("projectMap.relationship.chromeShow")
                                : t("projectMap.relationship.chromeHide")}
                            </button>
                            {isRelationshipDashboardChromeCollapsed ? (
                              <span>
                                {t("projectMap.relationship.chromeSummary", {
                                  files: relationshipDashboardData.files.length,
                                  relations: relationshipDashboardData.relations.length,
                                  freshness:
                                    relationshipDashboardData.staleSummary && !relationshipDashboardData.staleSummary.isFresh
                                      ? t("projectMap.relationship.chromeStale")
                                      : t("projectMap.relationship.chromeFresh"),
                                })}
                              </span>
                            ) : null}
                            {isRelationshipDashboardChromeCollapsed
                              && relationshipDashboardData.staleSummary
                              && !relationshipDashboardData.staleSummary.isFresh ? (
                              <button
                                type="button"
                                className="project-map-relationship-dashboard-chrome-refresh"
                                onClick={handleRelationshipStaleRefreshClick}
                                disabled={!activeWorkspaceId || relationshipScanState.status === "running"}
                              >
                                <RefreshCw aria-hidden />
                                {t("projectMap.relationship.staleRefresh", {
                                  mode: relationshipDashboardData.staleSummary.refreshSuggestion?.mode ?? "full",
                                })}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className={cn(
                        "project-map-relationship-dashboard-chrome",
                        isRelationshipDashboardChromeCollapsed && "is-collapsed",
                      )}>
                        {!isRelationshipDashboardChromeCollapsed ? (
                          <>
                            {relationshipDashboardData.staleSummary && !relationshipDashboardData.staleSummary.isFresh ? (
                              <div className="project-map-relationship-stale-banner">
                                <div>
                                  <strong>{t("projectMap.relationship.staleTitle")}</strong>
                                  <span>
                                    {relationshipDashboardData.staleSummary.reasons[0]?.message
                                      ?? t("projectMap.relationship.staleFallback")}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="project-map-toolbar-action"
                                  onClick={handleRelationshipStaleRefreshClick}
                                  disabled={!activeWorkspaceId || relationshipScanState.status === "running"}
                                >
                                  <RefreshCw aria-hidden />
                                  {t("projectMap.relationship.staleRefresh", {
                                    mode: relationshipDashboardData.staleSummary.refreshSuggestion?.mode ?? "full",
                                  })}
                                </button>
                              </div>
                            ) : null}
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
                            <div className="project-map-relationship-role-strip">
                              <button
                                type="button"
                                className={cn(
                                  relationshipDashboardRoleFilter === PROJECT_MAP_RELATION_FILTER_ALL && "is-active",
                                )}
                                onClick={() => setRelationshipDashboardRoleFilter(PROJECT_MAP_RELATION_FILTER_ALL)}
                              >
                                {t("projectMap.relationship.allRoles")}
                              </button>
                              {relationshipDashboardRoleOptions.slice(0, 10).map((role) => (
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
                          </>
                        ) : null}
                      </div>
                              {relationshipDashboardViewMode === "graph" ? (
                        <>
                          <div
                            className={cn(
                              "project-map-relationship-graph-dashboard",
                              isRelationshipGraphRailCollapsed && "is-rail-collapsed",
                              isRelationshipGraphInspectorCollapsed && "is-inspector-collapsed",
                            )}
                          >
                          {!isRelationshipGraphRailCollapsed ? (
                            <aside className="project-map-relationship-graph-rail">
                              <header>
                                <strong>{t("projectMap.relationship.graphFiles")}</strong>
                                <span>{t("projectMap.relationship.graphTopFiles", {
                                  count: Math.min(relationshipDashboardFilteredFiles.length, 32),
                                })}</span>
                              </header>
                              <div className="project-map-relationship-graph-file-list">
                                {relationshipDashboardFilteredFiles.slice(0, 32).map((file) => {
                                  const directionCount =
                                    relationshipDashboardDirectionCountByFile.get(file.id)
                                    ?? { incoming: 0, outgoing: 0 };
                                  return (
                                    <button
                                      key={file.id}
                                      type="button"
                                      className={cn(
                                        selectedRelationshipFile?.id === file.id && "is-active",
                                      )}
                                      onClick={() => {
                                        setSelectedRelationshipFileId(file.id);
                                        setInspectedRelationshipFileId(file.id);
                                        setSelectedRelationshipRelationId(null);
                                      }}
                                    >
                                      <span
                                        style={{
                                          "--relationship-node-color": getProjectMapRelationshipRoleColor(file.role),
                                        } as CSSProperties}
                                      />
                                      <strong>{file.basename}</strong>
                                      <em>
                                        {t("projectMap.relationship.graphFileDirectionSummary", {
                                          role: file.role,
                                          incoming: directionCount.incoming,
                                          outgoing: directionCount.outgoing,
                                        })}
                                      </em>
                                    </button>
                                  );
                                })}
                              </div>
                            </aside>
                          ) : null}
                          <div
                            className={cn(
                              "project-map-relationship-graph-canvas",
                              isRelationshipGraphPanning && "is-panning",
                            )}
                            ref={relationshipGraphCanvasRef}
                            onPointerDown={handleRelationshipGraphPointerDown}
                            onPointerMove={handleRelationshipGraphPointerMove}
                            onPointerUp={handleRelationshipGraphPointerEnd}
                            onPointerCancel={handleRelationshipGraphPointerEnd}
                            onWheel={(event) => {
                              if (event.deltaY === 0) {
                                return;
                              }
                              event.preventDefault();
                              setRelationshipGraphZoom((current) => (
                                Number(Math.min(1.8, Math.max(0.7, current + (event.deltaY < 0 ? 0.1 : -0.1))).toFixed(2))
                              ));
                            }}
                          >
                            <header className="project-map-relationship-graph-canvas-header">
                              <div>
                                <strong>{t("projectMap.relationship.graphTitle")}</strong>
                                <span>{t("projectMap.relationship.graphSubtitle")}</span>
                              </div>
                              {selectedRelationshipFile ? (
                                <span>{t("projectMap.relationship.graphFocusHint", {
                                  file: selectedRelationshipFile.basename,
                                })}</span>
                              ) : null}
                            </header>
                            <div className="project-map-relationship-graph-legend">
                              <button
                                type="button"
                                className={cn(
                                  relationshipDashboardTypeFilter === PROJECT_MAP_RELATION_FILTER_ALL && "is-active",
                                )}
                                onClick={() => {
                                  setRelationshipDashboardTypeFilter(PROJECT_MAP_RELATION_FILTER_ALL);
                                  setSelectedRelationshipRelationId(null);
                                }}
                              >
                                {t("projectMap.relationship.graphLegendAll")}
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  "is-calls",
                                  relationshipDashboardTypeFilter === "calls" && "is-active",
                                )}
                                onClick={() => {
                                  setRelationshipDashboardTypeFilter("calls");
                                  setSelectedRelationshipRelationId(null);
                                }}
                              >
                                {t("projectMap.relationship.graphLegendCalls")}
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  "is-imports",
                                  relationshipDashboardTypeFilter === "imports" && "is-active",
                                )}
                                onClick={() => {
                                  setRelationshipDashboardTypeFilter("imports");
                                  setSelectedRelationshipRelationId(null);
                                }}
                              >
                                {t("projectMap.relationship.graphLegendImports")}
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  "is-tests",
                                  relationshipDashboardTypeFilter === "tested_by" && "is-active",
                                )}
                                onClick={() => {
                                  setRelationshipDashboardTypeFilter("tested_by");
                                  setSelectedRelationshipRelationId(null);
                                }}
                              >
                                {t("projectMap.relationship.graphLegendTests")}
                              </button>
                              <span>{t("projectMap.relationship.graphLegendOther")}</span>
                            </div>
                            {relationshipDashboardGraph ? (
                              <>
                                <div
                                  className="project-map-relationship-graph-stage"
                                  style={{
                                    "--relationship-graph-pan-x": `${relationshipGraphPan.x}px`,
                                    "--relationship-graph-pan-y": `${relationshipGraphPan.y}px`,
                                    "--relationship-graph-scale": Number((relationshipGraphScale * relationshipGraphZoom).toFixed(3)),
                                  } as CSSProperties}
                                >
                                  <div className="project-map-relationship-graph-lane-label is-incoming">
                                    {t("projectMap.relationship.graphLaneIncoming")}
                                  </div>
                                  <div className="project-map-relationship-graph-lane-label is-current">
                                    {t("projectMap.relationship.graphLaneCurrent")}
                                  </div>
                                  <div className="project-map-relationship-graph-lane-label is-outgoing">
                                    {t("projectMap.relationship.graphLaneOutgoing")}
                                  </div>
                                <svg
                                  className="project-map-relationship-graph-svg"
                                  viewBox={`0 0 ${PROJECT_MAP_RELATIONSHIP_GRAPH_WIDTH} ${PROJECT_MAP_RELATIONSHIP_GRAPH_HEIGHT}`}
                                  preserveAspectRatio="none"
                                  aria-hidden
                                >
                                  <defs>
                                    <marker
                                      id="project-map-relationship-arrow"
                                      markerWidth="8"
                                      markerHeight="8"
                                      refX="7"
                                      refY="4"
                                      orient="auto"
                                    >
                                      <path d="M0,0 L8,4 L0,8 Z" />
                                    </marker>
                                  </defs>
                                  {relationshipDashboardGraph.edges.map((edge) => {
                                    const arrowX = edge.sourceX + (edge.targetX - edge.sourceX) * 0.62;
                                    const arrowY = edge.sourceY + (edge.targetY - edge.sourceY) * 0.62;
                                    const arrowAngle = Math.atan2(
                                      edge.targetY - edge.sourceY,
                                      edge.targetX - edge.sourceX,
                                    ) * 180 / Math.PI;
                                    return (
                                      <g
                                        key={edge.relation.id}
                                        className={cn(
                                          "project-map-relationship-graph-edge",
                                          edge.relation.type === "calls" && "is-calls",
                                          edge.relation.type === "imports" && "is-imports",
                                          edge.relation.type === "tested_by" && "is-tests",
                                          edge.isSelected && "is-selected",
                                        )}
                                        onClick={() => {
                                          setInspectedRelationshipFileId(edge.relation.sourceFileId);
                                          setSelectedRelationshipRelationId(edge.relation.id);
                                        }}
                                      >
                                        <line
                                          x1={edge.sourceX}
                                          y1={edge.sourceY}
                                          x2={edge.targetX}
                                          y2={edge.targetY}
                                          markerEnd="url(#project-map-relationship-arrow)"
                                        />
                                        <path
                                          className="project-map-relationship-graph-edge-arrow"
                                          d="M -6 -4 L 6 0 L -6 4 Z"
                                          transform={`translate(${arrowX} ${arrowY}) rotate(${arrowAngle})`}
                                        />
                                      </g>
                                    );
                                  })}
                                  {relationshipDashboardGraph.aggregateEdges.map((edge) => {
                                    const arrowX = edge.sourceX + (edge.targetX - edge.sourceX) * 0.62;
                                    const arrowY = edge.sourceY + (edge.targetY - edge.sourceY) * 0.62;
                                    const arrowAngle = Math.atan2(
                                      edge.targetY - edge.sourceY,
                                      edge.targetX - edge.sourceX,
                                    ) * 180 / Math.PI;
                                    return (
                                      <g
                                        key={edge.id}
                                        className="project-map-relationship-graph-aggregate-edge"
                                      >
                                        <line
                                          x1={edge.sourceX}
                                          y1={edge.sourceY}
                                          x2={edge.targetX}
                                          y2={edge.targetY}
                                          markerEnd="url(#project-map-relationship-arrow)"
                                        />
                                        <path
                                          className="project-map-relationship-graph-edge-arrow"
                                          d="M -5 -3.5 L 5 0 L -5 3.5 Z"
                                          transform={`translate(${arrowX} ${arrowY}) rotate(${arrowAngle})`}
                                        />
                                      </g>
                                    );
                                  })}
                                </svg>
                                {relationshipDashboardGraph.edges.map((edge) => {
                                  const callCandidate = getProjectMapRelationshipCallCandidate(edge.relation);
                                  return (
                                    <button
                                      key={`${edge.relation.id}:label`}
                                      type="button"
                                      className={cn(
                                        "project-map-relationship-graph-edge-label",
                                        edge.relation.type === "calls" && "is-calls",
                                        edge.relation.type === "imports" && "is-imports",
                                        edge.relation.type === "tested_by" && "is-tests",
                                        edge.isSelected && "is-selected",
                                      )}
                                      style={{
                                        left: edge.labelX,
                                        top: edge.labelY,
                                      }}
                                      title={callCandidate ?? edge.relation.type}
                                      onClick={() => {
                                        setInspectedRelationshipFileId(edge.relation.sourceFileId);
                                        setSelectedRelationshipRelationId(edge.relation.id);
                                      }}
                                    >
                                      {callCandidate ?? edge.relation.type}
                                    </button>
                                  );
                                })}
                                {relationshipDashboardGraph.nodes.map((node) => (
                                  <div
                                    key={node.file.id}
                                    role="button"
                                    tabIndex={0}
                                    className={cn(
                                      "project-map-relationship-graph-node",
                                      node.isSelected && "is-selected",
                                      inspectedRelationshipFile?.id === node.file.id && "is-inspected",
                                      node.isNeighbor && "is-neighbor",
                                      selectedRelationshipRelation
                                        && (
                                          selectedRelationshipRelation.sourceFileId === node.file.id
                                          || selectedRelationshipRelation.targetFileId === node.file.id
                                        )
                                        && "is-edge-endpoint",
                                      !node.isSelected && !node.isNeighbor && "is-secondary",
                                    )}
                                    style={{
                                      left: node.x,
                                      top: node.y,
                                      "--relationship-node-color": getProjectMapRelationshipRoleColor(node.file.role),
                                    } as CSSProperties}
                                    onClick={() => {
                                      setInspectedRelationshipFileId(node.file.id);
                                      setSelectedRelationshipRelationId(null);
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.target !== event.currentTarget) {
                                        return;
                                      }
                                      if (event.key !== "Enter" && event.key !== " ") {
                                        return;
                                      }
                                      event.preventDefault();
                                      setInspectedRelationshipFileId(node.file.id);
                                      setSelectedRelationshipRelationId(null);
                                    }}
                                  >
                                    <i aria-hidden />
                                    <button
                                      type="button"
                                      className="project-map-relationship-graph-node-jump"
                                      aria-label={t("projectMap.relationship.graphFocusHint", {
                                        file: node.file.basename,
                                      })}
                                      title={t("projectMap.relationship.graphFocusHint", {
                                        file: node.file.basename,
                                      })}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedRelationshipFileId(node.file.id);
                                        setInspectedRelationshipFileId(node.file.id);
                                        setSelectedRelationshipRelationId(null);
                                      }}
                                    >
                                      <ExternalLink aria-hidden />
                                    </button>
                                    <span>{node.file.role}</span>
                                    <strong>{node.file.basename}</strong>
                                    <em>{node.file.language} · {node.file.layer}</em>
                                    <small>
                                      {t("projectMap.relationship.graphNodeMetricSummary", {
                                        incoming: node.incoming,
                                        outgoing: node.outgoing,
                                        total: node.total,
                                      })}
                                    </small>
                                  </div>
                                ))}
                                {relationshipDashboardGraph.aggregateNodes.map((node) => (
                                  <button
                                    key={node.id}
                                    type="button"
                                    className={cn(
                                      "project-map-relationship-graph-aggregate-node",
                                      node.kind === "incoming" ? "is-incoming" : "is-outgoing",
                                      node.isExpanded && "is-expanded",
                                    )}
                                    style={{ left: node.x, top: node.y }}
                                    onClick={() => {
                                      setRelationshipGraphExpandedSide((current) => (
                                        current === node.kind ? null : node.kind
                                      ));
                                      setSelectedRelationshipRelationId(null);
                                    }}
                                  >
                                    <strong>+{node.count}</strong>
                                    <span>
                                      {node.kind === "incoming"
                                        ? t("projectMap.relationship.graphMoreIncoming")
                                        : t("projectMap.relationship.graphMoreOutgoing")}
                                      {" · "}
                                      {node.isExpanded
                                        ? t("projectMap.relationship.graphMoreCollapse")
                                        : t("projectMap.relationship.graphMoreExpand")}
                                    </span>
                                  </button>
                                ))}
                                </div>
                                <div className="project-map-relationship-graph-minimap" aria-hidden>
                                  {relationshipDashboardGraph.nodes.map((node) => (
                                    <span
                                      key={`${node.file.id}:minimap`}
                                      className={cn(
                                        node.isSelected && "is-selected",
                                        node.isNeighbor && "is-neighbor",
                                        selectedRelationshipRelation
                                          && (
                                            selectedRelationshipRelation.sourceFileId === node.file.id
                                            || selectedRelationshipRelation.targetFileId === node.file.id
                                          )
                                          && "is-edge-endpoint",
                                      )}
                                      style={{
                                        left: `${Math.max(3, Math.min(94, (node.x / PROJECT_MAP_RELATIONSHIP_GRAPH_WIDTH) * 100))}%`,
                                        top: `${Math.max(6, Math.min(90, (node.y / PROJECT_MAP_RELATIONSHIP_GRAPH_HEIGHT) * 100))}%`,
                                        "--relationship-node-color": getProjectMapRelationshipRoleColor(node.file.role),
                                      } as CSSProperties}
                                    />
                                  ))}
                                </div>
                                {!relationshipDashboardGraph.edges.length ? (
                                  <p className="project-map-relationship-graph-empty">
                                    {t("projectMap.relationship.graphNoEdges")}
                                  </p>
                                ) : null}
                              </>
                            ) : (
                              <p className="project-map-relationship-graph-empty">
                                {t("projectMap.relationship.graphNoEdges")}
                              </p>
                            )}
                          </div>
                          {!isRelationshipGraphInspectorCollapsed ? (
                            <aside className="project-map-relationship-graph-inspector">
                              <header className="project-map-relationship-graph-inspector-header">
                                <div>
                                  <span>{t("projectMap.relationship.graphInspector")}</span>
                                  <strong>
                                    {inspectedRelationshipFile?.basename ?? t("projectMap.relationship.inspectorNoFile")}
                                  </strong>
                                  {inspectedRelationshipFile ? <p>{inspectedRelationshipFile.path}</p> : null}
                                </div>
                              </header>
                              {inspectedRelationshipFile ? (
                                <>
                                  <div className="project-map-relationship-inspector-tags">
                                    <span>{inspectedRelationshipFile.role}</span>
                                    <span>{inspectedRelationshipFile.language}</span>
                                    <span>{inspectedRelationshipFile.layer}</span>
                                    <span>{inspectedRelationshipFile.parseStatus}</span>
                                  </div>
                                  <div className="project-map-relationship-inspector-metrics">
                                    <button
                                      type="button"
                                      onClick={() => focusProjectMapRelationshipRelation("incoming")}
                                      disabled={!inspectedRelationshipRelations.some((item) => (
                                        item.targetFileId === inspectedRelationshipFile.id
                                      ))}
                                    >
                                      <strong>{relationshipDashboardDirectionCountByFile.get(inspectedRelationshipFile.id)?.incoming ?? 0}</strong>
                                      {t("projectMap.relationship.inspectorIncomingShort")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => focusProjectMapRelationshipRelation("outgoing")}
                                      disabled={!inspectedRelationshipRelations.some((item) => (
                                        item.sourceFileId === inspectedRelationshipFile.id
                                      ))}
                                    >
                                      <strong>{relationshipDashboardDirectionCountByFile.get(inspectedRelationshipFile.id)?.outgoing ?? 0}</strong>
                                      {t("projectMap.relationship.inspectorOutgoingShort")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => focusProjectMapRelationshipRelation("total")}
                                      disabled={!inspectedRelationshipRelations.length}
                                    >
                                      <strong>{relationshipDashboardRelationCountByFile.get(inspectedRelationshipFile.id) ?? 0}</strong>
                                      {t("projectMap.relationship.inspectorTotalShort")}
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <p className="project-map-relationship-inspector-empty">
                                  {t("projectMap.relationship.inspectorEmpty")}
                                </p>
                              )}
                              {selectedRelationshipRelation ? (() => {
                                const sourceFile = relationshipDashboardFileIndex.get(selectedRelationshipRelation.sourceFileId);
                                const targetFile = relationshipDashboardFileIndex.get(selectedRelationshipRelation.targetFileId);
                                const evidence = selectedRelationshipRelation.evidence[0];
                                const callCandidate = getProjectMapRelationshipCallCandidate(selectedRelationshipRelation);
                                const targetDefinitionLine = resolveProjectMapRelationshipTargetSymbolLine({
                                  relation: selectedRelationshipRelation,
                                  symbols: relationshipDashboardData?.symbols ?? [],
                                });
                                return (
                                  <article className="project-map-relationship-inspector-edge-card">
                                    <span>{t("projectMap.relationship.graphSelectedEdge")}</span>
                                    <strong>
                                      {selectedRelationshipRelation.type === "calls"
                                        ? t("projectMap.relationship.methodCall")
                                        : selectedRelationshipRelation.type}
                                    </strong>
                                    <p>
                                      {sourceFile?.basename ?? selectedRelationshipRelation.sourceFileId}
                                      {" -> "}
                                      {targetFile?.basename ?? selectedRelationshipRelation.targetFileId}
                                    </p>
                                    {callCandidate ? <em>{callCandidate}</em> : null}
                                    <div className="project-map-relationship-inspector-file-actions">
                                      <button
                                        type="button"
                                        disabled={!sourceFile || !onOpenEvidenceFile}
                                        onClick={() => openProjectMapRelationshipFileWithEvidence({
                                          filePath: sourceFile?.path,
                                          evidencePath: evidence?.path,
                                          evidenceLine: evidence?.line,
                                        })}
                                      >
                                        <ExternalLink aria-hidden />
                                        {t("projectMap.relationship.openSourceFile")}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!targetFile || !onOpenEvidenceFile}
                                        onClick={() => openProjectMapRelationshipFileWithEvidence({
                                          filePath: targetFile?.path,
                                          preferredLine: targetDefinitionLine,
                                          evidencePath: evidence?.path,
                                          evidenceLine: evidence?.line,
                                        })}
                                      >
                                        <ExternalLink aria-hidden />
                                        {t("projectMap.relationship.openTargetFile")}
                                      </button>
                                    </div>
                                    {evidence ? (
                                      <button
                                        type="button"
                                        className="project-map-relationship-inspector-evidence"
                                        disabled={!onOpenEvidenceFile}
                                        onClick={() => openProjectMapRelationshipPath(evidence.path, evidence.line)}
                                      >
                                        <span>{t("projectMap.relationship.evidenceTitle")}</span>
                                        <strong>
                                          {evidence.path}
                                          {evidence.line ? `:${evidence.line}` : ""}
                                        </strong>
                                        {evidence.excerpt ? <em>{evidence.excerpt}</em> : null}
                                      </button>
                                    ) : null}
                                  </article>
                                );
                              })() : null}
                              {selectedRelationshipRelationGroups.length ? (
                                <div className="project-map-relationship-inspector-section">
                                  <h5>{t("projectMap.relationship.readRelationshipSections")}</h5>
                                  {selectedRelationshipRelationGroups.map((group) => (
                                    <div key={group.id} className="project-map-relationship-inspector-relation-group">
                                      <strong>{group.title}</strong>
                                      {group.relations.slice(0, 4).map((relation) => {
                                        const sourceFile = relationshipDashboardFileIndex.get(relation.sourceFileId);
                                        const targetFile = relationshipDashboardFileIndex.get(relation.targetFileId);
                                        const callCandidate = getProjectMapRelationshipCallCandidate(relation);
                                        return (
                                          <button
                                            key={relation.id}
                                            type="button"
                                            className={cn(selectedRelationshipRelation?.id === relation.id && "is-active")}
                                            onClick={() => setSelectedRelationshipRelationId(relation.id)}
                                          >
                                            <span>{relation.type}</span>
                                            <strong>
                                              {sourceFile?.basename ?? relation.sourceFileId}
                                              {" -> "}
                                              {targetFile?.basename ?? relation.targetFileId}
                                            </strong>
                                            {callCandidate ? <em>{callCandidate}</em> : null}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              {relationshipDashboardData.contextPack ? (
                                <div className="project-map-relationship-inspector-section">
                                  <h5>{t("projectMap.relationship.readContextTitle")}</h5>
                                  <div className="project-map-relationship-inspector-chip-list">
                                    {relationshipDashboardData.contextPack.mustReadFiles.slice(0, 3).map((path) => (
                                      <button
                                        key={`must:${path}`}
                                        type="button"
                                        onClick={() => openProjectMapRelationshipPath(path)}
                                      >
                                        {t("projectMap.relationship.contextMustReadChip", { path })}
                                      </button>
                                    ))}
                                    {relationshipDashboardData.contextPack.testTargets.slice(0, 3).map((path) => (
                                      <button
                                        key={`test:${path}`}
                                        type="button"
                                        onClick={() => openProjectMapRelationshipPath(path)}
                                      >
                                        {t("projectMap.relationship.contextTestChip", { path })}
                                      </button>
                                    ))}
                                    {relationshipDashboardData.contextPack.riskFlags.slice(0, 3).map((flag) => (
                                      <span key={`risk:${flag.label}`}>risk · {flag.label}</span>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </aside>
                          ) : null}
                          </div>
                        </>
                      ) : null}
                      {relationshipDashboardViewMode === "files" ? (
                        <div className="project-map-relationship-file-workspace">
                          <header className="project-map-relationship-workspace-header">
                            <div>
                              <strong>{t("projectMap.relationship.filesWorkspaceTitle")}</strong>
                              <span>{t("projectMap.relationship.filesWorkspaceSummary", {
                                visible: relationshipDashboardFilteredFiles.length,
                                total: relationshipDashboardVisibleFileTotal,
                              })}</span>
                            </div>
                            <button
                              type="button"
                              className="project-map-toolbar-action"
                              onClick={() => setRelationshipDashboardViewMode("graph")}
                            >
                              {t("projectMap.relationship.openGraph")}
                            </button>
                          </header>
                          <div
                            className={cn(
                              "project-map-relationship-file-tree",
                              `is-layout-${relationshipDashboardLayoutPreset}`,
                            )}
                            style={{ "--relationship-files-scale": relationshipFilesZoom } as CSSProperties}
                            onWheel={(event) => {
                              if (event.deltaY === 0) {
                                return;
                              }
                              event.preventDefault();
                              setRelationshipFilesZoom((current) => (
                                Number(Math.min(1.8, Math.max(0.7, current + (event.deltaY < 0 ? 0.1 : -0.1))).toFixed(2))
                              ));
                            }}
                          >
                            <div className="project-map-relationship-file-tree-zoom">
                              {relationshipDashboardFileTreeGroups.length ? (
                                relationshipDashboardFileTreeGroups.map((group) => (
                                  <section key={group.id} className="project-map-relationship-file-tree-group">
                                    <header>
                                      <strong>{group.label}</strong>
                                      <span>{t("projectMap.relationship.filesTreeGroupStats", {
                                        files: group.files.length,
                                        relations: group.relationCount,
                                      })}</span>
                                    </header>
                                    <div className="project-map-relationship-file-tree-list">
                                      {group.files.map((file) => {
                                        const directionCount =
                                          relationshipDashboardDirectionCountByFile.get(file.id)
                                          ?? { incoming: 0, outgoing: 0 };
                                        return (
                                          <button
                                            key={file.id}
                                            type="button"
                                            className={cn(
                                              "project-map-relationship-file-tree-row",
                                              selectedRelationshipFile?.id === file.id && "is-active",
                                            )}
                                            title={file.path}
                                            onClick={() => {
                                              setSelectedRelationshipFileId(file.id);
                                              setInspectedRelationshipFileId(file.id);
                                              setSelectedRelationshipRelationId(null);
                                              setRelationshipDashboardViewMode("graph");
                                            }}
                                          >
                                            <span
                                              style={{
                                                "--relationship-node-color": getProjectMapRelationshipRoleColor(file.role),
                                              } as CSSProperties}
                                            />
                                            <div>
                                              <strong>{file.basename}</strong>
                                              <em>{file.path}</em>
                                            </div>
                                            <small>
                                              {t("projectMap.relationship.graphFileLanguageDirectionSummary", {
                                                role: file.role,
                                                language: file.language,
                                                incoming: directionCount.incoming,
                                                outgoing: directionCount.outgoing,
                                              })}
                                            </small>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </section>
                                ))
                              ) : (
                                <p className="project-map-relationship-empty">
                                  {t("projectMap.relationship.noFiles")}
                                </p>
                              )}
                            </div>
                          </div>
                          {relationshipDashboardVisibleFileTotal > relationshipDashboardFilteredFiles.length ? (
                            <p className="project-map-relationship-list-cap">
                              {t("projectMap.relationship.listCap", {
                                visible: relationshipDashboardFilteredFiles.length,
                                total: relationshipDashboardVisibleFileTotal,
                              })}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {relationshipDashboardViewMode === "read" ? (
                        <div className="project-map-relationship-read-workspace">
                          <section className="project-map-relationship-read-main">
                            <header className="project-map-relationship-workspace-header">
                              <div>
                                <strong>{t("projectMap.relationship.readWorkspaceTitle")}</strong>
                                <span>
                                  {inspectedRelationshipFile
                                    ? inspectedRelationshipFile.path
                                    : t("projectMap.relationship.readWorkspaceEmpty")}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="project-map-toolbar-action"
                                onClick={() => setRelationshipDashboardViewMode("graph")}
                              >
                                {t("projectMap.relationship.openGraph")}
                              </button>
                            </header>
                            {inspectedRelationshipFile ? (
                              <article className="project-map-relationship-read-profile">
                                <span>{t("projectMap.relationship.readFileProfile")}</span>
                                <strong>{inspectedRelationshipFile.basename}</strong>
                                <p>{inspectedRelationshipFile.path}</p>
                                <div>
                                  <small>{inspectedRelationshipFile.role}</small>
                                  <small>{inspectedRelationshipFile.language}</small>
                                  <small>{relationshipDashboardModuleByFileId.get(inspectedRelationshipFile.id) ?? inspectedRelationshipFile.layer}</small>
                                  <small>{inspectedRelationshipFile.parseStatus}</small>
                                </div>
                              </article>
                            ) : null}
                            <div className="project-map-relationship-read-relation-groups">
                              <h5>{t("projectMap.relationship.readRelationshipSections")}</h5>
                              {selectedRelationshipRelationGroups.length ? (
                                selectedRelationshipRelationGroups.map((group) => (
                                  <section key={group.id} className="project-map-relationship-read-relation-group">
                                    <header>
                                      <strong>{group.title}</strong>
                                      <span>{t("projectMap.relationship.chainGroupCount", {
                                        count: group.relations.length,
                                      })}</span>
                                    </header>
                                    {group.relations.slice(0, 8).map((relation) => {
                                      const sourceFile = relationshipDashboardFileIndex.get(relation.sourceFileId);
                                      const targetFile = relationshipDashboardFileIndex.get(relation.targetFileId);
                                      const callCandidate = getProjectMapRelationshipCallCandidate(relation);
                                      const evidence = relation.evidence[0];
                                      return (
                                        <button
                                          key={relation.id}
                                          type="button"
                                          className={cn(
                                            "project-map-relationship-read-edge-row",
                                            selectedRelationshipRelation?.id === relation.id && "is-active",
                                          )}
                                          onClick={() => setSelectedRelationshipRelationId(relation.id)}
                                        >
                                          <span>{relation.type === "calls" ? t("projectMap.relationship.methodCall") : relation.type}</span>
                                          <strong>{sourceFile?.basename ?? relation.sourceFileId} {"->"} {targetFile?.basename ?? relation.targetFileId}</strong>
                                          {callCandidate ? <em>{callCandidate}</em> : null}
                                          {evidence ? (
                                            <small>
                                              {evidence.path}
                                              {evidence.line ? ":" + evidence.line : ""}
                                            </small>
                                          ) : null}
                                        </button>
                                      );
                                    })}
                                  </section>
                                ))
                              ) : (
                                <p className="project-map-relationship-empty">
                                  {t("projectMap.relationship.noNeighborhood")}
                                </p>
                              )}
                            </div>
                          </section>
                          <aside className="project-map-relationship-read-side">
                            <section>
                              <h5>{t("projectMap.relationship.readContextTitle")}</h5>
                              {relationshipDashboardData.contextPack ? (
                                <>
                                  <div className="project-map-relationship-read-chip-list">
                                    <strong>{t("projectMap.relationship.readMustReadTitle")}</strong>
                                    {relationshipDashboardData.contextPack.mustReadFiles.slice(0, 8).map((item) => (
                                      <span key={"must:" + item}>{item}</span>
                                    ))}
                                  </div>
                                  <div className="project-map-relationship-read-chip-list">
                                    <strong>{t("projectMap.relationship.readRelatedTitle")}</strong>
                                    {relationshipDashboardData.contextPack.relatedFiles.slice(0, 8).map((item) => (
                                      <span key={"related:" + item}>{item}</span>
                                    ))}
                                  </div>
                                  <div className="project-map-relationship-read-chip-list">
                                    <strong>{t("projectMap.relationship.readTestsTitle")}</strong>
                                    {relationshipDashboardData.contextPack.testTargets.slice(0, 6).map((item) => (
                                      <span key={"test:" + item}>{item}</span>
                                    ))}
                                  </div>
                                  <div className="project-map-relationship-read-chip-list">
                                    <strong>{t("projectMap.relationship.readContractsTitle")}</strong>
                                    {relationshipDashboardData.contextPack.contracts.slice(0, 6).map((item) => (
                                      <span key={"contract:" + item}>{item}</span>
                                    ))}
                                  </div>
                                  {relationshipDashboardData.contextPack.riskFlags.length ? (
                                    <div className="project-map-relationship-read-chip-list is-risk">
                                      <strong>{t("projectMap.relationship.readRiskTitle")}</strong>
                                      {relationshipDashboardData.contextPack.riskFlags.slice(0, 6).map((flag) => (
                                        <span key={flag.severity + ":" + flag.label}>{flag.severity} · {flag.label}</span>
                                      ))}
                                    </div>
                                  ) : null}
                                </>
                              ) : (
                                <p className="project-map-relationship-empty">
                                  {t("projectMap.relationship.readPlanEmpty")}
                                </p>
                              )}
                            </section>
                            <section>
                              <h5>{t("projectMap.relationship.readImpactTitle")}</h5>
                              {relationshipDashboardData.impactSummary ? (
                                <div className="project-map-relationship-read-metrics">
                                  <span>{relationshipDashboardData.impactSummary.changedFiles.length}{t("projectMap.relationship.impactChanged")}</span>
                                  <span>{relationshipDashboardData.impactSummary.directlyAffectedFiles.length}{t("projectMap.relationship.impactDirect")}</span>
                                  <span>{relationshipDashboardData.impactSummary.transitivelyAffectedFiles.length}{t("projectMap.relationship.impactTransitive")}</span>
                                  <span>{relationshipDashboardData.impactSummary.unmappedFiles.length}{t("projectMap.relationship.impactUnmapped")}</span>
                                </div>
                              ) : (
                                <p className="project-map-relationship-empty">
                                  {t("projectMap.relationship.impactEmpty")}
                                </p>
                              )}
                            </section>
                            {selectedRelationshipScopeWarnings.length ? (
                              <section>
                                <h5>{t("projectMap.relationship.readScopeTitle")}</h5>
                                <div className="project-map-relationship-read-chip-list is-warning">
                                  {selectedRelationshipScopeWarnings.slice(0, 4).map((reason) => (
                                    <span key={reason.kind + ":" + (reason.path ?? reason.message)}>
                                      {reason.path ?? reason.message}
                                    </span>
                                  ))}
                                </div>
                              </section>
                            ) : null}
                          </aside>
                        </div>
                      ) : null}
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

  );
}
