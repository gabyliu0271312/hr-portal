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

## 360°邀请填写内容操作入口修复（PM-T004-T05-F02，2026-10-21）

- 用户确认 `D:/乐逗/Desktop/360°邀请环节.txt` 中的唯一加号按钮为“添加提示”，复用已有功能即可。
- 仅当 `node_type=reviewer_360_invite` 且当前为 `fill / 配置填写内容` 时，空内容操作栏和已有内容底栏仅显示“添加提示”。复用 `PerformanceTemplateOperateBar.vue` 单 action，保持54px高度与全宽居中操作项，不渲染第二个操作项或分隔线。
- 点击沿用 `handleContentAction('add-prompt')` 打开 `PerformancePromptModal.vue`；复用原有字段、必填校验、确定和取消行为，不打开“选择评估内容”抽屉。
- 参考Tab、360°确认、执行人为360°评估人的 evaluation 及其他节点保持原行为；保留已有内容，不修改内容类型规则、GET/PATCH、JSONB、权限、周期快照或数据库迁移。
- 本次仅修复操作入口。既有 `handlePromptSave` 只关闭弹窗，尚未持久化提示；本次不扩展提示存储契约，不宣称提示保存落库或重开回显。
- 验证：页面定向 Vitest 27/27通过；覆盖空/已有内容的单按钮、提示必填校验、确认事件与关闭、取消、邀请参考入口及其他360节点回归。`npm --prefix hr-portal/frontend run build`（vue-tsc+vite）通过，存在VueUse PURE注释及大chunk告警。扩展三文件回归67/68，共享抽屉另一组未提交改动的源码断言失败，本任务未修改其文件；向导有既有jsdom XHR日志。已隔离Docker构建并仅替换本地frontend容器；本次使用采集实测公共内容宽度 `792px`、Tab外层 `800px`、标题hover `2px solid #3370FF`、内容块hover `1px dashed #3370FF`及公共选中 `inset 0 0 0 2px #3370FF`。运行镜像 `sha256:35b6176249016bbfea73cfa4a9dca2817f3f404b0c66aed1841d78d0acd30b38`，running/restarts=0，网络 `hr-portal_default`，页面HTTP200；运行CSS已核验公共宽度与邀请选中态样式。后端、数据库、Gotenberg容器未替换。未执行浏览器截图或真实保存重开验收，非生产部署。
- 采集的邀请预览主体固定为 `792×408px`：白底、圆角4px、内边距上24px/左右24px；内容区不可操作（`pointer-events:none`），外层悬浮显示 `1px dashed #3370FF` 边框。预览依次展示标题“通过「搜索」添加 360° 评估人”、说明“已邀请 0 人，除系统默认邀请外，仍需邀请至少 5 人。上级和 HRBP 也可以给员工邀请 360° 评估人。”、32px搜索占位框“搜索成员”、列表标题“已邀请列表：当前共 0 人”、默认选中的“按关系”/“按邀请人”分组，以及四行空表格“相同上级同事/不同上级同事/虚线上级/直属下级”。表格左列约109px、每行52px、右侧为空。这里是模板预览，不接搜索、邀请人员、列表加载或邀请规则接口。
- 预览标题栏为58px高、下方12px间距；底部操作区使用 `sticky; bottom:8px`，顶部1px分隔线，内层操作栏54px高，仅保留“添加提示”。空/已有内容状态均复用现有提示弹窗入口；采集示例中的0人和至少5人仅为展示文案，不转化为后端约束。
- 验证：内容设置页面定向 Vitest 28/28通过；覆盖预览文案、四行表格、不可交互、单提示按钮、打开提示弹窗、Tab/其他节点回归。前端类型检查和生产构建通过；构建存在既有VueUse PURE注释及大chunk告警。
- UI合规：Spec 012 N0001/N0002/N0004/N0005；复用既有按钮和提示弹窗，不新建组件体系或信息架构；N1102-N1104在本记录及交付说明中记录。没有新增接口错误态或权限行为。

## 内容 item 选择事件与360°确认复用（PM-T004-T05-F05，2026-10-21）

- 360°邀请预览点击选择只作用于主体 item 区；标题不响应选择，不能与主体同时显示实线选中。主体直接复用 `PerformanceContentSelectionFrame.vue` 的 root 选中态；取消页面独立维护的标题选中样式。
- 配置内容 item 的点击由共享 `PerformanceContentRenderer.vue` 截断事件冒泡，不得让外层卡片标题/root同时变为选中；360°确认环节的已配置内容继续复用 `PerformanceConfiguredContentBlock.vue → PerformanceAssessmentConfiguredPreview.vue → PerformanceContentRenderer.vue`，无需复制内容编辑器或另造确认专属行为。
- 验证：前端定向 Vitest 50/50通过，前端类型检查与生产构建通过。未执行登录态实际页面截图或真实API保存重开；本次不替换容器。

## 工作总结 item 设置分组修复（PM-T004-T05-F03，2026-10-21）

- 用户确认：工作总结环节 → 配置填写内容 → 选择工作总结 item，右侧“内容设置”面板不显示“显示设置”分组，最顶部直接显示“填写设置”（在此环节填写/在此环节隐藏）；仅填写模式显示后续“必填项设置”。
- F03 原实现将非 rating 的自定义 item 一并按此规则处理；用户后续在 F04 明确纠正：自定义文本型 item 需要顶部“显示设置/隐藏名称”，不应与工作总结 item 混同。评分评级 item 仍显示“显示设置/隐藏名称”和“必填项设置”。整体 root 的隐藏描述、允许添加多个保持不变。
- 仅移除非 rating 的空 fieldset，不更改设置值、事件或持久化契约。沿用现有蓝图和控件，关联 Spec 012 N0001/N0002/N0004/N0005/N1102-N1104，无禁止项。

## 自定义文本 item 隐藏名称恢复（PM-T004-T05-F04，2026-10-21）

