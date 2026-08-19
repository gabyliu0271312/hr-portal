# PM-T004 流程设置交互说明

## Result reconsideration shared executor configuration (PM-T004-T02-F34)

- `result_reconsideration` uses the shared multi-role executor configuration component; existing executor nodes retain their current component props and legacy fields.
- The default configuration contains only `HRBP`. At least one role must remain selected.
- Roles are `REAL_LINE_MANAGER`, `HRBP`, `DEPARTMENT_HEAD`, and `SPECIFIED_PERSON`. Real-line levels are `DIRECT_MANAGER` and `LEVEL_1_MANAGER`; department levels are `CURRENT_DEPARTMENT`, `PARENT_DEPARTMENT`, and `LEVEL_1_DEPARTMENT`.
- Specified people are persisted by `employee_no` and rendered by `display_name`. The search/source API is reserved for the roster integration task and is not implemented here.
- The template stores rules only. Ordinary manager, HRBP, and department resolution is performed later from the cycle roster/snapshot; this task does not generate runtime tasks or alter cycle snapshots.
- Implemented-state evidence: `../../ui-blueprints/PM-T004-T02-F34-implemented-result-reconsideration-executors.png`.

状态：`pending visual confirmation`。本页只覆盖流程设置，以及上一步/下一步按钮。

## 已确认范围

- 路由：`/performance/settings/templates/create?step=workflow`；编辑已有模板时携带 `template_id`。
- 默认角色：绩效管理员；仍需服务端权限校验。
- 节点名称和顺序以附件为准：项目启动、评估型环节、绩效结果查看环节、项目结束；可新增工作总结环节、360°邀请环节、360°确认环节、校准环节、结果沟通环节。绩效结果查看环节是流程内置节点，不出现在加号弹层可新增列表。
- 点击节点显示右侧配置；点击加号打开节点类型选择；新增节点后自动选中；可删除业务节点，系统起止节点不可删除。
- 新增节点类型“结果复议处理”使用 `result_reconsideration`。它只出现在“绩效结果查看环节”后的加号弹层中，且该弹层只显示这一项；添加后相关连接器保留连线但不显示加号，删除后恢复。其他加号不得展示或插入该节点。
- “可添加环节”弹层固定宽度 `313px`，高度由当前可选项数量自然撑开；动态隐藏已添加节点后不得保留原多选项高度。“结果复议处理”的单项专属弹层遵循同一规则，最后一个 StageCard 不保留 `8px` 底间距。
- 弹层通过定位层跟随当前加号：主体左边缘固定在加号右边缘 `10px` 处。左侧使用目标原始 `8×16px` SVG 箭头，箭头只有两个离散位置：中心距弹层顶部 `16px`，或中心距弹层底部 `16px`；下方空间可容纳弹层时使用顶部箭头，下方不足时切换为底部箭头，禁止在二者之间连续移动。箭头中心始终指向加号中心，弹层在空间不足时通过限制高度和内部滚动避让流程画布可视边界；动态高度、画布/窗口滚动和窗口尺寸变化后必须重新计算，禁止固定 `top/left`。
- 上一步和下一步必须存在；下一步保存成功后进入内容设置，上一步保存草稿后返回基本信息。
- 保存走真实接口，不带版本号；接口失败保留输入并允许重试。
- 已被周期使用时，锁定流程和数据写入相关字段，仅开放参考/提示内容；周期数量由接口返回。
- Header 是模板创建/编辑向导的共享组件；流程设置页仅传入当前步骤状态。Header 高度为 `56px`，左侧区域为 `x=16,width=209px`；步骤导航独立水平居中（目标范围 `x=459~821px`）；右侧按钮组固定右对齐，距右侧 `20px`，上一步与下一步均为 `80×32px`，两按钮间距 `12px`（目标位置分别为 `x=1088` 与 `x=1180`）。下一步使用填充色 `#245BDB`，上一步使用 `#EFF0F1` 填充与 `#D0D3D6` 边框；步骤文案根据当前步骤分别使用当前、已完成、未到达三种颜色状态。窄屏时保持 Head 不横向溢出，内容区独立纵向滚动。
- 右侧选中节点面板顶部使用公共标准标题组件：内容宽度约 `319px`、高度 `48px`、`padding:12px 20px`、系统字体 `16px/600/24px`、文字颜色 `rgba(0,0,0,.65)`，底部边框 `0.666667px solid rgba(31,35,41,.15)`。标题显示节点类型的标准名称（例如 `评估型环节`），不读取用户在“环节名称”输入框中修改后的自定义名称；编辑框仍保留用户自定义名称。
- 右侧面板外层宽度保持 `320px`；面板滚动条不得挤占内部内容宽度，内部内容区域应保持约 `319.3333px`，同时保留滚动能力。
- 右侧标准标题栏与表单滚动区域同级：面板外层使用 `overflow:hidden`，标题栏保持静态 `48px` 高度；仅表单区域使用 `overflow:auto`，右侧表单向下滚动时标题栏不移动。

