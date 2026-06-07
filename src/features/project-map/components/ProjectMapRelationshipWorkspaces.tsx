import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import MapPin from "lucide-react/dist/esm/icons/map-pin";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";

import { cn } from "../../../lib/utils";
import { readWorkspaceFilePreview } from "../../../services/tauri";
import {
  buildProjectMapApiEndpointDetail,
  buildProjectMapApiEndpointRow,
} from "./projectMapRelationshipApiModel";
import {
  getProjectMapRelationshipCallCandidate,
  getProjectMapRelationshipRoleColor,
  type ProjectMapRelationshipDashboardData,
} from "../utils/relationshipDashboardModel";
import {
  buildProjectMapApiExportFile,
  type ProjectMapApiExportFormat,
} from "../utils/apiContractExport";
import type {
  ProjectMapApiCallChain,
  ProjectMapApiEndpoint,
  ProjectMapApiGroup,
  ProjectMapFileRelation,
  ProjectMapRelationshipSymbol,
  ProjectMapScannedFile,
} from "../types";

type ProjectMapRelationshipDashboardViewMode = "graph" | "files" | "read" | "api";
type ProjectMapRelationshipLayoutPreset = "radial" | "tree" | "force";

type ProjectMapApiGroupWithCount = ProjectMapApiGroup & {
  endpointCount: number;
};

type ProjectMapApiEndpointSection = {
  id: string;
  title: string;
  hint: string;
  endpoints: ProjectMapApiEndpoint[];
};

type ProjectMapRelationshipFileTreeGroup = {
  id: string;
  label: string;
  files: ProjectMapScannedFile[];
  relationCount: number;
};

type ProjectMapRelationshipFileDirectionCount = {
  incoming: number;
  outgoing: number;
};

type ProjectMapRelationshipRelationGroup = {
  id: string;
  title: string;
  relations: ProjectMapFileRelation[];
};

type ProjectMapRelationshipReadLane = "incoming" | "outgoing" | "verify";

type ProjectMapRelationshipReadRelationCard = {
  id: string;
  lane: ProjectMapRelationshipReadLane;
  relation: ProjectMapFileRelation;
  file: ProjectMapScannedFile | null;
  title: string;
  path: string;
  evidencePath: string;
  evidenceLine: number | null;
  callCandidate: string | null;
};

type ProjectMapRelationshipReadChainNode = {
  id: string;
  relationId: string | null;
  label: string;
  fileLabel: string;
  path: string;
  line: number | null;
  relationType: ProjectMapFileRelation["type"] | "method";
  confidence: ProjectMapFileRelation["confidence"] | "focus";
  children: ProjectMapRelationshipReadChainNode[];
};

type ProjectMapRelationshipReadMethodCard = {
  id: string;
  name: string;
  kind: string;
  line: number | null;
  endLine: number | null;
  sourceSnippet: string[];
  sourceFlowNodes: ProjectMapRelationshipReadChainNode[];
  outgoing: ProjectMapFileRelation[];
  incoming: ProjectMapFileRelation[];
  chain: ProjectMapRelationshipReadChainNode;
};

type ProjectMapRelationshipReadSourceMethod = {
  id: string;
  name: string;
  line: number;
  endLine: number;
  signature: string;
  bodyLines: string[];
  flowNodes: ProjectMapRelationshipReadChainNode[];
};

type ProjectMapRelationshipScanStatus = {
  status: "idle" | "running" | "success" | "failed";
};

type ProjectMapApiMethodChainTreeNode = {
  symbol: string;
  incomingEdge?: ProjectMapApiCallChain["edges"][number];
  children: ProjectMapApiMethodChainTreeNode[];
};

const PROJECT_MAP_RELATIONSHIP_EXPLORER_GROUP_LIMIT = 80;
const API_LEFT_PANE_DEFAULT_WIDTH = 20;
const API_RIGHT_PANE_DEFAULT_WIDTH = 60;
const API_LEFT_PANE_MIN_WIDTH = 16;
const API_LEFT_PANE_MAX_WIDTH = 30;
const API_RIGHT_PANE_MIN_WIDTH = 34;
const API_RIGHT_PANE_MAX_WIDTH = 68;
const API_METHOD_CHAIN_MAX_TREE_DEPTH = 5;
const API_METHOD_CHAIN_MAX_RENDERED_NODES = 32;
const READ_ANATOMY_MAX_INCOMING = 7;
const READ_ANATOMY_MAX_OUTGOING = 9;
const READ_ANATOMY_MAX_VERIFY = 4;
const READ_METHOD_INDEX_LIMIT = 18;
const READ_METHOD_CHAIN_BRANCH_LIMIT = 12;
const READ_METHOD_CHAIN_SECONDARY_LIMIT = 3;

const RELATION_CONFIDENCE_WEIGHT: Record<ProjectMapFileRelation["confidence"], number> = {
  high: 4,
  medium: 3,
  low: 2,
  unknown: 1,
};

