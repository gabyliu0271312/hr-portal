---
name: hr_portal_report_dangling_field_ref
description: 报表查询弹"计算字段已被删除/已自动跳过"告警的根因与修复——脏引用需重新保存才清除
metadata:
  type: project
---

报表点"查询/查看"时弹「报表引用的计算字段「calc.xxx」已被删除,已自动跳过」一串告警(可多条),但用户在界面上没看到用这些字段。

**根因**:`reports.config.columns`(JSON)里残留了已从数据集删除的字段引用(多为 `calc.*` 计算字段)。前端 ReportFieldPicker / ReportDesigner 渲染"已选字段"时用 `.filter(Boolean)` 把数据集里找不到的引用静默丢弃 → 界面看不见、也没有移除按钮 → 但保存时原样写回,所以删不掉。查询时后端 sql_builder.py 比对发现引用不存在 → 报警(该告警**只在 columns 这一处产生**,filters/sorts/value_rules 里的孤儿 calc 是静默忽略,不报警)。功能不受影响(后端已自动跳过)。

**修复**(2026-06-26, commit dbfe7a4,前端 ReportDesigner.vue buildPayload):持久化前按 allColumns 过滤剔除孤儿引用(守卫 allColumns 非空,避免字段未加载完时误清空)。

**关键运维点**:修复只在**重新保存报表**时生效——光"查询/查看"不会改动已存 config,照报。存量报表逐个打开点保存一次即自愈。

**Why**:用户是业务用户,遇到这类告警会困惑"我没用这字段为啥报错"。
**How to apply**:再遇到同样告警 → 让用户打开该报表点一次保存即可,不必改库改代码。若想批量清存量,可逐张报表 resave,或直接改 config.columns(需 SQL,见 [[hr_portal_server_deploy]] 连库方式)。