## 已确认提示条参数

已有周期时使用 `Div.flex` SnapSpec：`1200×40px`、`padding:0 16px`、背景 `#E1EAFF`、正文 `#1F2329`、链接 `#1890FF`、系统字体 14/22、信息/关闭 SVG 均为 `16×16px`。详见蓝图第 6.1 节。

## 像素测量依据

详见 [`ui-blueprints/PM-T004-template-flow-settings.md`](../../ui-blueprints/PM-T004-template-flow-settings.md)。该文件定义 CSS px/device px 坐标、节点矩形、header、画布和右面板边界。

## 未确认项

流程节点 `StageCard` 的 280×38 参数究竟用于画布节点还是加号菜单项、流程 SVG path、连接线/加号几何、加号菜单布局，以及保存接口最终合同仍未确认；在确认前不得猜测或进入正式 UI 编码。
## Component reuse decision (PM-T004-T02-F15)

- The workflow node name and description fields are shared across node types and are implemented by `WorkflowNodeBasicFields.vue` within the performance domain.
- The compact 28x16 boolean control is implemented by `PerformanceSwitch.vue` and reused by the template basic-information calculation setting and the workflow final-result setting.
- Node-specific executor, evaluation-type, and final-result rules remain in the workflow configuration view; no new API field or persistence enum is introduced by this refactor.
- Fixed evaluation defaults are executor-specific: `被评估人` and `实线上级` normalize to `SINGLE`, while `360°评估人` normalizes to `MULTI`; all three disable both evaluation choices. `被评估人` and `360°评估人` additionally force `include_final_result` off, disable its switch, and expose the captured restriction popover. `实线上级` keeps that switch editable; when enabled, the 263px helper text reads `设置了最终绩效结果的环节必须在评估内容中添加评估型问题`. Switching to an executor without a confirmed fixed rule restores the current single/off editable defaults.
- `虚线上级` keeps evaluation type editable but forces `include_final_result` off and disables that switch. Hovering or focusing its switch wrapper reuses the same measured restriction popover with `执行人为虚线上级时无法开启此功能。`.

## Executor selector restoration (PM-T004-T02-F16)

- The executor field uses a custom combobox matching the captured `ud__select__selector` structure rather than a native `<select>`.
- Normal state is `263.333px x 32px` with `padding: 1px 11px`, `border-radius: 6px`, and `#D0D3D6` border; open/focus state uses the captured blue border.
- The selected item and search layer are both `220px x 28px`; the arrow area is `12px x 28px` with `8px` left margin and the captured `DownBoldOutlined` path.

## Real-line manager checkbox restoration (PM-T004-T02-F26)

- The `实线上级` executor displays four manager-level options in a `263.333px x 136px` panel placed `8px` below the executor selector. The panel uses `12px` padding, an `#F8F9FA` background, and a `6px` radius.
- Each option row is `22px` high with an `8px` row gap. The custom checkbox is `16px x 16px`, vertically centered in the row, with an `8px` control-to-label gap.
- Unchecked controls use a white background, a `0.666667px solid #8F959E` border, and a `4px` radius. Checked controls use `#0442D2`, a transparent border, and the captured centered `12px x 12px` white check SVG.
- Existing `executor_types` array binding and locked-field behavior remain unchanged; this task introduces no DTO, persistence, permission, or executor-rule change.

