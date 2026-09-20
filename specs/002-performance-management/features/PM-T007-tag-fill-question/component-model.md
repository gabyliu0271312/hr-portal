# PM-T007 组件模型

```text
completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- 导航父菜单和“评估题”子项的最终语义映射仍不完整；标签型填写题 selected after 已生成
- `capture_model.json` 已分析完成，但 `implementation_brief.status=design_incomplete`
- 列表行 hover、编辑入口和编辑页面已生成最新 session 的 after artifacts，但人工触发检查点及最终 source_state_id 映射仍未闭合
- 新建 after-state 的 action_log capture_context 为空，语义上下文不完整
- 校验、focus、预览和 rendered contract 尚未完成
- textarea resize 本期直接复用既有多行文本框组件，不新增独立 dragging 变体
```

## 1. Evidence index

| source_state_id | session | URL | viewport | state | evidence | complete |
|---|---|---|---|---|---|---|
| `LIST-DEFAULT` | `idreamsky.feishu.cn_20260902_123014_357212` | tagged-fill-in-questions | 1920×1080/DPR1 | default | `captures/initial/*` | partial |
| `CREATE-DEFAULT` | `idreamsky.feishu.cn_20260902_123014_357212` | `/perf/admin/tagged-fill-in-questions/create` | 1920×1080/DPR1 | create after | `captures/hybrid_steps/step_01/after/*`、`step_14/after/*` | partial |
| `EDIT-DEFAULT` | `idreamsky.feishu.cn_20260902_142513_564760` | `https://idreamsky.feishu.cn/perf/admin/tagged-fill-in-questions/7173973572648894465?from` | 1920×1080/DPR1 | edit after | `captures/hybrid_steps/step_12/after/*` | partial |
| `NAV-*` | `idreamsky.feishu.cn_20260902_122428_527008` / `...153113_566355` | tagged-fill-in-questions | 1920×1080/DPR1 | parent hover/toggle and child states | `captures/recording_events/*`、`captures/hybrid_steps/step_02-19/*` | partial |
| `NAV-TAG-SELECTED` | `idreamsky.feishu.cn_20260902_153113_566355` | tagged-fill-in-questions | 1920×1080/DPR1 | tag item selected after | `captures/hybrid_steps/step_18/after/*` | partial |
| `FORM-DESCRIPTION-FOCUS` | `idreamsky.feishu.cn_20260902_161653_099829` | `/perf/admin/tagged-fill-in-questions/create` | 1920×1080/DPR1 | description focus | `captures/hybrid_steps/step_05/after/*` | partial |
| `FORM-REMARK-FOCUS` | `idreamsky.feishu.cn_20260902_161653_099829` | `/perf/admin/tagged-fill-in-questions/create` | 1920×1080/DPR1 | remark focus | `captures/hybrid_steps/step_08/after/*` | partial |
| `FORM-TAG-ADDED` | `idreamsky.feishu.cn_20260902_161653_099829` | `/perf/admin/tagged-fill-in-questions/create` | 1920×1080/DPR1 | second tag added | `captures/hybrid_steps/step_11/after/*` | partial |
| `FORM-PREVIEW-VALIDATION` | `idreamsky.feishu.cn_20260902_161653_099829` | `/perf/admin/tagged-fill-in-questions/create` | 1920×1080/DPR1 | empty form validation | `captures/hybrid_steps/step_14/after/*` | partial |

原始表单 session 的 19 个候选节点已在 `state-map.json` 中逐节点绑定唯一 `source_state_id`；重复观察通过 `variant_key` 分组，不合并证据。


