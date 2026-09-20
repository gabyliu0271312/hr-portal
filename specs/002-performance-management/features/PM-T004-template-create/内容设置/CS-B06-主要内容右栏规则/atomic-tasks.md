# CS-B06 原子任务

completion_status: completed
pixel_restore_status: ready_for_implementation
uncovered_reasons: []
pixel_acceptance_status: not-run

- [x] PM-T004-T08 冻结工作总结 root/item 右栏开发契约
  - Goal: 将 2026-09-03 最终采集投影为本目录唯一机器契约及 Markdown 开发说明，纠正旧 root/item 归属。
  - Type: contract/documentation
  - 前置条件：无；`realtime-ec568ea4f7c2` 与 `capture_model.json` 已完成。
  - Required reading: 本目录全部文件、父功能 `spec.md`/`ui-interaction.md`、`references/ui-design-delivery.md`。
  - Allowed modifications: 仅本目录规格文件。
  - Forbidden modifications: HR Portal 业务代码、后端/API/数据库、权限、UCP、原始采集目录、目标模板数据。
  - Input contract: 最终 capture session、root/item bindings、16 个分析 variant、52 个有效状态。
  - Output contract: schema v3 JSON；统一 `completion_status=completed`、`pixel_restore_status=ready_for_implementation`、`pixel_acceptance_status=not-run`。
  - Test contract: JSON 可解析；design gate 无错误；所有 source state 可回溯。
  - Evidence: `capture-manifest.md`、`extracted-ui-contract.json`、design gate 输出。
  - Non-scope: 前端实现和像素验收。
  - Definition of done: 8 个必需文件存在、状态一致、机器契约和设计门禁通过。

- [ ] PM-T004-T09 实现 CS-B06 root/item 右栏与即时联动
  - Goal: 仅按 stage rule variant 实现完整业务组件 `PerformanceConfiguredContentBlock`：统一拥有 root/item owner、右栏设置、中栏描述/隐藏/必填/允许多个联动与状态隔离；工作总结环节启用该 variant，页面只组装，不能用 `content.type === 'work_summary'` 作为规则开关。
  - Type: frontend/UI
  - 前置条件：PM-T004-T08；用户确认本 UI Implementation Brief。
  - Required reading: 本目录全部文件、父功能现有内容设置实现与 focused specs。
  - Allowed modifications: `PerformanceTemplateContentSettings.vue`、直接承载 root/item 的 performance 业务组件、对应 focused specs；如需复用只允许最小修改已有 `PerformanceRadioGroup.vue`/`PerformanceCheckbox.vue`。
  - Forbidden modifications: 流程设置、其他八环节、抽屉/自定义/评分/标签、API/数据库/权限/UCP、全局主题、保存行为。
  - Input contract: `selectedOwner=root|item`、`hideDescription`、`allowMultiple`、`fillMode`、`required`。
  - Output contract: 业务组件控制 root/item 规则；`AddAnotherItemButton` 仅输出已采集 SVG/文案/布局，不新增 item、不改变内容模型、不发写请求。
  - Test contract: AC-01 至 AC-09 的正向和反向组件断言；focused Vitest、typecheck、production build。
  - Acceptance: 目标 geometry/styles/SVG 在 1920×1080/DPR1 tolerance 内；实现截图独立存放于 UI blueprint/evidence 目录。
  - Evidence: `PerformanceConfiguredContentBlock.vue` now owns the complete stage-rule-driven root/item behavior; `PerformanceConfiguredContentBlock.spec.ts` 2/2 plus existing content settings/renderer/checkbox focused tests 23/23 passed; Vite production build 2849 modules passed; implementation gate passed without errors.
  - Runtime status: previous authenticated local route evidence covered the original implementation states; the post-refactor Docker redeploy was blocked because Docker Desktop Linux engine was unavailable. `PM-T004-T10` remains unchecked and `pixel_acceptance_status=not-run` until a fresh rendered contract and screenshot diff are produced.
  - Blockers: repository-wide `vue-tsc` remains blocked only by out-of-scope existing errors in `ReviewQuestionTable.spec.ts` and two report `expand_by` type errors; final rendered contract and screenshot diff are not-run.
  - Non-scope: 真实模板持久化、第二 item 证据、移动端。
  - Definition of done: 代码、focused tests、build、rendered contract 与运行时截图齐备；只由主智能体勾选。

- [ ] PM-T004-T10 执行 CS-B06 运行时像素验收
  - Goal: 在真实 HR Portal 路由生成 rendered contract 和截图 diff。
  - Type: acceptance/test
  - 前置条件：PM-T004-T09。
  - Required reading: `acceptance-contract.md`、`pixel-contract.md`、实现测试。
  - Allowed modifications: focused acceptance test、rendered contract、独立实现截图和验收记录。
  - Forbidden modifications: 借验收顺带修改业务规则或扩大实现范围。
  - Test contract: 同 viewport 比较 text/visibility、geometry、styles、line groups、container insets、SVG 和状态转换。
  - Acceptance: `check_ui_spec.py --phase acceptance --compare-contract ...` 通过；截图 diff 在批准阈值内。
  - skipped/not-run rule: 未执行任一层必须报告 not-run，不能宣称像素通过。
  - Definition of done: structure/layout/visual/behavior/pixel 分层结果全部记录后由主智能体勾选。
