## 1. OpenSpec Readiness

- [x] 1.1 [P0][依赖: 无][输入: proposal/design/spec][输出: strict-valid change][验证: `openspec validate wire-project-map-auto-ingestion --strict`] 完成 Auto Ingestion 接线 change artifacts。

## 2. Scheduler And Request Contract

- [x] 2.1 [P0][依赖: 1.1][输入: `ProjectMapAutoIngestionSettings` + `memoryCursor`][输出: interval/threshold/duplicate guard helpers][验证: autoIngestion util tests cover interval and active-run guards] 实现自动补充调度判断。
- [x] 2.2 [P0][依赖: 2.1][输入: Project Memory messages][输出: `ProjectMapGenerationRequest` auto scope with memory evidence metadata][验证: generation request / hook tests assert `kind=auto` queued run] 创建真实 auto generation request。
- [x] 2.3 [P0][依赖: 2.2][输入: `checkIntervalMinutes`][输出: footer interval setting wiring][验证: component test renders interval control; hook test persists interval updates] 补齐底部 interval UI 接线。

## 3. Worker And Candidate Safety

- [x] 3.1 [P0][依赖: 2.2][输入: auto run memory evidence][输出: worker prompt includes bounded Project Memory snippets][验证: worker test prompt includes memory evidence block for auto run] 接入 Project Memory evidence prompt。
- [x] 3.2 [P0][依赖: 3.1][输入: applyMode][输出: default candidate-safe generated updates][验证: worker / merge tests keep createCandidate auto output as candidate] 默认 createCandidate 不直接信任自动补充事实。
- [x] 3.3 [P1][依赖: 3.1][输入: run completion state][输出: success-only processed marker update][验证: hook test success marks processed, failure does not] 成功后才写 processed marker。

## 4. Validation

- [x] 4.1 [P0][依赖: 2.*-3.*][输入: Project Map focused suites][输出: tests pass][验证: `npm exec vitest -- run src/features/project-map/hooks/useProjectMapDataset.test.tsx src/features/project-map/components/ProjectMapPanel.test.tsx src/features/project-map/services/projectMapGenerationWorker.test.ts src/features/project-map/utils/autoIngestion.test.ts --maxWorkers 1 --minWorkers 1`] 运行聚焦测试。
- [x] 4.2 [P0][依赖: 4.1][输入: TypeScript project][输出: typecheck pass][验证: `npm run typecheck`] 运行类型检查。
- [x] 4.3 [P0][依赖: 4.2][输入: OpenSpec change][输出: strict validation pass][验证: `openspec validate wire-project-map-auto-ingestion --strict`] 最终 OpenSpec 校验。
