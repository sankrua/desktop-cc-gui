import { invoke } from "@tauri-apps/api/core";
import type { EngineType } from "../../types";
import { engineSendMessageSync } from "./appServer";

export type CommitMessageLanguage = "zh" | "en";
export type CommitMessageEngine = EngineType;

export async function getCommitMessagePrompt(
  workspaceId: string,
  language: CommitMessageLanguage = "zh",
  selectedPaths?: string[],
): Promise<string> {
  return invoke("get_commit_message_prompt", { workspaceId, language, selectedPaths });
}

export async function generateCommitMessage(
  workspaceId: string,
  language: CommitMessageLanguage = "zh",
  selectedPaths?: string[],
): Promise<string> {
  return invoke("generate_commit_message", { workspaceId, language, selectedPaths });
}

export async function generateCommitMessageWithEngine(
  workspaceId: string,
  language: CommitMessageLanguage = "zh",
  engine: CommitMessageEngine = "codex",
  selectedPaths?: string[],
): Promise<string> {
  if (engine === "codex") {
    return generateCommitMessage(workspaceId, language, selectedPaths);
  }
  const prompt = await getCommitMessagePrompt(workspaceId, language, selectedPaths);
  const response = await engineSendMessageSync(workspaceId, {
    text: prompt,
    engine,
    autoSession: {
      sessionPurpose: "commit-message",
      visibility: "hidden",
      ownerFeature: "git",
      autoArchive: true,
      createdBy: "system",
    },
  });
  return response.text;
}