- 工作总结环节 → 配置填写内容 → 自定义文本型 item：顶部显示“显示设置”，下方复用 `PerformanceCheckbox.vue` 展示“隐藏名称”，再展示既有“填写设置”和条件必填设置。
- 勾选时立即隐藏该 item 的题目名称和附属必填星号，取消时恢复；不隐藏整个题目、输入区、内容块名称或其他 item 名称。值归属当前 item，沿用 `items[].settings.hideName`，默认 false，保存与重开需保持一致。
- 工作总结类型 item 仍遵循 F03；评分评级保持原行为。标签型自定义 item 和其他环节不因本次文本题修复改变。沿用 T05 蓝图和公共控件，不新增整页蓝图。
- 实现：当前选中item按item.questionType优先、兼容content.questionType、缺省text分类；仅custom-text增加显示组。名称联动通过renderer条件class隐藏整条label（含星号），输入区、内容块标题和其他item仍保留。hideName复用现有normalize/serialize/API JSONB，不新增字段。
- 验证：block/renderer/layers/checkbox/page五文件Vitest87/87通过，覆盖多题隔离、公共checkbox、文本/tag/工作总结/rating和mock保存重开。真实页面PNG、真实API/数据库保存重开尚未执行；员工填报和只读结果页不在本次范围。UI自检N0001/N0002/N0004/N0005/N1102-N1104，无新设计体系、权限或禁止项。

- 容器验证：2026-10-21在现有Docker多阶段构建内编译并仅替换本地frontend；镜像 `sha256:561d35b19b604a3d7d4b226c9abb51f0b5cc8cbaa7edb9ef8781a3d37d0a30e2`，running/restarts=0，nginx配置有效，端口8080。页面及模板JS/CSS均HTTP200，已从HTTP资源核验custom-text、hideName及隐藏label的CSS；未登录API401。后端/数据库/Gotenberg未替换。没有实际登录态交互截图或真实保存重开证据，不将静态资源验证冒充UI验收。

## 页面标题选择与名称保存（PM-T004-T05-F06，2026-10-21）

- 本次用户确认优先于F02/F05旧记录：配置填写内容标题可以选中，hover为1px虚线、选中为2px实线；标题与内容root、item、邀请预览主体互斥。统一复用PerformanceContentSelectionFrame与tokens.css的hover-outline/hover-outline-offset/selected-shadow，不保留标题独立实线hover层。切换环节或Tab清空选中；hover不切换选中目标。
- 选中标题后，右侧“内容设置”展示必填“页面名称”：label为14px/600/22px、下间距8px，红色必填SVG为8px；输入复用PerformanceTextField的feishu-input，高30px、padding 4px 8px 4px 11px、宽随272px面板内容区。标题支持点击及Enter/Space选择。
- 页面名称独立于流程环节名称和内容块名称。现有workflow GET/PATCH新增可选content_page_name:string|null，缺省/null使用node.name；仅fill页使用该值，reference/adjustment与固定result_view标题“绩效结果”不变。显式名称trim后1–100字符，空白不能保存，定位到出错节点和输入框；保存失败保留输入，父向导不跳转。
- 值保存在既有nodes JSONB，GET重新打开回显；流程设置再次保存需保留。旧客户端省略新字段保留存量值，显式null恢复默认。沿用performance.configuration.manage权限、审计事务和已使用模板409 TEMPLATE_WORKFLOW_LOCKED，不改历史周期快照或新增migration。
- UI合规关联Spec012 N0001/N0002/N0004/N0005/N1102-N1104；沿用T05三栏蓝图，不新增整页蓝图或设计体系。实现态PNG目标../../ui-blueprints/PM-T004-T05-F06-implemented-page-name.png，未取得不作为完成证据。
- 追加确认：选中内容块root或题目item时，右侧“内容设置”标题下同一根公共分隔线保持可见，不被固定定位的设置表单遮住；标题/root/item切换不重复生成分隔线，不改变互斥选中、表单或保存行为。
- 最终验证：前端五文件106/106、后端页面名称专项20/20和完整workflow129/129通过；前端build含类型检查通过。先前测试源码读取和类型断言错误已修复。浏览器实际交互/PNG及真实DB保存重开未执行，F06保留未勾选；未更新容器或部署。

## 环节独立内容与统一能力（PM-T004-T05-F07，2026-10-21）

- 用户明确：题目名称、提示、选项及显示/填写/必填设置均由各环节独立维护，不属于共享定义变更。选择已有内容只复制初始结构；节点content是局部权威，content_library仅种子及旧binding补齐来源，不用局部副本覆盖已有库。
- 不修改已启动周期快照、生效时机或已使用模板锁定逻辑；本次不建立“模板修改不影响已启动周期”的新约束。允许修改后的生效策略留既有逻辑及后续前端控制任务。
- 环节root/item能力和题型字段矩阵集中声明，保持现有启用范围，不凭通用化自动开放其他环节新设置。自定义题按item.questionType优先、块级兼容、缺省text；配置卡片和员工端均正确区分标签/文本。
- 编辑内容保留原settings、未知字段和局部选项；评级资料异步返回仅补缺失定义，不覆盖已保存的label/hint/options/settings。模板GET/PATCH保持原路径和JSONB协议。
- 员工schema新增hide_name/default_all：隐藏名称在编辑/只读字段组件中生效；标签默认全部只初始化无答案的可编辑任务，新添加重复实例使用默认值，显式空答案和历史只读答案不重置。UI组件复用现有checkbox、rating、rich-text，不新建页面或设计体系。
- 最终整合验证：前端七文件Vitest117/117、后端workflow/projects284/284（129+155）、前端vue-tsc+vite build通过；git diff --check通过。后端有既有python_multipart弃用警告，构建有VueUse PURE注释和大chunk提示。测试覆盖同ID环节独立、库种子不覆盖、评级异步刷新、显式空值、标签item优先、编辑保存保留settings、员工编辑/只读隐藏名及默认标签不覆盖空答案。尚未执行登录态浏览器/独立PNG、真实API/数据库保存重开和全仓回归，F07不勾选。遵循Spec012 N0001/N0002/N0004/N0005/N1102-N1104，未引入禁止项；不改锁定/快照/生效时机。

