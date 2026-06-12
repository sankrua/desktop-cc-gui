#!/usr/bin/env node

// perf-archive-readiness.mjs
//
// Archive-readiness gate for P0/P1 performance changes.
//
// Reads:
//   - docs/perf/baseline.json
//   - docs/perf/runtime-evidence-gates.json
//
// Checks (hard fail -> exit 1):
//   1. Evidence class coverage: every metric record must declare evidenceClass.
//   2. Unit consistency: observed unit and budget.unit must match when both present.
//   3. HardFail annotation: every record with budget.hardFail must carry
//      budget.rollout, top-level rollout, or top-level status.
//   4. ArchiveReadiness staleness: archiveReadiness.completed must not list
//      change names that are absent from current `openspec list --json` active
//      changes (excluding this closure change).
//   5. Large-file debt ownership: every P0/P1 candidate in
//      largeFileSummary.candidates[] must include owner and followUp.
//
// Checks (residual -> exit 2, not 1):
//   - Missing budget block (warn).
//   - Unsupported evidence class (residual risk; must remain visible).
//
// Exit codes:
//   0  pass (no hard fail, no warn/residual)
//   1  hard failure
//   2  no hard failure, but warn/residual items exist
//   3  unexpected script error (input missing, etc.)

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const PERF_BASELINE_PATH = "docs/perf/baseline.json";
const RUNTIME_EVIDENCE_GATES_PATH = "docs/perf/runtime-evidence-gates.json";
const SELF_CHANGE_NAME = "close-performance-iteration-2026-06";

const VALID_EVIDENCE_CLASSES = new Set([
  "measured",
  "proxy",
  "manual-only",
  "unsupported",
]);

function repoPath(path) {
  return resolve(process.cwd(), path);
}

async function readJsonIfExists(path) {
  const absolutePath = repoPath(path);
  if (!existsSync(absolutePath)) {
    return null;
  }
  return JSON.parse(await readFile(absolutePath, "utf-8"));
}

