// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readEngineTaskOutputArtifact } from "../../../services/tauri";
import type { EngineTaskOutputSnapshot } from "../types";
import {
  engineTaskOutputHookInternals,
  useEngineTaskOutputSnapshot,
} from "./useEngineTaskOutputSnapshot";

vi.mock("../../../services/tauri", () => ({
  readEngineTaskOutputArtifact: vi.fn(),
}));

const snapshot: EngineTaskOutputSnapshot = {
  id: "task-1",
  engine: "claude",
  title: "reviewer",
  description: "Review auth flow",
  status: "running",
  taskId: "task-1",
  toolUseId: "tool-1",
  threadId: null,
  outputFileName: "task.output",
  outputFilePath: "/tmp/tasks/task.output",
  recentOutput: "initial",
  tokenUsage: null,
  telemetryStatus: "pending",
};

describe("useEngineTaskOutputSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("does not call the artifact bridge when no output path exists", () => {
    renderHook(() =>
      useEngineTaskOutputSnapshot({
        workspaceId: "ws-1",
        snapshot: { ...snapshot, outputFilePath: null },
      }),
    );

    expect(readEngineTaskOutputArtifact).not.toHaveBeenCalled();
  });

  it("updates recent output from a bounded artifact response", async () => {
    vi.mocked(readEngineTaskOutputArtifact).mockResolvedValueOnce({
      exists: true,
      content: "fresh progress",
      truncated: false,
      byteLength: 14,
    });

    const { result } = renderHook(() =>
      useEngineTaskOutputSnapshot({
        workspaceId: "ws-1",
        snapshot,
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot?.recentOutput).toBe("fresh progress");
    });
    expect(result.current.refreshState.source).toBe("artifact");
    expect(readEngineTaskOutputArtifact).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      path: "/tmp/tasks/task.output",
    });
  });

  it("keeps the current snapshot when artifact refresh fails", async () => {
    vi.mocked(readEngineTaskOutputArtifact).mockRejectedValueOnce(
      new Error("denied"),
    );

    const { result } = renderHook(() =>
      useEngineTaskOutputSnapshot({
        workspaceId: "ws-1",
        snapshot,
      }),
    );

    await waitFor(() => {
      expect(result.current.refreshState.source).toBe("unavailable");
    });
    expect(result.current.snapshot?.recentOutput).toBe("initial");
    expect(result.current.refreshState.error).toBe("denied");
  });

  it("refreshes running task output only while mounted", async () => {
    vi.useFakeTimers();
    vi.mocked(readEngineTaskOutputArtifact).mockResolvedValue({
      exists: true,
      content: "tick",
      truncated: false,
      byteLength: 4,
    });

    const { unmount } = renderHook(() =>
      useEngineTaskOutputSnapshot({
        workspaceId: "ws-1",
        snapshot,
      }),
    );

    expect(readEngineTaskOutputArtifact).toHaveBeenCalledTimes(1);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(engineTaskOutputHookInternals.RUNNING_REFRESH_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(readEngineTaskOutputArtifact).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => {
      vi.advanceTimersByTime(engineTaskOutputHookInternals.RUNNING_REFRESH_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(readEngineTaskOutputArtifact).toHaveBeenCalledTimes(2);
  });
});
