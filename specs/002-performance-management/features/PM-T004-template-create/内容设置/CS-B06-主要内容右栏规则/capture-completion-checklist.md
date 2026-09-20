# CS-B06 采集完成检查

completion_status: completed
pixel_restore_status: ready_for_implementation
uncovered_reasons: []
pixel_acceptance_status: not-run

## 1. Readiness

| 检查项 | 状态 | 证据 |
| --- | --- | --- |
| capture integrity | passed | `capture_model.json#/capture_readiness` |
| capture completeness | passed | 16 个目标 variant、52 个有效状态、0 blocked |
| implementation readiness | ready | `implementation_brief.status=ready`、`variant_candidates=[]` |
| readiness scope | feature（本 CS-B06 局部功能） | root/item 及全部要求联动 |
| target bindings | passed | root/item 两个 binding 已捕获并重放 |
| screenshot/layout/computed | passed | 每个关键 after step 完整落盘 |
| destructive action boundary | passed | 无保存/提交/发布/删除/清空 |
| pixel runtime acceptance | not-run | 尚无 HR Portal rendered contract 和截图 diff |

## 2. 行为覆盖

- [x] root 右栏完整结构与默认值。
- [x] root 隐藏描述 on/off 与中栏空间差分。
- [x] root 允许添加多个 on/off、按钮位置和卡片高度差分。
- [x] item 右栏完整结构与默认值。
- [x] item 填写/隐藏 on/off 与右栏下级设置变化。
- [x] item hidden 的中栏禁用态、隐藏图标、卡片高度。
- [x] item 必填 on/off 与星号变化。
- [x] root → item → root 绑定重放和状态隔离。
- [x] 单选/复选 DOM role、16px 几何、checked/aria-checked 状态证据。
- [ ] 不同同类型 item 切换：`not_attempted`，页面不存在第二项，不属于缺陷。

## 3. 文档投影覆盖

- [x] `spec.md`
- [x] `capture-manifest.md`
- [x] `capture-completion-checklist.md`
- [x] `component-model.md`
- [x] `extracted-ui-contract.json`
- [x] `pixel-contract.md`
- [x] `acceptance-contract.md`
- [x] `atomic-tasks.md`

## 4. 放行边界

本目录允许进入 CS-B06 的前端实现，但不能宣称像素验收通过。实现完成后仍必须：

1. 在真实 HR Portal 路由进入相同 root/item 状态；
2. 生成 rendered contract；
3. 在 `1920×1080/DPR1/100%` 下生成实现截图；
4. 比较 text/visibility、geometry、styles、line groups、container insets 和 SVG；
5. 运行 `check_ui_spec.py --phase acceptance --compare-contract ...`。
