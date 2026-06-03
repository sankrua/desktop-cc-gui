import type {
  ProjectMapDataset,
  ProjectMapNode,
  ProjectMapRelation,
  ProjectMapTourMetadata,
  ProjectMapTourPurpose,
  ProjectMapTourStep,
} from "../types";
import {
  buildProjectMapNodeIndex,
  compareProjectMapNodes,
  getProjectMapCoreNode,
  getSortedProjectMapChildren,
  normalizeProjectMapProjectionNodes,
} from "./interactiveLayout";

export type ProjectMapTourCopy = Record<ProjectMapTourPurpose, { title: string; summary: string }>;

export type ProjectMapSearchResult = {
  node: ProjectMapNode;
  score: number;
  matchedFields: string[];
};

export type ProjectMapPathStep = {
  node: ProjectMapNode;
  via: "hierarchy" | "relation" | "self";
  relation?: ProjectMapRelation;
};

export type ProjectMapPathResult =
  | {
      status: "idle";
      steps: [];
      edgeKeys: Set<string>;
      message: string;
    }
  | {
      status: "found";
      steps: ProjectMapPathStep[];
      edgeKeys: Set<string>;
      message: string;
    }
  | {
      status: "not-found";
      steps: [];
      edgeKeys: Set<string>;
      message: string;
    };

const TOUR_ORDER: ProjectMapTourPurpose[] = [
  "onboarding",
  "architecture-review",
  "risk-review",
  "task-planning",
];

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueExistingNodeIds(nodeIds: string[], nodeIndex: Map<string, ProjectMapNode>): string[] {
  const seen = new Set<string>();
  const existingIds: string[] = [];
  for (const nodeId of nodeIds) {
    if (!nodeIndex.has(nodeId) || seen.has(nodeId)) {
      continue;
    }
    seen.add(nodeId);
    existingIds.push(nodeId);
  }
  return existingIds;
}

function buildTourStep(input: {
  id: string;
  purpose: ProjectMapTourPurpose;
  copy: ProjectMapTourCopy;
  nodeIds: string[];
  nodeIndex: Map<string, ProjectMapNode>;
  priority: number;
}): ProjectMapTourStep | null {
  const nodeIds = uniqueExistingNodeIds(input.nodeIds, input.nodeIndex);
  if (nodeIds.length === 0) {
    return null;
  }
  const copy = input.copy[input.purpose] ?? input.copy.onboarding;
  return {
    id: input.id,
    purpose: input.purpose,
    title: copy.title,
    summary: copy.summary,
    nodeIds,
    priority: input.priority,
  };
}

function sanitizePersistedTourSteps(
  tours: ProjectMapTourMetadata | undefined,
  nodeIndex: Map<string, ProjectMapNode>,
): ProjectMapTourStep[] {
  return (tours?.steps ?? [])
    .map((step) => ({
      ...step,
      nodeIds: uniqueExistingNodeIds(step.nodeIds, nodeIndex),
    }))
    .filter((step) => step.nodeIds.length > 0)
    .sort((left, right) => (left.priority ?? 99) - (right.priority ?? 99));
}

export function buildProjectMapGuidedTour(input: {
  dataset: ProjectMapDataset;
  copy: ProjectMapTourCopy;
}): ProjectMapTourStep[] {
  const nodes = normalizeProjectMapProjectionNodes(input.dataset.nodes);
  const nodeIndex = buildProjectMapNodeIndex(nodes);
  const persistedSteps = sanitizePersistedTourSteps(input.dataset.tours, nodeIndex);
  if (persistedSteps.length > 0) {
    return persistedSteps;
  }

  const rootNode = getProjectMapCoreNode({ ...input.dataset, nodes });
  const hubNodes = rootNode ? getSortedProjectMapChildren(rootNode, nodeIndex).slice(0, 4) : [];
  const riskNodes = nodes
    .filter((node) => node.stale || node.confidence === "low" || node.detail.riskSignals.length > 0)
    .sort(compareProjectMapNodes)
    .slice(0, 4);
  const candidateNodes = nodes.filter((node) => node.candidate).sort(compareProjectMapNodes).slice(0, 4);
  const relationNodes = (input.dataset.relations ?? [])
    .flatMap((relation) => [relation.sourceNodeId, relation.targetNodeId])
    .map((nodeId) => nodeIndex.get(nodeId))
    .filter((node): node is ProjectMapNode => Boolean(node))
    .slice(0, 5);

  return TOUR_ORDER.flatMap((purpose, index) => {
    if (purpose === "onboarding") {
      return buildTourStep({
        id: "tour-onboarding",
        purpose,
        copy: input.copy,
        nodeIds: [rootNode?.id ?? "", ...hubNodes.map((node) => node.id)],
        nodeIndex,
        priority: index + 1,
      }) ?? [];
    }
    if (purpose === "architecture-review") {
      return buildTourStep({
        id: "tour-architecture-review",
        purpose,
        copy: input.copy,
        nodeIds: [...hubNodes.map((node) => node.id), ...relationNodes.map((node) => node.id)],
        nodeIndex,
        priority: index + 1,
      }) ?? [];
    }
    if (purpose === "risk-review") {
      return buildTourStep({
        id: "tour-risk-review",
        purpose,
        copy: input.copy,
        nodeIds: riskNodes.map((node) => node.id),
        nodeIndex,
        priority: index + 1,
      }) ?? [];
    }
    return buildTourStep({
      id: "tour-task-planning",
      purpose,
      copy: input.copy,
      nodeIds: [...candidateNodes.map((node) => node.id), ...riskNodes.map((node) => node.id)],
      nodeIndex,
      priority: index + 1,
    }) ?? [];
  });
}

