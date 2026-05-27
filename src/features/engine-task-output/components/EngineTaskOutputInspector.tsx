import { memo } from "react";
import { useTranslation } from "react-i18next";
import Bot from "lucide-react/dist/esm/icons/bot";
import CircleAlert from "lucide-react/dist/esm/icons/circle-alert";
import CircleCheck from "lucide-react/dist/esm/icons/circle-check";
import Clock3 from "lucide-react/dist/esm/icons/clock-3";
import X from "lucide-react/dist/esm/icons/x";
import type {
  EngineTaskOutputArtifactRefreshState,
  EngineTaskOutputSnapshot,
  EngineTaskOutputStatus,
} from "../types";

type EngineTaskOutputInspectorProps = {
  snapshot: EngineTaskOutputSnapshot;
  refreshState?: EngineTaskOutputArtifactRefreshState;
  onRefresh?: () => void;
  onClose?: () => void;
};

const STATUS_ICON = {
  running: Clock3,
  completed: CircleCheck,
  error: CircleAlert,
  unavailable: CircleAlert,
} as const;

function formatTokenCount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return String(Math.round(value));
}

function resolveStatusKey(status: EngineTaskOutputStatus) {
  switch (status) {
    case "completed":
      return "engineTaskOutput.status.completed";
    case "error":
      return "engineTaskOutput.status.error";
    case "unavailable":
      return "engineTaskOutput.status.unavailable";
    case "running":
    default:
      return "engineTaskOutput.status.running";
  }
}

export const EngineTaskOutputInspector = memo(function EngineTaskOutputInspector({
  snapshot,
  refreshState,
  onRefresh,
  onClose,
}: EngineTaskOutputInspectorProps) {
  const { t } = useTranslation();
  const StatusIcon = STATUS_ICON[snapshot.status] ?? Clock3;
  const usage = snapshot.tokenUsage;
  const usageRows = usage
    ? [
        ["engineTaskOutput.tokens.input", usage.last.inputTokens],
        ["engineTaskOutput.tokens.cached", usage.last.cachedInputTokens],
        ["engineTaskOutput.tokens.output", usage.last.outputTokens],
        ["engineTaskOutput.tokens.total", usage.last.totalTokens],
      ] as const
    : [];

  return (
    <aside
      className="engine-task-output-inspector"
      aria-label={t("engineTaskOutput.label")}
    >
      <div className="engine-task-output-header">
        <div className="engine-task-output-title-block">
          <span className="engine-task-output-avatar" aria-hidden>
            <Bot size={16} />
          </span>
          <div>
            <div className="engine-task-output-eyebrow">
              {t("engineTaskOutput.engine", { engine: snapshot.engine })}
            </div>
            <h3 className="engine-task-output-title">{snapshot.title}</h3>
            {snapshot.description ? (
              <p className="engine-task-output-description">
                {snapshot.description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="engine-task-output-header-actions">
          <span className={`engine-task-output-status is-${snapshot.status}`}>
            <StatusIcon size={13} aria-hidden />
            {t(resolveStatusKey(snapshot.status))}
          </span>
          {onClose ? (
            <button
              type="button"
              className="engine-task-output-close"
              onClick={onClose}
              aria-label={t("engineTaskOutput.close")}
              title={t("engineTaskOutput.close")}
            >
              <X size={14} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <div className="engine-task-output-grid">
        <div className="engine-task-output-section">
          <h4>{t("engineTaskOutput.identity")}</h4>
          <div className="engine-task-output-chips">
            {snapshot.taskId ? (
              <span className="engine-task-output-chip">task {snapshot.taskId}</span>
            ) : null}
            {snapshot.toolUseId ? (
              <span className="engine-task-output-chip">tool {snapshot.toolUseId}</span>
            ) : null}
            {snapshot.threadId ? (
              <span className="engine-task-output-chip">thread {snapshot.threadId}</span>
            ) : null}
            {snapshot.outputFileName ? (
              <span className="engine-task-output-chip">{snapshot.outputFileName}</span>
            ) : null}
          </div>
        </div>

        <div className="engine-task-output-section">
          <h4>{t("engineTaskOutput.telemetry")}</h4>
          {usage ? (
            <div className="engine-task-output-token-grid">
              {usageRows.map(([labelKey, value]) => (
                <div className="engine-task-output-token" key={labelKey}>
                  <span>{t(labelKey)}</span>
                  <strong>{formatTokenCount(value) ?? t("engineTaskOutput.pending")}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="engine-task-output-muted">{t("engineTaskOutput.telemetryPending")}</p>
          )}
          <p className="engine-task-output-muted">
            {t(`engineTaskOutput.telemetryStatus.${snapshot.telemetryStatus}`)}
          </p>
        </div>
      </div>

      <div className="engine-task-output-section">
        <div className="engine-task-output-section-heading">
          <h4>{t("engineTaskOutput.recentOutput")}</h4>
          {onRefresh && snapshot.outputFilePath ? (
            <button
              type="button"
              className="engine-task-output-refresh"
              onClick={onRefresh}
              disabled={refreshState?.isRefreshing ?? false}
            >
              {refreshState?.isRefreshing
                ? t("engineTaskOutput.refreshing")
                : t("engineTaskOutput.refresh")}
            </button>
          ) : null}
        </div>
        {snapshot.recentOutput ? (
          <pre className="engine-task-output-pre">{snapshot.recentOutput}</pre>
        ) : (
          <p className="engine-task-output-muted">{t("engineTaskOutput.outputUnavailable")}</p>
        )}
        {refreshState?.error ? (
          <p className="engine-task-output-muted">
            {t("engineTaskOutput.artifactUnavailable")}
          </p>
        ) : refreshState?.truncated ? (
          <p className="engine-task-output-muted">
            {t("engineTaskOutput.artifactTruncated")}
          </p>
        ) : refreshState?.source === "artifact" ? (
          <p className="engine-task-output-muted">
            {t("engineTaskOutput.artifactLive")}
          </p>
        ) : null}
      </div>
    </aside>
  );
});