## 自定义文本 root 移除填写设置（PM-T004-T05-F08，2026-10-21）

- 用户最新确认：填写设置需要保留在 item 部分，移除的是自定义文本内容块 root 部分的“填写设置/允许添加多个”。root 仅保留“显示设置/隐藏描述”；item 继续显示“填写设置/在此环节填写、在此环节隐藏”、显示设置和必填项设置。
- root 能力通过集中规则判断：当内容块全部为自定义文本题时关闭 `allowMultiple` 的展示；混合文本/标签、自定义标签、工作总结和评分评级不改变原能力。item 的 `custom-text.mode` 恢复为 true。
- 只移除 root 配置入口，不清除或强制转换既有 `rootSettings.allowMultiple`；item `settings.mode` 与其他设置原样保留。无 API、权限、数据库迁移、周期快照、UCP 或外部系统变更。
- 验证：五文件定向 Vitest 106/106通过（block12/page37/renderer16/layers35/员工模板renderer6），覆盖纯文本 root 无填写组、item 填写/隐藏切换、混合与标签/工作总结/rating回归、修改隐藏描述时保留历史allowMultiple、mock保存重开。`git diff --check`通过；前端build运行中。本次不执行浏览器截图、真实 API/数据库验收或部署。
- UI 合规：已读 Spec 012 UI 规范，关联 N0001/N0002/N0004/N0005/N1102-N1104；沿用 T05 已确认蓝图和公共控件，无信息架构或设计体系变更、无禁止项。

## 自定义标签题 root/item 显示配置（PM-T004-T05-F09，2026-10-21）

- 工作总结环节的自定义标签题 root 仅保留显示设置/隐藏描述，不显示填写设置/允许添加多个。自定义文本及标签混合块也沿用此 root 规则，本确认覆盖 F08 对标签和混合块的旧例外；工作总结和评级不变。
- item 顶部为显示设置，依次显示公共复选框“隐藏名称”“隐藏描述”（间距8px），其后保留填写设置和条件必填项设置。隐藏名称仅移除题目名及星号，隐藏描述仅移除 item.hint 的描述，不影响 root 描述、标签选项、补充提示或答案；两项独立，默认不隐藏，切换item/环节不串值。
- 使用集中 custom-tag 能力与现有 settings.hideName/hideDescription，workflow GET/PATCH和JSONB不变；员工标签schema补充 description/hide_description 并沿用 hide_name，共享字段组件在编辑/只读时应用。只补兼容字段，不改已启动快照/锁定/生效时机、权限、迁移或外部系统。
- 验证：最终前端五文件109/109、后端projects/workflow288/288通过（1个既有python_multipart弃用提示）；初次前端运行73/74，旧测试误把新显示开关作为必填开关，已修正选择器并加入保存/mock重开显隐断言。首次build被新增测试的隐式any阻断，修正后 `npm.cmd --prefix hr-portal/frontend run build`（vue-tsc+vite）exit0，有既有VueUse PURE提示。git diff --check通过；真实浏览器/独立PNG、真实数据库/API保存重开与部署未执行，F09保持未勾选。
- UI合规：Spec012 N0001/N0002/N0004/N0005/N1102-N1104；沿用T05蓝图/公共checkbox/token，无新设计体系或禁止项。

## 评分评级按规则配置可选等级（PM-T004-T05-F10，2026-10-21）

- 工作总结环节→配置填写内容→评分评级 item，显示设置/隐藏名称与必填项设置/必填保持原样；下方新增“按规则配置可选等级”公共 PerformanceSwitch，默认关闭。仅rating能力levelRules=true渲染此入口，root/文本/标签不增加该项，其他环节启用范围不变。
- 开启后显示272px说明，使用全局14px/21px与#646A73对应token：“当满足条件时，当前评估题仅可选如下规则配置的可选项，当不满足所有规则时，当前评估题可选任意选项。”下方8px为272×32px“添加规则”按钮，复用PerformanceButton，使用虚线#D0D3D6边框、#EFF0F1底、6px圆角、蓝色文字及用户提供的原始14×14 GanttsetOutlined SVG。开关在标签右侧8px，组间距24px，颜色/字号/字体/间距/圆角均消费全局tokens.css。
- 独立PerformanceRatingLevelRuleSettings.vue只负责此功能块，通过v-model接现有item settings更新链路；新增可选items[].settings.levelRulesEnabled，默认false，开关/隐藏名称/必填互不覆盖，关闭只收起说明/按钮，不删除历史或未知设置。已有workflow GET/PATCH和JSONB保存/重开沿用，不加migration或后端执行逻辑。
- 本次不开发规则弹窗、规则条件模型、等级过滤执行；“添加规则”点击仅用现有ElMessage.info提示“添加规则弹窗暂未开放”，不写数据或创建dialog，不宣称打开开关即可限制等级。
- UI合规：沿用T05已确认蓝图和本次SnapSpec，属于小范围增补，无新整页蓝图/设计体系；Spec012 N0001/N0002/N0004/N0005/N1102-N1104。真实浏览器/独立PNG与真实API数据库重开尚未执行，不将组件测试冒充真实页面验收。
- 验证：最终前端六文件Vitest114/114、后端workflow/projects290/290通过（131+159）；覆盖公共开关/按钮、显隐/消息/无dialog、false/true保存重开、内容编辑保留settings、原有设置和题型回归。首轮build因测试get().exists()类型错误失败，修正后最终 `npm.cmd --prefix hr-portal/frontend run build`（vue-tsc+vite）exit0，有既有VueUse PURE注释提示。git diff --check通过；后端有既有python_multipart弃用提示。未执行真实浏览器/独立PNG、真实API数据库重开或部署，F10保持未勾选。

- 容器更新：用户授权后完成本地frontend容器内生产构建和替换，运行镜像 `sha256:10b15538af97850b0ccc83d5bdd2b18ccbb9cc42ab869725716bb8f1aae8c957`，running/restarts=0、nginx配置检查成功。页面/JS/CSS HTTP200；容器运行资源核验开关字段、原始图标、中文提示与按钮CSS及全局token，未登录workflow API401。backend/db/gotenberg容器ID与启动时间不变，无迁移；保留回退标签 `hr-portal-frontend:before-rating-level-rules-20261021`。仅本地更新，不代表生产发布或实际登录态UI/数据库验收，F10完整验收仍未勾选。

