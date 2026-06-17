import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

function runProducer(args) {
  return new Promise((resolve, reject) => {
    execFile(
      "npm",
      ["exec", "vite-node", "--", "scripts/perf-v0511-runtime-evidence.ts", ...args],
      { cwd: process.cwd() },
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      },
    );
  });
}

function metricMap(fragment) {
  return new Map(
    fragment.metrics.map((metric) => [`${metric.scenario}/${metric.metric}`, metric]),
  );
}

test("v0.5.11 runtime producer emits proxy evidence for the four performance gaps", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mossx-v0511-runtime-evidence-"));
  const outputPath = join(dir, "runtime-evidence.json");

  await runProducer(["--diagnostics=none", `--output=${outputPath}`]);

  const fragment = JSON.parse(await readFile(outputPath, "utf-8"));
  const byMetric = metricMap(fragment);

  for (const key of [
    "S-IO-RR/thread_reducer_flush_ms_p95",
    "S-IO-RR/realtime_delta_route_ms_p95",
    "S-IO-AS/app_server_event_route_ms_p95",
    "S-IO-AS/main_thread_long_task_count_during_stream",
    "S-IO-FS/file_io_command_wall_ms_p95",
    "S-IO-FS/file_io_async_worker_stall_ms_p95",
    "S-IO-FS/file_io_blocking_pool_call_count",
    "S-IO-FS/tauri_command_during_stream_ms_p95",
    "S-IO-FP/composer_render_count_per_streaming_minute",
    "S-IO-FP/sidebar_render_count_per_streaming_minute",
    "S-IO-FP/thread_row_rerender_count_per_1000_delta",
    "S-IO-FP/layout_nodes_recompute_count_per_1000_delta",
  ]) {
    const row = byMetric.get(key);
    assert.equal(row?.evidenceClass, "proxy", `${key} should be proxy evidence`);
    assert.equal(typeof row?.value, "number", `${key} should have a numeric value`);
  }

  assert.equal(byMetric.get("S-IO-RR/prepareThreadItems_calls_per_1000_delta")?.value, 0);
  assert.equal(byMetric.get("S-IO-AS/realtime_reducer_dispatches_per_1000_delta")?.value, 1000);
  assert.match(fragment.notes.join("\n"), /not release-grade desktop runtime proof/);
});

test("v0.5.11 runtime producer promotes whitelisted diagnostics to measured evidence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mossx-v0511-runtime-evidence-"));
  const diagnosticsPath = join(dir, "renderer-diagnostics.json");
  const outputPath = join(dir, "runtime-evidence.json");

  await writeFile(
    diagnosticsPath,
    JSON.stringify({
      rendererDiagnostics: [
        {
          timestamp: Date.now(),
          label: "perf.v0511.runtime-evidence",
          payload: {
            scenario: "S-IO-RR",
            metric: "thread_reducer_flush_ms_p95",
            value: 7.25,
            unit: "ms",
            notes: "Measured from Tauri WebView profiler",
          },
        },
        {
          timestamp: Date.now(),
          label: "perf.v0511.runtime-evidence",
          payload: {
            scenario: "S-IO-FP",
            metric: "composer_render_count_per_streaming_minute",
            value: 42,
            unit: "count",
          },
        },
      ],
    }),
    "utf-8",
  );

  await runProducer([`--diagnostics=${diagnosticsPath}`, `--output=${outputPath}`]);

  const fragment = JSON.parse(await readFile(outputPath, "utf-8"));
  const byMetric = metricMap(fragment);

  assert.equal(byMetric.get("S-IO-RR/thread_reducer_flush_ms_p95")?.value, 7.25);
  assert.equal(byMetric.get("S-IO-RR/thread_reducer_flush_ms_p95")?.evidenceClass, "measured");
  assert.equal(byMetric.get("S-IO-FP/composer_render_count_per_streaming_minute")?.value, 42);
  assert.equal(byMetric.get("S-IO-FP/composer_render_count_per_streaming_minute")?.evidenceClass, "measured");
  assert.match(fragment.notes.join("\n"), /accepted measuredMetricCount=2/);
});

test("v0.5.11 runtime producer ignores unsafe or malformed diagnostics", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mossx-v0511-runtime-evidence-"));
  const diagnosticsPath = join(dir, "renderer-diagnostics.json");
  const outputPath = join(dir, "runtime-evidence.json");

  await writeFile(
    diagnosticsPath,
    JSON.stringify({
      entries: [
        {
          timestamp: Date.now(),
          label: "perf.v0511.runtime-evidence",
          payload: {
            scenario: "S-IO-RR",
            metric: "thread_reducer_flush_ms_p95",
            value: -1,
            unit: "ms",
          },
        },
        {
          timestamp: Date.now(),
          label: "perf.v0511.runtime-evidence",
          payload: {
            scenario: "S-IO-RR",
            metric: "prompt_text_should_not_be_accepted",
            value: 1,
            unit: "count",
            prompt: "sensitive user text",
          },
        },
      ],
    }),
    "utf-8",
  );

  await runProducer([`--diagnostics=${diagnosticsPath}`, `--output=${outputPath}`]);

  const fragment = JSON.parse(await readFile(outputPath, "utf-8"));
  const byMetric = metricMap(fragment);

  assert.equal(byMetric.get("S-IO-RR/thread_reducer_flush_ms_p95")?.evidenceClass, "proxy");
  assert.match(fragment.notes.join("\n"), /accepted measuredMetricCount=0/);
  assert.doesNotMatch(JSON.stringify(fragment), /sensitive user text/);
});

