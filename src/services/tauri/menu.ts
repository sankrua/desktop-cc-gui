import { invoke } from "@tauri-apps/api/core";

type MenuAcceleratorUpdate = {
  id: string;
  accelerator: string | null;
};

export async function setMenuAccelerators(updates: MenuAcceleratorUpdate[]): Promise<void> {
  return invoke("menu_set_accelerators", { updates });
}

type MenuLabelUpdate = {
  id: string;
  text: string;
};

export async function updateMenuLabels(updates: MenuLabelUpdate[]): Promise<void> {
  return invoke("menu_update_labels", { updates });
}