## 360° invitation executor configuration (PM-T004-T02-F27)

- The section is rendered only when the selected evaluation node executor is `360°评估人`. Its shared compact switch defaults off. Turning it on reveals `全部执行人` and `部分执行人`, defaulting to `全部执行人`.
- `部分执行人` candidates are the deduplicated first-level `executor_label` values of other evaluation nodes. The current node is always excluded; another 360° node remains eligible. Deleting a source node or changing its executor automatically removes stale selections.
- Invitation state belongs to the current node. Turning the switch off or temporarily changing that node to another executor preserves its values and restores them when returning to `360°评估人`; newly created nodes always use the fresh off/`ALL`/empty defaults.
- Empty-partial validation is evaluated across all 360° nodes. A single invalid node blocks next; when every 360° node is invalid, only the first reports `请选择允许邀请的执行人角色`. If any 360° node is off, uses all executors, or has a selected partial role, another partial node may remain empty.
- The inline validation text uses `#F54A45`, system font `14px/400/22.001px`, aligns with the role selector, and begins `1.333px` below it. The selector keeps its normal `#D0D3D6` border. The error-state panel is `263.333×156px`.
- Persistence uses `allow_invite_other_executors`, `invite_executor_scope`, and `invite_executor_types` in `GET/PATCH /performance/templates/{template_id}/workflow`. The backend canonicalizes candidates and validation and writes an immutable workflow audit event in the same transaction.
- Implemented-state evidence: [`PM-T004-T02-F27-implemented-360-invite-executors.png`](../../ui-blueprints/PM-T004-T02-F27-implemented-360-invite-executors.png). The screenshot was captured from the rebuilt local production container at the workflow route with the 360° executor, enabled switch, and partial scope visible.

## Empty partial-invitation candidate behavior (PM-T004-T02-F28)

- When `部分执行人` has no candidate roles, the selector remains enabled and may receive focus. It is not replaced by a disabled field and no empty-state copy is introduced.
- Clicking the empty selector may retain its internal open state, but must not mount a listbox, dropdown shell, option row, or “暂无数据” popover. Since no popup exists, `aria-expanded` is omitted and the control retains the normal `#D0D3D6` border.
- When candidates later become available, the existing dropdown, blue open border, positioning, role selection, and removable-tag behavior continue unchanged.
- This rule is presentation-only. Candidate derivation, cross-node validation, persisted invitation fields, and API behavior remain those defined by PM-T004-T02-F27.
- Implemented-state evidence: [`PM-T004-T02-F28-implemented-empty-candidate-no-popup.png`](../../ui-blueprints/PM-T004-T02-F28-implemented-empty-candidate-no-popup.png). The production-container capture shows the empty selector after click with no dropdown or empty-state overlay.

## Result-communication executor reuse (PM-T004-T02-F29)

- Result-communication nodes reuse `PerformanceExecutorSelect` and the real-line manager checkbox panel already used by evaluation nodes. No second executor selector or checkbox implementation is introduced.
- Their primary executor list is intentionally limited to `实线上级` and `虚线上级`. A new result-communication node defaults to `实线上级` with `直属上级` selected.
- The shared dropdown width continues to follow the `263.333px` selector. Its height is content-driven rather than fixed: short lists end after the rendered options, while longer lists are capped at `165.333px` and become scrollable.
- Selecting `实线上级` exposes the same four manager levels and preserves that node's checked levels while temporarily switching to `虚线上级`; selecting `虚线上级` hides the level panel.
- Evaluation-only controls remain absent: result-communication nodes do not render evaluation type, 360° invitation configuration, or the final-result switch.
- Legacy result-communication values outside the supported two-option set are normalized to the real-line default during workflow hydration and serialization. The existing workflow payload fields are reused, with no DTO, migration, permission, or API-path change.
- Implemented-state evidence: [`PM-T004-T02-F29-implemented-result-communication-executor.png`](../../ui-blueprints/PM-T004-T02-F29-implemented-result-communication-executor.png). The rebuilt production-container capture shows the result-communication panel and the open executor dropdown containing exactly the two allowed options.