export function searchProjectMapNodes(input: {
  dataset: ProjectMapDataset;
  query: string;
  limit?: number;
}): ProjectMapSearchResult[] {
  const query = normalizeSearchText(input.query);
  if (!query) {
    return [];
  }
  const limit = input.limit ?? 8;
  return input.dataset.nodes
    .map((node) => {
      const fields = [
        ["title", node.title],
        ["summary", node.summary],
        ["kind", node.nodeKind],
        ["lens", node.lensId],
        ["source", node.sources.map((source) => `${source.label} ${source.path ?? ""}`).join(" ")],
      ] as const;
      const matchedFields = fields
        .filter(([, value]) => normalizeSearchText(String(value)).includes(query))
        .map(([field]) => field);
      const titleMatch = normalizeSearchText(node.title).includes(query);
      const score = matchedFields.length * 10 + (titleMatch ? 20 : 0) + node.children.length;
      return { node, score, matchedFields };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || compareProjectMapNodes(left.node, right.node))
    .slice(0, limit);
}

function edgeKey(sourceNodeId: string, targetNodeId: string): string {
  return `${sourceNodeId}::${targetNodeId}`;
}

function addPathNeighbor(
  adjacency: Map<string, ProjectMapPathStep[]>,
  fromNode: ProjectMapNode,
  toNode: ProjectMapNode | undefined,
  via: ProjectMapPathStep["via"],
  relation?: ProjectMapRelation,
): void {
  if (!toNode) {
    return;
  }
  const neighbors = adjacency.get(fromNode.id) ?? [];
  neighbors.push({ node: toNode, via, relation });
  adjacency.set(fromNode.id, neighbors);
}

export function buildProjectMapShortestPath(input: {
  dataset: ProjectMapDataset;
  sourceNodeId: string | null;
  targetNodeId: string | null;
  emptyMessage: string;
  foundMessage: string;
  notFoundMessage: string;
}): ProjectMapPathResult {
  const sourceNodeId = input.sourceNodeId?.trim() ?? "";
  const targetNodeId = input.targetNodeId?.trim() ?? "";
  if (!sourceNodeId || !targetNodeId) {
    return { status: "idle", steps: [], edgeKeys: new Set(), message: input.emptyMessage };
  }

  const nodes = normalizeProjectMapProjectionNodes(input.dataset.nodes);
  const nodeIndex = buildProjectMapNodeIndex(nodes);
  const sourceNode = nodeIndex.get(sourceNodeId);
  const targetNode = nodeIndex.get(targetNodeId);
  if (!sourceNode || !targetNode) {
    return { status: "not-found", steps: [], edgeKeys: new Set(), message: input.notFoundMessage };
  }
  if (sourceNode.id === targetNode.id) {
    return {
      status: "found",
      steps: [{ node: sourceNode, via: "self" }],
      edgeKeys: new Set(),
      message: input.foundMessage,
    };
  }

  const adjacency = new Map<string, ProjectMapPathStep[]>();
  for (const node of nodes) {
    addPathNeighbor(adjacency, node, node.parentId ? nodeIndex.get(node.parentId) : undefined, "hierarchy");
    for (const childId of node.children) {
      addPathNeighbor(adjacency, node, nodeIndex.get(childId), "hierarchy");
    }
  }
  for (const relation of input.dataset.relations ?? []) {
    const source = nodeIndex.get(relation.sourceNodeId);
    const target = nodeIndex.get(relation.targetNodeId);
    if (!source || !target) {
      continue;
    }
    if (relation.direction !== "backward") {
      addPathNeighbor(adjacency, source, target, "relation", relation);
    }
    if (relation.direction !== "forward") {
      addPathNeighbor(adjacency, target, source, "relation", relation);
    }
  }

  const queue = [sourceNode.id];
  const previous = new Map<string, { previousNodeId: string; step: ProjectMapPathStep }>();
  const visited = new Set<string>([sourceNode.id]);

  while (queue.length > 0) {
    const currentNodeId = queue.shift()!;
    for (const neighbor of adjacency.get(currentNodeId) ?? []) {
      if (visited.has(neighbor.node.id)) {
        continue;
      }
      visited.add(neighbor.node.id);
      previous.set(neighbor.node.id, { previousNodeId: currentNodeId, step: neighbor });
      if (neighbor.node.id === targetNode.id) {
        queue.length = 0;
        break;
      }
      queue.push(neighbor.node.id);
    }
  }

  if (!previous.has(targetNode.id)) {
    return { status: "not-found", steps: [], edgeKeys: new Set(), message: input.notFoundMessage };
  }

  const reversedSteps: ProjectMapPathStep[] = [];
  let currentNodeId = targetNode.id;
  while (currentNodeId !== sourceNode.id) {
    const previousEntry = previous.get(currentNodeId);
    if (!previousEntry) {
      break;
    }
    reversedSteps.push(previousEntry.step);
    currentNodeId = previousEntry.previousNodeId;
  }
  const steps: ProjectMapPathStep[] = [{ node: sourceNode, via: "self" }, ...reversedSteps.reverse()];
  const edgeKeys = new Set<string>();
  for (let index = 1; index < steps.length; index += 1) {
    const fromNodeId = steps[index - 1]?.node.id;
    const toNodeId = steps[index]?.node.id;
    if (fromNodeId && toNodeId) {
      edgeKeys.add(edgeKey(fromNodeId, toNodeId));
      edgeKeys.add(edgeKey(toNodeId, fromNodeId));
    }
  }

  return { status: "found", steps, edgeKeys, message: input.foundMessage };
}

