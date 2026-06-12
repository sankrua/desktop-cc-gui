# v0.5.9 Performance Baseline

Generated at: 2026-06-11T14:21:21.611Z
Schema version: 1.0
Branch: feature/v0.5.9
Commit: e16f08a15bfacef871c65be4da08502a2334fb56

## Section A — Fixture-Replay Baseline

| Scenario | Metric | Value | Unit | Evidence | Target | Hard Fail | Notes |
|---|---:|---:|---|---|---:|---:|---|
| S-LL-200 | commitDurationP50 | 10.15 | ms | proxy |  |  |  |
| S-LL-200 | commitDurationP95 | 10.15 | ms | proxy |  |  |  |
| S-LL-200 | firstPaintAfterMount | 35.81 | ms | proxy |  |  |  |
| S-LL-500 | commitDurationP50 | 13.84 | ms | proxy |  |  |  |
| S-LL-500 | commitDurationP95 | 13.84 | ms | proxy |  |  |  |
| S-LL-500 | firstPaintAfterMount | 33.48 | ms | proxy |  |  |  |
| S-LL-1000 | commitDurationP50 | 18.03 | ms | proxy |  |  |  |
| S-LL-1000 | commitDurationP95 | 18.03 | ms | proxy |  |  |  |
| S-LL-1000 | firstPaintAfterMount | 36.91 | ms | proxy |  |  |  |
| S-LL-1000 | scrollFrameDropPct | 0 | % | proxy | 1 | 5 | jsdom proxy; browser scroll gate is follow-up |
| S-CI-50 | keystrokeToCommitP95 | 0.09 | ms | proxy | 16 | 32 |  |
| S-CI-50 | inputEventLossCount | 0 | count | proxy |  |  |  |
| S-CI-50 | compositionToCommit | 0 | ms | proxy |  |  |  |
| S-CI-100-IME | keystrokeToCommitP95 | 0.03 | ms | proxy | 16 | 32 |  |
| S-CI-100-IME | inputEventLossCount | 0 | count | proxy |  |  |  |
| S-CI-100-IME | compositionToCommit | 0.13 | ms | proxy |  |  |  |
| S-RS-FT | firstTokenLatency | 5000 | ms | proxy | 2000 | 5000 | turn start to first assistant delta |
| S-RS-FT | interTokenJitterP95 | 920 | ms | proxy | 500 | 920 |  |
| S-RS-PE | dedupHitRatio | 0.25 | ratio | proxy |  |  |  |
| S-RS-PE | assemblerLatency | 4.18 | ms | proxy |  |  | replay reducer-path proxy latency |
| S-RS-VL | visibleTextLagP95 | 24 | ms | proxy |  |  | first engine delta ingress -> first visible text growth (per-turn P95, turn-trace correlation gate) |
| S-RS-RA | reducerAmplificationMedian | 4 | ratio | proxy |  |  | reducer commit count / delta count (median across completed turns) |
| S-RS-FD | batchFlushDurationP95 | 13.33 | ms | proxy |  |  | batch flush duration P95 across completed turns |
| S-RS-TS | terminalSettlementP95 | 60 | ms | proxy |  |  | last reducer commit -> terminal settlement P95 across completed turns |
| S-CS-COLD | bundleSizeMain | 1121481 | bytes-gzip | measured | 950000 | 1100000 | App-GOSdMQOY.js |
| S-CS-COLD | bundleSizeVendor | 741552 | bytes-gzip | measured | 680000 | 760000 | subset-shared.chunk-BukY6QKG.js |
| S-CS-COLD | firstPaintMs | unsupported | ms | unsupported |  |  | Tauri webview headless cold-start timing is not available in this script; bundle baseline is recorded. |
| S-CS-COLD | firstInteractiveMs | unsupported | ms | unsupported |  |  | Tauri webview headless cold-start timing is not available in this script; bundle baseline is recorded. |

## Section B — Cross-Platform Notes

