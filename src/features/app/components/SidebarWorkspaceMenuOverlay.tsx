import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import type { ReactNode } from "react";
import type { WorkspaceMenuAction } from "../hooks/useSidebarMenus";

type SidebarWorkspaceMenuOverlayProps = {
  menu: {
    x: number;
    y: number;
    groups: Array<{
      id: string;
      label: string;
      actions: WorkspaceMenuAction[];
    }>;
  };
  t: (key: string) => string;
  onClose: () => void;
  onAction: (action: WorkspaceMenuAction) => void;
  renderIcon: (iconKind: string) => ReactNode;
};

export function SidebarWorkspaceMenuOverlay({
  menu,
  t,
  onClose,
  onAction,
  renderIcon,
}: SidebarWorkspaceMenuOverlayProps) {
  return (
    <div
      className="sidebar-workspace-menu-backdrop"
      onClick={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        className="sidebar-workspace-menu"
        role="menu"
        aria-label={
          menu.groups.length === 1 &&
          menu.groups[0]?.id === "new-session"
            ? t("sidebar.sessionActionsGroup")
            : t("sidebar.workspaceActionsGroup")
        }
        style={{
          left: menu.x,
          top: menu.y,
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {menu.groups.map((group, groupIndex) => (
          <div className="sidebar-workspace-menu-group" key={group.id}>
            <div className="sidebar-workspace-menu-group-title">
              {group.label}
            </div>
            {group.actions.map((action) => (
              <div className="sidebar-workspace-menu-item-row" key={action.id}>
                <button
                  type="button"
                  role="menuitem"
                  className={`sidebar-workspace-menu-item${
                    action.tone === "danger" ? " is-danger" : ""
                  }${action.deprecated ? " is-deprecated" : ""}${
                    action.unavailable ? " is-unavailable" : ""
                  }`}
                  disabled={action.unavailable}
                  onClick={() => onAction(action)}
                >
                  <span
                    className={`sidebar-workspace-menu-item-icon sidebar-workspace-menu-item-icon-${action.iconKind}${
                      action.unavailable ? " is-unavailable" : ""
                    }`}
                    aria-hidden
                  >
                    {renderIcon(action.iconKind)}
                  </span>
                  <span className="sidebar-workspace-menu-item-label">
                    {action.label}
                  </span>
                  {action.deprecated ? (
                    <span className="sidebar-workspace-menu-item-deprecated">
                      ({t("sidebar.deprecatedTag")})
                    </span>
                  ) : null}
                  {action.unavailable ? (
                    <span className="sidebar-workspace-menu-item-unavailable">
                      ({action.statusLabel ?? t("sidebar.unavailableTag")})
                    </span>
                  ) : null}
                </button>
                {action.refreshable ? (
                  <button
                    type="button"
                    className={`sidebar-workspace-menu-item-refresh${
                      action.refreshing ? " is-refreshing" : ""
                    }`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void action.onRefresh?.();
                    }}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    aria-label={t("common.refresh")}
                    title={t("common.refresh")}
                    data-tauri-drag-region="false"
                    disabled={action.refreshing}
                  >
                    <RefreshCw size={13} aria-hidden />
                  </button>
                ) : null}
              </div>
            ))}
            {groupIndex < menu.groups.length - 1 ? (
              <div className="sidebar-workspace-menu-divider" aria-hidden />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