```text
TagFillQuestionManagement [LIST-DEFAULT]
├── PerformanceAssessmentNavigation [NAV-* blocked]
│   ├── AssessmentManagementParent
│   │   ├── AssessmentManagementIcon [SVG blocked]
│   │   └── ExpandCollapseIcon [SVG blocked]
│   ├── ReviewQuestionItem [NAV-* blocked]
│   └── TagFillQuestionItem [NAV-* blocked]
└── PerformanceListPage [LIST-DEFAULT]
    └── TagFillQuestionTableCard
        ├── PerformanceListToolbar [shared candidate with PM-T006]
        │   ├── NewButton [LIST-NEW-HOVER]
        │   ├── SearchInput [LIST-DEFAULT]
        │   └── FilterButton [LIST-DEFAULT]
        ├── TagFillQuestionTable [LIST-DEFAULT]
        │   └── TagFillQuestionRowActions [LIST-ROW-HOVER partial]
        └── Pagination [LIST-DEFAULT]

TagFillQuestionCreatePage [CREATE-DEFAULT]
├── SharedPerformancePageHeader [candidate; exact SVG blocked]
│   ├── BackAction
│   └── ModeTitle [create title observed]
├── TagFillQuestionForm
│   ├── LanguageAndLocaleBar
│   ├── BasicInfoSection
│   │   ├── NameInput
│   │   └── DescriptionTextarea
│   ├── TagItemsSection
│   │   └── TagItemEditor × N [default N and add behavior blocked]
│   │       ├── TagNameInput
│   │       ├── TagDescriptionTextarea
│   │       └── TagPromptTextarea
│   └── RemarkTextarea
└── SharedPerformanceActionBar [candidate]
    ├── SubmitButton
    ├── PreviewButton
    └── CancelButton

TagFillQuestionEditPage [EDIT-DEFAULT partial]
└── TagFillQuestionForm (same tree candidate; title `价值观`, name/description/tag values prefilled)
```

## 3. Layout skeleton

| 维度 | 采集值 | source_state_ids |
|---|---|---|
| 页面框架 | header、侧栏、内容区、列表卡片 | `LIST-DEFAULT` |
| 列表内容区 | 列表卡片约 `x=260,y=118,width=1640,height=942` | `LIST-DEFAULT` |
| 新建页面 | 独立页面，非居中 dialog；主体 `x=584,y=64,width=752` | `CREATE-DEFAULT` |
| 新建 Header | `x=0,y=0,width=1920,height=56`；返回+标题 | `CREATE-DEFAULT` |
| 新建主体 | 主表单根 `x=584,y=64,width=752,height=719.333374` | `CREATE-DEFAULT` |
| 标签区域 | 标签区根约 `x=584,y=311.333343,width=752,height=352.666687` | `CREATE-DEFAULT` |
| Footer | 操作区约 `x=584,y=767.333374,width=752,height=64` | `CREATE-DEFAULT` |
| 滚动 | root overflow x/y auto；具体滚动状态未采集 | `CREATE-DEFAULT` |
| 响应式 | 仅有 1920×1080/DPR1 | `CREATE-DEFAULT` |

## 3.1 Container edge constraints

| component_id | state | container bbox | first visible child | terminal visible child | inset | ownership | evidence |
|---|---|---|---|---|---|---|---|
| `TagFillQuestionForm` | `CREATE-DEFAULT` | `x=584,y=64,w=752,h=719.333374` | 中文/更多/多语言配置区域 | 备注区域 | `BLOCKED`，需同状态 bbox 派生 | parent | `target_contract.json` |
| `TagItemsSection` | `CREATE-DEFAULT` | `x=584,y=311.333343,w=752,h=352.666687` | 标签名称 | 添加标签 | `BLOCKED` | parent | `layout.json` |
| `SharedPerformanceActionBar` | `CREATE-DEFAULT` | `x=584,y=767.333374,w=752,h=64` | 提交 | 取消 | `BLOCKED` | parent | `layout.json` |
| `TagFillQuestionListCard` | `LIST-DEFAULT` | `BLOCKED` | 新建 | 分页 | `BLOCKED` | parent | `initial/layout.json` |

## 4. Component contracts

| component_id | 层级 | 职责 | props | emits/v-model | required states | source_state_ids |
|---|---|---|---|---|---|---|
| `PerformanceAssessmentNavigation` | 基础/业务 | 父菜单与子项状态 | `expanded`, `selected` | `toggle`, `navigate` | default/hover/expanded/collapsed/selected | `NAV-*` blocked |
| `PerformanceListToolbar` | 基础 | 列表工具栏 | `search`, `actions` | search/filter/create | default/hover/focus | `LIST-DEFAULT`, PM-T006 baseline |
| `TagFillQuestionTable` | 业务 | 标签题列表 | `items`, `loading`, `page`, `pageSize`, `total` | edit/remove/page-change | default/empty/loading/row-hover | `LIST-DEFAULT`, `EDIT-BUTTON-HOVER` |
| `TagFillQuestionForm` | 业务 | 新建/编辑主体表单 | `mode=create|edit`, `modelValue` | `update:modelValue`, `submit`, `preview`, `cancel`, `back` | create/edit/validation | `CREATE-DEFAULT`, `EDIT-DEFAULT` |
| `SharedPerformancePageHeader` | 基础/业务 | 返回和标题 | `title`, `mode` | `back` | default/hover/focus | `CREATE-DEFAULT` |
| `TagItemEditor` | 业务 | 单个标签配置 | `modelValue`, `index` | update/remove | default/focus/error/add | `CREATE-DEFAULT`, add blocked |
| `SharedPerformanceActionBar` | 基础 | 底部操作 | `loading`, `disabled` | submit/preview/cancel | default/hover/focus/disabled | `CREATE-DEFAULT` |