## 评分评级允许不了解与内容跳过（PM-T004-T05-F11，2026-10-21）

- 工作总结环节的评分评级root保留显示设置、移除填写设置，新增评估设置及公共checkbox“评估时允许选择「不了解」”；说明为“开启后，若评估人选择「不了解」，则会跳过该评估内容中的所有问题。”，使用既有token、14px/22px和4px上间距。item显示/必填/F10开关不变。
- 用户确认按公共组件逻辑实现：content.settings.allowUnknown是唯一配置来源，PerformanceRatingControl统一根据allowUnknown临时生成不了解（id=__unknown__）且去重；配置预览与员工端仅透传原始options与flag，无各自追加选项，不污染真实等级定义和统计选项。
- 模板沿现有workflow GET/PATCH JSONB保存；员工schema仅将rating开关透传allow_unknown，默认false。选择不了解仅跳过当前内容当前实例必填；被跳过的其他输入只读且保留答案，评级控件可切回正常选项并恢复校验。其他内容/重复实例照常校验；服务端禁止未允许的sentinel，返回400 VALIDATION_FAILED，使用原事务与权限，不改快照/结果开放/统计口径。
- 验证：前端6文件101/101、后端projects/workflow294/294通过（既有python_multipart弃用提示），覆盖默认/开关/取消、标签与下拉、保存/mock重开、只读不了解文案、禁止伪造、内容/实例隔离、切回恢复校验及原答案保留。构建：`npm.cmd --prefix hr-portal/frontend run build`（vue-tsc+vite）exit0，有既有VueUse PURE注释提示；未执行实际浏览器/独立PNG、真实API数据库重开或部署，F11未勾选。
- UI合规：Spec012 N0001/N0002/N0004/N0005/N1102-N1104；已读基线/T05蓝图，复用原checkbox/rating组件和全局token，无新整页结构/设计体系/禁止项。

- 容器更新（F11）：用户授权后在Docker内完成frontend生产构建和替换，镜像 `sha256:f126be3ee2c1be7fff952240c16f71dcb1abcda3779947001986ad3e12f3d333`，frontend running/restarts=0，nginx -t成功，页面HTTP200；运行资源包含模板allowUnknown/公共评级与跳过代码，未登录workflow API401。backend/db/gotenberg镜像、ID、启动时间未变，网络保持hr-portal_default；旧镜像回退标签`hr-portal-frontend:before-rating-unknown-20261021`。仅本地容器更新，未部署生产；真实登录态/数据库保存重开/PNG未执行，F11保持未勾选。

## 360°邀请与确认共享填写内容（PM-T004-T05-F12，2026-10-21）

- 用户最新确认：将邀请环节现有填写内容提炼成 `PerformanceReviewer360Content.vue`，在 `reviewer_360_invite` 和 `reviewer_360_confirm` 的fill Tab共用；覆盖F02关于确认环节入口保持原样的旧边界。共享原有标题、搜索/邀请列表非交互预览、54px单“添加提示”操作栏及样式，不复制确认专属实现。
- 组件props接收页面标题、标题/root选中态、操作栏显隐和actions；`select-heading`、`select-root`、`action`事件沿用页面互斥选择和 `handleContentAction('add-prompt')` 打开 `PerformancePromptModal`。存量配置内容继续走原共享渲染链，已有内容时公共底栏仍只有一个“添加提示”。参考Tab及其他节点不变。
- 选择两环节预览root后，右侧显示“暂无可配置内容”；没有选择内容、切换环节/Tab后仍显示“暂未选择内容”。选择标题仍显示原页面名称表单，标题/root/item互斥，不新增可配置字段。
- 复用现有workflow DTO和提示弹窗；不增加提示持久化、人员搜索/邀请、实际360确认任务或API能力，无权限、迁移、UCP和快照变更。
- 验证：页面45、ConfiguredContentBlock15、ContentRenderer17、AssessmentContentLayers36，共113/113通过；前端build（vue-tsc+vite）通过，既有VueUse PURE注释提示；git diff --check通过。组件DOM验证覆盖共享组件接入、空态文案、标题/root/item互斥、空/已有内容单提示入口、切Tab及非360节点回归。未执行真实浏览器截图、真实API数据库验收或容器替换，不宣称生产已更新。
- UI自检：已阅读Spec012交互与实施守则，N0001/N0002/N0004/N0005/N1102-N1104适用检查完成；沿用T05蓝图及公共控件，无新设计体系、信息架构或禁止项。

## 评估型环节填写项三态配置（PM-T004-T05-F15，2026-10-22）

- 本次按用户最后澄清实现评估型环节的执行人上下文能力矩阵：仅当 `node_type=evaluation` 且执行人为 `360°评估人` 或 `直属/直接上级` 时，开放四类已有内容（工作总结、评分评级、自定义文本、自定义标签）的内容设置。两种执行人均支持工作总结 Root 隐藏描述/允许添加多个；工作总结 Item 三态填写/隐藏/查看；评分评级 Item 隐藏名称/必填/按规则配置可选等级；自定义文本 Item 隐藏名称/三态填写/隐藏/查看/必填；自定义标签 Item 隐藏名称/隐藏描述/三态填写/隐藏/查看/必填；四类内容 Root 均支持隐藏描述。仅 360°评估人的评分评级 Root 额外支持“评估时允许选择不了解”，直属/直接上级不开放该项。其他评估执行人上下文不自动开放这组能力。
- 该能力沿用已有内容选择器、`PerformanceWorkSummaryRootSettings`、`PerformanceWorkSummaryItemSettings`、评级规则组件和 workflow JSONB/settings 保存回显，不操作具体模板实例，不新增 API、数据库、权限或周期快照规则。三态查看后续读取边界仍以已确认的员工端读取契约为准。
- 本轮补充：评估型环节自定义文本/标签 Item 的显示设置与填写设置并列独立；填写模式切换为“隐藏”或“查看”时，仅隐藏必填项设置，保留隐藏名称/隐藏描述配置及其值，不因 `mode` 改写显示设置。

