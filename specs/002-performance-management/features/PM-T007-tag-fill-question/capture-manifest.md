# PM-T007 采集证据清单

```text
completion_status: incomplete
pixel_restore_status: blocked
capture_readiness:
  capture_integrity: passed
  capture_completeness: passed
  implementation_readiness: design_incomplete
  readiness_scope: variant
```

## 1. 采集任务

- 页面：`https://idreamsky.feishu.cn/perf/admin/tagged-fill-in-questions?currentPage=1&pageSize=10`
- Mission：`mission-e9067c6b3862`
- 初始 session：`idreamsky.feishu.cn_20260902_112536_141654`
- 导航补采 session：`idreamsky.feishu.cn_20260902_122428_527008`
- 列表/新建补采 session：`idreamsky.feishu.cn_20260902_123014_357212`
- 导航最终补采 session：`idreamsky.feishu.cn_20260902_153113_566355`
- 编辑分支补采 session：`idreamsky.feishu.cn_20260902_142513_564760`
- 最新分析模型：`C:\Users\gaby.liu\ClonedSites\idreamsky.feishu.cn_20260902_153113_566355\captures\capture_model.json`
- 表单状态补采 session：`idreamsky.feishu.cn_20260902_161653_099829`
- 表单最终补采 session：`idreamsky.feishu.cn_20260902_165521_251185`
- 备注 resize 补采 session：`idreamsky.feishu.cn_20260902_170518_391976`
- 最新表单分析模型：`C:\Users\gaby.liu\ClonedSites\idreamsky.feishu.cn_20260902_165521_251185\captures\capture_model.json`
- 19 个表单候选状态的唯一语义映射：`state-map.json`。
- 最新分析结果：19 个有效交互状态、19 条状态边、`capture_completeness=passed`；`implementation_brief=design_incomplete`。

## 2. 证据索引

| source_state_id | session | 状态 | 证据目录 | 完整性 |
|---|---|---|---|---|
| `LIST-DEFAULT` | `...123014_357212` | 标签型填写题列表默认态 | `captures/initial/` | 部分完整 |
| `LIST-ROW-HOVER` | `...142513_564760` | 第一行及编辑操作 hover | `captures/hybrid_steps/step_02-05/after/` | after artifacts 已生成 |
| `LIST-NEW-HOVER` | `...123014_357212`、`...141952_713904` | 新建按钮 hover | `captures/recording_events/`、`captures/hybrid_steps/` | 已记录事件 |
| `CREATE-DEFAULT` | `...123014_357212`、`...141952_713904` | 新建标签型填写题页面 | `captures/hybrid_steps/step_01/after/`、`step_14/after/` | 结构 artifacts 完整 |
| `EDIT-BUTTON-HOVER` | `...142513_564760` | 第一条记录编辑按钮 hover | `captures/recording_events/` | after artifacts 已生成 |
| `EDIT-DEFAULT` | `...142513_564760` | 编辑页面回填态 | `captures/hybrid_steps/step_12/after/` | 结构 artifacts 完整，语义检查点未闭合 |
| `NAV-TAG-SELECTED` | `...153113_566355` | 标签型填写题选中态 | `captures/hybrid_steps/step_18/after/` | after artifacts 已生成 |
| `FORM-DESCRIPTION-FOCUS` | `...161653_099829` | 描述字段 focus | `captures/hybrid_steps/step_05/after/` | after artifacts 已生成 |
| `FORM-REMARK-FOCUS` | `...161653_099829` | 备注字段 focus | `captures/hybrid_steps/step_08/after/` | after artifacts 已生成 |
| `FORM-TAG-ADDED` | `...161653_099829` | 添加第二个标签项 | `captures/hybrid_steps/step_11/after/` | after artifacts 已生成 |
| `NAV-REVIEW-SELECTED` | `...153113_566355` | 评估题选中态 | `captures/hybrid_steps/step_16/blocked/` | blocked，目标未找到 |
| `FORM-PREVIEW-VALIDATION` | `...161653_099829` | 空表单预览校验 | `captures/hybrid_steps/step_14/after/` | after artifacts 已生成 |
| `FORM-PREVIEW-SUCCESS` | `...165521_251185` | 合法草稿预览成功态 | `captures/hybrid_steps/step_14/after/` | after artifacts 已生成 |
| `FORM-PREVIEW-CLOSED` | `...165521_251185` | 关闭预览后返回表单 | `captures/hybrid_steps/step_16/after/` | after artifacts 已生成 |
| `FORM-TAG-ADDED-FINAL` | `...165521_251185` | 添加标签后的最终状态 | `captures/hybrid_steps/step_19/after/` | after artifacts 已生成 |
| `REMARK-RESIZE-AFTER` | `...170518_391976` | 备注文本域 after-drag | `captures/hybrid_steps/step_01/after/`、`captures/recording_events/` | after height `126px` 已记录，dragging 独立态待补 |

## 3. 已确认证据

- 列表标题：`标签型填写题`。
- 列表工具栏存在`新建`和`筛选`，搜索 placeholder 为`通过名称、备注搜索`。
- 列表列：`名称`、`创建人`、`创建时间`、`备注`、`操作`。
- 当前默认列表可见记录：`价值观`、`投入度`、`价值贡献`。
- 新建按钮 bbox：`x=280,y=138,width=80,height=32`。
- 新建按钮 SVG：`data-icon=AddOutlined`，viewBox `0 0 24 24`，尺寸约 `14×14`，path 已保存在 `action_log.json`。
- 新建页面实际 URL：`/perf/admin/tagged-fill-in-questions/create`。
- 新建页面标题：`新建标签型填写题`。
- 新建页面主体根容器 bbox：`x=584,y=64,width=752,height=719.3333740234375`。
- 新建页面页头 bbox：`x=0,y=0,width=1920,height=56`。
- 编辑按钮 bbox：`x=1638.47,y=246.33,width=28,height=22`，文字颜色 `rgb(36,91,219)`，命中区 cursor 为 pointer。
- 编辑页面实际 URL：`/perf/admin/tagged-fill-in-questions/7173973572648894465?from`。
- 编辑页面标题：`价值观`；名称回填`价值观`；描述计数器为`47/20000`；标签名称回填`价值观测评语`。
- 已观察字段/控件见 `component-model.md` 的 field inventory。

## 4. 阻塞项

- 导航父菜单和“评估题”子项的最终目标映射仍不完整；“标签型填写题”选中 after 已生成。
- 列表行 hover、编辑按钮 hover 和编辑入口已生成新 session 的状态 artifacts。
- 编辑页面已获得稳定 after 截图和结构数据，尚需与新建页做逐项 ownership 对照。
- 最新 `capture_model.json` 报告 `semantic_variant_context_incomplete`；组件级语义上下文和完整 variant projection 仍需整理。
- 描述/备注 focus、添加第二个标签项和空表单预览校验已生成 after artifacts；textarea resize、预览关闭/成功态和完整控件状态仍未完成。
- 没有 rendered contract 和截图 diff。
- API、数据模型、内部权限、删除和引用限制未确认。

## 5. 证据使用规则

- `CREATE-DEFAULT` 只作为已观察的 UI 结构输入，不作为已通过的交互验收证据。
- 所有未采集值写 `BLOCKED`，不使用 Element Plus 默认值或 PM-T006 相邻值推导。
- 采集目录不进入 Git；真实 HTML、截图、日志和认证状态不得提交。
- 后续补采必须为导航、编辑和表单状态建立新的 `source_state_id`，不得覆盖现有证据。