function clampApiPaneWidth(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function downloadProjectMapApiExport(file: { filename: string; mimeType: string; content: string }) {
  const blob = new Blob([file.content], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildProjectMapApiMethodChainTree(
  chain: ProjectMapApiCallChain,
  rootSymbol: string | null | undefined,
): ProjectMapApiMethodChainTreeNode[] {
  const childrenBySource = new Map<string, ProjectMapApiCallChain["edges"]>();
  const targetSymbols = new Set<string>();
  for (const edge of chain.edges) {
    const children = childrenBySource.get(edge.sourceSymbol) ?? [];
    children.push(edge);
    childrenBySource.set(edge.sourceSymbol, children);
    targetSymbols.add(edge.targetSymbol);
  }
  const roots = rootSymbol
    ? [rootSymbol]
    : Array.from(childrenBySource.keys()).filter((symbol) => !targetSymbols.has(symbol));
  const fallbackRoots = roots.length ? roots : chain.edges[0] ? [chain.edges[0].sourceSymbol] : [];
  let renderedCount = 0;
  const visit = (
    symbol: string,
    incomingEdge: ProjectMapApiCallChain["edges"][number] | undefined,
    depth: number,
    path: Set<string>,
  ): ProjectMapApiMethodChainTreeNode => {
    renderedCount += 1;
    if (
      depth >= API_METHOD_CHAIN_MAX_TREE_DEPTH
      || renderedCount >= API_METHOD_CHAIN_MAX_RENDERED_NODES
      || path.has(symbol)
    ) {
      return { symbol, incomingEdge, children: [] };
    }
    const nextPath = new Set(path);
    nextPath.add(symbol);
    const children = (childrenBySource.get(symbol) ?? [])
      .slice(0, 8)
      .map((edge) => visit(edge.targetSymbol, edge, depth + 1, nextPath));
    return { symbol, incomingEdge, children };
  };
  return fallbackRoots.map((symbol) => visit(symbol, undefined, 0, new Set()));
}

function formatProjectMapReadPathEvidence(relation: ProjectMapFileRelation): string {
  const evidence = relation.evidence[0];
  if (!evidence) {
    return relation.confidence;
  }
  return `${relation.confidence} · ${evidence.path}${evidence.line ? `:${evidence.line}` : ""}`;
}

function getProjectMapReadPathBasename(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1] || path;
}

function isProjectMapReadVerifyRelation(relation: ProjectMapFileRelation): boolean {
  return relation.type === "tested_by"
    || relation.type === "specified_by"
    || relation.type === "documents"
    || relation.type === "styled_by";
}

function isProjectMapReadAnatomyRelation(relation: ProjectMapFileRelation): boolean {
  return relation.type === "calls"
    || relation.type === "bridges_to"
    || relation.type === "configures";
}

function sortProjectMapReadRelations(
  left: ProjectMapFileRelation,
  right: ProjectMapFileRelation,
): number {
  const confidenceDelta = RELATION_CONFIDENCE_WEIGHT[right.confidence] - RELATION_CONFIDENCE_WEIGHT[left.confidence];
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }
  return (left.evidence[0]?.line ?? Number.MAX_SAFE_INTEGER) - (right.evidence[0]?.line ?? Number.MAX_SAFE_INTEGER);
}

function sortProjectMapReadRelationsByEvidenceLine(
  left: ProjectMapFileRelation,
  right: ProjectMapFileRelation,
): number {
  return (left.evidence[0]?.line ?? Number.MAX_SAFE_INTEGER) - (right.evidence[0]?.line ?? Number.MAX_SAFE_INTEGER);
}

function getProjectMapReadRelationCounterpart(
  relation: ProjectMapFileRelation,
  inspectedFileId: string,
  relationshipDashboardFileIndex: ReadonlyMap<string, ProjectMapScannedFile>,
): ProjectMapScannedFile | null {
  const counterpartId = relation.sourceFileId === inspectedFileId
    ? relation.targetFileId
    : relation.sourceFileId;
  return relationshipDashboardFileIndex.get(counterpartId) ?? null;
}

function getProjectMapReadRelationTitle(
  relation: ProjectMapFileRelation,
  inspectedFile: ProjectMapScannedFile,
  counterpartFile: ProjectMapScannedFile | null,
): string {
  const sourceLabel = relation.sourceFileId === inspectedFile.id
    ? inspectedFile.basename
    : counterpartFile?.basename ?? relation.sourceFileId;
  const targetLabel = relation.targetFileId === inspectedFile.id
    ? inspectedFile.basename
    : counterpartFile?.basename ?? relation.targetFileId;
  return `${sourceLabel} -> ${targetLabel}`;
}

function buildProjectMapReadRelationCard(input: {
  relation: ProjectMapFileRelation;
  lane: ProjectMapRelationshipReadLane;
  inspectedFile: ProjectMapScannedFile;
  relationshipDashboardFileIndex: ReadonlyMap<string, ProjectMapScannedFile>;
}): ProjectMapRelationshipReadRelationCard {
  const counterpartFile = getProjectMapReadRelationCounterpart(
    input.relation,
    input.inspectedFile.id,
    input.relationshipDashboardFileIndex,
  );
  const evidence = input.relation.evidence[0];
  const fallbackPath = counterpartFile?.path ?? input.inspectedFile.path;
  return {
    id: `${input.lane}:${input.relation.id}`,
    lane: input.lane,
    relation: input.relation,
    file: counterpartFile,
    title: getProjectMapReadRelationTitle(input.relation, input.inspectedFile, counterpartFile),
    path: counterpartFile?.path ?? fallbackPath,
    evidencePath: evidence?.path ?? fallbackPath,
    evidenceLine: evidence?.line ?? null,
    callCandidate: getProjectMapRelationshipCallCandidate(input.relation),
  };
}

function isProjectMapReadMethodSymbol(kind: string): boolean {
  const normalizedKind = kind.toLowerCase();
  return normalizedKind.includes("method")
    || normalizedKind.includes("function")
    || normalizedKind.includes("constructor")
    || normalizedKind === "fn";
}

function getProjectMapReadTerminalCallName(candidate: string | null): string | null {
  if (!candidate) {
    return null;
  }
  const trimmed = candidate.replace(/\(.*/, "").trim();
  const segments = trimmed.split(".");
  return segments[segments.length - 1] || trimmed;
}

function getProjectMapReadRelationLineForFile(
  relation: ProjectMapFileRelation,
  path: string,
): number | null {
  const evidence = relation.evidence.find((entry) => entry.path === path) ?? relation.evidence[0];
  return evidence?.line ?? null;
}

function findProjectMapReadMethodIdByLine(
  methodSymbols: ProjectMapRelationshipSymbol[],
  line: number | null,
): string | null {
  if (!line) {
    return null;
  }
  let selectedMethod: ProjectMapRelationshipSymbol | null = null;
  for (const symbol of methodSymbols) {
    if (symbol.line > line) {
      break;
    }
    selectedMethod = symbol;
  }
  return selectedMethod?.id ?? null;
}

function getProjectMapReadMethodDeclarationName(line: string, language: ProjectMapScannedFile["language"]): string | null {
  const trimmed = line.trim();
  if (
    !trimmed
    || trimmed.startsWith("//")
    || trimmed.startsWith("*")
    || trimmed.startsWith("@")
    || /^(if|for|while|switch|catch|return|throw|new|else|do)\b/.test(trimmed)
  ) {
    return null;
  }
  if (language === "python") {
    const match = /^def\s+([A-Za-z_]\w*)\s*\(/.exec(trimmed);
    return match?.[1] ?? null;
  }
  if (language === "typescript" || language === "javascript") {
    const functionMatch = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(trimmed);
    if (functionMatch?.[1]) {
      return functionMatch[1];
    }
    const arrowMatch = /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=.*=>/.exec(trimmed);
    return arrowMatch?.[1] ?? null;
  }
  if (language === "java" || language === "kotlin" || language === "csharp") {
    if (!trimmed.includes("(") || !trimmed.includes(")")) {
      return null;
    }
    const withoutGenerics = trimmed.replace(/<[^>]+>/g, "");
    const match = /(?:public|private|protected|static|final|synchronized|abstract|native|override|\s)+[\w[\].?]+\s+([A-Za-z_$][\w$]*)\s*\(/.exec(withoutGenerics);
    return match?.[1] ?? null;
  }
  const genericMatch = /(?:function\s+|fn\s+|func\s+)([A-Za-z_$][\w$]*)\s*\(/.exec(trimmed);
  return genericMatch?.[1] ?? null;
}

function getProjectMapReadBraceDelta(line: string): number {
  let delta = 0;
  let inString: string | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const previous = index > 0 ? line[index - 1] : "";
    if ((character === "\"" || character === "'" || character === "`") && previous !== "\\") {
      inString = inString === character ? null : inString ?? character;
      continue;
    }
    if (inString) {
      continue;
    }
    if (character === "{") {
      delta += 1;
    } else if (character === "}") {
      delta -= 1;
    }
  }
  return delta;
}

function buildProjectMapReadSourceFlowNodes(input: {
  bodyLines: string[];
  methodLine: number;
  filePath: string;
}): ProjectMapRelationshipReadChainNode[] {
  const blockedNames = new Set([
    "if",
    "for",
    "while",
    "switch",
    "catch",
    "return",
    "throw",
    "new",
    "super",
    "this",
  ]);
  const nodes: ProjectMapRelationshipReadChainNode[] = [];
  const seenByLineAndName = new Set<string>();
  for (const [offset, line] of input.bodyLines.entries()) {
    const sourceLine = input.methodLine + offset;
    if (sourceLine === input.methodLine) {
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) {
      continue;
    }
    const callPattern = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g;
    for (const match of trimmed.matchAll(callPattern)) {
      const candidate = match[1];
      const terminalName = getProjectMapReadTerminalCallName(candidate);
      if (!candidate || !terminalName || blockedNames.has(terminalName) || blockedNames.has(candidate)) {
        continue;
      }
      const key = `${sourceLine}:${candidate}`;
      if (seenByLineAndName.has(key)) {
        continue;
      }
      seenByLineAndName.add(key);
      nodes.push({
        id: `source-flow:${sourceLine}:${candidate}`,
        relationId: null,
        label: candidate,
        fileLabel: getProjectMapReadPathBasename(input.filePath),
        path: input.filePath,
        line: sourceLine,
        relationType: "method",
        confidence: "focus",
        children: [],
      });
    }
  }
  return nodes.slice(0, READ_METHOD_CHAIN_BRANCH_LIMIT);
}

function buildProjectMapReadSourceMethods(input: {
  content: string;
  file: ProjectMapScannedFile;
}): ProjectMapRelationshipReadSourceMethod[] {
  const lines = input.content.split(/\r?\n/);
  const methods: ProjectMapRelationshipReadSourceMethod[] = [];
  let currentMethod: {
    name: string;
    line: number;
    startIndex: number;
    signature: string;
    braceDepth: number;
    bodyLines: string[];
  } | null = null;
  for (const [lineIndex, line] of lines.entries()) {
    if (!currentMethod) {
      const declarationName = getProjectMapReadMethodDeclarationName(line, input.file.language);
      if (!declarationName) {
        continue;
      }
      currentMethod = {
        name: declarationName,
        line: lineIndex + 1,
        startIndex: lineIndex,
        signature: line.trim(),
        braceDepth: Math.max(0, getProjectMapReadBraceDelta(line)),
        bodyLines: [line],
      };
      if (currentMethod.braceDepth === 0 && line.includes(";")) {
        currentMethod = null;
      }
      continue;
    }
    currentMethod.bodyLines.push(line);
    currentMethod.braceDepth += getProjectMapReadBraceDelta(line);
    if (currentMethod.braceDepth <= 0) {
      const methodLine = currentMethod.line;
      const bodyLines = currentMethod.bodyLines;
      methods.push({
        id: `source-method:${methodLine}:${currentMethod.name}`,
        name: currentMethod.name,
        line: methodLine,
        endLine: lineIndex + 1,
        signature: currentMethod.signature,
        bodyLines,
        flowNodes: buildProjectMapReadSourceFlowNodes({
          bodyLines,
          methodLine,
          filePath: input.file.path,
        }),
      });
      currentMethod = null;
    }
  }
  return methods.slice(0, READ_METHOD_INDEX_LIMIT);
}

function buildProjectMapReadRelationChainNode(input: {
  relation: ProjectMapFileRelation;
  inspectedFileId: string;
  relationshipDashboardFileIndex: ReadonlyMap<string, ProjectMapScannedFile>;
  relationLookup: ProjectMapFileRelation[];
  depth: number;
  visitedFileIds: Set<string>;
}): ProjectMapRelationshipReadChainNode {
  const targetFile = input.relationshipDashboardFileIndex.get(input.relation.targetFileId);
  const sourceFile = input.relationshipDashboardFileIndex.get(input.relation.sourceFileId);
  const displayFile = targetFile ?? sourceFile;
  const evidence = input.relation.evidence[0];
  const callCandidate = getProjectMapRelationshipCallCandidate(input.relation);
  const nextVisitedFileIds = new Set(input.visitedFileIds);
  nextVisitedFileIds.add(input.relation.targetFileId);
  const canExpand = input.depth < 2 && !input.visitedFileIds.has(input.relation.targetFileId);
  const children = canExpand
    ? input.relationLookup
        .filter((relation) => (
          relation.type === "calls"
          && relation.sourceFileId === input.relation.targetFileId
          && relation.targetFileId !== input.inspectedFileId
        ))
        .sort(sortProjectMapReadRelations)
        .slice(0, READ_METHOD_CHAIN_SECONDARY_LIMIT)
        .map((relation) => buildProjectMapReadRelationChainNode({
          relation,
          inspectedFileId: input.inspectedFileId,
          relationshipDashboardFileIndex: input.relationshipDashboardFileIndex,
          relationLookup: input.relationLookup,
          depth: input.depth + 1,
          visitedFileIds: nextVisitedFileIds,
        }))
    : [];
  return {
    id: `chain:${input.relation.id}:${input.depth}`,
    relationId: input.relation.id,
    label: callCandidate ?? displayFile?.basename ?? input.relation.targetFileId,
    fileLabel: displayFile?.basename ?? input.relation.targetFileId,
    path: displayFile?.path ?? evidence?.path ?? input.relation.id,
    line: evidence?.path === displayFile?.path ? evidence?.line ?? null : null,
    relationType: input.relation.type,
    confidence: input.relation.confidence,
    children,
  };
}

type ProjectMapRelationshipApiWorkspaceProps = {
  activeWorkspaceId: string | null;
  apiConfidenceFilter: string;
  apiContractScanExists: boolean;
  apiControllerFilter: string;
  apiControllerGroupsByModuleId: ReadonlyMap<string, ProjectMapApiGroupWithCount[]>;
  apiEndpointCount: number;
  apiEndpointSections: ProjectMapApiEndpointSection[];
  apiFilterOptions: {
    protocols: Set<string>;
    languages: Set<string>;
    frameworks: Set<string>;
    modules: Set<string>;
    controllers: Set<string>;
    confidences: Set<string>;
  };
  apiFrameworkFilter: string;
  apiGraphMode: string;
  apiGroups: ProjectMapApiGroupWithCount[];
  apiLanguageFilter: string;
  apiModuleFilter: string;
  apiModuleGroups: ProjectMapApiGroupWithCount[];
  apiProtocolFilter: string;
  apiSearchQuery: string;
  expandedApiModuleGroupIds: ReadonlySet<string>;
  handleRelationshipScanClick: () => void;
  openProjectMapRelationshipPath: (path: string | null | undefined, line?: number | null) => void;
  relationshipDashboardData: ProjectMapRelationshipDashboardData;
  relationshipDashboardLayoutPreset: ProjectMapRelationshipLayoutPreset;
  relationshipGraphZoom: number;
  relationshipScanState: ProjectMapRelationshipScanStatus;
  selectedApiCallChains: ProjectMapApiCallChain[];
  selectedApiEndpoint: ProjectMapApiEndpoint | null;
  selectedApiGroup: ProjectMapApiGroupWithCount | null;
  selectedApiGroupEndpoints: ProjectMapApiEndpoint[];
  selectedApiModuleGroup: ProjectMapApiGroupWithCount | null;
  setApiConfidenceFilter: (value: string) => void;
  setApiControllerFilter: (value: string) => void;
  setApiFrameworkFilter: (value: string) => void;
  setApiLanguageFilter: (value: string) => void;
  setApiModuleFilter: (value: string) => void;
  setApiProtocolFilter: (value: string) => void;
  setExpandedApiModuleGroupIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedApiEndpointId: (value: string | null) => void;
  setSelectedApiGroupId: (value: string | null) => void;
};

export function ProjectMapRelationshipApiWorkspace({
  activeWorkspaceId,
  apiConfidenceFilter,
  apiContractScanExists,
  apiControllerFilter,
  apiControllerGroupsByModuleId,
  apiEndpointCount,
  apiEndpointSections,
  apiFilterOptions,
  apiFrameworkFilter,
  apiGraphMode,
  apiGroups,
  apiLanguageFilter,
  apiModuleFilter,
  apiModuleGroups,
  apiProtocolFilter,
  apiSearchQuery,
  expandedApiModuleGroupIds,
  handleRelationshipScanClick,
  openProjectMapRelationshipPath,
  relationshipDashboardData,
  relationshipDashboardLayoutPreset,
  relationshipGraphZoom,
  relationshipScanState,
  selectedApiCallChains,
  selectedApiEndpoint,
  selectedApiGroup,
  selectedApiGroupEndpoints,
  selectedApiModuleGroup,
  setApiConfidenceFilter,
  setApiControllerFilter,
  setApiFrameworkFilter,
  setApiLanguageFilter,
  setApiModuleFilter,
  setApiProtocolFilter,
  setExpandedApiModuleGroupIds,
  setSelectedApiEndpointId,
  setSelectedApiGroupId,
}: ProjectMapRelationshipApiWorkspaceProps) {
  const { t } = useTranslation();
  const apiContractWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const [apiLeftPaneWidth, setApiLeftPaneWidth] = useState(API_LEFT_PANE_DEFAULT_WIDTH);
  const [apiRightPaneWidth, setApiRightPaneWidth] = useState<number | null>(null);
  const [apiInspectorFocused, setApiInspectorFocused] = useState(false);
  const apiPaneResizeCleanupRef = useRef<(() => void) | null>(null);
  const selectedApiEndpointDetail = useMemo(
    () => selectedApiEndpoint ? buildProjectMapApiEndpointDetail(selectedApiEndpoint) : null,
    [selectedApiEndpoint],
  );
  const selectedApiMethodChainTrees = useMemo(() => (
    selectedApiCallChains.map((chain) => ({
      chain,
      roots: buildProjectMapApiMethodChainTree(chain, selectedApiEndpoint?.handlerSymbol),
    }))
  ), [selectedApiCallChains, selectedApiEndpoint?.handlerSymbol]);
  useEffect(() => {
    return () => {
      apiPaneResizeCleanupRef.current?.();
      apiPaneResizeCleanupRef.current = null;
    };
  }, []);
  useEffect(() => {
    setApiInspectorFocused(false);
  }, [selectedApiEndpoint?.id, selectedApiGroup?.id]);
  const apiPaneStyle = {
    "--relationship-graph-scale": relationshipGraphZoom,
    "--api-left-pane-width": `${apiLeftPaneWidth}%`,
    ...(apiRightPaneWidth === null ? {} : { "--api-right-pane-width": `${apiRightPaneWidth}%` }),
  } as CSSProperties;
  const beginApiPaneResize = useCallback((
    pane: "left" | "right",
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    const workspaceRect = apiContractWorkspaceRef.current?.getBoundingClientRect();
    const workspaceWidth = workspaceRect?.width ?? 0;
    if (!workspaceWidth || !Number.isFinite(workspaceWidth)) {
      return;
    }
    apiPaneResizeCleanupRef.current?.();
    apiPaneResizeCleanupRef.current = null;
    const startX = event.clientX;
    const startLeftWidth = apiLeftPaneWidth;
    const startRightWidth = apiRightPaneWidth ?? API_RIGHT_PANE_DEFAULT_WIDTH;
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const deltaPercent = delta / workspaceWidth * 100;
      if (pane === "left") {
        setApiLeftPaneWidth(clampApiPaneWidth(
          startLeftWidth + deltaPercent,
          API_LEFT_PANE_MIN_WIDTH,
          API_LEFT_PANE_MAX_WIDTH,
        ));
        return;
      }
      setApiRightPaneWidth(clampApiPaneWidth(
        startRightWidth - deltaPercent,
        API_RIGHT_PANE_MIN_WIDTH,
        API_RIGHT_PANE_MAX_WIDTH,
      ));
    };
    const cleanupResize = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      apiPaneResizeCleanupRef.current = null;
    };
    const handlePointerUp = () => {
      cleanupResize();
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    apiPaneResizeCleanupRef.current = cleanupResize;
  }, [apiLeftPaneWidth, apiRightPaneWidth]);
  const handleApiExport = useCallback((format: ProjectMapApiExportFormat) => {
    if (!relationshipDashboardData.apiContracts) {
      return;
    }
    downloadProjectMapApiExport(buildProjectMapApiExportFile(relationshipDashboardData.apiContracts, format));
  }, [relationshipDashboardData.apiContracts]);
  const openApiInspectorPath = useCallback((path: string | null | undefined, line?: number | null) => {
    setApiInspectorFocused(true);
    openProjectMapRelationshipPath(path, line);
  }, [openProjectMapRelationshipPath]);
  const renderApiMethodChainNode = (
    node: ProjectMapApiMethodChainTreeNode,
    depth: number,
  ): ReactElement => {
    const edge = node.incomingEdge;
    const edgeLocationLabel = edge ? `${edge.sourceFile}${edge.line ? `:${edge.line}` : ""}` : null;
    const edgeTargetLocationLabel = edge?.targetFile
      ? `${edge.targetFile}${edge.targetLine ? `:${edge.targetLine}` : ""}`
      : null;
    return (
      <li
        key={`${node.symbol}:${edge?.id ?? "root"}`}
        className={cn(
          "project-map-api-method-tree-node",
          depth === 0 && "is-root",
          edge && !edge.targetFile && "is-unresolved",
        )}
      >
        <div className="project-map-api-method-tree-card">
          <div className="project-map-api-method-tree-card-main">
            <strong>{node.symbol}</strong>
            {edge ? (
              <span>{edge.kind} · {edge.confidence}</span>
            ) : (
              <span>{selectedApiEndpoint?.method ?? selectedApiEndpoint?.protocol ?? "endpoint"}</span>
            )}
          </div>
          {edge ? (
            <div className="project-map-api-method-tree-anchors">
              {edgeLocationLabel ? (
                <button
                  type="button"
                  onClick={() => openApiInspectorPath(edge.sourceFile, edge.line)}
                  aria-label={edge.line
                    ? t("projectMap.relationship.sourceOpenFileAtLine", {
                        path: edge.sourceFile,
                        line: edge.line,
                      })
                    : t("projectMap.relationship.sourceOpenFile", {
                        path: edge.sourceFile,
                      })}
                >
                  call · {edgeLocationLabel}
                </button>
              ) : null}
              {edgeTargetLocationLabel && edge.targetFile ? (
                <button
                  type="button"
                  className="is-target"
                  onClick={() => openApiInspectorPath(edge.targetFile, edge.targetLine)}
                  aria-label={edge.targetLine
                    ? t("projectMap.relationship.sourceOpenFileAtLine", {
                        path: edge.targetFile,
                        line: edge.targetLine,
                      })
                    : t("projectMap.relationship.sourceOpenFile", {
                        path: edge.targetFile,
                      })}
                >
                  def · {edgeTargetLocationLabel}
                </button>
              ) : null}
            </div>
          ) : null}
          {edge?.excerpt ? (
            <button
              type="button"
              className="project-map-api-method-tree-excerpt"
              onClick={() => openApiInspectorPath(edge.sourceFile, edge.line)}
              aria-label={edge.line
                ? t("projectMap.relationship.sourceOpenFileAtLine", {
                    path: edge.sourceFile,
                    line: edge.line,
                  })
                : t("projectMap.relationship.sourceOpenFile", {
                    path: edge.sourceFile,
                  })}
            >
              <code>{edge.excerpt}</code>
            </button>
          ) : null}
        </div>
        {node.children.length ? (
          <ol>
            {node.children.map((child) => renderApiMethodChainNode(child, depth + 1))}
          </ol>
        ) : null}
      </li>
    );
  };
  const primaryApiFilters = [
    {
      label: t("projectMap.relationship.apiFilterModule"),
      value: apiModuleFilter,
      onChange: setApiModuleFilter,
      options: Array.from(apiFilterOptions.modules),
    },
    {
      label: t("projectMap.relationship.apiFilterController"),
      value: apiControllerFilter,
      onChange: setApiControllerFilter,
      options: Array.from(apiFilterOptions.controllers),
    },
    {
      label: t("projectMap.relationship.apiFilterConfidence"),
      value: apiConfidenceFilter,
      onChange: setApiConfidenceFilter,
      options: Array.from(apiFilterOptions.confidences),
    },
  ];
  const advancedApiFilters = [
    {
      label: t("projectMap.relationship.apiFilterProtocol"),
      value: apiProtocolFilter,
      onChange: setApiProtocolFilter,
      options: Array.from(apiFilterOptions.protocols),
    },
    {
      label: t("projectMap.relationship.apiFilterLanguage"),
      value: apiLanguageFilter,
      onChange: setApiLanguageFilter,
      options: Array.from(apiFilterOptions.languages),
    },
    {
      label: t("projectMap.relationship.apiFilterFramework"),
      value: apiFrameworkFilter,
      onChange: setApiFrameworkFilter,
      options: Array.from(apiFilterOptions.frameworks),
    },
  ];

  return (
    <div
      ref={apiContractWorkspaceRef}
      className={cn(
        "project-map-api-contract-workspace",
        `is-layout-${relationshipDashboardLayoutPreset}`,
        apiInspectorFocused && "is-inspector-focused",
      )}
      style={apiPaneStyle}
    >
      <header className="project-map-relationship-workspace-header project-map-api-contract-toolbar">
        <div className="project-map-api-contract-toolbar-copy">
          <strong>{t("projectMap.relationship.apiWorkspaceTitle")}</strong>
          <span>{t("projectMap.relationship.apiWorkspaceSummary", {
            endpoints: apiEndpointCount,
            groups: apiGroups.length,
            mode: t(`projectMap.relationship.apiGraphMode.${apiGraphMode}`),
          })}</span>
        </div>
        <div className="project-map-api-contract-toolbar-controls">
          <div className="project-map-api-contract-filters">
            <span className="project-map-api-contract-filter-group-label">
              {t("projectMap.relationship.apiPrimaryFilters")}
            </span>
            {primaryApiFilters.map((filter) => (
              <label key={filter.label}>
                <span>{filter.label}</span>
                <select
                  value={filter.value}
                  onChange={(event) => {
                    filter.onChange(event.target.value);
                    setSelectedApiEndpointId(null);
                  }}
                >
                  <option value="all">{t("projectMap.relationship.apiFilterAll")}</option>
                  {filter.options.sort().map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            ))}
            <details className="project-map-api-contract-advanced-filters">
              <summary>{t("projectMap.relationship.apiAdvancedFilters")}</summary>
              <div>
                <div className="project-map-api-contract-export-actions" aria-label={t("projectMap.relationship.apiExportLabel")}>
                  <button
                    type="button"
                    className="project-map-toolbar-action project-map-api-contract-scan-action"
                    onClick={handleRelationshipScanClick}
                    disabled={!activeWorkspaceId || relationshipScanState.status === "running"}
                  >
                    <RefreshCw aria-hidden />
                    {relationshipScanState.status === "running"
                      ? t("projectMap.relationship.scanning")
                      : t("projectMap.relationship.apiScan")}
                  </button>
                  {([
                    ["markdown", t("projectMap.relationship.apiExportMarkdown")],
                    ["html", t("projectMap.relationship.apiExportHtml")],
                    ["openapi-json", t("projectMap.relationship.apiExportOpenApiJson")],
                  ] as const).map(([format, label]) => (
                    <button
                      key={format}
                      type="button"
                      className="project-map-toolbar-action project-map-api-contract-export-action"
                      disabled={!relationshipDashboardData.apiContracts || !apiEndpointCount}
                      onClick={() => handleApiExport(format)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {advancedApiFilters.map((filter) => (
                  <label key={filter.label}>
                    <span>{filter.label}</span>
                    <select
                      value={filter.value}
                      onChange={(event) => {
                        filter.onChange(event.target.value);
                        setSelectedApiEndpointId(null);
                      }}
                    >
                      <option value="all">{t("projectMap.relationship.apiFilterAll")}</option>
                      {filter.options.sort().map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </details>
          </div>
        </div>
        <small className="project-map-api-contract-export-caveat">
          {t("projectMap.relationship.apiExportCaveat")}
        </small>
      </header>
      {relationshipDashboardData.apiContracts && apiEndpointCount > 0 ? (
        <div className="project-map-api-contract-grid">
          <section className="project-map-api-contract-group-rail">
            <header>
              <strong>{t("projectMap.relationship.apiModulesTitle")}</strong>
              <span>{t("projectMap.relationship.apiModulesHint")}</span>
            </header>
            <div className="project-map-api-contract-module-tree">
              {apiModuleGroups.slice(0, 42).map((moduleGroup) => (
                <section
                  key={moduleGroup.id}
                  className={cn(
                    "project-map-api-contract-module-branch",
                    selectedApiModuleGroup?.id === moduleGroup.id && "is-active",
                  )}
                >
                  <button
                    type="button"
                    className="project-map-api-contract-module-button"
                    aria-expanded={expandedApiModuleGroupIds.has(moduleGroup.id)}
                    onClick={() => {
                      setSelectedApiGroupId(moduleGroup.id);
                      setSelectedApiEndpointId(null);
                      setExpandedApiModuleGroupIds((current) => {
                        const next = new Set(current);
                        if (next.has(moduleGroup.id)) {
                          next.delete(moduleGroup.id);
                        } else {
                          next.add(moduleGroup.id);
                        }
                        return next;
                      });
                    }}
                  >
                    <b aria-hidden>
                      {expandedApiModuleGroupIds.has(moduleGroup.id) ? "−" : "+"}
                    </b>
                    <span>{moduleGroup.level}</span>
                    <strong>{moduleGroup.label}</strong>
                    <em>{t("projectMap.relationship.apiGroupStats", {
                      endpoints: moduleGroup.endpointCount,
                      children: moduleGroup.childGroupIds.length,
                    })}</em>
                  </button>
                  {expandedApiModuleGroupIds.has(moduleGroup.id) ? (
                    <div className="project-map-api-contract-controller-list">
                      {(apiControllerGroupsByModuleId.get(moduleGroup.id) ?? []).slice(0, 32).map((controllerGroup) => (
                        <button
                          key={controllerGroup.id}
                          type="button"
                          className={cn(selectedApiGroup?.id === controllerGroup.id && "is-active")}
                          onClick={() => {
                            setSelectedApiGroupId(controllerGroup.id);
                            setSelectedApiEndpointId(null);
                          }}
                        >
                          <span>{controllerGroup.level}</span>
                          <strong>{controllerGroup.label}</strong>
                          <em>{t("projectMap.relationship.apiGroupStats", {
                            endpoints: controllerGroup.endpointCount,
                            children: controllerGroup.childGroupIds.length,
                          })}</em>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          </section>
          <div
            className="project-map-api-contract-resizer"
            role="separator"
            aria-label={t("projectMap.relationship.apiResizeLeft")}
            onPointerDown={(event) => beginApiPaneResize("left", event)}
          />
          <section className="project-map-api-contract-stage">
            <div className="project-map-api-contract-breadcrumb">
              <span>{t("projectMap.relationship.apiBreadcrumbRoot")}</span>
              {selectedApiModuleGroup ? <strong>{selectedApiModuleGroup.label}</strong> : null}
              {selectedApiGroup && selectedApiGroup.id !== selectedApiModuleGroup?.id
                ? <strong>{selectedApiGroup.label}</strong>
                : null}
            </div>
            <div className="project-map-api-contract-stage-summary">
              <strong>
                {selectedApiGroup?.label
                  ?? selectedApiModuleGroup?.label
                  ?? t("projectMap.relationship.apiBreadcrumbRoot")}
              </strong>
              <span>{t("projectMap.relationship.apiStageEndpointSummary", {
                endpoints: selectedApiGroupEndpoints.length,
                sections: apiEndpointSections.length,
              })}</span>
            </div>
            {apiEndpointSections.length ? (
              <div className="project-map-api-contract-node-layer is-endpoints">
                {apiEndpointSections.slice(0, 8).map((section) => (
                  <section key={section.id} className="project-map-api-contract-endpoint-section">
                    <header>
                      <strong>{section.title}</strong>
                      <span>{section.hint}</span>
                    </header>
                    <div className="project-map-api-contract-endpoint-grid">
                      {section.endpoints.slice(0, 36).map((endpoint) => {
                        const endpointRow = buildProjectMapApiEndpointRow(endpoint);
                        return (
                          <button
                            key={`endpoint:${endpoint.id}`}
                            type="button"
                            className={cn(
                              "project-map-api-contract-endpoint-node",
                              selectedApiEndpoint?.id === endpoint.id && "is-active",
                            )}
                            onClick={() => setSelectedApiEndpointId(endpoint.id)}
                          >
                            <span>{endpointRow.methodLabel}</span>
                            <strong>{endpointRow.pathLabel}</strong>
                            <em>{endpointRow.summary ?? endpointRow.handlerLabel ?? endpoint.sourceFile}</em>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <p className="project-map-api-contract-stage-empty">
                {apiSearchQuery
                  ? t("projectMap.relationship.apiSearchEmpty")
                  : t("projectMap.relationship.apiNoEndpointsInGroup")}
              </p>
            )}
          </section>
          <div
            className="project-map-api-contract-resizer"
            role="separator"
            aria-label={t("projectMap.relationship.apiResizeRight")}
            onPointerDown={(event) => beginApiPaneResize("right", event)}
          />
          <aside className="project-map-api-contract-inspector">
            <header>
              <div>
                <span>{t("projectMap.relationship.apiInspectorTitle")}</span>
                <button
                  type="button"
                  className="project-map-api-contract-inspector-focus-toggle"
                  onClick={() => setApiInspectorFocused((current) => !current)}
                >
                  {apiInspectorFocused
                    ? t("projectMap.relationship.apiInspectorExitFocus")
                    : t("projectMap.relationship.apiInspectorFocus")}
                </button>
              </div>
              {selectedApiEndpoint ? null : (
                <strong>{selectedApiGroup?.label ?? t("projectMap.relationship.apiInspectorEmpty")}</strong>
              )}
            </header>
            {selectedApiEndpoint && selectedApiEndpointDetail ? (
              <>
                <article className="project-map-api-contract-swagger-card">
                  <div className="project-map-api-contract-operation-line">
                    <span>{selectedApiEndpointDetail.invocation.httpMethod}</span>
                    <strong>{selectedApiEndpointDetail.invocation.url}</strong>
                  </div>
                  <p>{selectedApiEndpointDetail.overview.description ?? t("projectMap.relationship.apiDescriptionUnavailable")}</p>
                  <div className="project-map-api-contract-endpoint-meta">
                    <span>{selectedApiEndpoint.protocol}</span>
                    <span>{selectedApiEndpoint.confidence}</span>
                    <span>{selectedApiEndpoint.language}</span>
                    {selectedApiEndpoint.framework ? <span>{selectedApiEndpoint.framework}</span> : null}
                    <em>
                      {t("projectMap.relationship.apiTrustEvidenceSummary", {
                        count: selectedApiEndpoint.evidence.length,
                        sources: Array.from(new Set(selectedApiEndpoint.evidence.map((entry) => entry.parserSource))).join(", ")
                          || t("projectMap.relationship.apiTrustEvidenceUnavailable"),
                      })}
                    </em>
                  </div>
                </article>
                <section className="project-map-api-contract-inspector-section project-map-api-contract-overview-section">
                  <h5>{t("projectMap.relationship.apiOverviewTitle")}</h5>
                  <dl className="project-map-api-contract-detail-list project-map-api-contract-overview-list project-map-api-contract-invocation-list">
                    <div>
                      <dt>{t("projectMap.relationship.apiOverviewName")}</dt>
                      <dd>{selectedApiEndpointDetail.overview.interfaceName}</dd>
                    </div>
                    <div>
                      <dt>{t("projectMap.relationship.apiOverviewMethodName")}</dt>
                      <dd>{selectedApiEndpointDetail.overview.methodName}</dd>
                    </div>
                    <div>
                      <dt>{t("projectMap.relationship.apiOverviewChineseComment")}</dt>
                      <dd>{selectedApiEndpointDetail.overview.chineseComment ?? t("projectMap.relationship.apiDescriptionUnavailable")}</dd>
                    </div>
                    <div>
                      <dt>{t("projectMap.relationship.apiOverviewScenario")}</dt>
                      <dd>{selectedApiEndpointDetail.overview.scenario ?? t("projectMap.relationship.apiDeclaredUnavailable")}</dd>
                    </div>
                    <div>
                      <dt>{t("projectMap.relationship.apiOverviewVersion")}</dt>
                      <dd>{selectedApiEndpointDetail.overview.version ?? t("projectMap.relationship.apiDeclaredUnavailable")}</dd>
                    </div>
                  </dl>
                </section>
                <section className="project-map-api-contract-inspector-section project-map-api-contract-overview-section">
                  <h5>{t("projectMap.relationship.apiInvocationTitle")}</h5>
                  <dl className="project-map-api-contract-detail-list project-map-api-contract-overview-list">
                    <div>
                      <dt>{t("projectMap.relationship.apiInvocationMethod")}</dt>
                      <dd>{selectedApiEndpointDetail.invocation.httpMethod}</dd>
                    </div>
                    <div>
                      <dt>{t("projectMap.relationship.apiInvocationUrl")}</dt>
                      <dd>{selectedApiEndpointDetail.invocation.url}</dd>
                    </div>
                    <div>
                      <dt>{t("projectMap.relationship.apiInvocationContentType")}</dt>
                      <dd>{selectedApiEndpointDetail.invocation.contentType}</dd>
                    </div>
                    <div>
                      <dt>{t("projectMap.relationship.apiInvocationHeaders")}</dt>
                      <dd>
                        {selectedApiEndpointDetail.invocation.headers.length
                          ? selectedApiEndpointDetail.invocation.headers.map((header) => header.name).join(", ")
                          : t("projectMap.relationship.apiNoHeaders")}
                      </dd>
                    </div>
                  </dl>
                  {selectedApiEndpointDetail.invocation.requestExample ? (
                    <code className="project-map-api-contract-example">
                      {selectedApiEndpointDetail.invocation.requestExample}
                    </code>
                  ) : null}
                </section>
                <section className="project-map-api-contract-inspector-section">
                  <h5>{t("projectMap.relationship.apiEndpointParams")}</h5>
                  {selectedApiEndpointDetail.inputParameters.length ? (
                    <div className="project-map-api-contract-parameter-list">
                      {selectedApiEndpointDetail.inputParameters.map((parameter) => (
                        <article key={`${parameter.location}:${parameter.name}`} className="project-map-api-contract-parameter-card">
                          <div>
                            <span>{parameter.location}</span>
                            <strong>{parameter.name}</strong>
                            <em>{parameter.type}{parameter.required ? " · required" : ""}</em>
                          </div>
                          {parameter.description ? <p>{parameter.description}</p> : null}
                          {parameter.defaultValue || parameter.example ? (
                            <small>
                              {parameter.defaultValue ? `default: ${parameter.defaultValue}` : ""}
                              {parameter.defaultValue && parameter.example ? " · " : ""}
                              {parameter.example ? `example: ${parameter.example}` : ""}
                            </small>
                          ) : null}
                          {parameter.fields.length ? (
                            <div className="project-map-api-contract-field-table">
                              <span>{t("projectMap.relationship.apiParamColumnName")}</span>
                              <span>{t("projectMap.relationship.apiParamColumnSchema")}</span>
                              <span>{t("projectMap.relationship.apiParamColumnRequired")}</span>
                              <span>{t("projectMap.relationship.apiParamColumnDescription")}</span>
                              {parameter.fields.slice(0, 24).flatMap((field) => [
                                <strong key={`${parameter.name}:${field.path}:name`} style={{ paddingLeft: `${6 + field.depth * 12}px` }}>
                                  {field.path}
                                </strong>,
                                <em key={`${parameter.name}:${field.path}:type`}>{field.type ?? "-"}</em>,
                                <em key={`${parameter.name}:${field.path}:required`}>{field.required ? "true" : "false"}</em>,
                                <em key={`${parameter.name}:${field.path}:description`}>
                                  {field.description ?? field.defaultValue ?? field.example ?? "-"}
                                </em>,
                              ])}
                            </div>
                          ) : (
                            <p>{t("projectMap.relationship.apiParamFieldsUnavailable")}</p>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>{t("projectMap.relationship.apiNoParameters")}</p>
                  )}
                </section>
                <section className="project-map-api-contract-inspector-section">
                  <h5>{t("projectMap.relationship.apiEndpointResponses")}</h5>
                  {selectedApiEndpointDetail.responses.length ? (
                    <div className="project-map-api-contract-response-list">
                      {selectedApiEndpointDetail.responses.map((response, responseIndex) => (
                        <article key={`${response.statusCode}:${response.rawType}:${responseIndex}`}>
                          <div className="project-map-api-contract-response-head">
                            <strong>{response.statusCode}</strong>
                            <span>{response.contentType}</span>
                          </div>
                          <em className="project-map-api-contract-response-schema">
                            {response.rawType}
                            {response.businessType !== response.rawType ? ` · data: ${response.businessType}` : ""}
                            {response.description ? ` · ${response.description}` : ""}
                          </em>
                          {response.fields.length ? (
                            <div className="project-map-api-contract-response-fields">
                              {response.fields.slice(0, 16).map((field, fieldIndex) => (
                                <div key={`${response.statusCode}:${field.path}:${fieldIndex}`}>
                                  <code>{field.path}</code>
                                  {field.type ? <span>{field.type}</span> : null}
                                  {field.description ? <p>{field.description}</p> : null}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>{t("projectMap.relationship.apiNoResponses")}</p>
                  )}
                </section>
                <section className="project-map-api-contract-inspector-section">
                  <h5>{t("projectMap.relationship.apiErrorCodesTitle")}</h5>
                  {selectedApiEndpointDetail.responses.some((response) => response.isError) ? (
                    <div className="project-map-api-contract-response-list">
                      {selectedApiEndpointDetail.responses.filter((response) => response.isError).map((response, responseIndex) => (
                        <article key={`error:${response.statusCode}:${responseIndex}`}>
                          <strong>{response.statusCode}</strong>
                          <span>{response.description ?? t("projectMap.relationship.apiDeclaredUnavailable")}</span>
                          <em>{t("projectMap.relationship.apiErrorHandlingHint")}</em>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>{t("projectMap.relationship.apiNoErrorCodes")}</p>
                  )}
                </section>
                <section className="project-map-api-contract-inspector-section">
                  <h5>{t("projectMap.relationship.apiEndpointDescription")}</h5>
                  {selectedApiEndpointDetail.descriptionBlocks.length ? (
                    selectedApiEndpointDetail.descriptionBlocks.map((block) => (
                      <p key={`${block.kind}:${block.text}`}>{block.kind} · {block.text}</p>
                    ))
                  ) : (
                    <p>{t("projectMap.relationship.apiDescriptionUnavailable")}</p>
                  )}
                </section>
                <section className="project-map-api-contract-evidence">
                  <h5>{t("projectMap.relationship.apiEvidenceTitle")}</h5>
                  {selectedApiEndpoint.evidence.slice(0, 4).map((evidence) => (
                    <button
                      key={`${evidence.path}:${evidence.line ?? 0}:${evidence.parserSource}`}
                      type="button"
                      onClick={() => openApiInspectorPath(evidence.path, evidence.line)}
                    >
                      <span>{evidence.parserSource}{evidence.redacted ? " · redacted" : ""}</span>
                      <strong>{evidence.path}{evidence.line ? `:${evidence.line}` : ""}</strong>
                      {evidence.excerpt ? <em>{evidence.excerpt}</em> : null}
                    </button>
                  ))}
                  {!selectedApiEndpoint.evidence.length ? (
                    <p>{t("projectMap.relationship.apiEvidenceEmpty")}</p>
                  ) : null}
                </section>
                <section className="project-map-api-contract-inspector-section">
                  <h5>{t("projectMap.relationship.apiMethodChainTitle")}</h5>
                  {selectedApiCallChains.length ? (
                    <div className="project-map-api-contract-method-chain-list">
                      {selectedApiMethodChainTrees.map(({ chain, roots }) => (
                        <article key={chain.id} className="project-map-api-method-tree">
                          {chain.truncatedReason ? (
                            <span className="project-map-api-contract-method-chain-warning">
                              {t("projectMap.relationship.apiMethodChainTruncated", {
                                reason: chain.truncatedReason,
                              })}
                            </span>
                          ) : null}
                          <ol className="project-map-api-method-tree-roots">
                            {roots.map((root) => renderApiMethodChainNode(root, 0))}
                          </ol>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>
                      {selectedApiEndpoint.callChainUnavailableReason
                        ? t("projectMap.relationship.apiMethodChainUnavailable", {
                            reason: selectedApiEndpoint.callChainUnavailableReason,
                          })
                        : t("projectMap.relationship.apiMethodChainEmpty")}
                    </p>
                  )}
                </section>
              </>
            ) : selectedApiGroup ? (
              <div className="project-map-api-contract-group-summary">
                <span>{selectedApiGroup.level}</span>
                <strong>{selectedApiGroup.label}</strong>
                <p>{t("projectMap.relationship.apiGroupInspectorSummary", {
                  endpoints: selectedApiGroup.endpointCount,
                  children: selectedApiGroup.childGroupIds.length,
                })}</p>
                <div className="project-map-api-contract-distribution">
                  <h5>{t("projectMap.relationship.apiDistributionProtocol")}</h5>
                  <div className="project-map-api-contract-chip-list">
                    {Object.entries(selectedApiGroup.protocolCounts ?? {}).map(([key, value]) => (
                      <span key={`protocol:${key}`}>{key} · {value}</span>
                    ))}
                  </div>
                  <h5>{t("projectMap.relationship.apiDistributionLanguage")}</h5>
                  <div className="project-map-api-contract-chip-list">
                    {Object.entries(selectedApiGroup.languageCounts ?? {}).map(([key, value]) => (
                      <span key={`language:${key}`}>{key} · {value}</span>
                    ))}
                  </div>
                  <h5>{t("projectMap.relationship.apiDistributionConfidence")}</h5>
                  <div className="project-map-api-contract-chip-list">
                    {Object.entries(selectedApiGroup.confidenceCounts ?? {}).map(([key, value]) => (
                      <span key={`confidence:${key}`}>{key} · {value}</span>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      ) : (
        <div className="project-map-api-contract-empty">
          <strong>
            {apiContractScanExists
              ? t("projectMap.relationship.apiEmptyScannedTitle")
              : t("projectMap.relationship.apiEmptyTitle")}
          </strong>
          <p>
            {apiContractScanExists
              ? t("projectMap.relationship.apiEmptyScannedBody")
              : t("projectMap.relationship.apiEmptyBody")}
          </p>
          <small>
            {apiContractScanExists
              ? t("projectMap.relationship.apiEmptyScannedHint")
              : t("projectMap.relationship.apiEmptyHint")}
          </small>
        </div>
      )}
    </div>
  );
}

type ProjectMapRelationshipFileWorkspaceProps = {
  expandedRelationshipFileGroups: ReadonlySet<string>;
  relationshipDashboardDirectionCountByFile: ReadonlyMap<string, ProjectMapRelationshipFileDirectionCount>;
  relationshipDashboardExplorerRenderedFileCount: number;
  relationshipDashboardFileTreeGroups: ProjectMapRelationshipFileTreeGroup[];
  relationshipDashboardFilteredFiles: ProjectMapScannedFile[];
  relationshipDashboardLayoutPreset: ProjectMapRelationshipLayoutPreset;
  relationshipDashboardScannedFileCount: number;
  relationshipDashboardVisibleFileTotal: number;
  relationshipFilesZoom: number;
  selectedRelationshipFile: ProjectMapScannedFile | null;
  setInspectedRelationshipFileId: (value: string | null) => void;
  setRelationshipDashboardViewMode: (value: ProjectMapRelationshipDashboardViewMode) => void;
  setSelectedRelationshipFileId: (value: string | null) => void;
  setSelectedRelationshipRelationId: (value: string | null) => void;
  toggleRelationshipFileTreeGroup: (groupId: string) => void;
};

export function ProjectMapRelationshipFileWorkspace({
  expandedRelationshipFileGroups,
  relationshipDashboardDirectionCountByFile,
  relationshipDashboardExplorerRenderedFileCount,
  relationshipDashboardFileTreeGroups,
  relationshipDashboardFilteredFiles,
  relationshipDashboardLayoutPreset,
  relationshipDashboardScannedFileCount,
  relationshipDashboardVisibleFileTotal,
  relationshipFilesZoom,
  selectedRelationshipFile,
  setInspectedRelationshipFileId,
  setRelationshipDashboardViewMode,
  setSelectedRelationshipFileId,
  setSelectedRelationshipRelationId,
  toggleRelationshipFileTreeGroup,
}: ProjectMapRelationshipFileWorkspaceProps) {
  const { t } = useTranslation();

  return (
    <div className="project-map-relationship-file-workspace">
      <header className="project-map-relationship-workspace-header">
        <div>
          <strong>{t("projectMap.relationship.filesWorkspaceTitle")}</strong>
          <span>{t("projectMap.relationship.filesWorkspaceSummary", {
            rendered: relationshipDashboardExplorerRenderedFileCount,
            matching: relationshipDashboardVisibleFileTotal,
            scanned: relationshipDashboardScannedFileCount,
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
      >
        <div className="project-map-relationship-file-tree-zoom">
          {relationshipDashboardFileTreeGroups.length ? (
            relationshipDashboardFileTreeGroups.map((group) => (
              <section key={group.id} className="project-map-relationship-file-tree-group">
                <header>
                  <strong>{group.label}</strong>
                  <span>{t("projectMap.relationship.filesTreeGroupStats", {
                    rendered: expandedRelationshipFileGroups.has(group.id)
                      ? group.files.length
                      : Math.min(group.files.length, PROJECT_MAP_RELATIONSHIP_EXPLORER_GROUP_LIMIT),
                    files: group.files.length,
                    relations: group.relationCount,
                  })}</span>
                </header>
                <div className="project-map-relationship-file-tree-list">
                  {(expandedRelationshipFileGroups.has(group.id)
                    ? group.files
                    : group.files.slice(0, PROJECT_MAP_RELATIONSHIP_EXPLORER_GROUP_LIMIT)
                  ).map((file) => {
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
                  {group.files.length > PROJECT_MAP_RELATIONSHIP_EXPLORER_GROUP_LIMIT ? (
                    <button
                      type="button"
                      className="project-map-relationship-file-tree-row"
                      onClick={() => toggleRelationshipFileTreeGroup(group.id)}
                    >
                      <strong>
                        {expandedRelationshipFileGroups.has(group.id)
                          ? t("projectMap.relationship.filesTreeGroupCollapse")
                          : t("projectMap.relationship.filesTreeGroupMore", {
                              count: group.files.length - PROJECT_MAP_RELATIONSHIP_EXPLORER_GROUP_LIMIT,
                            })}
                      </strong>
                      <em>{t("projectMap.relationship.filesTreeGroupSearchHint")}</em>
                    </button>
                  ) : null}
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
  );
}

type ProjectMapRelationshipReadWorkspaceProps = {
  activeWorkspaceId: string | null;
  inspectedRelationshipFile: ProjectMapScannedFile | null;
  openProjectMapRelationshipPath: (path: string | null | undefined, line?: number | null) => void;
  relationshipDashboardData: ProjectMapRelationshipDashboardData;
  relationshipDashboardFileIndex: ReadonlyMap<string, ProjectMapScannedFile>;
  relationshipDashboardModuleByFileId: ReadonlyMap<string, string>;
  selectedRelationshipRelation: ProjectMapFileRelation | null;
  selectedRelationshipRelationGroups: ProjectMapRelationshipRelationGroup[];
  setRelationshipDashboardViewMode: (value: ProjectMapRelationshipDashboardViewMode) => void;
};

export function ProjectMapRelationshipReadWorkspace({
  activeWorkspaceId,
  inspectedRelationshipFile,
  openProjectMapRelationshipPath,
  relationshipDashboardData,
  relationshipDashboardFileIndex,
  relationshipDashboardModuleByFileId,
  selectedRelationshipRelation,
  selectedRelationshipRelationGroups,
  setRelationshipDashboardViewMode,
}: ProjectMapRelationshipReadWorkspaceProps) {
  const { t } = useTranslation();
  const [selectedReadMethodId, setSelectedReadMethodId] = useState<string | null>(null);
  const [readSourceContent, setReadSourceContent] = useState<string | null>(null);
  const [readSourceError, setReadSourceError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setReadSourceContent(null);
    setReadSourceError(null);
    if (!activeWorkspaceId || !inspectedRelationshipFile) {
      return () => {
        cancelled = true;
      };
    }
    readWorkspaceFilePreview(activeWorkspaceId, inspectedRelationshipFile.path)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setReadSourceContent(response.content);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setReadSourceError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, inspectedRelationshipFile]);
  const relatedRelations = useMemo(() => {
    if (!inspectedRelationshipFile) {
      return [];
    }
    return relationshipDashboardData.relations
      .filter((relation) => (
        relation.sourceFileId === inspectedRelationshipFile.id
        || relation.targetFileId === inspectedRelationshipFile.id
      ))
      .sort(sortProjectMapReadRelations);
  }, [inspectedRelationshipFile, relationshipDashboardData.relations]);
  const incomingReadCards = useMemo(() => {
    if (!inspectedRelationshipFile) {
      return [];
    }
    return relatedRelations
      .filter((relation) => (
        relation.targetFileId === inspectedRelationshipFile.id
        && isProjectMapReadAnatomyRelation(relation)
      ))
      .slice(0, READ_ANATOMY_MAX_INCOMING)
      .map((relation) => buildProjectMapReadRelationCard({
        relation,
        lane: "incoming",
        inspectedFile: inspectedRelationshipFile,
        relationshipDashboardFileIndex,
      }));
  }, [inspectedRelationshipFile, relatedRelations, relationshipDashboardFileIndex]);
  const outgoingReadCards = useMemo(() => {
    if (!inspectedRelationshipFile) {
      return [];
    }
    return relatedRelations
      .filter((relation) => (
        relation.sourceFileId === inspectedRelationshipFile.id
        && isProjectMapReadAnatomyRelation(relation)
      ))
      .slice(0, READ_ANATOMY_MAX_OUTGOING)
      .map((relation) => buildProjectMapReadRelationCard({
        relation,
        lane: "outgoing",
        inspectedFile: inspectedRelationshipFile,
        relationshipDashboardFileIndex,
      }));
  }, [inspectedRelationshipFile, relatedRelations, relationshipDashboardFileIndex]);
  const verifyReadCards = useMemo(() => {
    if (!inspectedRelationshipFile) {
      return [];
    }
    return relatedRelations
      .filter(isProjectMapReadVerifyRelation)
      .slice(0, READ_ANATOMY_MAX_VERIFY)
      .map((relation) => buildProjectMapReadRelationCard({
        relation,
        lane: "verify",
        inspectedFile: inspectedRelationshipFile,
        relationshipDashboardFileIndex,
      }));
  }, [inspectedRelationshipFile, relatedRelations, relationshipDashboardFileIndex]);
  const readMethodCards = useMemo((): ProjectMapRelationshipReadMethodCard[] => {
    if (!inspectedRelationshipFile) {
      return [];
    }
    const sourceMethods = readSourceContent
      ? buildProjectMapReadSourceMethods({
          content: readSourceContent,
          file: inspectedRelationshipFile,
        })
      : [];
    const outgoingCalls = relatedRelations.filter((relation) => (
      relation.type === "calls"
      && relation.sourceFileId === inspectedRelationshipFile.id
    ));
    const incomingCalls = relatedRelations.filter((relation) => (
      relation.type === "calls"
      && relation.targetFileId === inspectedRelationshipFile.id
    ));
    const callSiteLines = new Set(
      outgoingCalls
        .map((relation) => getProjectMapReadRelationLineForFile(relation, inspectedRelationshipFile.path))
        .filter((line): line is number => Boolean(line)),
    );
    const callTerminalNames = new Set(
      outgoingCalls
        .map((relation) => getProjectMapReadTerminalCallName(getProjectMapRelationshipCallCandidate(relation)))
        .filter((name): name is string => Boolean(name)),
    );
    const methodSymbols = relationshipDashboardData.symbols
      .filter((symbol) => (
        symbol.fileId === inspectedRelationshipFile.id
        && isProjectMapReadMethodSymbol(symbol.kind)
        && !callTerminalNames.has(symbol.name)
        && !callSiteLines.has(symbol.line)
      ))
      .sort((left, right) => left.line - right.line)
      .slice(0, READ_METHOD_INDEX_LIMIT);
    const methodCardsById = new Map<string, ProjectMapRelationshipReadMethodCard>();
    const methodEntries = sourceMethods.length
      ? sourceMethods.map((sourceMethod) => ({
          id: sourceMethod.id,
          name: sourceMethod.name,
          kind: "method",
          line: sourceMethod.line,
          endLine: sourceMethod.endLine,
          sourceSnippet: sourceMethod.bodyLines.slice(0, 28),
          sourceFlowNodes: sourceMethod.flowNodes,
        }))
      : methodSymbols.map((symbol) => ({
          id: symbol.id,
          name: symbol.name,
          kind: symbol.kind,
          line: symbol.line,
          endLine: null,
          sourceSnippet: [],
          sourceFlowNodes: [],
        }));
    for (const methodEntry of methodEntries) {
      methodCardsById.set(methodEntry.id, {
        id: methodEntry.id,
        name: methodEntry.name,
        kind: methodEntry.kind,
        line: methodEntry.line,
        endLine: methodEntry.endLine,
        sourceSnippet: methodEntry.sourceSnippet,
        sourceFlowNodes: methodEntry.sourceFlowNodes,
        outgoing: [],
        incoming: [],
        chain: {
          id: `method:${methodEntry.id}`,
          relationId: null,
          label: methodEntry.name,
          fileLabel: inspectedRelationshipFile.basename,
          path: inspectedRelationshipFile.path,
          line: methodEntry.line,
          relationType: "method",
          confidence: "focus",
          children: [],
        },
      });
    }
    if (!methodCardsById.size) {
      for (const relation of outgoingCalls.slice(0, READ_METHOD_INDEX_LIMIT)) {
        const line = getProjectMapReadRelationLineForFile(relation, inspectedRelationshipFile.path);
        const methodId = `callsite:${line ?? relation.id}`;
        if (methodCardsById.has(methodId)) {
          continue;
        }
        methodCardsById.set(methodId, {
          id: methodId,
          name: line
            ? t("projectMap.relationship.readMethodFallbackLine", { line })
            : inspectedRelationshipFile.basename,
          kind: "callsite",
          line,
          endLine: null,
          sourceSnippet: [],
          sourceFlowNodes: [],
          outgoing: [],
          incoming: [],
          chain: {
            id: `method:${methodId}`,
            relationId: null,
            label: line
              ? t("projectMap.relationship.readMethodFallbackLine", { line })
              : inspectedRelationshipFile.basename,
            fileLabel: inspectedRelationshipFile.basename,
            path: inspectedRelationshipFile.path,
            line,
            relationType: "method",
            confidence: "focus",
            children: [],
          },
        });
      }
    }
    for (const relation of outgoingCalls) {
      const line = getProjectMapReadRelationLineForFile(relation, inspectedRelationshipFile.path);
      const sourceMethod = sourceMethods.find((method) => (
        line !== null && line >= method.line && line <= method.endLine
      ));
      const methodId = sourceMethod?.id ?? findProjectMapReadMethodIdByLine(methodSymbols, line) ?? methodCardsById.keys().next().value;
      const methodCard = methodId ? methodCardsById.get(methodId) : null;
      if (!methodCard) {
        continue;
      }
      methodCard.outgoing.push(relation);
    }
    for (const relation of incomingCalls) {
      const terminalName = getProjectMapReadTerminalCallName(getProjectMapRelationshipCallCandidate(relation));
      const matchedMethod = methodSymbols.find((symbol) => symbol.name === terminalName);
      const methodId = matchedMethod?.id ?? methodCardsById.keys().next().value;
      const methodCard = methodId ? methodCardsById.get(methodId) : null;
      if (!methodCard) {
        continue;
      }
      methodCard.incoming.push(relation);
    }
    for (const methodCard of methodCardsById.values()) {
      methodCard.outgoing.sort(sortProjectMapReadRelationsByEvidenceLine);
      methodCard.incoming.sort(sortProjectMapReadRelations);
      methodCard.chain.children = methodCard.outgoing
        .slice(0, READ_METHOD_CHAIN_BRANCH_LIMIT)
        .map((relation) => buildProjectMapReadRelationChainNode({
          relation,
          inspectedFileId: inspectedRelationshipFile.id,
          relationshipDashboardFileIndex,
          relationLookup: relationshipDashboardData.relations,
          depth: 0,
          visitedFileIds: new Set([inspectedRelationshipFile.id]),
        }));
    }
    return Array.from(methodCardsById.values())
      .filter((methodCard) => methodCard.outgoing.length || methodCard.incoming.length || methodCard.kind !== "callsite")
      .slice(0, READ_METHOD_INDEX_LIMIT);
  }, [
    inspectedRelationshipFile,
    relatedRelations,
    readSourceContent,
    relationshipDashboardData.relations,
    relationshipDashboardData.symbols,
    relationshipDashboardFileIndex,
    t,
  ]);
  useEffect(() => {
    setSelectedReadMethodId(readMethodCards[0]?.id ?? null);
  }, [inspectedRelationshipFile?.id, readMethodCards]);
  const selectedReadMethod = readMethodCards.find((methodCard) => methodCard.id === selectedReadMethodId)
    ?? readMethodCards[0]
    ?? null;
  const readPathFileCount = useMemo(() => {
    const pathSet = new Set<string>();
    for (const card of [...incomingReadCards, ...outgoingReadCards, ...verifyReadCards]) {
      pathSet.add(card.path);
    }
    return pathSet.size + (inspectedRelationshipFile ? 1 : 0);
  }, [incomingReadCards, inspectedRelationshipFile, outgoingReadCards, verifyReadCards]);
  const renderReadRelationCard = (card: ProjectMapRelationshipReadRelationCard): ReactElement => (
    <article
      key={card.id}
      className={cn(
        "project-map-relationship-read-relation-card",
        `is-lane-${card.lane}`,
        selectedRelationshipRelation?.id === card.relation.id && "is-active",
      )}
      title={`${card.title} · ${formatProjectMapReadPathEvidence(card.relation)}`}
    >
      <header>
        <strong>{card.file?.basename ?? getProjectMapReadPathBasename(card.path)}</strong>
        <span>{card.relation.type}</span>
      </header>
      <div>
        <button
          type="button"
          className="project-map-relationship-read-action"
          onClick={() => openProjectMapRelationshipPath(card.path)}
        >
          <ExternalLink aria-hidden="true" />
          {t("projectMap.relationship.readOpenFile")}
        </button>
        <button
          type="button"
          className="project-map-relationship-read-action"
          onClick={() => openProjectMapRelationshipPath(card.evidencePath, card.evidenceLine)}
        >
          <MapPin aria-hidden="true" />
          {t("projectMap.relationship.readOpenEvidence")}
        </button>
      </div>
    </article>
  );

  return (
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
          <article className="project-map-relationship-read-hero">
            <div>
              <span>{t("projectMap.relationship.readMissionTitle")}</span>
              <strong>{inspectedRelationshipFile.basename}</strong>
              <p>{t("projectMap.relationship.readMissionBody", {
                path: inspectedRelationshipFile.path,
              })}</p>
            </div>
            <dl>
              <div>
                <dt>{t("projectMap.relationship.readMetricFiles")}</dt>
                <dd>{readPathFileCount}</dd>
              </div>
              <div>
                <dt>{t("projectMap.relationship.readMetricRelations")}</dt>
                <dd>{selectedRelationshipRelationGroups.reduce((count, group) => count + group.relations.length, 0)}</dd>
              </div>
              <div>
                <dt>{t("projectMap.relationship.readMetricMethods")}</dt>
                <dd>{readMethodCards.length}</dd>
              </div>
            </dl>
          </article>
        ) : null}
        <section className="project-map-relationship-read-anatomy">
          <header>
            <span>{t("projectMap.relationship.readAnatomyEyebrow")}</span>
            <strong>{t("projectMap.relationship.readAnatomyTitle")}</strong>
            <p>{t("projectMap.relationship.readAnatomyHint")}</p>
          </header>
          {inspectedRelationshipFile ? (
            <>
              <div className="project-map-relationship-read-anatomy-graph">
                <section className="project-map-relationship-read-lane is-incoming">
                  <h5>{t("projectMap.relationship.readIncomingTitle")}</h5>
                  {incomingReadCards.length ? incomingReadCards.map(renderReadRelationCard) : (
                    <p className="project-map-relationship-empty">{t("projectMap.relationship.readIncomingEmpty")}</p>
                  )}
                </section>
                <article className="project-map-relationship-read-current-file">
                  <span>{t("projectMap.relationship.readCurrentFile")}</span>
                  <strong>{inspectedRelationshipFile.basename}</strong>
                  <p>{inspectedRelationshipFile.path}</p>
                  <div>
                    <em>{inspectedRelationshipFile.role}</em>
                    <em>{inspectedRelationshipFile.language}</em>
                    <em>{relationshipDashboardModuleByFileId.get(inspectedRelationshipFile.id) ?? inspectedRelationshipFile.layer}</em>
                  </div>
                  <button
                    type="button"
                    className="project-map-relationship-read-action"
                    onClick={() => openProjectMapRelationshipPath(inspectedRelationshipFile.path)}
                  >
                    <ExternalLink aria-hidden="true" />
                    {t("projectMap.relationship.readOpenCurrentFile")}
                  </button>
                </article>
                <section className="project-map-relationship-read-lane is-outgoing">
                  <h5>{t("projectMap.relationship.readOutgoingTitle")}</h5>
                  {outgoingReadCards.length ? outgoingReadCards.map(renderReadRelationCard) : (
                    <p className="project-map-relationship-empty">{t("projectMap.relationship.readOutgoingEmpty")}</p>
                  )}
                </section>
              </div>
              {verifyReadCards.length ? (
                <div className="project-map-relationship-read-verify-row">
                  <strong>{t("projectMap.relationship.readVerifyTitle")}</strong>
                  {verifyReadCards.map(renderReadRelationCard)}
                </div>
              ) : null}
            </>
          ) : (
            <p className="project-map-relationship-empty">
              {t("projectMap.relationship.readRouteEmpty")}
            </p>
          )}
        </section>
        <section className="project-map-relationship-read-methods">
          <header>
            <span>{t("projectMap.relationship.readMethodEyebrow")}</span>
            <strong>{t("projectMap.relationship.readMethodTitle")}</strong>
            <p>{t("projectMap.relationship.readMethodHint")}</p>
          </header>
          {readMethodCards.length && selectedReadMethod ? (
            <div className="project-map-relationship-read-method-grid">
              <nav aria-label={t("projectMap.relationship.readMethodTitle")}>
                {readMethodCards.map((methodCard) => (
                  <button
                    key={methodCard.id}
                    type="button"
                    className={cn(
                      "project-map-relationship-read-method-tab",
                      selectedReadMethod.id === methodCard.id && "is-active",
                    )}
                    onClick={() => setSelectedReadMethodId(methodCard.id)}
                  >
                    <strong>{methodCard.name}</strong>
                    <span>
                      {methodCard.kind}
                      {methodCard.line ? ` · L${methodCard.line}` : ""}
                      {" · "}
                      {methodCard.outgoing.length}{t("projectMap.relationship.readMethodCallsOut")}
                    </span>
                  </button>
                ))}
              </nav>
              <article className="project-map-relationship-read-method-chain">
                <header>
                  <div>
                    <span>{t("projectMap.relationship.readMethodSelected")}</span>
                    <strong>{selectedReadMethod.name}</strong>
                    <p>
                      {selectedReadMethod.incoming.length}{t("projectMap.relationship.readMethodIncoming")}
                      {" · "}
                      {selectedReadMethod.outgoing.length}{t("projectMap.relationship.readMethodOutgoing")}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="project-map-relationship-read-action"
                    onClick={() => {
                      if (inspectedRelationshipFile) {
                        openProjectMapRelationshipPath(inspectedRelationshipFile.path, selectedReadMethod.line);
                      }
                    }}
                  >
                    <MapPin aria-hidden="true" />
                    {t("projectMap.relationship.readOpenMethod")}
                  </button>
                </header>
                <ol className="project-map-relationship-read-method-flow">
                  <li className="is-start">
                    <article>
                      <span>{t("projectMap.relationship.readFlowStart")}</span>
                      <strong>{selectedReadMethod.name}</strong>
                      <button
                        type="button"
                        className="project-map-relationship-read-action"
                        onClick={() => {
                          if (inspectedRelationshipFile) {
                            openProjectMapRelationshipPath(inspectedRelationshipFile.path, selectedReadMethod.line);
                          }
                        }}
                      >
                        <MapPin aria-hidden="true" />
                        {t("projectMap.relationship.readOpenMethod")}
                      </button>
                    </article>
                  </li>
                  {(selectedReadMethod.sourceFlowNodes.length
                    ? selectedReadMethod.sourceFlowNodes
                    : selectedReadMethod.outgoing.slice(0, READ_METHOD_CHAIN_BRANCH_LIMIT).map((relation) => {
                        const targetFile = relationshipDashboardFileIndex.get(relation.targetFileId);
                        const evidence = relation.evidence[0];
                        return {
                          id: `relation-flow:${relation.id}`,
                          relationId: relation.id,
                          label: getProjectMapRelationshipCallCandidate(relation) ?? targetFile?.basename ?? relation.targetFileId,
                          fileLabel: targetFile?.basename ?? relation.targetFileId,
                          path: targetFile?.path ?? evidence?.path ?? inspectedRelationshipFile?.path ?? relation.id,
                          line: evidence?.line ?? null,
                          relationType: relation.type,
                          confidence: relation.confidence,
                          children: [],
                        } satisfies ProjectMapRelationshipReadChainNode;
                      })).map((flowNode, index) => {
                    return (
                      <li key={`flow:${flowNode.id}`}>
                        <article>
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <strong>{flowNode.label}</strong>
                          <div>
                            <button
                              type="button"
                              className="project-map-relationship-read-action"
                              onClick={() => openProjectMapRelationshipPath(flowNode.path)}
                            >
                              <ExternalLink aria-hidden="true" />
                              {t("projectMap.relationship.readOpenFile")}
                            </button>
                            <button
                              type="button"
                              className="project-map-relationship-read-action"
                              onClick={() => openProjectMapRelationshipPath(flowNode.path, flowNode.line)}
                            >
                              <MapPin aria-hidden="true" />
                              {t("projectMap.relationship.readOpenEvidence")}
                            </button>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                  <li className="is-end">
                    <article>
                      <span>{t("projectMap.relationship.readFlowEnd")}</span>
                      <strong>{t("projectMap.relationship.readFlowReturn")}</strong>
                    </article>
                  </li>
                </ol>
                {selectedReadMethod.sourceSnippet.length ? (
                  <pre className="project-map-relationship-read-method-snippet">
                    <code>
                      {selectedReadMethod.sourceSnippet
                        .map((line, index) => `${String((selectedReadMethod.line ?? 1) + index).padStart(4, " ")}  ${line}`)
                        .join("\n")}
                    </code>
                  </pre>
                ) : readSourceError ? (
                  <p className="project-map-relationship-empty">
                    {t("projectMap.relationship.readSourceUnavailable", { message: readSourceError })}
                  </p>
                ) : null}
              </article>
            </div>
          ) : (
            <p className="project-map-relationship-empty">
              {t("projectMap.relationship.readMethodEmpty")}
            </p>
          )}
        </section>
      </section>
    </div>
  );
}