function getOpenSpecActiveNames() {
  try {
    const output = execFileSync("openspec", ["list", "--json"], {
      cwd: process.cwd(),
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output);
    const names = Array.isArray(parsed?.changes)
      ? parsed.changes.map((c) => c?.name).filter(Boolean)
      : [];
    return new Set(names);
  } catch (error) {
    throw new Error(
      `Failed to read \`openspec list --json\`: ${error.message ?? String(error)}`
    );
  }
}

function recordLabel(record) {
  const scenario = record?.scenario ?? "?";
  const metric = record?.metric ?? "?";
  return `${scenario}/${metric}`;
}

function runtimeMetricRecords(runtimeGates) {
  return [
    ...(Array.isArray(runtimeGates?.performanceEvidence)
      ? runtimeGates.performanceEvidence
      : []),
    ...(Array.isArray(runtimeGates?.realtimeTraceBudgets)
      ? runtimeGates.realtimeTraceBudgets
      : []),
  ];
}

function runtimeEvidenceObjects(runtimeGates) {
  const records = [];
  function visit(value, path) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}.${index}`));
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Object.prototype.hasOwnProperty.call(value, "evidenceClass")) {
      records.push({ path, record: value });
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, path ? `${path}.${key}` : key);
    }
  }
  visit(runtimeGates, "runtimeEvidenceGates");
  return records;
}

function evidenceObjectLabel(item) {
  const label = recordLabel(item.record);
  return label === "?/?" ? item.path : `${item.path}:${label}`;
}

function checkEvidenceClassCoverage(baseline, runtimeGates) {
  const failures = [];
  const metrics = [
    ...(Array.isArray(baseline?.metrics) ? baseline.metrics : []),
    ...runtimeMetricRecords(runtimeGates),
  ];
  for (const metric of metrics) {
    const cls = metric?.evidenceClass;
    if (cls === undefined || cls === null || cls === "") {
      failures.push({
        check: "evidence-class-missing",
        record: recordLabel(metric),
        detail: "metric record is missing evidenceClass",
      });
      continue;
    }
    if (!VALID_EVIDENCE_CLASSES.has(cls)) {
      failures.push({
        check: "evidence-class-invalid",
        record: recordLabel(metric),
        detail: `evidenceClass=${cls} is not one of ${[...VALID_EVIDENCE_CLASSES].join(", ")}`,
      });
    }
  }
  return failures;
}

function collectUnitConflict(record, failures) {
  const observedUnit = record?.unit;
  const budget = record?.budget;
  if (!budget) return false;
  const budgetUnit = budget?.unit;
  if (observedUnit && budgetUnit && observedUnit !== budgetUnit) {
    failures.push({
      check: "unit-conflict",
      record: recordLabel(record),
      detail: `observed unit=${observedUnit}, budget unit=${budgetUnit}`,
    });
  }
  return true;
}

function checkUnitConsistency(baseline, runtimeGates) {
  const failures = [];
  const warnings = [];
  const metrics = Array.isArray(baseline?.metrics) ? baseline.metrics : [];
  for (const metric of metrics) {
    const hasBudget = collectUnitConflict(metric, failures);
    if (!hasBudget) {
      warnings.push({
        check: "budget-missing",
        record: recordLabel(metric),
        detail: `metric has observed unit=${metric?.unit ?? "?"} but no budget block`,
      });
    }
  }
  for (const record of runtimeMetricRecords(runtimeGates)) {
    collectUnitConflict(record, failures);
  }
  return { failures, warnings };
}

function checkHardFailAnnotation(baseline, runtimeGates) {
  const failures = [];
  const metrics = Array.isArray(baseline?.metrics) ? baseline.metrics : [];
  for (const metric of metrics) {
    const budget = metric?.budget;
    if (!budget) continue;
    if (budget.hardFail === undefined || budget.hardFail === null) continue;
    const hasAnnotation =
      budget.rollout !== undefined ||
      metric.rollout !== undefined ||
      metric.status !== undefined;
    if (!hasAnnotation) {
      failures.push({
        check: "hardfail-annotation-missing",
        record: recordLabel(metric),
        detail: `budget.hardFail=${budget.hardFail} has no budget.rollout, top-level rollout, or top-level status`,
      });
    }
  }
  for (const record of runtimeMetricRecords(runtimeGates)) {
    const budget = record?.budget;
    if (!budget) continue;
    if (budget.hardFail === undefined || budget.hardFail === null) continue;
    const hasAnnotation =
      budget.rollout !== undefined ||
      record.rollout !== undefined ||
      record.status !== undefined;
    if (!hasAnnotation) {
      failures.push({
        check: "hardfail-annotation-missing",
        record: recordLabel(record),
        detail: `runtime-evidence gate budget.hardFail=${budget.hardFail} has no budget.rollout, top-level rollout, or top-level status`,
      });
    }
  }
  return failures;
}

function checkArchiveReadinessStaleness(runtimeGates, activeNames) {
  const failures = [];
  const completed = Array.isArray(runtimeGates?.archiveReadiness?.completed)
    ? runtimeGates.archiveReadiness.completed
    : [];
  for (const entry of completed) {
    const name = entry?.name;
    if (!name) continue;
    if (name === SELF_CHANGE_NAME) {
      failures.push({
        check: "archive-readiness-self-reference",
        record: name,
        detail: `${SELF_CHANGE_NAME} is the closure change and must not be in current completed active list`,
      });
      continue;
    }
    if (!activeNames.has(name)) {
      failures.push({
        check: "archive-readiness-stale",
        record: name,
        detail: `${name} is no longer in \`openspec list --json\` active changes; move it to history / previousArchiveContext`,
      });
    }
  }
  return failures;
}

function checkLargeFileOwnership(runtimeGates) {
  const failures = [];
  const candidates = Array.isArray(runtimeGates?.largeFileSummary?.candidates)
    ? runtimeGates.largeFileSummary.candidates
    : [];
  for (const candidate of candidates) {
    const priority = candidate?.priority;
    if (priority !== "P0" && priority !== "P1") continue;
    const path = candidate?.path ?? "?";
    const ownerMissing = !candidate?.owner;
    const followUpMissing = !candidate?.followUp;
    if (ownerMissing || followUpMissing) {
      const missing = [
        ownerMissing ? "owner" : null,
        followUpMissing ? "followUp" : null,
      ]
        .filter(Boolean)
        .join(", ");
      failures.push({
        check: "large-file-owner-followup-missing",
        record: path,
        detail: `${path} priority=${priority} is missing: ${missing}`,
      });
    }
  }
  return failures;
}

function summarizeUnsupported(runtimeGates) {
  return runtimeEvidenceObjects(runtimeGates)
    .filter((item) => item.record?.evidenceClass === "unsupported")
    .map(evidenceObjectLabel);
}

