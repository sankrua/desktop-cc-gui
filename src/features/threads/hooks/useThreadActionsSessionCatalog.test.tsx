// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useThreadActionsSessionCatalog } from "./useThreadActionsSessionCatalog";

describe("useThreadActionsSessionCatalog", () => {
  it("treats archive evidence with missing source status as incomplete", async () => {
    const listWorkspaceSessionArchiveEvidenceService = vi.fn().mockResolvedValue({
      archivedAtBySessionId: {},
      partialSource: null,
    });

    const { result } = renderHook(() =>
      useThreadActionsSessionCatalog({
        canListWorkspaceSessions: true,
        listWorkspaceSessionsService: null,
        listWorkspaceSessionArchiveEvidenceService,
      }),
    );

    const evidence = await result.current.loadArchivedSessionMap("ws-1");

    expect(listWorkspaceSessionArchiveEvidenceService).toHaveBeenCalledWith("ws-1");
    expect(evidence?.archivedAtBySessionId.size).toBe(0);
    expect(evidence?.partialSource).toBeNull();
    expect(evidence?.sourceStatuses).toEqual([]);
    expect(evidence?.isComplete).toBe(false);
  });
});