新建和编辑当前均有稳定 after 结构证据，可以将 `TagFillQuestionForm(mode=create|edit)` 作为高可信共享候选；但完整 DOM ownership、Footer 差异和字段可编辑性仍待补采确认。

## 5. Field inventory

| field | label | placeholder | required | limit | control | order | source_state_ids |
|---|---|---|---:|---:|---|---:|---|
| `language` | 中文 | — | BLOCKED | BLOCKED | language/locale bar | 1 | `CREATE-DEFAULT` |
| `name` | 名称 | `请输入名称` | yes（视觉星号） | 500 | single-line input | 2 | `CREATE-DEFAULT`、validation |
| `description` | 描述 | `请输入描述` | no | 20000（视觉 counter） | textarea | 3 | `CREATE-DEFAULT`、validation |
| `tags[].name` | 名称 | `请输入标签名称` | yes（视觉星号） | 100 | single-line input | 4 | `CREATE-DEFAULT`、validation |
| `tags[].description` | 说明 | `请输入标签说明（选填）` | no | 20000（视觉 counter） | textarea | 5 | `CREATE-DEFAULT`、validation |
| `tags[].prompt` | 提示 | `请输入提示（选填）` | no | 20000（视觉 counter） | textarea | 6 | `CREATE-DEFAULT`、validation |
| `remark` | 备注 | `填写帮助管理员理解此问题的内容，备注仅展示在飞书绩效管理后台` | no | 2000 | textarea | 7 | `CREATE-DEFAULT`、validation |

`required` 和 `limit` 对部分字段来自视觉/validation 证据的组合；如果后端契约与页面证据冲突，必须停止定稿并记录冲突。

## 6. Option enumerations

| field | 完整选项与顺序 | default | disabled rules | source_state_ids |
|---|---|---|---|---|
| 语言/多语言 | 中文；更多；多语言配置的交互选项未完整展开 | 中文可见 | BLOCKED | `CREATE-DEFAULT` |
| 标签项 | 页面存在“添加标签”；初始标签数量和新增后的字段行为未确认 | BLOCKED | BLOCKED | `CREATE-DEFAULT` |

## 7. State machines

| component | current | event | guard | next | visible/layout change | source_state_ids |
|---|---|---|---|---|---|---|
| `PerformanceAssessmentNavigation` | collapsed | click parent | safe | expanded | 子菜单出现、图标变化 | `NAV-*` blocked |
| `PerformanceAssessmentNavigation` | expanded | click parent | safe | collapsed | 子菜单消失、图标变化 | `NAV-*` blocked |
| `TagFillQuestionManagement` | list | click 新建 | safe | create | 路由进入 `/create` | `LIST-NEW-HOVER`, `CREATE-DEFAULT` partial |
| `TagFillQuestionForm` | create | focus 描述/备注 | safe | focused | textarea 蓝色 focus border | `FORM-DESCRIPTION-FOCUS`, `FORM-REMARK-FOCUS` |
| `TagItemEditor` | one tag | click 添加标签 | safe | two tags | 标签编辑区新增一组字段并自然增高 | `FORM-TAG-ADDED` |
| `TagFillQuestionForm` | empty | click 预览 | safe, no write | preview-validation-error | 名称和标签名称出现“名称为必填”，中文区域出现错误图标 | `FORM-PREVIEW-VALIDATION` |
| `TagFillQuestionForm` | create | drag 备注文本域右下角 | safe | remark-resized | 高度从`49.33px`变为`126px`，宽度保持`752px` | `REMARK-RESIZE-AFTER` |
| `TagFillQuestionManagement` | list | click 编辑 | safe | edit | 路由进入 `.../7173973572648894465?from`，题目名称/描述/标签值回填 | `EDIT-BUTTON-HOVER`, `EDIT-DEFAULT` |
| `TagFillQuestionForm` | create/edit | submit | dangerous/write | success or validation | 未采集、不得默认实现 | BLOCKED |

## 8. Visual state matrix

