import { invoke } from "@tauri-apps/api/core";
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

export async function listThreadTitles(workspaceId: string): Promise<Record<string, string>> {
  return traceStartupInvoke("list_thread_titles", workspaceScope(workspaceId), () =>
    invoke("list_thread_titles", { workspaceId }),
  );
}

export async function setThreadTitle(workspaceId: string, threadId: string, title: string): Promise<string> {
  return invoke("set_thread_title", { workspaceId, threadId, title });
}

export async function renameThreadTitleKey(workspaceId: string, oldThreadId: string, newThreadId: string): Promise<void> {
  return invoke("rename_thread_title_key", {
    workspaceId,
    oldThreadId,
    newThreadId,
  });
}

export async function generateThreadTitle(workspaceId: string, threadId: string, userMessage: string, preferredLanguage?: "zh" | "en"): Promise<string> {
  return invoke("generate_thread_title", {
    workspaceId,
    threadId,
    userMessage,
    preferredLanguage: preferredLanguage ?? null,
  });
}