function renderTextReport(result) {
  const lines = [];
  lines.push("perf-archive-readiness");
  lines.push("=======================");
  lines.push("");
  lines.push(`Inputs:`);
  lines.push(`  - ${PERF_BASELINE_PATH}`);
  lines.push(`  - ${RUNTIME_EVIDENCE_GATES_PATH}`);
  lines.push(`  - openspec list --json (active changes: ${result.activeChangeCount})`);
  lines.push("");
  lines.push(`Result: ${result.status.toUpperCase()}`);
  lines.push("");

  if (result.hardFailures.length === 0 && result.warnings.length === 0) {
    lines.push("No defects detected. Evidence metadata is ready for archive.");
  } else {
    if (result.hardFailures.length > 0) {
      lines.push(`Hard failures (${result.hardFailures.length}):`);
      for (const f of result.hardFailures) {
        lines.push(`  - [${f.check}] ${f.record} :: ${f.detail}`);
      }
      lines.push("");
    }
    if (result.warnings.length > 0) {
      lines.push(`Warnings / residual risk (${result.warnings.length}):`);
      for (const w of result.warnings) {
        lines.push(`  - [${w.check}] ${w.record} :: ${w.detail}`);
      }
      lines.push("");
    }
  }

  if (result.unsupportedRecords.length > 0) {
    lines.push(`Unsupported evidence (residual risk, not hard fail): ${result.unsupportedRecords.length}`);
    for (const label of result.unsupportedRecords) {
      lines.push(`  - ${label}`);
    }
    lines.push("");
  }

  lines.push(`Counts:`);
  lines.push(`  - metrics: ${result.metricCount}`);
  lines.push(`  - budget-missing: ${result.budgetMissingCount}`);
  lines.push(`  - hardFailures: ${result.hardFailures.length}`);
  lines.push(`  - warnings: ${result.warnings.length}`);
  lines.push(`  - unsupported: ${result.unsupportedRecords.length}`);
  lines.push(`  - active changes: ${result.activeChangeCount}`);

  return lines.join("\n");
}

function buildInputGuard() {
  const inputsMissing = [];
  if (!existsSync(repoPath(PERF_BASELINE_PATH))) {
    inputsMissing.push(PERF_BASELINE_PATH);
  }
  if (!existsSync(repoPath(RUNTIME_EVIDENCE_GATES_PATH))) {
    inputsMissing.push(RUNTIME_EVIDENCE_GATES_PATH);
  }
  if (inputsMissing.length > 0) {
    return `Missing required input file(s): ${inputsMissing.join(", ")}`;
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");

  const inputError = buildInputGuard();
  if (inputError) {
    if (jsonMode) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: inputError }, null, 2)}\n`);
    } else {
      process.stderr.write(`perf-archive-readiness error: ${inputError}\n`);
    }
    process.exit(3);
  }

  let baseline;
  let runtimeGates;
  try {
    baseline = await readJsonIfExists(PERF_BASELINE_PATH);
    runtimeGates = await readJsonIfExists(RUNTIME_EVIDENCE_GATES_PATH);
  } catch (error) {
    const message = `Failed to parse input JSON: ${error.message ?? String(error)}`;
    if (jsonMode) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
    } else {
      process.stderr.write(`perf-archive-readiness error: ${message}\n`);
    }
    process.exit(3);
  }

  let activeNames;
  try {
    activeNames = getOpenSpecActiveNames();
  } catch (error) {
    const message = error.message ?? String(error);
    if (jsonMode) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
    } else {
      process.stderr.write(`perf-archive-readiness error: ${message}\n`);
    }
    process.exit(3);
  }

  const unitCheck = checkUnitConsistency(baseline, runtimeGates);
  const hardFailures = [
    ...checkEvidenceClassCoverage(baseline, runtimeGates),
    ...unitCheck.failures,
    ...checkHardFailAnnotation(baseline, runtimeGates),
    ...checkArchiveReadinessStaleness(runtimeGates, activeNames),
    ...checkLargeFileOwnership(runtimeGates),
  ];

  const warnings = [...unitCheck.warnings];
  const unsupportedRecords = summarizeUnsupported(runtimeGates);
  const budgetMissingCount = warnings.filter((w) => w.check === "budget-missing").length;

  let status;
  let exitCode;
  if (hardFailures.length > 0) {
    status = "fail";
    exitCode = 1;
  } else if (warnings.length > 0 || unsupportedRecords.length > 0) {
    status = "warn";
    exitCode = 2;
  } else {
    status = "pass";
    exitCode = 0;
  }

  const result = {
    ok: exitCode !== 3,
    status,
    exitCode,
    activeChangeCount: activeNames.size,
    metricCount: Array.isArray(baseline?.metrics) ? baseline.metrics.length : 0,
    budgetMissingCount,
    hardFailures,
    warnings,
    unsupportedRecords,
    inputs: {
      baseline: PERF_BASELINE_PATH,
      runtimeEvidenceGates: RUNTIME_EVIDENCE_GATES_PATH,
      openSpec: "openspec list --json",
    },
  };

  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderTextReport(result)}\n`);
  }

  process.exit(exitCode);
}

main();
