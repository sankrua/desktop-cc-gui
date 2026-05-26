import type { ProjectMapCandidate, ProjectMapDataset, ProjectMapNode } from "../types";
import { validateProjectMapNodePatch } from "./evidenceGate";
import { recalculateProjectMapLensStats } from "./incrementalGeneration";

function applyPatchToNode(node: ProjectMapNode, candidate: ProjectMapCandidate): ProjectMapNode {
  const patch = candidate.patch;
  return {
    ...node,
    summary: patch.summary ?? node.summary,
    detail: patch.detail ? { ...node.detail, ...patch.detail } : node.detail,
    sources: patch.sources ?? node.sources,
    confidence: patch.confidence ?? node.confidence,
    stale: patch.stale ?? node.stale,
    candidate: patch.candidate ?? node.candidate,
  };
}

function candidateTargetsNode(candidate: ProjectMapCandidate, nodeId: string): boolean {
  return (candidate.targetNodeId ?? candidate.patch.nodeId) === nodeId;
}

function withCandidateNodeUpdate(input: {
  dataset: ProjectMapDataset;
  nodeId: string;
  updatedAt: string;
  updateNode: (node: ProjectMapNode) => ProjectMapNode;
  updateCandidate?: (candidate: ProjectMapCandidate) => ProjectMapCandidate;
}): { ok: true; dataset: ProjectMapDataset } | { ok: false; errors: string[] } {
  const targetNode = input.dataset.nodes.find((node) => node.id === input.nodeId);
  if (!targetNode) {
    return { ok: false, errors: [`Project-map node is missing: ${input.nodeId}`] };
  }
  if (!targetNode.candidate) {
    return { ok: false, errors: [`Project-map node is not a candidate: ${input.nodeId}`] };
  }

  const nodes = input.dataset.nodes.map((node) =>
    node.id === input.nodeId ? input.updateNode(node) : node,
  );
  const updateCandidate = input.updateCandidate;
  const candidates = updateCandidate
    ? (input.dataset.candidates ?? []).map((candidate) =>
        candidateTargetsNode(candidate, input.nodeId)
          ? updateCandidate(candidate)
          : candidate,
      )
    : input.dataset.candidates;

  return {
    ok: true,
    dataset: {
      ...input.dataset,
      manifest: {
        ...input.dataset.manifest,
        updatedAt: input.updatedAt,
        lensStats: recalculateProjectMapLensStats(input.dataset.lenses, nodes),
      },
      nodes,
      candidates,
    },
  };
}

export function confirmProjectMapCandidate(input: {
  dataset: ProjectMapDataset;
  candidateId: string;
  confirmedAt: string;
}):
  | { ok: true; dataset: ProjectMapDataset }
  | { ok: false; errors: string[] } {
  const candidate = (input.dataset.candidates ?? []).find(
    (item) => item.id === input.candidateId,
  );
  if (!candidate) {
    return { ok: false, errors: [`Unknown project-map candidate: ${input.candidateId}`] };
  }
  if (candidate.status !== "pending") {
    return { ok: false, errors: ["Only pending project-map candidates can be confirmed."] };
  }

  const targetNode = input.dataset.nodes.find((node) => node.id === candidate.patch.nodeId);
  if (!targetNode) {
    return { ok: false, errors: [`Candidate target node is missing: ${candidate.patch.nodeId}`] };
  }

  const gate = validateProjectMapNodePatch(targetNode, candidate.patch);
  if (!gate.ok) {
    return { ok: false, errors: gate.issues.map((issue) => issue.message) };
  }

  const nodes = input.dataset.nodes.map((node) =>
    node.id === targetNode.id ? applyPatchToNode(node, candidate) : node,
  );

  return {
    ok: true,
    dataset: {
      ...input.dataset,
      manifest: {
        ...input.dataset.manifest,
        updatedAt: input.confirmedAt,
        lensStats: recalculateProjectMapLensStats(input.dataset.lenses, nodes),
      },
      nodes,
      candidates: (input.dataset.candidates ?? []).map((item) =>
        item.id === candidate.id
          ? { ...item, status: "confirmed", updatedAt: input.confirmedAt }
          : item,
      ),
      evidenceRecords: [
        ...(input.dataset.evidenceRecords ?? []),
        ...candidate.evidence,
      ],
    },
  };
}

export function rejectProjectMapCandidate(input: {
  dataset: ProjectMapDataset;
  candidateId: string;
  rejectedAt: string;
}): ProjectMapDataset {
  return {
    ...input.dataset,
    candidates: (input.dataset.candidates ?? []).map((candidate) =>
      candidate.id === input.candidateId
        ? { ...candidate, status: "rejected", updatedAt: input.rejectedAt }
        : candidate,
    ),
  };
}

export function confirmProjectMapNodeCandidate(input: {
  dataset: ProjectMapDataset;
  nodeId: string;
  confirmedAt: string;
}): { ok: true; dataset: ProjectMapDataset } | { ok: false; errors: string[] } {
  return withCandidateNodeUpdate({
    dataset: input.dataset,
    nodeId: input.nodeId,
    updatedAt: input.confirmedAt,
    updateNode: (node) => ({ ...node, candidate: false }),
  });
}

export function rejectProjectMapNodeCandidate(input: {
  dataset: ProjectMapDataset;
  nodeId: string;
  rejectedAt: string;
}): { ok: true; dataset: ProjectMapDataset } | { ok: false; errors: string[] } {
  return withCandidateNodeUpdate({
    dataset: input.dataset,
    nodeId: input.nodeId,
    updatedAt: input.rejectedAt,
    updateNode: (node) => ({ ...node, candidate: false, stale: true }),
  });
}
