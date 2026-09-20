# PM-T004 内容设置开发验收契约

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- 目标采集证据已整理，但没有实现侧 rendered contract、运行时截图或截图 diff。
- “更多”菜单、分组内容选项、custom 内容最终进中栏和新增分支完整状态矩阵未完成。
- 本契约定义后续可执行验收，不把本轮采集结果当作实现通过。

## 1. 验收真源与边界

- 机器契约：[`extracted-ui-contract.json`](extracted-ui-contract.json)。
- 证据索引：[`capture-manifest.md`](capture-manifest.md)。
- 组件投影：[`component-model.md`](component-model.md)。
- 像素约束：[`pixel-contract.md`](pixel-contract.md)。
- 统一 manifest：`C:/Users/gaby.liu/ClonedSites/realtime_sessions/manifests/PM-T004-content-settings-20260901-50f0f4d0.json`。
- 目标路由：`/performance/settings/templates/create?step=content`。
- 角色：绩效管理员；本轮不做真实模板保存或模板级写操作。

## 2. 分层验收结果规则

| 层级 | 必须验证 | 当前结果 |
| --- | --- | --- |
| structure | 三栏、九环节、root/item 分层、抽屉/分组/自定义弹窗、字段/选项和组件归属 | 已采集，可进入离线设计 |
| layout | bbox、边缘 inset、first/terminal visible child、对齐、间距、滚动和 overflow | 目标值已入 JSON；实现侧 not-run |
| visual | 字体、颜色、边框、圆角、阴影、SVG/path、hover/disabled | 部分目标证据；新状态 blocked |
| behavior | tab 组合、抽屉开关、分组添加/取消、root/item 选择、操作条、拖拽、编辑、删除回收 | 部分已采；删除/最终 custom 卡片和 resize 未完成 |
| pixel | 同 viewport 目标/实现截图 diff | not-run；无实现截图 |

HTTP 200、单测、构建或采集 session 完成不能替代 layout/visual/pixel 验收。

## 3. Given/When/Then

### AC-01 九环节 visible/forbidden 矩阵

- Given 页面以九环节 fixture 打开并按 `stage_type + executor_type` 选择一个环节。
- When 依次选中工作总结、360°邀请、360°确认、360°评估人、直属上级评估、校准、结果沟通、绩效结果查看、结果复议处理。
- Then 中栏只显示 `extracted-ui-contract.json#/variant_contracts/content-nine-stage-matrix` 规定的填写/参考/供调整/查看组合；禁止 tab 不得渲染；工作总结“更多”只在取得菜单证据后再验收其菜单项。
- Evidence: `ALL9-*` 状态；目标实现截图和 rendered contract 待补。

### AC-02 抽屉默认与可见性开关

- Given 选中评估型环节并打开选择评估内容抽屉。
- When 抽屉加载、切换“评估内容分人群可见”。
- Then 抽屉宽 680px、右贴边；默认关闭时不出现“设置分组”；开启后出现；新建和全部展开同时存在；已配置项为 checked-disabled。
- Evidence: `C10-DRAWER-OPEN`、`C10-VISIBILITY-SWITCH-ON`；geometry 需与 `container_constraints` 比较。

### AC-03 分组弹窗

- Given 可见性开关已开启。
- When 点击“设置分组”、添加第三分组、再点击取消。
- Then 初始显示分组 1/2；每组有必填名称和评估内容选择器；添加后显示分组 3；取消关闭弹窗并丢弃新增第三组。选项弹层在未补采前必须标记 blocked，不得用自编选项验收。
- Evidence: `C10-GROUP-DIALOG-OPEN`、`C10-THIRD-GROUP-ADDED`、`C10-GROUP-DIALOG-CANCEL`。

### AC-04 root/item 右栏归属

- Given 中栏存在已配置内容卡片。
- When 点击整卡/上半区域，再点击下半内容项。
- Then 整卡选择只显示 root 设置（工作总结为填写设置三选一和必填）；内容项选择只显示 item 设置（隐藏描述和允许添加多个）；两个选择边框独立，不得由透明 mask 的辅助框决定归属。
- Evidence: `C20-CARD-ROOT-SELECTED-CLEAN`、`C20-CONTENT-BODY-SELECTED-DIAGNOSTIC`、`TYPE-WORK-SUMMARY-ROOT-TOP-CLICK`、`TYPE-WORK-SUMMARY-ITEM-TRUSTED-POINT`。

### AC-05 操作条与边界

- Given 至少两张已配置卡片。
- When hover 卡片顶部任意位置，再依次 hover 上移、下移、编辑、删除。
- Then 操作条按上移、下移、编辑、删除排列；每个命中区 24×24；第一张上移和最后一张下移保留布局并以采集 opacity 表示 disabled；卡片 bbox 不因 toolbar 出现而改变。
- Evidence: `C20-CARD-HEADER-HOVER`、`C20-TOOLBAR-MOVE-UP-HOVER`、`C20-TOOLBAR-MOVE-DOWN-HOVER`、`C20-TOOLBAR-EDIT-HOVER`、`C20-TOOLBAR-DELETE-HOVER`。

### AC-06 拖拽、折叠、编辑和删除

- Given 两张展开卡片。
- When 从整条顶部拖拽条启动、移动并释放；点击折叠/展开；点击编辑；在用户明确操作后点击删除。
- Then 记录 grab → grabbing → drop，释放后真实数组顺序更新；折叠仅移除当前预览并恢复可展开态；编辑打开对应内容编辑器；删除后卡片从中栏移除，重新打开抽屉时该项 unchecked/enabled。
- Evidence: 当前 toolbar/drag 证据仅覆盖部分阶段；删除和 custom 最终中栏 after 为 blocked，不能报告通过。