## 结果复议处理填写内容展示（PM-T004-T05-F14，2026-10-22）

- 用户采集的 `ReviewContent` 展开态为 800×174，白底圆角 4px；标题区高 56px，左侧“复议理由”为 16px/600/24px，2×14px `#3370FF` 竖线；右侧按钮 24×24px。正文区高 102px，内边距 12px 24px，左侧浅灰说明块 284×54px（内边距 16px），文案“这里展示被评估人发起复议时填写的内容”。仅为模板预览，不读取员工实际申诉记录。
- 在 `result_reconsideration` 的 fill Tab 顶部保留与普通内容模块一致的页面标题区（复用 `PerformanceTemplateSectionCard`）；下方固定复议理由展示区复用 `PerformanceAssessmentPreviewHeader`、`PerformanceExpandButton`、`PerformanceContentSelectionFrame` 和底部 `PerformanceTemplateOperateBar`。收起按钮必须使用 `PerformanceExpandButton` 的既有 `hoverOnly`/regular icon 样式，不为复议区复制底色或 hover CSS。收起仅隐藏固定说明区，不删除已配置内容，选中与页面标题/内容块互斥。配置内容为空或已有内容时只保留一处底部操作栏。底部按钮种类沿用当前 `summaryActions`，第二段采集被截断，不能据此发明复议特定操作或认定像素级验收已完成。
- 页面标题、已有内容及参考 Tab 不变；无 API/持久化/权限/迁移/周期快照/UCP 更改。悬浮与选中沿用公共 1px 蓝色虚线/2px 实线 token，采集中的 `hidden` 边界层不可直接复制为常显遮罩。Spec 012 合规检查关联 N0001/N0002/N0004/N0005、N1102-N1104。

## Result-view content correction (PM-T004-T05-F01, 2026-10-21)

候选保留工作总结、评分评级、自定义三种内容；以唯一 `include_final_result=true` 节点的 fill 内容归属判断可选性，而非按内容类型过滤。无终评或无填写内容时所有候选不可选；全部 item 隐藏的内容不可选。

- 其他内容复选框置灰，复用 `PerformanceCheckbox`、`PerformanceInfoPopover` 的 disabled-action 及全局 token。显示提示“仅可选择终评环节执行人「直属上级」填写的内容”；实线上级从现有 manager-level options 动态生成具体级别，多级用顿号连接。受限模式不允许在结果查看节点新建或修改来源内容，普通节点保留原编辑/新建行为。
- 选中 result_view 后显示唯一“配置查看内容”Tab；区域标题为“绩效结果”，不是流程节点自定义名称。按采集还原18/600/26标题、16px/24px内边距、4px圆角、1px分隔、40px空态上下内边距、14/22灰色说明及54px双操作栏；区域悬浮显示蓝色虚线边框，顶部保留原始16px横向拖拽图标。该固定区域当前不新增拖拽排序协议。
- “添加其他参考内容”在同一查看Tab下复用参考内容抽屉，保存到独立 reference slot；不得覆盖 view 内容，也不增加参考Tab。已有内容支持回显与移除。
- API继续使用原 workflow GET/PATCH、content/content_bindings/content_library。支持仅 bindings 的内容回显；后端在修改记录与审计前拒绝非法 view 来源，返回422 `TEMPLATE_WORKFLOW_INVALID`、动态 message 与 result_view node_id。无view配置的旧数据兼容，不更改其他节点slot行为。
- 范围不包括提示内容存储模型、员工结果读取接口、结果开放策略、项目历史快照或数据库迁移。“添加提示”继续复用既有弹窗，不声称已补齐既有提示保存链路。

## 结果查看标签题允许查看（PM-T004-T05-F13，2026-10-22）

- 仅结果查看view slot的自定义标签item显示公共“允许查看”复选框；缺省兼容为允许，关闭后灰框收起，但保留该题隐藏名称/描述设置，重新开启恢复。非标签题不新增配置能力。
- 开启后在272px宽、84px自然高的灰框展示公共“隐藏名称”“隐藏描述”，#F5F6F7、16px内边距、8px行距、6px圆角、14px/22px系统字体。复用WorkSummaryItemSettings及集中result-view-tag能力，不新建同功能组件。配置区仍显示已关闭题的灰态和锁图标，允许重新选中恢复，不能把关闭的题从配置DOM删除。
- hideName仅控制题目名/星号，hideDescription仅控制题目hint描述，不影响模块描述、标签选项及答案。两个选项独立、局限当前环节与当前item，沿用workflow JSONB/settings保存，重新选择内容也应保留局部设置。
- 2026-10-25 追加确认：结果查看 item 的 `allowView=false` 不得切换为通用 `mode=hidden` 或重绘内容结构；保持与允许查看时相同的只读内容渲染，仅通过共享 `PerformanceUnavailableOverlay` 叠加不可查看蒙层与隐藏图标。该渲染状态由公共内容 renderer 消费，后续结果查看内容类型可复用，配置项仍沿用现有 `items[].settings.allowView`。
- 员工results接口兼容评级列表，并追加只读contents（task_id/form_schema/answers）；以项目result_view和终评节点快照为准，只有已完成终评、来源合法且allowView不为false的标签题可返回；后端白名单裁剪答案，隐藏名称/描述不以仅前端CSS作为边界。未开通、身份/成员不匹配沿用404 RESULT_NOT_FOUND；不修改结果开通、历史快照或生效策略。
- 员工结果页复用PerformanceTemplateRenderer的readonly模式展示标签和说明，旧接口无contents时仍正常显示评级；空态/失败态沿用现有文案。实际浏览器/数据库重开证据未获得前，F13保持未勾选，不声称部署完成。

