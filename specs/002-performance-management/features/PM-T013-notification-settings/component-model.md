# PM-T013 组件模型

- completion_status: incomplete
- pixel_restore_status: blocked
- uncovered_reasons: 浏览器 JSON/HTML 已恢复，但缺少完整原始证据包和目标截图、采集器状态 ID、完整交互证据及策略 API。

## component_tree（保存交互已接入，像素契约仍 blocked）

```text
NotificationSettings
├── PerformanceNotificationMethodsCard
└── PerformanceNotificationSettingsCard [source_state_ids: BLOCKED; browser script default is not an approved collector state]
    ├── PerformanceNotificationRadioSection (绩效校准期间发送结果变更通知)
    │   └── PerformanceRadioGroup
    ├── PerformanceNotificationRadioSection (绩效结果变更通知)
    │   └── PerformanceRadioGroup
    ├── PerformanceNotificationRuleSummary × 3
    └── PerformanceNotificationDisableConfirm（取消勾选时）
        ├── PerformanceCheckbox
        ├── 编辑按钮
        └── 通知摘要
```

## proposed components（第二卡片尚未实现）

| component_id | owner | props/events | source_state_ids |
| --- | --- | --- | --- |
| `notification-settings-page` | 页面 | `loading`, `error`, `emailEnabled`; GET/PATCH | `not_observed` |
| `notification-methods-card` | 业务组件 | `emailEnabled`, `disabled`, `update:emailEnabled` | `not_observed` |
| `notification-settings-card` | 业务组件 | `settings`, `saving`, `request-save(payload)` | `BLOCKED` |
| `notification-radio-section` | 业务组件 | `selected`, `disabled`, `update:selected` | `BLOCKED` |
| `notification-rule-summary` | 业务组件 | `enabled`, `update:enabled` | `BLOCKED` |
| `notification-feishu-checkbox` | `PerformanceCheckbox` | `modelValue=true`, `label=飞书推送`, `disabled=true` | `not_observed` |
| `notification-email-checkbox` | `PerformanceCheckbox` | `modelValue=emailEnabled`, `label=邮件`, `disabled=false` | `not_observed` |

## state_machines

- 页面：`idle → loading → ready | error`。
- 邮件：`unchecked ↔ checked`；提交中暂时 disabled；失败回滚到变更前状态。
- 飞书推送：固定 `checked + disabled`，无可用转换。
- 策略单选组：`ready → saving → ready | rollback`；保存中阻断第二次操作但保留原输入节点和焦点，避免灰色闪动。
- 已选中复选：`checked → pending_confirmation → keep(checked，无 PATCH) | confirm(saving) → unchecked | error(checked，弹窗保留可重试)`；未选中→选中仍即时保存。保存中只在卡片根捕获第二次操作，不把未操作的另外两个复选框转成 disabled 或改动其 DOM/样式。
- 每项摘要与编辑按钮受自身 `enabled` 控制，仅开启时存在；确认关闭 PATCH 完成前继续显示，失败保持可见，重新开启时乐观恢复，失败回滚。其他两项独立渲染。可见编辑按钮固定 disabled。动作后像素状态仍待采集。

## captured notification-settings-card geometry/styles

- source session：`pm-t013-browser-2026-09-23T07-01-19-124Z`。
- viewport：`1280×361`，DPR `1.5`；`1280×305.33` 是采集脚本选中的整个 `.page-content` 根框；第二卡片根框实际为 x=260、y=302、992×707.33。
- 第二卡片：白底、20px 内边距、8px 圆角、绩效中性阴影；内容宽度由页面容器约束。
- 单选组 gap：8px；摘要卡背景 `#F5F6F7`、圆角 8px、水平内边距 16px、垂直内边距 12px。
- 摘要字段：通知频率、通知时间、是否在节假日和周末时屏蔽；编辑按钮使用采集的 14px EditOutlined SVG。
- 缺少同一状态的目标截图和完整容器 edge constraints，不能据此声明 P1 或像素验收。

## notification-methods-card geometry/styles

- 卡片：712×168px、padding 20px、radius 8px、margin-bottom 16px；viewport 894×631。
- 标题：16/600/24、`#1F2329`。
- 说明：14/400/22、`#646A73`。
- 方法行：16px checkbox、22px line-height、8px checkbox-label gap、8px 行间距。
- 辅助文案：12/400/22、左边距 24px、`#646A73`。
- 由于缺少稳定运行时证据，以上为采集文字/CSS 参数，不是 pixel acceptance 结论。

## ownership

页面负责数据生命周期和反馈；卡片负责布局；复选框负责控件状态、SVG 和可访问性。
