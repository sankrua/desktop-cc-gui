import { invoke } from "@tauri-apps/api/core";

export type WindowOpacityApplyResult = {
  requestedOpacity: number;
  appliedOpacity: number;
  applied: boolean;
  platform: string;
  reason: string | null;
};

export function setMainWindowOpacity(
  opacity: number,
): Promise<WindowOpacityApplyResult> {
  return invoke<WindowOpacityApplyResult>("set_main_window_opacity", {
    opacity,
  });
}