- F13验证：前端四文件104/104、后端workflow/projects320/320通过；前端build（vue-tsc+vite）最终exit0、git diff --check通过。覆盖共享checkbox、隐藏双项独立/重选保留/保存mock重开、员工只读结果、拒绝访问、合法来源/任务/题目/答案裁剪及富文本清洗。既有VueUse PURE注释与python_multipart弃用提示未修改；实际浏览器/PNG、真实数据库/API持久化验收未执行，F13保持未勾选，无部署。

## 标签题维护描述与提示带入（PM-T004-T05-F17，2026-10-23）

- 选择标签题时，将目录的名称与题目描述复制到当前 item.label/item.hint，各标签 prompt 继续保存为 options[].placeholder；题目描述不是标签说明，也不是答案。环节已保存的局部内容仍独立，不随目录更新覆写。
- 新建/编辑预览的题目描述位于题目名称下、标签复选框上，14px/400/22px、#646A73、上间距4px，自然换行，不固定44px高度；无描述不渲染空段落。
- 勾选标签后，各标签下方空富文本区显示其独立提示，14px、24px行高；标签行最小高24px，与编辑区间隔4px。宽度跟随原预览区域，不写死491/473/457px；单一顶部工具栏和自然增高逻辑不变。提示不写入试填答案，输入后隐藏占位提示。
- 旧 options 缺少 placeholder 时仅按同名标签补目录提示；已有局部提示和显式空字符串不被目录覆盖。取消勾选/重开及多标签内容隔离沿用现有逻辑。
- 验证：layers40/page49/renderer17/block18共124项通过，包含选择→配置confirm→无目录mock重开，缺失旧提示/局部覆盖/输入后提示消失；前端vue-tsc+vite构建通过（既有VueUse PURE注释提示），diff检查通过。没有登录态浏览器尺寸实测、独立PNG、真实数据库/API重开或部署证据，不声称像素级验收；无API、权限、迁移、员工端或快照改动。

## 统一富文本内核与标签输入（PM-T004-T05-F18，2026-10-23）

- 用户确认配置预览与实际填写的标签样式一致：单外框/顶部共享工具栏/各标签独立紧凑输入区；不是把既有实现差异一律当变体保留。两处统一调用 `PerformanceTagRichTextInput`，工作总结、文本与标签编辑均调用 `PerformanceRichTextEditor`；移除旧局部引擎与员工端execCommand实现。普通文本default/task-entry维持现有尺寸场景，宽度由调用容器决定，不固定采集宽度、不改变实际填写页面宽度。
- 统一 `pre-wrap/overflow-wrap:anywhere/min-width:0/grid minmax`，中文、英文、数字、链接及列表在容器内自然换行与增高，不用overflow:hidden裁切。提示在空编辑器显示、输入后消失；HTML白名单清洗和语义格式回显共用，旧纯文本/段落/列表兼容。链接使用弹层且限制http/https/mailto。
- 单一标签工具栏作用于当前焦点/选区的标签，移除后回退有效标签；答案仍按原tags/notes独立存储，兼容旧note，不串题；预览试填仍不进入配置confirm。readonly保留禁写DOM；结果只读展示链路保持原白名单清洗。
- 浏览器证据：真实Chromium挂载实际组件与现有样式的隔离fixture，55/55检查通过，包含320/491/860宽度与配置弹窗约492px外框，五类长文本、scrollWidth不超过clientWidth、文字不越界、输入节点identity不变、提示不重叠。独立截图 `../../ui-blueprints/PM-T004-T05-F18-implemented-rich-wrap.png` 为实际组件隔离验证，不是登录态业务页面或真实数据库验收。早先fixture选择器误选背景框的失败已修正，仅最终通过结果作为证据。
- 测试采用真实Teleport验证配置编辑节点稳定；旧Teleport测试替身会导致节点重建，不据此修改业务弹窗。定向回归与最终build结果见F18任务。无API、迁移、权限、历史快照、部署或提交推送。

## 标签题共享业务渲染与员工视角（PM-T004-T05-F19，2026-10-23）

- 用户确认配置态保留hidden/不允许查看题的灰态管理入口，员工视角完全隐藏；差异只在后台选择/拖拽/工具栏包装，题目业务渲染共用。布局宽度随容器，合理紧凑布局不改变名称、描述、提示、必填、答案和查看权限含义。
- 编辑弹窗与配置区/员工端共用PerformanceTemplateFieldRenderer，root统一PerformanceAssessmentPreviewHeader；移除弹窗手写标签复选区和配置区对公共标签底框的深度重写。目录补缺的预览与确定使用同一规范化结果，显式空提示、局部设置及未知字段保留，available-only条目编辑结果不能静默丢失。
- 历史设计曾要求配置页员工视角入口提交当前节点草稿至只读管理 API，再使用员工 TemplateRenderer；该配置页入口及管理 API 已被 2026-10-23 的最新确认废止，不作为后续实现依据。员工正式页面的可见性裁剪与只读渲染仍保留。
- 员工身份接口必须在服务端移除hidden题定义、选项和对应答案；名称/描述隐藏时原文不返回，也不得通过placeholder绕回。后台配置管理员有权读取完整定义不等于员工有权访问管理接口；沿用现有权限拒绝。
- mode=view属于只读业务状态，不是布局变体；只读题不生成默认答案、不校验必填、不接受客户端改写。真实来源仅当前项目/周期被评估人唯一work_summary中已提交的同内容；未提交/不合法来源不能用草稿或伪造预览答案替代。历史快照与已有锁定策略不改变。

## 取消内容设置页员工视角预览（2026-10-23 用户确认）

- 内容设置页所有流程环节均不显示“员工视角预览”按钮，不进入员工预览态，不发起 `POST /performance/templates/{template_id}/content-preview`。
- 内容配置、结果查看、mode=view 的只读展示和员工正式页面保持独立；本次仅移除配置页临时员工预览入口，不删除正式员工结果展示能力。
- 后端 content-preview 管理接口与其专用 schema 已移除；内容设置页仍通过 workflow GET/PATCH 保存配置。
- 本次针对所有环节统一移除整条前端预览分支（含按钮、预览态、请求、加载/错误状态），而非仅在结果查看节点做 `node_type` 门控；生产构建不得保留该入口文案与请求调用。