| component | state | bbox | typography | color/background | border/radius/shadow | opacity/cursor | source_state_ids |
|---|---|---|---|---|---|---|---|
| `NewButton` | default/hover | default `280,138,80,32`; hover style not isolated | BLOCKED | default bg `rgb(51,112,255)`, text white | BLOCKED | cursor pointer | `LIST-NEW-HOVER` |
| `TagFillQuestionForm` | create-default | `584,64,752,719.333374` | BLOCKED | white page background observed | BLOCKED | BLOCKED | `CREATE-DEFAULT` |
| `TagItemsSection` | default | `584,311.333343,752,352.666687` | BLOCKED | light gray section background observed | BLOCKED | BLOCKED | `CREATE-DEFAULT` |
| `ActionBar` | default | `584,767.333374,752,64` | BLOCKED | primary submit blue observed | BLOCKED | pointer | `CREATE-DEFAULT`, `EDIT-DEFAULT` |
| `TagFillQuestionEditPage` | edit-default | Header 标题为`价值观`；名称回填`价值观`；描述 counter `47/20000`；标签名称回填`价值观测评语` | 与新建页主体几何一致性已观察，完整 ownership 待对照 | BLOCKED | `EDIT-DEFAULT` |
| `NavigationTagItem` | selected | BLOCKED | BLOCKED | selected blue background/left rail described but exact state not mapped | BLOCKED | pointer | `NAV-*` blocked |
| `TagFillQuestionRowActions` | hover | 编辑按钮 bbox `x=1638.47,y=246.33,w=28,h=22`，蓝色文字 `rgb(36,91,219)` | 透明背景，无边框 | cursor pointer | `EDIT-BUTTON-HOVER` |
| `DescriptionTextarea` | focus | `x=580,y=265,w=752,h=49` | BLOCKED | border `rgb(20,86,240)` | BLOCKED | text cursor | `FORM-DESCRIPTION-FOCUS` |
| `RemarkTextarea` | focus | `x=584,y=714,w=752,h=49.33` | BLOCKED | border `rgb(20,86,240)` | BLOCKED | text cursor | `FORM-REMARK-FOCUS` |
| `TagItemsSection` | two-tags | 页面纵向滚动；第二组标签字段出现 | BLOCKED | 浅灰标签卡片重复 | BLOCKED | pointer | `FORM-TAG-ADDED` |
| `FormValidation` | preview-validation-error | 页面纵向滚动；错误区域增加 | BLOCKED | 红色边框/文字；名称为必填 | BLOCKED | pointer | `FORM-PREVIEW-VALIDATION` |
| `RemarkTextarea` | after-drag | `x=584,y=713.98,w=752,h=126` | 14px/22px | border `rgb(20,86,240)` | native vertical resize | text cursor | `REMARK-RESIZE-AFTER` |

## 9. SVG and icons

| component | purpose | viewBox | size | path | fill/stroke | hit area | states | source_state_ids |
|---|---|---|---|---|---|---|---|---|
| `NewButtonIcon` | 新建 | `0 0 24 24` | SVG bbox约 `14×14` | `M12 2a1 1 0 0 0-1 1v8H3a1 1 0 1 0 0 2h8v8a1 1 0 0 0 2 0v-8h8a1 1 0 0 0 0-2h-8V3a1 1 0 0 0-1-1Z` | `currentColor` | button `80×32` | default/hover | `LIST-NEW-HOVER` |
| `NavigationAssessmentIcon` | 评估题管理 | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | default/hover | `NAV-*` |
| `NavigationExpandCollapseIcon` | 展开/收起 | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | expanded/collapsed | `NAV-*` |
| `PageHeaderBackIcon` | 返回 | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | default/hover | `CREATE-DEFAULT` |
| `EditIcon` | 编辑 | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | row-hover | `EDIT-BUTTON-HOVER` |

## 10. Invariants

1. 页面字段、列、选项和文案只能取自本目录证据；未确认项保持 `BLOCKED`。
2. 新建页面已确认是独立路由页面，不得按弹窗实现。
3. 列表基础结构可候选复用 PM-T006，但列名、列宽、标题和间距必须由 `LIST-DEFAULT` 单独确认。
4. 新建与编辑必须在补齐编辑证据后才能确认共享表单组件。
5. `completion_status` 和 `pixel_restore_status` 必须与 `capture-manifest.md`、`capture-completion-checklist.md`、`extracted-ui-contract.json` 和 `acceptance-contract.md` 一致。