## Work-summary fixed executor reuse (PM-T004-T02-F30)

- Work-summary nodes display a required `环节执行人` field with a non-editable neutral tag whose canonical executor is `{ type: 'SUBJECT', label: '被评估人' }`; no combobox or dropdown is rendered.
- Executor codes and labels live in `performanceExecutorOptions.ts`. The evaluation-node selector and work-summary fixed field consume the same subject definition so future backend mapping does not depend on duplicated display strings.
- Presentation is split into reusable layers: `PerformanceExecutorTag.vue` renders an executor token and exposes its stable type through `data-executor-type`; `WorkflowFixedExecutorField.vue` composes the label, required mark, and tag and accepts alternate labels/required states for later fixed-executor nodes.
- New work-summary nodes and loaded/saved legacy work-summary nodes normalize to `executor_label='被评估人'` and `executor_types=['SUBJECT']` using existing workflow fields. No DTO or endpoint is added.
- Measured runtime geometry is `271×54px` for the field, `70×22px` for the title, and `68×24px` for the tag. The tag uses `rgba(31,35,41,.1)`, a `4px` radius, `6px` horizontal padding, and system `14px/22px` typography.
- Implemented-state evidence: [`PM-T004-T02-F30-implemented-work-summary-executor.png`](../../ui-blueprints/PM-T004-T02-F30-implemented-work-summary-executor.png).

## 360-invitation fixed executor and previous-node setting (PM-T004-T02-F31)

- `reviewer_360_invite` consumes the same canonical `{ type: 'SUBJECT', label: '被评估人' }`, `WorkflowFixedExecutorField.vue`, and `PerformanceExecutorTag.vue` used by work-summary nodes. No invitation-specific executor tag or label mapping is allowed.
- When the invitation node has an immediately preceding business node, render “设置执行人需完成上一环节任务” with a default-off shared switch. When it is the first business node, the complete setting row is absent and serialization normalizes the value to `false`.
- `PerformanceSwitchSettingRow.vue` owns the semibold label, optional information anchor, and shared `PerformanceSwitch.vue`. `PerformanceInfoPopover.vue` owns the reusable InfoOutlined icon, hover/focus delay, collision-aware fixed positioning, Teleport, border/shadow, and arrow. The existing “允许邀请其他评估环节执行人” row must migrate to the same components instead of retaining page-local tooltip code.
- The row is `263.333×22px`; the label is `196×22px` at system `14px/600/22.001px`; the `16px` info icon follows after `4px`; the `28×16px` switch follows after `8px`. The new tooltip text is `上一环节的执行人完成环节任务后，当前环节的执行人才可以完成此任务`.
- Tooltip runtime measurements: about `124ms` open delay, `420×69.333px`, preferred top placement, about `10px` anchor gap, `16px` viewport collision margin, and the captured `16×8px` bottom arrow aligned to the information-icon center.
- Persistence adds `require_previous_node_completion: boolean` to the existing workflow GET/PATCH JSONB contract. It defaults to `false`; only a non-first `reviewer_360_invite` node may retain `true`. No database migration or endpoint is introduced.
- This task does not claim runtime enforcement. Cycle workflow snapshots, task generation/status, and task-entry blocking remain a separate later task.
- Implemented-state evidence: [`PM-T004-T02-F31-implemented-360-invite-prerequisite.png`](../../ui-blueprints/PM-T004-T02-F31-implemented-360-invite-prerequisite.png). Because the local production preview redirects unauthenticated access to login, this artifact is an isolated visual render of the implemented component state; executable component tests provide the DOM, interaction, and persistence evidence.

## 360-confirmation shared executor field (PM-T004-T02-F32)

