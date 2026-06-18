import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const SCRIPT_PATH = resolve("scripts/perf-archive-readiness.mjs");

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

async function createFixture({ mainBundleValue = 1121481, coldStartEvidence = "unsupported" } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "perf-readiness-"));
  const baselinePath = join(dir, "baseline.json");
  const runtimePath = join(dir, "runtime-evidence.json");
  const activePath = join(dir, "openspec-active.json");

  const baseline = {
    metrics: [
      {
        scenario: "S-CS-COLD",
        metric: "bundleSizeMain",
        value: mainBundleValue,
        unit: "bytes-gzip",
        evidenceClass: "measured",
        budget: {
          observed: mainBundleValue,
          target: 950000,
          hardFail: 1100000,
          unit: "bytes-gzip",
          evidenceClass: "measured",
          source: "fixture",
          rollout: "advisory-until-bundle-optimization",
        },
      },
      {
        scenario: "S-CS-COLD",
        metric: "firstPaintMs",
        value: coldStartEvidence === "measured" ? 480 : null,
        unit: "ms",
        evidenceClass: coldStartEvidence,
      },
      {
        scenario: "S-CS-COLD",
        metric: "firstInteractiveMs",
        value: coldStartEvidence === "measured" ? 760 : null,
        unit: "ms",
        evidenceClass: coldStartEvidence,
      },
      {
        scenario: "S-RS-VL",
        metric: "visibleTextLagP95",
        value: 42,
        unit: "ms",
        evidenceClass: "proxy",
      },
    ],
  };
  const runtimeEvidence = {
    archiveReadiness: { completed: [] },
    largeFileSummary: { candidates: [] },
    performanceEvidence: baseline.metrics,
    realtimeTraceBudgets: [],
  };
  const activeChanges = { changes: [{ name: "collect-release-grade-performance-evidence" }] };

  await writeJson(baselinePath, baseline);
  await writeJson(runtimePath, runtimeEvidence);
  await writeJson(activePath, activeChanges);

  return { baselinePath, runtimePath, activePath };
}

function runReadiness(fixture, args = [], options = {}) {
  const result = spawnSync(
    process.execPath,
    [
      SCRIPT_PATH,
      "--json",
      "--baseline",
      fixture.baselinePath,
      "--runtime-evidence",
      fixture.runtimePath,
      ...(options.useActiveChangesJson === false
        ? []
        : ["--active-changes-json", fixture.activePath]),
      ...args,
    ],
    {
      cwd: options.cwd ?? process.cwd(),
      encoding: "utf-8",
      env: options.env ?? process.env,
    },
  );
  assert.equal(result.stderr, "");
  return {
    status: result.status,
    json: JSON.parse(result.stdout),
  };
}

async function createFallbackOpenSpecWorkspace(activeNames) {
  const cwd = await mkdtemp(join(tmpdir(), "perf-readiness-cwd-"));
  await mkdir(join(cwd, "openspec", "changes", "archive"), { recursive: true });
  await Promise.all(activeNames.map((name) => (
    mkdir(join(cwd, "openspec", "changes", name), { recursive: true })
  )));
  await mkdir(join(cwd, "openspec", "changes", ".ignored"), { recursive: true });
  return cwd;
}

test("default archive-readiness keeps hard budget breach advisory", async () => {
  const fixture = await createFixture();
  const result = runReadiness(fixture);

  assert.equal(result.status, 2);
  assert.equal(result.json.releaseMode, false);
  assert.equal(result.json.proxyRatio, 0.5);
  assert.deepEqual(result.json.hardFailures, []);
  assert.ok(result.json.warnings.some((warning) => warning.check === "budget-missing"));
});

test("default archive-readiness warns but does not hard fail on high proxy ratio", async () => {
  const fixture = await createFixture({ coldStartEvidence: "measured" });
  const result = runReadiness(fixture);

  assert.equal(result.status, 2);
  assert.equal(result.json.proxyRatio, 0.25);
  assert.deepEqual(result.json.hardFailures, []);

  const baseline = {
    metrics: [
      {
        scenario: "S-PROXY",
        metric: "one",
        value: 1,
        unit: "count",
        evidenceClass: "proxy",
      },
      {
        scenario: "S-PROXY",
        metric: "two",
        value: 2,
        unit: "count",
        evidenceClass: "proxy",
      },
      {
        scenario: "S-MEASURED",
        metric: "one",
        value: 1,
        unit: "count",
        evidenceClass: "measured",
      },
    ],
  };
  const runtimeEvidence = {
    archiveReadiness: { completed: [] },
    largeFileSummary: { candidates: [] },
    performanceEvidence: baseline.metrics,
    realtimeTraceBudgets: [],
  };
  await writeJson(fixture.baselinePath, baseline);
  await writeJson(fixture.runtimePath, runtimeEvidence);

  const highProxyResult = runReadiness(fixture);

  assert.equal(highProxyResult.status, 2);
  assert.ok(highProxyResult.json.proxyRatio > 0.5);
  assert.deepEqual(highProxyResult.json.hardFailures, []);
  assert.ok(highProxyResult.json.warnings.some((warning) => (
    warning.check === "proxy-ratio-too-high"
    && warning.code === "proxy-ratio-too-high"
    && warning.record === "performance-evidence"
  )));
});

