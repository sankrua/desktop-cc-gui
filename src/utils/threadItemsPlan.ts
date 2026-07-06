function asString(value: unknown) {
  return typeof value === "string" ? value : value ? String(value) : "";
}

export function formatPlanSteps(value: unknown) {
  if (!Array.isArray(value)) {
    return "";
  }
  const lines = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return "";
      }
      const record = entry as Record<string, unknown>;
      const step = asString(record.step ?? record.title ?? record.text ?? "").trim();
      if (!step) {
        return "";
      }
      const status = asString(record.status ?? "").trim();
      return status ? `- [${status}] ${step}` : `- ${step}`;
    })
    .filter(Boolean);
  return lines.join("\n");
}

export function extractImplementPlanActionId(item: Record<string, unknown>) {
  const direct = asString(item.actionId ?? item.action_id ?? "").trim();
  if (direct) {
    return direct;
  }
  const action =
    item.action && typeof item.action === "object" && !Array.isArray(item.action)
      ? (item.action as Record<string, unknown>)
      : null;
  const fromAction = asString(action?.id ?? action?.actionId ?? action?.action_id ?? "").trim();
  if (fromAction) {
    return fromAction;
  }
  const actions = Array.isArray(item.actions) ? item.actions : [];
  for (const entry of actions) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const id = asString(record.id ?? record.actionId ?? record.action_id ?? "").trim();
    if (id) {
      return id;
    }
  }
  return "";
}