- darwin: S-CS-COLD/firstPaintMs unsupported - Tauri webview headless cold-start timing is not available in this script; bundle baseline is recorded.
- darwin: S-CS-COLD/firstInteractiveMs unsupported - Tauri webview headless cold-start timing is not available in this script; bundle baseline is recorded.

## Section C — Previous Baseline Comparison

Previous baseline: v0.5.6 (docs/perf/history/v0.5.6-baseline.json)

| Scenario | Metric | Previous | Current | Delta | Unit | Evidence | Status |
|---|---|---:|---:|---:|---|---|---|
| S-LL-200 | commitDurationP50 | 17.6 | 10.15 | -7.45 | ms | proxy | comparable |
| S-LL-200 | commitDurationP95 | 17.6 | 10.15 | -7.45 | ms | proxy | comparable |
| S-LL-200 | firstPaintAfterMount | 54.54 | 35.81 | -18.73 | ms | proxy | comparable |
| S-LL-500 | commitDurationP50 | 170.66 | 13.84 | -156.82 | ms | proxy | comparable |
| S-LL-500 | commitDurationP95 | 170.66 | 13.84 | -156.82 | ms | proxy | comparable |
| S-LL-500 | firstPaintAfterMount | 195.04 | 33.48 | -161.56 | ms | proxy | comparable |
| S-LL-1000 | commitDurationP50 | 34.47 | 18.03 | -16.44 | ms | proxy | comparable |
| S-LL-1000 | commitDurationP95 | 34.47 | 18.03 | -16.44 | ms | proxy | comparable |
| S-LL-1000 | firstPaintAfterMount | 58.43 | 36.91 | -21.52 | ms | proxy | comparable |
| S-LL-1000 | scrollFrameDropPct | 0 | 0 | 0 | % | proxy | comparable |
| S-CI-50 | keystrokeToCommitP95 | 0.08 | 0.09 | 0.01 | ms | proxy | comparable |
| S-CI-50 | inputEventLossCount | 0 | 0 | 0 | count | proxy | comparable |
| S-CI-50 | compositionToCommit | 0 | 0 | 0 | ms | proxy | comparable |
| S-CI-100-IME | keystrokeToCommitP95 | 0.03 | 0.03 | 0 | ms | proxy | comparable |
| S-CI-100-IME | inputEventLossCount | 0 | 0 | 0 | count | proxy | comparable |
| S-CI-100-IME | compositionToCommit | 0.11 | 0.13 | 0.02 | ms | proxy | comparable |
| S-RS-FT | firstTokenLatency | 5000 | 5000 | 0 | ms | proxy | comparable |
| S-RS-FT | interTokenJitterP95 | 920 | 920 | 0 | ms | proxy | comparable |
| S-RS-PE | dedupHitRatio | 0.25 | 0.25 | 0 | ratio | proxy | comparable |
| S-RS-PE | assemblerLatency | 5.73 | 4.18 | -1.55 | ms | proxy | comparable |
| S-RS-VL | visibleTextLagP95 | unsupported | 24 |  | ms | proxy | missing |
| S-RS-RA | reducerAmplificationMedian | unsupported | 4 |  | ratio | proxy | missing |
| S-RS-FD | batchFlushDurationP95 | unsupported | 13.33 |  | ms | proxy | missing |
| S-RS-TS | terminalSettlementP95 | unsupported | 60 |  | ms | proxy | missing |
| S-CS-COLD | bundleSizeMain | 1284244 | 1121481 | -162763 | bytes-gzip | measured | comparable |
| S-CS-COLD | bundleSizeVendor | 672901 | 741552 | 68651 | bytes-gzip | measured | comparable |
| S-CS-COLD | firstPaintMs | unsupported | unsupported |  | ms | unsupported | not comparable |
| S-CS-COLD | firstInteractiveMs | unsupported | unsupported |  | ms | unsupported | not comparable |

> Comparison status: 22/28 metrics comparable; 4 missing, 2 not comparable.

## Section D — Residual Risks

- Baseline values are fixture-based and should be used for relative comparison, not absolute UX claims.