- `reviewer_360_confirm` uses the same `WorkflowExecutorField.vue` as result-communication and evaluation nodes. The shared component owns the required label, `PerformanceExecutorSelect`, and the real-line manager checkbox panel; node-specific views only configure its option sets and locked state.
- Its primary executor options are exactly `实线上级` and `虚线上级`, matching result communication. New and unsupported loaded values normalize to `实线上级` with `直属上级` selected.
- When `实线上级` is selected, 360-confirmation exposes exactly `直属上级`, `隔 1 级上级`, and `隔 2 级上级`. It never renders or persists `隔 3 级上级及以上`; duplicate and unsupported level codes are removed by frontend hydration/serialization and backend normalization.
- Selecting `虚线上级` hides the manager-level panel while retaining valid node-scoped level values for a later switch back. Evaluation-only controls remain absent.
- Persistence reuses `executor_label` and `executor_types` in the existing workflow GET/PATCH JSONB contract. No DTO field, migration, permission, API route, runtime task behavior, or external-system integration is added.
- Acceptance evidence: focused Vitest covers shared-component rendering and both node integrations; backend pytest covers canonical save/read values; `vue-tsc --noEmit` and the production build verify compilation. Independent implemented-state PNG: [`PM-T004-T02-F32-implemented-360-confirmation-executor.png`](../../ui-blueprints/PM-T004-T02-F32-implemented-360-confirmation-executor.png). The authenticated route remains login-guarded, so the PNG is an isolated render of the implemented component state and executable tests remain the interaction/persistence authority.

## Calibration fixed executor placeholder (PM-T004-T02-F33)

- `calibration` reuses `WorkflowFixedExecutorField.vue`, the same shared fixed-executor composition used by work-summary and 360-invitation nodes. It renders a required `环节执行人` field with the neutral tag `在项目配置时指定`; no selector or manager-level panel is shown.
- The template API reserves the stable executor pair `{ type: 'PROJECT_CONFIGURED', label: '在项目配置时指定' }` in the existing `executor_types` / `executor_label` fields. New nodes, legacy loaded values, and saved payloads normalize to this pair.
- This is a template-level placeholder only. Actual calibrator selection belongs to the later project-configuration API and runtime calibration task flow; this task does not implement that selection or task assignment.
- Acceptance evidence: focused Vitest covers new and hydrated calibration nodes; backend pytest covers canonical API normalization; `vue-tsc --noEmit`, production build, Docker replacement, and isolated implemented-state PNG verify the contract.

## Calibration reason setting (PM-T004-T02-F35)

- Only `calibration` nodes render this section. It follows the fixed executor field and reuses `PerformanceSwitchSettingRow.vue` / `PerformanceSwitch.vue` for the semibold “填写调整原因” label and compact switch.
- New calibration nodes default the switch on with shared active color `#1456F0`. The `271px`-wide helper text “在校准时调整评分或评级结果，需填写原因” uses system `14px/400/20px`, `#646A73`, and a `4px` top gap.
- When enabled, the section renders the shared `PerformanceCheckbox.vue` with an `8px` top gap. Its checkbox-only `label` is the first child and the independent “必填” text span is the immediately following sibling, fixed `8px` to the right; the control is `16×16px` with a `4px` radius and `#8F959E` unchecked border. `WorkflowExecutorField.vue` consumes the same checkbox component for manager-level options.
- Turning the reason switch off hides the checkbox and clears `calibration_reason_required`; turning it back on restores the canonical unchecked state. Locked workflow fields disable both controls through the existing lock rule.
- The existing workflow GET/PATCH JSONB contract adds `calibration_reason_enabled` and `calibration_reason_required`. Only calibration nodes may retain these flags; disabled and non-calibration nodes normalize required to `false`. No database migration, endpoint, permission, UCP, external-system, or runtime-calibration behavior is introduced.

## Result-reconsideration appeal prompt (PM-T004-T02-F36)

