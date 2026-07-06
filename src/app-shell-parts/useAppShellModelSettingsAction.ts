import { useCallback } from "react";
import { requestVendorModelManager } from "../features/vendors/modelManagerRequest";

type OpenSettings = (section: "providers") => void;

export function useAppShellModelSettingsAction(openSettings: OpenSettings) {
  return useCallback(
    (providerId?: string) => {
      const target =
        providerId === "codex"
          ? "codex"
          : providerId === "gemini"
            ? "gemini"
            : "claude";
      requestVendorModelManager({ target, addMode: true });
      openSettings("providers");
    },
    [openSettings],
  );
}