## 统一提示变体与混合内容条目（PM-T004-T05-F20，2026-10-23 用户确认）

- 自定义/评分评级的“添加”共用“填写项/提示项”菜单。自定义沿现有填写项逻辑；评分评级新增同样的自定义填写项，保留原评估项，三种条目在同一列表中拖拽排序。
- 公共提示表单单一维护字段、默认值和校验；独立弹窗与内嵌变体共用，宽度由所在容器决定。标题可选，提示内容必填最多2000字，保留颜色与适用被评估人范围。
- 页面级提示作为当前slot内容块，复用同层内容保存、编辑、删除和拖拽；内嵌提示随所属内容草稿确认/取消与保存重开。两层均保留顺序，不因选择其他内容丢弃提示。
- 原评估项、新增填写项、提示项使用items.kind=rating|fill|prompt，旧缺省kind沿原行为；页面提示type=prompt、items=[]、prompt={title,content,color,scope}。沿用workflow JSONB和局部内容权威，未知字段保留，不裁剪混合items；提示不作为答案字段、必填题、评分题或终评来源。
- 按钮默认透明；菜单hover引用全局token（rgba(31,35,41,.08)），边框/圆角/阴影沿popover token。采集65×69为菜单参考，不能作为提示表单宽度。
- 沿用T05布局和本轮确认，不新增整页蓝图。Spec012 N0001/N0002/N0004/N0005/N1102-N1104适用；独立PNG目标../../ui-blueprints/PM-T004-T05-F20-implemented-mixed-prompts.png。无迁移、权限、历史快照、评分算法、UCP或部署变更，实际验证见F20任务记录。

- 2026-10-23实现验收记录：公共 `PerformancePromptForm` 由独立弹窗和内嵌条目共同消费；菜单通过 `PerformanceItemAddMenu` 复用，菜单使用全局 hover token 并以 Teleport 避免滚动容器裁切；`PerformanceSortableList` 同时承载评级/填写/提示。定向前端157/157、后端workflow/projects392/392、前端build和diff检查通过。未执行登录态浏览器、独立PNG、真实数据库重开和员工端提示展示，F20保持未勾选。

- 2026-10-25提示组件修订（以本次用户追加确认为准）：颜色悬浮提示沿用Teleport/body和公共popover层级；外部提示底色必须与相应悬浮示例的浅色底完全相同，复用`PerformancePromptNotice`导出的唯一色彩/图标定义，不能直接用色块的饱和颜色铺底。图标使用勾选颜色，内层符号白色；标题16px/600/24px、内容14px/400/22px沿用主/次文本色。`showIcon`默认false，保留既有保存/重开。
- 页面级提示不显示收起按钮，且不受旧expanded值影响。提示底色框与实际工作总结输入框左右边界及宽度一致，而非与整张792px卡片同宽；共用`--performance-readonly-item-padding-inline`及`--performance-content-item-border-width`。配置卡片中的所有条目统一同一内缩，不以有无右侧配置能力决定布局宽度；编辑弹窗仍随父容器。
- 点击页面级或内嵌提示时，右侧内容设置复用`PerformanceWorkSummaryItemSettings`的prompt变体：顶层“允许查看”（默认true）；开启时在与结果查看标签题相同的灰色嵌套框内展示“仅在填写时显示”（默认false）。关闭允许查看收起子项但保留子项值；管理画布保留灰态提示以便重新开启。两项保存在当前`prompt.allowView/onlyWhenFilling`，与showIcon、颜色和未知字段一起沿既有workflow JSONB保存。不同环节、提示和两种层级不串值；不将此配置验收冒充员工运行态提示/周期范围解析已完成。
- 本轮验证：前端6文件190/190，后端workflow183/183；完整vue-tsc+vite通过（VueUse既有PURE注释提示）。真实Chromium隔离挂载实际组件，792px容器下工作总结输入框/页面提示/内嵌提示均左50px、宽740px；620px容器下均左50px、宽568px。浅底与hover notice相同、图标为所选色、无收起按钮、父子勾选恢复/提示隔离和tooltip2201高于modal2200均通过，无pageerror。独立PNG：`../../ui-blueprints/PM-T004-T05-F20-implemented-prompt-view-settings.png`，已查看；这是实际组件隔离证据，不是登录态业务页面或真实数据库回读。无迁移、容器替换、生产部署或提交推送。

### F01 历史验收记录

- 验证：最终前端八组定向Vitest 131/131，后端workflow pytest 108/108，前端类型检查和生产构建通过。补齐view旧副本覆盖来源和普通节点同ID干扰binding-only来源的回归。前端向导测试输出既有jsdom XHR AggregateError日志（用例仍通过），构建有VueUse PURE注释警告，后端有Starlette弃用警告。本地Docker前后端镜像构建与容器替换通过，数据库和Gotenberg容器未替换；Alembic当前版本与head均0266。容器路由HTTP200、未登录API401，后端启动期间短暂502后恢复。浏览器跳转登录，未取得F01实际页面PNG，也未完成真实API保存重开验收；不得将登录页或目标图作为实现截图。F01保留未勾选。


## 已加载评分评级 item 标题字体统一（PM-T004-T05-F21，2026-10-25）

- 真实Chromium计算样式确认根因为字号/行高不一致，不是字体族：原评级item为16px/600/24px，同容器的工作总结、文本、标签item为14px/600/22px。
- 仅`configured-card`变体内的评级item标题改用`--font-size-md`、`--performance-input-line-height`；保持600字重及原字体继承。原失效的直接子strong选择器替换为实际header/strong层级。旧缺省kind和显式rating均适用；内容块主标题、编辑弹窗预览、评级选项、必填/隐藏逻辑与间距保持原样。
- 前端3文件105/105通过（renderer24/block24/page57），完整vue-tsc+vite通过，有既有VueUse PURE注释提示；独立真实组件Chromium验证五类item的fontFamily/fontSize/fontWeight/lineHeight相同，均14px/600/22px，root和editor-preview仍16px/600/24px，无pageerror。独立PNG：`../../ui-blueprints/PM-T004-T05-F21-implemented-rating-item-typography.png`，已查看；不是登录态业务页截图。
- UI合规N0001/N0002/N0004/N0005/N1102-N1104；沿用T05蓝图，无信息架构或新设计体系。纯样式修复，无API、持久化、权限、迁移、周期快照或UCP影响；后端/数据库验收不适用。未替换容器、部署、commit或push。