- Only `result_reconsideration` nodes render “发起复议提示” after the shared executor field. The helper copy is “此提示内容将在被评估人填写复议理由时展示”; the full-width `263.333×32px` edit button uses the captured `14×14px` edit icon.
- The editor is a `600px` modal titled “发起复议提示”, naturally `352px` high at the captured full viewport and capped to the viewport with a scrollable body. It contains required “提示文案” and “填写说明” fields with a measured `20px` form-item gap.
- Both fields reuse `PerformanceCountedTextarea.vue`: initial `552×49.333px`, `min-height:49.333px`, vertical-only resizing, `overflow:auto`, system `14px/22px`, `6px` radius, normal `#D0D3D6` border and focused `#1456F0` border. Each count suffix stays inside its own textarea at `right:9px; bottom:9px`, uses `#EFF0F1`, and follows vertical resizing.
- New and legacy result-reconsideration nodes default `appeal_prompt_content` to “如果你不认可本次绩效结果，请详细说明复议原因并提供事实依据” with `current/1500`, and `appeal_reason_instruction` to “请输入复议理由” with `current/1000`. Save commits both trimmed drafts; Cancel, mask click, and Close discard both. Empty save restores their defaults.
- The existing workflow GET/PATCH JSONB adds `appeal_prompt_content` and `appeal_reason_instruction`; no migration or endpoint is added. Both remain editable when a template is already used, consistent with `editable_scope.reference_and_prompt_content=true`.
- Blueprint: [`PM-T004-T02-F36-appeal-prompt.html`](../../ui-blueprints/PM-T004-T02-F36-appeal-prompt.html). Implemented-state evidence: [`PM-T004-T02-F36-implemented-appeal-prompt.png`](../../ui-blueprints/PM-T004-T02-F36-implemented-appeal-prompt.png).
- Follow-up measured V2 blueprint/evidence: [`PM-T004-T02-F36-appeal-prompt-v2.html`](../../ui-blueprints/PM-T004-T02-F36-appeal-prompt-v2.html) and [`PM-T004-T02-F36-implemented-appeal-prompt-v2.png`](../../ui-blueprints/PM-T004-T02-F36-implemented-appeal-prompt-v2.png).
- Follow-up preview correction: the setting uses a `20px` top gap from the executor field, a title/helper visual gap of `0px` through the measured `8px` row gap plus `-8px` helper margin, and a right-aligned `36×22px` “预览” button (`top:-2px`, `right:0`, `#3370FF`). Hover opens a Teleport-to-body preview after `118ms`; pointer leave hides it immediately. The preview now matches the captured composition: an inner `600×333.601px` modal wrapped by `zoom:70%` (outer result about `420×234px`), with an `absolute; inset:0; z-index:10` non-interactive overlay over the modal. The modal uses measured header/body/footer sections, a `552×39.9702px` blue information notice (`#F0F4FF`, `16px` info icon, `9px 0 9px 16px` padding), followed by the measured `552.024×97.9048px` read-only preview textarea (`请输入复议理由`, `4px 11px` padding, `0.952381px #D0D3D6` border, `6px` radius, `resize:vertical`, `overflow:auto`) and 80×32px action buttons. The outer preview remains right-aligned to the button, clamped to `16px` viewport padding, with `8px` radius, `#DEE0E3` border and the captured three-layer shadow. Its notification description derives labels from the shared `executor_config`; configured prompt content is shown in the notice.
- Implemented-state preview evidence: [`PM-T004-T02-F36-implemented-appeal-preview.png`](../../ui-blueprints/PM-T004-T02-F36-implemented-appeal-preview.png).

## Result-view subject confirmation (PM-T004-T02-F37)

- `result_view` reuses the same canonical `{ type: 'SUBJECT', label: '被评估人' }`, `WorkflowFixedExecutorField.vue`, and `PerformanceExecutorTag.vue` as work-summary nodes. The field remains required and non-editable.
- Directly below the executor field, render `PerformanceSwitchSettingRow.vue` with label `需要被评估人确认绩效结果`; its shared `PerformanceSwitch.vue` defaults off and uses the captured `8px` label-to-switch gap.
- The existing workflow field `subject_confirm_required: boolean` is the sole persistence contract. It defaults to `false`, may retain `true` only for `result_view`, and is normalized to `false` for every other node type.
- Existing GET/PATCH workflow JSONB is reused. No route, database migration, permission, UCP, external-system, cycle snapshot, or runtime confirmation-task behavior is introduced.
