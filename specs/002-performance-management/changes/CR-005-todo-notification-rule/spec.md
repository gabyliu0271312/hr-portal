# CR-005 待办任务通知规则

## 确认与范围

2026-10-20 用户确认根据已采集参数、截图及会话拆解完成开发，未采集部分暂不做像素级还原。入口 `/performance/settings/system/notifications` 的其他通知设置 → 待办任务通知 → 编辑。不是 PM-T007。

交付三态编辑、校验、持久化、摘要与重开回显；不接入真实消息发送、调度、节假日日历或修改周期快照。保存仅保存全局配置，不改变已启动周期或任务数据。界面明确提示尚未接入发送。

## 契约 v1

沿用 GET/PATCH `/api/v1/performance/system-settings/notifications` 和内部 `performance.configuration.manage`；Portal 编辑按钮仍要求 `performance.admin` U。200 成功，422 参数错误，403 无权限。未知字段拒绝，显式 null 拒绝。

增加 `todo_task_rule` 完整嵌套对象（PATCH 原子替换，非嵌套局部合并）：
- `frequency`: `specified` / `daily` / `weekly`。
- `interval`: 正整数 1..365，仅重复模式使用。
- `days_before`: 0..365 整数数组，指定模式至少一项，去重排序。
- `day_kind`: `calendar_day`，基础实现暂只支持天，不推断工作日。
- `weekdays`: ISO 1..7 整数数组，周模式至少一项，去重排序。
- `time`: `HH:mm`，纯时间，不转换为日期或 UTC。
- `timezone`: `person` 或有效 IANA 名称；UI 基础选项为人员所在时区、Asia/Shanghai、Asia/Hong_Kong、Asia/Tokyo、America/Los_Angeles、Europe/London。人员时区解析暂不执行。
- `suppress_non_working_days`: boolean，仅保存配置，不宣称已执行屏蔽。

基础选项与 0..365 / 1..365 范围是本次暂定实现约束，不是源系统采集事实。指定模式提供 0..30 天常用多选，保留已保存的更大偏移；第二个下拉暂只有“天”；周模式提供星期一到星期日；分钟精度。旧数据默认 daily、interval=1、days_before=[]、weekdays=[]、time=10:00、timezone=person、不屏蔽。

数据库在 performance_notification_settings 增加非空 JSONB todo_task_rule，服务端默认同上；新增线性迁移，不修改已有迁移。旧开关 PATCH 不覆盖规则；规则 PATCH 不覆盖其他通知。沿用单例 upsert、行锁、事务及 PERFORMANCE_NOTIFICATION_SETTING_UPDATED 审计，嵌套模型转 JSON 后落库。无外部调用，无凭证。

## 验收

编辑不立即保存；切换频率保留会话草稿；取消不写；确定校验当前分支；保存中不可重复提交或关闭；失败保留草稿、摘要不变；成功从服务端结果更新摘要；刷新/重开回显。无权限 GET/PATCH 均拒绝。UI、迁移、测试证据见 atomic-tasks.md 与 ui-interaction.md。