### 提示取消允许查看的右上角标识（PM-T004-T05-F20，2026-10-25追加确认）

- `prompt.allowView=false`时，页面级及内嵌提示均在内部底色框右上角显示复用的`PerformanceVisibleLockIcon`按钮外观；恢复允许查看或旧值缺省时隐藏。与左侧showIcon独立，关闭颜色图标不影响隐藏标识。
- 标识绝对定位在提示框内，top=4px、right=8px、按钮24px/图标16px，沿用公共spacing/icon token。文本预留右侧空间，按钮不独立响应点击、不抢焦点或阻断配置选择，沿用其他模块的状态标识行为；不改JSONB/权限或员工运行态。
- 4文件Vitest159/159、完整vue-tsc+vite通过；初次build的两处测试get().exists()类型错误已修复后复验。真实Chromium验证两层标识的内部定位、预留空间、显隐/重新选择，无pageerror；独立PNG `../../ui-blueprints/PM-T004-T05-F20-implemented-prompt-hidden-marker.png`已查看，为实际组件隔离截图，非登录态页面。UI自检N0001/N0002/N0004/N0005/N1102-N1104，无新设计体系/禁止项；无API/数据库迁移、容器替换、部署或提交推送。


## 标签题配置预览外观与只读交互分离（PM-T004-T05-F22，2026-10-25）

- 用户确认配置区标签勾选框与弹窗预览外观一致，但配置画布仍不可试填。公共PerformanceCheckbox新增可选readonly（默认false）：沿正常颜色展示已选/未选，原生input仍disabled，拒绝change发出，命中交给外层item选择；disabled仍优先展示原灰态。
- PerformanceTemplateFieldRenderer新增可选previewOnly（默认false），仅由PerformanceContentRenderer显式开启。不可编辑的配置预览使用readonly勾选框；其他不可编辑场景保持disabled灰态，员工可编辑/只读结果与弹窗试填不因此开放或关闭。
- PerformanceTagRichTextInput仅editable且非displayOnly时添加is-editable，蓝色hover/focus边框仅此状态启用。不可编辑的内部填写框保持原灰色边框，不影响外层PerformanceContentSelectionFrame的蓝色虚线hover/实线选中；不改答案、默认选中、工具栏、布局、API/JSONB/权限/快照。
- 验证：组件及内容设置6文件179/179通过，SelfSummaryTask.spec.js/Review.spec.ts另38/38通过；完整vue-tsc+vite、diff检查通过（既有VueUse PURE提示）。Chromium实际组件隔离验证未选框两处同为白底#FFFFFF/边框#8F959E，已选样式等待动画稳定后两处同#0442D2；配置input仍disabled，可编辑预览input可操作，普通disabled仍#EFF0F1。配置内部hover前后边框均#DEE0E3，外层仍蓝色虚线，点击checkbox区域只选item不勾选；内部contenteditable=false，可编辑预览仍蓝色hover，无pageerror。独立截图 `../../ui-blueprints/PM-T004-T05-F22-implemented-tag-preview-states.png`已查看，非登录态页面/真实数据库证据。
- UI合规N0001/N0002/N0004/N0005/N1102-N1104；沿T05已确认蓝图做局部修复，无新设计体系/禁止项。不涉及后端/数据库验收、迁移、权限、周期快照、UCP；未替换运行容器、部署、commit或push。


## 绩效题目标题全局token与单一公共样式（PM-T004-T05-F23，2026-10-25）

- 本次用户确认以已加载的自定义标签型填写题item标题为基准，工作总结/评分评级/自定义文本item统一；不能各题型复制一套字体逻辑。完整卡片复核发现前三种继承details的#646A73而标签明确#1F2329，F21只统一字号/行高不足，本节取代其“字体四项一致即全部一致”的验收范围。
- 在全局tokens.css定义`--performance-item-title-font-family/font-size/font-weight/line-height/color`，分别引用`--font-sans`、`--font-size-md`、600、22px、`--color-text-primary`。global.css仅一份`.performance-item-title`消费这五项token；RichTextField label（工作总结/文本）、ContentRenderer评级strong、TemplateFieldRenderer题头（标签等）统一添加公共类，删除旧局部字号/字重/行高/颜色定义和覆盖。后续只改全局语义token，不按题型写重复样式。
- 原标签题头的strong继续font:inherit，布局/display/间距/必填标记不并入公共类；明确隐藏/禁用状态按原规则保留。原details仍为次文本灰色，不把整个内容容器改成主文本色。页面/内容块标题、描述、提示项和评级选项不使用此item标题角色。
- 验证：5文件179/179通过（renderer29/block24/TemplateRenderer15/Layers54/page57），员工填写/结果/Checkbox另42/42；完整vue-tsc+vite及diff检查通过，有既有VueUse PURE提示。初次静态CSS测试因Vitest CSS raw处理读空失败，改用项目已有readFileSync方式后全组通过。
- 真实Chromium挂载完整ConfiguredContentBlock，四类item的fontFamily相同、14px/600/22px/#1F2329，details仍#646A73；临时仅在浏览器覆盖五项token为monospace/18px/500/28px/#AA2266，四类标题全部同步，内容块主标题和描述的计算样式完全不变。恢复token后独立PNG `../../ui-blueprints/PM-T004-T05-F23-implemented-global-item-title-tokens.png`已查看，无pageerror；为真实组件隔离证据，不是登录态页面/数据库验收。
- UI合规N0001/N0002/N0004/N0005/N1102-N1104，沿已确认T05蓝图，无新组件体系或禁止项；同步frontend/docs/design-system.md。无API/JSONB/权限/迁移/周期快照/UCP变化，后端/数据库验收不适用；未替换容器、部署、commit或push。