test("archive-readiness includes synthetic evidence in proxy ratio denominator", async () => {
  const fixture = await createFixture({ coldStartEvidence: "measured" });
  const baseline = {
    metrics: [
      {
        scenario: "S-PROXY",
        metric: "one",
        value: 1,
        unit: "count",
        evidenceClass: "proxy",
      },
      {
        scenario: "S-MEASURED",
        metric: "one",
        value: 1,
        unit: "count",
        evidenceClass: "measured",
      },
      {
        scenario: "S-SYNTHETIC",
        metric: "one",
        value: 1,
        unit: "count",
        evidenceClass: "synthetic",
      },
    ],
  };
  const runtimeEvidence = {
    archiveReadiness: { completed: [] },
    largeFileSummary: { candidates: [] },
    performanceEvidence: baseline.metrics,
    realtimeTraceBudgets: [],
  };
  await writeJson(fixture.baselinePath, baseline);
  await writeJson(fixture.runtimePath, runtimeEvidence);

  const result = runReadiness(fixture);

  assert.equal(result.status, 2);
  assert.equal(result.json.proxyRatio, 0.3333);
  assert.equal(result.json.evidenceClassCounts.synthetic, 2);
  assert.ok(!result.json.warnings.some((warning) => (
    warning.check === "proxy-ratio-too-high"
  )));
});

test("archive-readiness falls back to openspec changes directory when openspec binary is unavailable", async () => {
  const fixture = await createFixture({ coldStartEvidence: "measured" });
  const cwd = await createFallbackOpenSpecWorkspace([
    "collect-release-grade-performance-evidence",
  ]);
  const result = runReadiness(fixture, [], {
    cwd,
    env: { ...process.env, PATH: "" },
    useActiveChangesJson: false,
  });

  assert.equal(result.status, 2);
  assert.equal(result.json.activeChangeCount, 1);
  assert.equal(result.json.inputs.openSpec, "openspec/changes directory fallback");
  assert.deepEqual(result.json.hardFailures, []);
});

test("archive-readiness directory fallback still hard fails stale completed changes", async () => {
  const fixture = await createFixture({ coldStartEvidence: "measured" });
  const cwd = await createFallbackOpenSpecWorkspace([
    "collect-release-grade-performance-evidence",
  ]);
  const runtimeEvidence = {
    archiveReadiness: {
      completed: [{ name: "already-archived-performance-change" }],
    },
    largeFileSummary: { candidates: [] },
    performanceEvidence: [],
    realtimeTraceBudgets: [],
  };
  await writeJson(fixture.runtimePath, runtimeEvidence);

  const result = runReadiness(fixture, [], {
    cwd,
    env: { ...process.env, PATH: "" },
    useActiveChangesJson: false,
  });

  assert.equal(result.status, 1);
  assert.equal(result.json.inputs.openSpec, "openspec/changes directory fallback");
  assert.ok(result.json.hardFailures.some((failure) => (
    failure.check === "archive-readiness-stale"
    && failure.record === "already-archived-performance-change"
  )));
});

test("release readiness fails on hard breach and unsupported cold-start evidence", async () => {
  const fixture = await createFixture();
  const result = runReadiness(fixture, ["--release"]);

  assert.equal(result.status, 1);
  assert.equal(result.json.releaseMode, true);
  assert.ok(result.json.hardFailures.some((failure) => (
    failure.check === "release-hard-budget-breach"
    && failure.record === "S-CS-COLD/bundleSizeMain"
    && failure.owner === "bundle-size-optimization"
  )));
  assert.ok(result.json.hardFailures.some((failure) => (
    failure.check === "release-evidence-unsupported"
    && failure.record === "S-CS-COLD/firstPaintMs"
  )));
  assert.ok(result.json.warnings.some((warning) => (
    warning.check === "release-evidence-proxy"
    && warning.record === "S-RS-VL/visibleTextLagP95"
  )));
});

test("release readiness deduplicates repeated hard breach records", async () => {
  const fixture = await createFixture();
  const result = runReadiness(fixture, ["--release"]);
  const bundleBreaches = result.json.hardFailures.filter((failure) => (
    failure.check === "release-hard-budget-breach"
    && failure.record === "S-CS-COLD/bundleSizeMain"
  ));

  assert.equal(bundleBreaches.length, 1);
});
