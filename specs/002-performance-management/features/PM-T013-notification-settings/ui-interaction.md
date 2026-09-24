# PM-T013 UI 交互

## 入口

- 路由：`/performance/settings/system/notifications`。
- 路由名：`PerformanceSystemNotifications`。
- 父布局：`PerformanceAdminLayout`。

## 页面结构

```text
通知设置
└─ 通知方式（白卡）
   ├─ 系统通知（待办提醒、催办等）的推送方式
   ├─ [已选中/禁用] 飞书推送
   └─ [可编辑] 邮件
      └─ 勾选后，邮件通知将会发送到参评人员在飞书中配置的邮箱。
```

## 交互

- 页面挂载调用 GET；加载期间两个复选框不可操作。
- 飞书推送始终 disabled、保持选中；不得出现保存按钮或邮件配置表单。
- 邮件切换后立即 PATCH `{ email_enabled }`。
- PATCH 成功更新服务端返回值并提示“保存成功”。
- PATCH 失败恢复变更前值并提示错误。
- GET 失败显示错误提示和“重新加载”。
- 所有控件提供可读的 `aria-label`；禁用控件保留原生 disabled 语义。

## 组件边界

- `NotificationSettings.vue`：页面状态、API 调用、错误/保存反馈。
- `PerformanceNotificationMethodsCard.vue`：卡片结构、文案和两个方法项，通过 `v-model:email-enabled` 传递邮件状态。
- `PerformanceCheckbox.vue`：复选框外观、勾选 SVG、disabled 视觉和原生输入事件。

## 4. 通知设置策略容器（五项选择已接入保存，编辑待确认）

- `PerformanceNotificationSettingsCard.vue`、`PerformanceNotificationRadioSection.vue`、`PerformanceNotificationRuleSummary.vue` 已接入页面；GET 成功后按服务端值显示，两组单选和三项复选各自 PATCH 单字段。保存中阻止重复请求且不改变其他选项视觉，失败回滚，刷新重读；编辑按钮仍原生 disabled。
- 浏览器脚本记录默认态与 focus-1~3，但并非采集器确认的可重放 source_state_ids。
- 默认态单选值为 `实时发送` 和 `仅在终评绩效结果（评分评级）发生变更时通知`；三个其他通知开关均为开启。
- 编辑按钮后状态尚未确认，不能猜测弹窗；五项选择的 GET/PATCH 契约见 api-contract.md。
- 已选中通知的复选框取消前进入 `PerformanceNotificationDisableConfirm.vue`：保留/Esc 不发送 API；确定才 PATCH 对应开关为 false；失败回滚且弹窗保留供重试，保存中禁用确认按钮。开启未选中项直接 PATCH true。
- 单选保存中保持同一输入节点和焦点，不使用原生 disabled 导致灰色闪动；捕获并阻止重复鼠标/键盘操作，提交完成后解除忙碌态。
- 三项复选保存中不把其他两项设为原生 disabled；卡片捕获重复操作，子项的节点、class、checked 与提示行高度在 PATCH 期间保持稳定。
- 摘要区 `v-if=enabled`：未勾选时只保留复选框行，隐藏该项灰底频率/时间/节假日摘要及编辑按钮；确定取消时请求完成前不提前隐藏，保留或失败不隐藏；重新开启时立即恢复，失败回滚隐藏。

## 5. 采集限制

浏览器 JSON/HTML 已恢复，但采集器正式状态与独立产物仍缺失；缺少采集目标截图、点击后/保存失败/重开状态。像素实现门禁阻塞，不宣称 P0/P1 或像素级通过。
