# PM-T015 组件模型

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons: missing_replayable_session, missing_dpr, missing_target_screenshot, missing_interaction_evidence
source_state_id: SNAPSPEC-PM-T015-DEFAULT-20260923

## component_tree

```text
AssessmentMethodSettings
├── PerformanceAssessmentMethodCard (关键指标考核)
│   ├── title
│   ├── description
│   ├── help-link
│   └── PerformanceSwitch
└── PerformanceProjectAssessmentCard (项目制考核)
    ├── title
    ├── description
    ├── help-link
    ├── PerformanceSwitch
    └── conditional-content (only when enabled)
        ├── relationship-source
        │   ├── PerformanceCheckbox (disabled, checked)
        │   ├── role-summary
        │   └── edit-action
        └── result-visibility
            ├── PerformanceCheckbox
            └── example-action
```

| 层级 | component_id | 职责 | props/events | source_state_ids |
| --- | --- | --- | --- | --- |
| 基础 | `PerformanceSwitch` | 考核方式开关 | `modelValue/disabled/ariaLabel`；`update:modelValue` | `SNAPSPEC-PM-T015-DEFAULT-20260923` |
| 基础 | `PerformanceCheckbox` | 复选框和禁用态 | `modelValue/label/disabled`；`update:modelValue` | `SNAPSPEC-PM-T015-DEFAULT-20260923` |
| 业务 | `PerformanceAssessmentMethodCard` | 标题、说明文案、说明链接和考核方式开关 | `title/description/helpHref/modelValue` | `SNAPSPEC-PM-T015-DEFAULT-20260923` |
| 业务 | `PerformanceProjectAssessmentCard` | 项目制考核配置结构 | `modelValue/projectResultVisible`；对应 update 事件 | `SNAPSPEC-PM-T015-DEFAULT-20260923` |
| 页面 | `AssessmentMethodSettings` | 页面状态、组件组装和入口 | 无外部 props | `SNAPSPEC-PM-T015-DEFAULT-20260923` |
| 业务 | `PerformanceProjectRoleDialog` | 项目角色编辑弹窗外壳、说明、空配置区和操作栏 | `modelValue`；`update:modelValue` | `SNAPSPEC-PM-T015-ROLE-EDIT-20260924` |

## 项目角色编辑弹窗补充模型

- `component_tree`：`PerformanceProjectRoleDialog → PerformanceDialogShell → header/title/description, body/role-config/add/language, footer/confirm/cancel`。
- `source_state_id`：`SNAPSPEC-PM-T015-ROLE-EDIT-20260924`；来源为用户提供的 SnapSpec Blueprint，viewport `894×631`，弹窗 `600×262px`。
- `visible_elements`：标题“设置项目角色”、说明文案、添加项目角色加号图标及“添加角色”文字入口、语言图标按钮、“确定”和“取消”。角色项列表为空，不捏造角色字段或枚举。
- `after_add_role`：显示角色输入行，包含复用 `PerformanceDragHandle` 的拖拽手柄、复用 `PerformanceTextField` 的 `feishu-input` 输入框（占位“请输入中文角色名称”、后缀“中文”）和复用 `PerformanceIconButton` 的删除入口；单行时两侧控件隐藏，两行及以上时显示并压缩输入框；“添加角色”按钮位于输入行之后。
- `interactions`：编辑入口打开弹窗；关闭按钮、取消和确定关闭弹窗；添加与语言入口保留采集到的视觉入口，但不写入角色数据。
- `forbidden_elements`：未采集的角色编辑表单、组织树、保存成功提示、后端请求。

- 页面：`idle → ready`；采集范围未提供 loading/error API，页面不新增虚构网络态。
- 项目制考核开关：`off ↔ on`；`on` 时显示条件内容，`off` 时隐藏条件内容。
- 项目结果入口可见性：`unchecked ↔ checked`，仅在项目制考核开启时存在。
- 手动导入来源：`checked + disabled`，不可切换。
- 项目角色编辑弹窗：`empty → role-added`；`role-added` 状态显示输入行，添加按钮移至输入行之后；删除输入行返回 `empty`。

## 拆解评估

| 层级 | 组件 | 职责 | 是否复用 | source_state_ids |
| --- | --- | --- | --- | --- |
| 基础 | `PerformanceSwitch` | 共享开关 | 跨绩效后台页面 | `SNAPSPEC-PM-T015-DEFAULT-20260923` |
| 基础 | `PerformanceCheckbox` | 共享复选框 | 跨绩效后台页面 | `SNAPSPEC-PM-T015-DEFAULT-20260923` |
| 业务 | `PerformanceAssessmentMethodCard` | 单个方式卡片 | 本页面和后续设置页可复用 | `SNAPSPEC-PM-T015-DEFAULT-20260923` |
| 业务 | `PerformanceProjectAssessmentCard` | 项目制专项配置 | 本模块 | `SNAPSPEC-PM-T015-DEFAULT-20260923` |
| 页面 | `AssessmentMethodSettings` | 页面组装 | - | `SNAPSPEC-PM-T015-DEFAULT-20260923` |
