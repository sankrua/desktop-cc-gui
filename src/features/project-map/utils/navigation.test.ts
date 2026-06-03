import { describe, expect, it } from "vitest";

import {
  createProjectMapDatasetFixture,
  createProjectMapNodeFixture,
  createProjectMapRelationFixture,
} from "../testUtils/fixtures";
import {
  buildProjectMapGuidedTour,
  buildProjectMapShortestPath,
  searchProjectMapNodes,
  type ProjectMapTourCopy,
} from "./navigation";

const TOUR_COPY: ProjectMapTourCopy = {
  onboarding: { title: "Onboarding", summary: "Start here." },
  "architecture-review": { title: "Architecture", summary: "Review architecture." },
  "risk-review": { title: "Risk", summary: "Review risk." },
  "task-planning": { title: "Tasks", summary: "Plan work." },
};

describe("project map navigation utilities", () => {
  it("builds deterministic guided tour steps from compact topology", () => {
    const riskNode = createProjectMapNodeFixture({
      id: "risk-node",
      title: "Risk Node",
      parentId: "project-core",
      stale: true,
      confidence: "low",
      detail: {
        coreDescription: "Risk boundary.",
        keyFacts: [],
        keyLogic: [],
        riskSignals: ["Low evidence"],
        relatedArtifacts: [],
      },
    });
    const candidateNode = createProjectMapNodeFixture({
      id: "candidate-node",
      title: "Candidate Node",
      parentId: "project-core",
      candidate: true,
    });
    const dataset = createProjectMapDatasetFixture({
      nodes: [
        createProjectMapNodeFixture({
          id: "project-core",
          title: "Project Core",
          children: ["api-controller", "data-store", "risk-node", "candidate-node"],
        }),
        createProjectMapNodeFixture({
          id: "api-controller",
          title: "API Controller",
          parentId: "project-core",
        }),
        createProjectMapNodeFixture({
          id: "data-store",
          title: "Data Store",
          parentId: "project-core",
        }),
        riskNode,
        candidateNode,
      ],
      relations: [createProjectMapRelationFixture()],
    });

    const steps = buildProjectMapGuidedTour({ dataset, copy: TOUR_COPY });

    expect(steps.map((step) => step.purpose)).toEqual([
      "onboarding",
      "architecture-review",
      "risk-review",
      "task-planning",
    ]);
    expect(steps.find((step) => step.purpose === "risk-review")?.nodeIds).toContain("risk-node");
    expect(steps.find((step) => step.purpose === "task-planning")?.nodeIds).toContain("candidate-node");
  });

  it("searches title, summary, kind, lens, and source fields with stable ranking", () => {
    const dataset = createProjectMapDatasetFixture();

    const results = searchProjectMapNodes({
      dataset,
      query: "controller",
    });

    expect(results[0]?.node.id).toBe("api-controller");
    expect(results[0]?.matchedFields).toEqual(expect.arrayContaining(["title", "summary", "source"]));
  });

  it("finds relation-backed shortest paths and exposes edge keys", () => {
    const dataset = createProjectMapDatasetFixture({
      relations: [createProjectMapRelationFixture()],
    });

    const result = buildProjectMapShortestPath({
      dataset,
      sourceNodeId: "api-controller",
      targetNodeId: "data-store",
      emptyMessage: "empty",
      foundMessage: "found",
      notFoundMessage: "not-found",
    });

    expect(result.status).toBe("found");
    expect(result.steps.map((step) => step.via)).toEqual(["self", "relation"]);
    expect(result.edgeKeys.has("api-controller::data-store")).toBe(true);
  });

  it("falls back to hierarchy paths and returns not-found for unreachable endpoints", () => {
    const dataset = createProjectMapDatasetFixture();

    const hierarchyPath = buildProjectMapShortestPath({
      dataset,
      sourceNodeId: "project-core",
      targetNodeId: "api-controller",
      emptyMessage: "empty",
      foundMessage: "found",
      notFoundMessage: "not-found",
    });
    const missingPath = buildProjectMapShortestPath({
      dataset,
      sourceNodeId: "project-core",
      targetNodeId: "missing-node",
      emptyMessage: "empty",
      foundMessage: "found",
      notFoundMessage: "not-found",
    });

    expect(hierarchyPath.status).toBe("found");
    expect(hierarchyPath.steps[0]?.via).toBe("self");
    expect(hierarchyPath.steps.slice(1).every((step) => step.via === "hierarchy")).toBe(true);
    expect(hierarchyPath.steps.at(-1)?.node.id).toBe("api-controller");
    expect(missingPath).toMatchObject({ status: "not-found", message: "not-found" });
  });
});
