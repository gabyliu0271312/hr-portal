# PM-T015 考核方式设置

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons: missing_replayable_session, missing_dpr, missing_target_screenshot, missing_persistence_contract

## 1. 目标

实现绩效后台「系统设置 → 考核方式设置」页面，展示关键指标考核和项目制考核配置，并提供采集到的开关、项目合作关系来源及结果入口可见性设置。

## 2. 本期范围

- 页面标题和两张白色设置卡片。
- 关键指标考核开关，默认关闭，并从后端读取/保存状态。
- 项目制考核开关，默认开启。
- 项目合作关系来源：展示“管理员在周期中手动导入”的已选禁用项、项目角色配置摘要和编辑入口。
- 展示采集到的“查看使用说明”和“查看功能示例”入口。
- 展示项目团队绩效结果入口可见性复选框，默认未选中。
- 复用绩效共享 `PerformanceSwitch`、`PerformanceCheckbox` 控件。

## 3. 非范围

- 不虚构项目角色编辑之外的考核方式设置 API；关键指标考核开关使用 PM-T015-T05 定义的持久化接口。
- 不实现组织关系来源配置弹层和功能示例弹层；采集证据未提供可重放交互状态及表单契约。
- 项目角色编辑弹窗仅实现用户提供 SnapSpec 覆盖的结构、视觉和本地关闭行为，不新增角色字段、拖拽写入或保存 API。
- 不宣称截图像素级还原通过。

## 4. UI Implementation Brief

来源：`D:\乐逗\Desktop\考核方式设置.txt`；URL `https://idreamsky.feishu.cn/perf/admin/system-setting/assessment-pattern`；viewport `1534×911`。

- 页面使用绩效后台现有布局和系统设置导航。
- 卡片宽度随内容区，白底、8px 圆角、20px 内边距、绩效中性阴影、卡片间距 16px。
- 卡片标题 16px/600/24px，正文 14px/400/21px，主文本 `#1F2329`，辅助文本 `#646A73`，操作色 `#1456F0`。
- 关键指标卡包含标题、查看使用说明链接、右侧开关。
- 项目制考核卡包含标题、查看使用说明链接、右侧开关；下方使用虚线分隔线和项目合作关系来源配置；底部使用虚线分隔线和项目结果入口可见性配置。
- 可见文案、控件顺序和禁用态以 `extracted-ui-contract.json` 为准。

采集 readiness：`capture_integrity=blocked`、`capture_completeness=incomplete`、`implementation_readiness=ready`、`readiness_scope=variant`。P0/P1 结构可实现，P2 像素验收保持 blocked。
