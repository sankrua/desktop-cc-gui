// Render scheduling policy module (v2 naming).
// Centralizes the three-tier scheduling decision for the realtime
// dispatch path. Owned by capability `streaming-schedule-tier-rollback`
// (proposal 2026-06-24-harden-realtime-interaction-jank-during-tool-call).
//
// All exports are pure functions / constants so the policy can be
// unit-tested in isolation and consumed by both the hook layer
// (`useRenderScheduler`) and reducer-side dispatch helpers.

export const RENDER_SCHEDULE_TIER_VALUES = [
  "baseline",
  "guarded",
  "aggressive",
] as const;

export type RenderScheduleTier = (typeof RENDER_SCHEDULE_TIER_VALUES)[number];

export const RENDER_SCHEDULE_TIER_DEFAULT: RenderScheduleTier = "guarded";

export const RENDER_TIER_FLAG_KEY = "ccgui.perf.streamingScheduleTier";

export type DispatchSchedule = {
  /** Whether to wrap the dispatch in React `startTransition`. */
  useTransition: boolean;
  /** Whether to wait one rAF tick before dispatching. */
  useRafDelay: boolean;
  /** Drop the event if the reducer queue is saturated (coalesce/drop policy). */
  allowDrop: boolean;
  /** Hard budget (ms) for a single chunk inside useRenderScheduler. */
  budgetMs: number;
  /** Idle-callback timeout (ms) used by useRenderScheduler. */
  idleTimeoutMs: number;
};

export type ResolveDispatchScheduleInput = {
  tier: RenderScheduleTier;
  isLiveRow: boolean;
  isHeavy: boolean;
  isCritical: boolean;
};

const BASELINE_SCHEDULE: DispatchSchedule = {
  useTransition: false,
  useRafDelay: false,
  allowDrop: false,
  budgetMs: 32,
  idleTimeoutMs: 120,
};

const GUARDED_SCHEDULE: DispatchSchedule = {
  useTransition: true,
  useRafDelay: true,
  allowDrop: true,
  budgetMs: 8,
  idleTimeoutMs: 80,
};

const AGGRESSIVE_SCHEDULE: DispatchSchedule = {
  useTransition: true,
  useRafDelay: true,
  allowDrop: true,
  budgetMs: 4,
  idleTimeoutMs: 40,
};

export function isRenderScheduleTier(value: unknown): value is RenderScheduleTier {
  return (
    typeof value === "string" &&
    (RENDER_SCHEDULE_TIER_VALUES as readonly string[]).includes(value)
  );
}

export function resolveRenderScheduleTier(
  raw: string | null | undefined,
): RenderScheduleTier {
  if (isRenderScheduleTier(raw)) {
    return raw;
  }
  return RENDER_SCHEDULE_TIER_DEFAULT;
}

export function resolveDispatchSchedule(
  input: ResolveDispatchScheduleInput,
): DispatchSchedule {
  // Critical / live-row events never yield or drop regardless of tier so
  // `reduce-streaming-reducer-commit-lag` urgent fast-path is preserved.
  if (input.isCritical || input.isLiveRow) {
    return {
      useTransition: false,
      useRafDelay: false,
      allowDrop: false,
      budgetMs: 0,
      idleTimeoutMs: 0,
    };
  }

  switch (input.tier) {
    case "baseline":
      return BASELINE_SCHEDULE;
    case "aggressive":
      return AGGRESSIVE_SCHEDULE;
    case "guarded":
    default:
      return GUARDED_SCHEDULE;
  }
}

export function getTierSchedule(tier: RenderScheduleTier): DispatchSchedule {
  switch (tier) {
    case "baseline":
      return BASELINE_SCHEDULE;
    case "aggressive":
      return AGGRESSIVE_SCHEDULE;
    case "guarded":
    default:
      return GUARDED_SCHEDULE;
  }
}

// Read the tier from the realtime perf flag localStorage key. Invalid
// values fall back to `RENDER_SCHEDULE_TIER_DEFAULT` and never throw.
export type DispatchSubmitMode = "urgent" | "transition" | "idle";

/**
 * §6.3: 把 `DispatchSchedule` 进一步压成 3-mode submit 分支
 * (`urgent` / `transition` / `idle`),供 `dispatchWithSchedule` 选路。
 * - `urgent`: 同步 dispatch(等价旧 `useTransitionForDispatch: false`)
 * - `transition`: 走 `startTransition`(兼容 React 18/19)
 * - `idle`: 走 `requestIdleCallback`(WebView 内 batching 友好的让出策略)
 *
 * 决策规则(对应 tasks.md 6.3):
 *   - `isCritical` 或 `isLiveRow` 一律 `urgent`,无论 tier
 *   - tier=`baseline` 一律 `urgent`
 *   - tier=`guarded` + non-live non-critical 默认 `transition`
 *   - tier=`aggressive` + non-live non-critical 默认 `idle`
 */
export function resolveDispatchSubmitMode(
  input: ResolveDispatchScheduleInput,
): DispatchSubmitMode {
  if (input.isCritical || input.isLiveRow) {
    return "urgent";
  }
  switch (input.tier) {
    case "baseline":
      return "urgent";
    case "aggressive":
      return "idle";
    case "guarded":
    default:
      return "transition";
  }
}

export function readRenderScheduleTierFromStorage(): RenderScheduleTier {
  if (typeof window === "undefined") {
    return RENDER_SCHEDULE_TIER_DEFAULT;
  }
  try {
    const stored = window.localStorage.getItem(RENDER_TIER_FLAG_KEY);
    return resolveRenderScheduleTier(stored);
  } catch {
    return RENDER_SCHEDULE_TIER_DEFAULT;
  }
}