### AC-07 自定义文本和标签

- Given 从抽屉“新建”进入自定义编辑器。
- When 分别选择文本型和标签型，输入已采字段并确认。
- Then 文本型显示名称、描述、填写题名称、预览；标签型显示名称、标签选择器和真实选项“价值贡献/投入度/价值观”；确认后回填抽屉；不得发送模板或内容持久化请求。
- Evidence: `CUSTOM-TEXT-MODAL-OPEN`、`CUSTOM-TAG-MODAL`、`CUSTOM-TEXT-CONFIRM-RESUMED`、`CUSTOM-TAG-CONFIRM`。

### AC-08 失败与安全边界

- Given collector session 为 `stopped`、`incomplete`、`running` 或 action 为 blocked。
- When 生成开发契约或执行离线投影。
- Then 保留原生命周期和 blocker；不将 session 改为完成，不复制原始 HTML/截图/日志/认证信息到仓库，不执行保存、删除、提交、发布或邀请。
- Evidence: manifest summary and session table。

### AC-09 规则驱动的九环节复用

- Given 当前页面提供 `stage_type`、`executor_type`、`content_slot`、`content_type` 和 `selected_owner`。
- When 切换九个环节及其已采集的填写/参考/供调整/查看变体。
- Then 统一的 `ContentSettingsStageRenderer` 通过 `stageContentRules` 选择内容入口、内容类型 renderer 和 root/item 设置；不得按环节复制 Vue 页面或卡片组件。新增环节只能增加规则注册项和 fixture，除非有证据证明 DOM anatomy 或交互责任不可复用。
- Evidence: `extracted-ui-contract.json#/rule_registry`、`component-model.md §3.1`、`ALL9-*`。

### AC-10 新建与中栏预览复用

- Given 新建/编辑弹窗存在 draft，或抽屉已回填并在中栏生成配置内容。
- When 内容类型为工作总结、评分评级、自定义文本或自定义标签，并分别在 `editor`、`configured-card`、`drawer-summary` 上下文渲染。
- Then 三个场景使用同一个 `ContentPreviewRenderer` 和内容类型 renderer；字段顺序、内容语义和类型规则一致。弹窗预览不显示卡片操作条，中栏卡片由外层管理展开/折叠、root/item 选择和操作条，抽屉摘要只负责选择/回填。
- Evidence: `extracted-ui-contract.json#/preview_contract`、`component-model.md §3.2`。自定义内容最终进入中栏的目标 after 尚未采集，相关 pixel 结果保持 blocked。


实现阶段至少执行：

- `python .claude/skills/performance-spec-development/scripts/check_ui_spec.py specs/002-performance-management/features/PM-T004-template-create --task-id PM-T004-T06 --source-dir hr-portal/frontend/src --phase implementation`
- 前端 focused Vitest：`PerformanceAssessmentContentLayers.spec.ts`、`PerformanceTemplateContentSettings.spec.ts`。
- `npx.cmd vue-tsc --noEmit`。
- `npm.cmd run build`。
- 运行实际应用后生成 rendered contract；使用 `--phase acceptance --compare-contract <rendered-ui-contract.json>`。
- Playwright 在目标 viewport 进入每个 `source_state_id`，保存实现 PNG，并执行目标/实现截图 diff。

本轮没有运行上述实现/验收命令，状态为 `not-run`；不以既有采集器 65/65 测试代替 HR Portal UI 验收。

### AC-11 基础控件复用

- Given 内容设置需要单行文本框、多行文本框、计数文本框、富文本框、复选框、单选框、开关、选择器、弹窗、拖拽或图标按钮。
- When 实现或修改对应交互。
- Then 优先使用 `component-model.md §3.3` 登记的现有系统/绩效组件；不得在 `PerformanceAssessmentContentLayers.vue` 或页面文件中重新定义同类控件。新增 `PerformanceAssessmentSelect` 只能作为统一评估内容业务选择器，并须覆盖其状态和证据。
- Evidence: `component-model.md §3.3`、现有组件路径和 focused component tests。

### AC-12 既有实现增量对齐

- Given 内容设置现有实现已经覆盖部分拖拽、富文本、评分、弹窗、抽屉和预览行为。
- When 对照采集契约进行开发修正。
- Then 保留现有 public props/emits、状态机和已通过行为，先通过内部转接复用共享组件，再逐项修正契约差异；不得整体重写。每个删除局部重复实现或重写局部结构的变更必须有 focused regression 和不影响范围说明。
- Evidence: 变更 diff、focused tests、`extracted-ui-contract.json#/reuse_contract`。无必要重写理由时，验收阻塞。


每个状态必须记录：目标截图、实现截图、viewport、DPR、浏览器/字体环境、fixture、动作路径、截图区域、差异算法、容差、rendered contract 和结果。每个动态组件还必须比较：

- visible/forbidden 元素；
- 文案顺序、同行关系和换行；
- container 四边 inset、first/terminal visible child；
- 跨状态不变量与 variant discriminator；
- SVG `data-icon`、viewBox、path、fill/stroke；
- hover/focus/active/disabled/expanded/collapsed/dragging/after-click（适用时）；
- textarea resize default/dragging/after-drag（补采前为 blocked）。

结果只允许使用 `passed`、`not-run`、`blocked`；未执行不得写 passed。

## 6. 完成门禁

在补齐 blocker、确认 UI Implementation Brief、通过结构/布局/视觉/行为及 pixel 层验证前：

- `completion_status` 必须为 `incomplete`；
- `pixel_restore_status` 必须为 `blocked`；
- 不得勾选 PM-T004-T06 或相关未完成原子任务；
- 不得声明像素级一致、生产可用或目标模板已保存。
