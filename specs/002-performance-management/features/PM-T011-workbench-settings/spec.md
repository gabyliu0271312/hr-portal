# PM-T011 工作台设置

- 状态：实现中（P0/P1）
- completion_status: incomplete
- pixel_restore_status: blocked
- uncovered_reasons: 需求文档只提供默认态 SnapSpec，未提供新建/编辑弹窗、筛选面板、hover/disabled 状态和完整截图证据。

## 1. 背景与目标

实现绩效后台「系统设置 → 工作台设置」页面，维护工作台中的「更多入口」和「公告」配置。页面复用现有绩效管理组件和 Element Plus 基础组件，不复制新一套按钮、表格、搜索框或开关。

## 2. 范围

### 本期实现

- 更多入口功能说明、入口列表、搜索、筛选、新建、编辑、启用/停用、删除。
- 公告功能开关、公告列表、搜索、筛选、新建、编辑、启用/停用、删除。
- 配置持久化、列表分页、关键字查询、权限校验和审计事件。
- 前端工作台按当前项目周期读取启用公告，公告标题和链接来自后台配置；公告开关、状态、周期范围和 HRBP/实线上级可见范围在消费接口侧生效。
- 现有入口路由 `PerformanceSystemWorkbench` 接入真实页面。

### 非范围

- 公告内容发布、阅读统计和消息推送。
- 复杂组织/人员可见范围选择器；本期保存可见范围文本/范围编码，后续可接入组织选择器。
- 图标素材上传和图标市场；本期保存图标标识。
- 像素级验收；完整采集包和弹窗状态缺失。

## 3. 角色与权限

- 页面入口沿用绩效后台访问权限。
- 读写接口要求 `performance.configuration.manage`。
- 未授权用户返回 403；前端不以隐藏按钮替代服务端校验。

## 4. 数据模型

### WorkbenchEntry

- `id`：主键
- `title`：入口标题，必填，最长 128
- `status`：`active` / `inactive`
- `link`：站内或外部链接，必填，最长 2048
- `icon`：图标标识，可空，最长 128
- `visibility`：可见范围文本/编码，默认「所有人」
- `display_order`：列表顺序
- `created_by_type` / `created_by_ref` / `created_at` / `updated_at`

### WorkbenchAnnouncement

- `id`：主键
- `title`：公告标题，必填，最长 128
- `status`：`active` / `inactive`
- `link`：公告链接，必填，最长 2048
- `cycle_label`：展示周期文本，默认「所有周期」
- `visibility`：可见范围文本/编码，默认「所有人」
- `display_order`：列表顺序
- 创建、更新时间和操作者字段同上

## 5. 业务规则

- 列表默认按 `display_order`、`id` 升序。
- 关键字匹配标题；空关键字返回当前页全部数据。
- 启用/停用只改变状态，不删除配置。
- 删除为真实删除，前端必须经过确认弹窗；后端记录审计。
- 公告功能开关独立于公告数据；关闭时不删除已有公告。
- 新建/编辑校验标题、链接非空；未知字段不接受。

## 6. UI Implementation Brief

来源：`D:\乐逗\Desktop\工作台设置.txt`，状态标识 `SOURCE-WORKBENCH-SETTINGS-DEFAULT-1534`。

- 页面容器：白底、8px 圆角、20px 左右内边距。
- 更多入口：标题「更多入口」；说明文案；链接「查看功能示例」；列表标题「入口列表」；右侧新增按钮。
- 公告：标题「公告功能」；说明文案；右侧开关；下方「公告列表」工具栏。
- 工具栏：复用 `PerformanceListToolbar`，搜索 placeholder 分别为「搜索标题」，保留筛选事件。
- 表格：复用 `PerformanceManagementTable`，固定右侧操作列；列按需求文件为标题、状态、链接、图标/展示周期、可见范围、操作。
- 状态：加载、空、错误、正常列表、开关开/关、编辑弹窗和删除确认。
- 组件所有权：页面负责数据加载和弹窗状态；共享工具栏/表格/开关负责通用交互；API 负责权限和持久化。

像素证据不完整：缺少弹窗、筛选、hover、disabled 和真实目标截图，保持 `pixel_restore_status: blocked`。

## 7. 当前实现状态（2026-09-21）

已实现：

- 后端模型、0229/0230 Alembic 迁移、配置 API、CRUD、分页/关键字/状态筛选、权限依赖和审计事件；
- 前台工作台新增只读公告消费接口，按公告开关、启用状态、当前项目周期和 HRBP/实线上级可见范围过滤；
- 前端真实页面、路由接入、入口/公告列表、共享工具栏/表格/开关/确认弹窗复用、采集参数驱动的新建/编辑共享弹窗、加载/空/错误状态；
- 公告新增 `require_ack`、`cycle_ref`、`visibility_role` 持久化字段；展示周期和可见范围按采集的所有/指定模式写入契约字段，并接入真实周期 API 与人员范围选项；
- 后端聚焦测试 3 passed；前端工作台设置/弹窗聚焦测试 6 passed；新增代码通过定向类型错误筛查。

未完成/阻塞：

- 完整后端 API CRUD/403 集成测试、真实数据库升级/降级和 UI→API→数据库→重开验收尚未运行；
- 全量前端构建被既有未修改文件中的类型错误阻断：`PerformanceHrbpPermissionTable.spec.ts` 1 项、`CycleHrbpPermissionManagement.spec.ts` 2 项；
- UI 实现门禁因缺少 `capture-manifest.md`、`capture-completion-checklist.md`、`component-model.md`、`pixel-contract.md`、`acceptance-contract.md`、`extracted-ui-contract.json` 且 T01 未勾选而 blocked；
- 不宣称像素级通过或生产部署完成。
