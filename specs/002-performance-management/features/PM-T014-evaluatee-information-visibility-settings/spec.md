# PM-T014 被评估人信息可见性设置

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons: missing_replayable_session, missing_dpr, missing_target_screenshot, missing_editor_state, missing_interaction_evidence

- 状态：实现中（P0/P1）
- 采集限制：SnapSpec 提供默认列表态 HTML/CSS、文案与 viewport，但没有可重放 session、稳定状态 ID、DPR、编辑弹层状态、完整 before/after 证据或目标截图；本期实现业务框架与真实数据联动，不宣称 P2 像素验收通过。

## 1. 目标

实现绩效后台「应用设置 → 权限管理 → 被评估人信息可见性设置」，管理员按角色维护被评估人资料字段；配置真实影响工作台人员任务列表的资料列，以及填写详情页现有 header 元信息的数据来源。

## 2. 范围

- 10 个角色的默认规则、分页列表与编辑。
- GET/PATCH API、单例持久化、权限校验与审计。
- 复用 `PerformanceManagementTable`、其内置分页器、`PerformanceDialogShell`、`PerformanceCheckbox` 和共享权限按钮。
- 工作台人员列表按当前查看者相对角色返回并展示允许字段；隐藏字段不返回真实值。
- 填写详情 API 返回允许显示的 `profile_fields`，现有 header 继续使用原有单行点分隔格式。

## 3. 非范围

- 不改变工作台列表、填写详情 header 的视觉格式。
- 不实现导出、标签信息配置组织关系采集、角色授权或周期快照重写。
- 不宣称编辑弹层或交互态像素级还原完成。

## 4. 权限与安全

- 配置 GET/PATCH 要求 `performance.configuration.manage`。
- 运行时可见性由服务端按可信身份、任务、项目和人员快照解析；前端只消费裁剪后的字段和列键。
- 不因修改全局配置回写已启动周期人员快照；仅改变读取时披露范围。

## 5. 默认角色规则

| 角色键 | 角色名称 | 默认可见字段 |
| --- | --- | --- |
| `reviewee` | 被评估人 | 部门、职级、序列 |
| `leader` | 实线上级 | 部门、职级、序列、直属上级、入职日期 |
| `dotted_leader` | 虚线上级 | 部门、职级、序列、直属上级、入职日期 |
| `pdt_manager` | PDT 管理者 | 部门 |
| `metric_reviewer` | 指标评价人 | 部门 |
| `reviewer_360` | 360°评估人 | 部门、序列、直属上级、入职日期 |
| `adjuster` | 校准人 | 部门、职级、序列、直属上级、入职日期 |
| `hrbp` | HRBP | 部门、职级、序列、直属上级、入职日期 |
| `activity_manager` | 项目管理员 | 部门、职级、序列、直属上级、入职日期、人员类型 |
| `other` | 其他角色 | 部门、序列、直属上级、入职日期 |

## 6. UI Implementation Brief

来源：`D:\乐逗\Desktop\被评估人可见性设置.txt`；URL `https://idreamsky.feishu.cn/perf/admin/permission/information/setting`；viewport `1534×911`。

默认列表 variant：说明文案位于表格卡片上方；白色卡片 8px 圆角、20px 内边距、绩效中性阴影；表头依次为角色名称、可见标签信息、可见字段、操作；10 行；标签信息显示 `--`；操作显示蓝色“编辑”；底部分页显示总数、前后页、当前页和每页条数。页面、表格、分页和编辑器归属见 `component-model.md`。

采集 readiness：`capture_integrity=blocked`、`capture_completeness=incomplete`、`implementation_readiness=design_incomplete`、`readiness_scope=variant`。依据 ADR-002 仅推进 P0/P1；P2 仍 blocked。
