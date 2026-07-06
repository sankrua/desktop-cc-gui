import { invoke } from "@tauri-apps/api/core";
import type { CustomPromptOption } from "../../types";
import { traceStartupCommand, type StartupWorkspaceScope } from "../../features/startup-orchestration/utils/startupTrace";

function workspaceScope(workspaceId: string): StartupWorkspaceScope {
  return { workspaceId };
}

function traceStartupInvoke<T>(
  commandLabel: string,
  scope: StartupWorkspaceScope,
  run: () => Promise<T>,
) {
  return traceStartupCommand(commandLabel, scope, run);
}

export async function getPromptsList(workspaceId: string): Promise<CustomPromptOption[]> {
  return traceStartupInvoke("prompts_list", workspaceScope(workspaceId), () =>
    invoke<CustomPromptOption[]>("prompts_list", { workspaceId }),
  );
}

export async function getWorkspacePromptsDir(workspaceId: string) {
  return invoke<string>("prompts_workspace_dir", { workspaceId });
}

export async function getGlobalPromptsDir(workspaceId: string) {
  return invoke<string>("prompts_global_dir", { workspaceId });
}

export async function createPrompt(
  workspaceId: string,
  data: {
    scope: "workspace" | "global";
    name: string;
    description?: string | null;
    argumentHint?: string | null;
    content: string;
  },
): Promise<CustomPromptOption> {
  return invoke<CustomPromptOption>("prompts_create", {
    workspaceId,
    scope: data.scope,
    name: data.name,
    description: data.description ?? null,
    argumentHint: data.argumentHint ?? null,
    content: data.content,
  });
}

export async function updatePrompt(
  workspaceId: string,
  data: {
    path: string;
    name: string;
    description?: string | null;
    argumentHint?: string | null;
    content: string;
  },
): Promise<CustomPromptOption> {
  return invoke<CustomPromptOption>("prompts_update", {
    workspaceId,
    path: data.path,
    name: data.name,
    description: data.description ?? null,
    argumentHint: data.argumentHint ?? null,
    content: data.content,
  });
}

export async function deletePrompt(workspaceId: string, path: string): Promise<void> {
  return invoke<void>("prompts_delete", { workspaceId, path });
}

export async function movePrompt(workspaceId: string, data: { path: string; scope: "workspace" | "global" }): Promise<CustomPromptOption> {
  return invoke<CustomPromptOption>("prompts_move", {
    workspaceId,
    path: data.path,
    scope: data.scope,
  });
}