test("v0.5.11 runtime producer derives measured timing from turn trace summaries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mossx-v0511-runtime-evidence-"));
  const diagnosticsPath = join(dir, "turn-trace-diagnostics.json");
  const outputPath = join(dir, "runtime-evidence.json");

  await writeFile(
    diagnosticsPath,
    JSON.stringify({
      app: {
        diagnostics: {
          rendererLifecycleLog: [
            {
              timestamp: Date.now(),
              label: "realtime.turnTrace.summary",
              payload: {
                evidenceClass: "measured",
                deltas: {
                  batchFlushEndToReducerCommitMs: 3,
                },
                counters: {
                  realtimeDeltaRouteDurationAvgMs: 4,
                  appServerEventRouteDurationAvgMs: 5,
                },
              },
            },
            {
              timestamp: Date.now(),
              label: "realtime.turnTrace.summary",
              payload: {
                evidenceClass: "measured",
                deltas: {
                  batchFlushEndToReducerCommitMs: 6,
                },
                counters: {
                  realtimeDeltaRouteDurationAvgMs: 8,
                  appServerEventRouteDurationAvgMs: 9,
                },
              },
            },
          ],
        },
      },
    }),
    "utf-8",
  );

  await runProducer([`--diagnostics=${diagnosticsPath}`, `--output=${outputPath}`]);

  const fragment = JSON.parse(await readFile(outputPath, "utf-8"));
  const byMetric = metricMap(fragment);

  assert.equal(byMetric.get("S-IO-RR/realtime_delta_route_ms_p95")?.value, 8);
  assert.equal(byMetric.get("S-IO-RR/thread_reducer_flush_ms_p95")?.value, 6);
  assert.equal(byMetric.get("S-IO-AS/app_server_event_route_ms_p95")?.value, 9);
  assert.equal(byMetric.get("S-IO-AS/app_server_event_route_ms_p95")?.evidenceClass, "measured");
  assert.match(byMetric.get("S-IO-AS/app_server_event_route_ms_p95")?.notes ?? "", /sampleCount=2/);
});

test("v0.5.11 runtime producer derives reducer dispatch rate from measured turn trace counters", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mossx-v0511-runtime-evidence-"));
  const diagnosticsPath = join(dir, "turn-trace-diagnostics.json");
  const outputPath = join(dir, "runtime-evidence.json");

  await writeFile(
    diagnosticsPath,
    JSON.stringify({
      entries: [
        {
          timestamp: Date.now(),
          label: "realtime.turnTrace.summary",
          payload: {
            evidenceClass: "measured",
            counters: {
              deltaCount: 12,
              reducerCommitCount: 24,
              appServerEventRouteDurationAvgMs: 10,
            },
          },
        },
        {
          timestamp: Date.now(),
          label: "realtime.turnTrace.summary",
          payload: {
            evidenceClass: "measured",
            counters: {
              deltaCount: 14,
              reducerCommitCount: 56,
              appServerEventRouteDurationAvgMs: 14,
            },
          },
        },
      ],
    }),
    "utf-8",
  );

  await runProducer([`--diagnostics=${diagnosticsPath}`, `--output=${outputPath}`]);

  const fragment = JSON.parse(await readFile(outputPath, "utf-8"));
  const byMetric = metricMap(fragment);
  const reducerDispatchRate = byMetric.get(
    "S-IO-RR/realtime_reducer_dispatches_per_1000_delta",
  );
  const appServerRoute = byMetric.get("S-IO-AS/app_server_event_route_ms_p95");

  assert.equal(reducerDispatchRate?.value, 4000);
  assert.equal(reducerDispatchRate?.evidenceClass, "measured");
  assert.equal(appServerRoute?.value, 14);
  assert.doesNotMatch(JSON.stringify(fragment), /firstDeltaToFirstVisibleTextMs/);
});

test("v0.5.11 runtime producer does not promote legacy turn-window timings as measured route evidence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mossx-v0511-runtime-evidence-"));
  const diagnosticsPath = join(dir, "legacy-turn-trace-diagnostics.json");
  const outputPath = join(dir, "runtime-evidence.json");

  await writeFile(
    diagnosticsPath,
    JSON.stringify({
      entries: [
        {
          timestamp: Date.now(),
          label: "realtime.turnTrace.summary",
          payload: {
            evidenceClass: "measured",
            deltas: {
              firstDeltaToBatchFlushEndMs: 35_600,
              batchFlushEndToReducerCommitMs: 2_065,
            },
            counters: {
              deltaCount: 32,
              reducerCommitCount: 32,
              batchFlushDurationAvgMs: 9_647.5,
            },
          },
        },
      ],
    }),
    "utf-8",
  );

  await runProducer([`--diagnostics=${diagnosticsPath}`, `--output=${outputPath}`]);

  const fragment = JSON.parse(await readFile(outputPath, "utf-8"));
  const byMetric = metricMap(fragment);

  assert.equal(byMetric.get("S-IO-RR/realtime_delta_route_ms_p95")?.evidenceClass, "proxy");
  assert.notEqual(byMetric.get("S-IO-RR/realtime_delta_route_ms_p95")?.value, 35_600);
  assert.equal(byMetric.get("S-IO-AS/app_server_event_route_ms_p95")?.evidenceClass, "proxy");
  assert.notEqual(byMetric.get("S-IO-AS/app_server_event_route_ms_p95")?.value, 9_647.5);
  assert.equal(byMetric.get("S-IO-RR/thread_reducer_flush_ms_p95")?.value, 2_065);
  assert.equal(byMetric.get("S-IO-RR/thread_reducer_flush_ms_p95")?.evidenceClass, "measured");
});
