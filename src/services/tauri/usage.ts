import { invoke } from "@tauri-apps/api/core";
import type { LocalUsageSnapshot, LocalUsageStatistics } from "../../types";

export async function localUsageSnapshot(days?: number, workspacePath?: string | null): Promise<LocalUsageSnapshot> {
  const payload: { days: number; workspacePath?: string } = {
    days: days ?? 30,
  };
  if (workspacePath) {
    payload.workspacePath = workspacePath;
  }
  return invoke("local_usage_snapshot", payload);
}

export async function localUsageStatistics(input: {
  scope: "current" | "all";
  provider?: string | null;
  dateRange: "7d" | "30d" | "all";
  workspacePath?: string | null;
}): Promise<LocalUsageStatistics> {
  return invoke<LocalUsageStatistics>("local_usage_statistics", {
    scope: input.scope,
    provider: input.provider ?? "all",
    dateRange: input.dateRange,
    workspacePath: input.workspacePath ?? null,
  });
}
