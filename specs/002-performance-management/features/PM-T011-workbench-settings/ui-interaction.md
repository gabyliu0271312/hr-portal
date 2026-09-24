# PM-T011 UI 交互

## 入口

- 路由：`/performance/settings/system/workbench`。
- 路由名：`PerformanceSystemWorkbench`。
- 父布局：`PerformanceAdminLayout`。

## 页面结构

```text
工作台设置
├─ 更多入口（白卡）
│  ├─ 说明 + 查看功能示例
│  └─ 入口列表
│     ├─ 标题 + 新建
│     ├─ PerformanceListToolbar
│     └─ PerformanceManagementTable
└─ 公告功能（白卡）
   ├─ 说明 + PerformanceSwitch
   └─ 公告列表
      ├─ 标题 + PerformanceListToolbar
      └─ PerformanceManagementTable
```

## 交互

- 搜索框输入后按回车或清空触发重新加载；关键字只匹配标题。
- 筛选按钮保留统一入口，当前通过状态筛选菜单选择全部/已启用/已停用。
- 新建和编辑复用同一个表单弹窗，按实体切换字段；成功后关闭并刷新当前列表。
- 启用/停用使用已有确认反馈，失败保留当前状态并显示错误。
- 删除使用已有 `PerformanceConfirmDialog`，确认后刷新列表。
- 公告开关更新成功后保留当前公告列表；失败恢复原值并提示。
- 前端工作台进入或切换项目时，按当前项目 `cycle_ref` 读取公告消费接口；关闭开关时隐藏公告卡片，开启且无可见公告时显示空态；公告链接使用后台保存的 `link`。
- 加载中显示表格 loading 文案；空列表显示组件空态；接口失败显示重试操作。

## 共用组件边界

- 搜索和筛选：`PerformanceListToolbar` + `PerformanceSearchInput`。
- 表格和分页：`PerformanceManagementTable`。
- 开关：`PerformanceSwitch`。
- 删除确认：`PerformanceConfirmDialog`。
- 页面不创建独立搜索框、独立表格分页、独立开关或独立确认弹窗。

## 5. 新建/编辑弹窗（采集参数，2026-09-21）

采集来源：`D:\乐逗\Desktop\工作台设置--新建.txt`，viewport `1534×911`，弹窗 `600×706px`。

- 入口与公告共用 `WorkbenchSettingEditor` + `PerformanceDialogShell`；通过 `kind` 只切换业务字段，不复制弹窗。
- 弹窗：白底、8px 圆角；header 72px；左右内容内边距 24px，右侧关闭按钮保留 56px 空间；标题 16px/600/24px；关闭图标 20px。
- 公告字段顺序：公告标题、跳转链接、展示周期、可见范围、弹窗并要求查看人确认知悉。
- 标题和跳转链接使用共用 `PerformanceTextField` 的 `feishu-input` 变体，并显示「中文」语言标签和新增语言图标入口。
- 展示周期共用 `PerformanceRadioGroup`，纵向排列：所有周期 / 指定周期，默认所有周期；选择指定周期后，在下一行显示共用 `PerformanceSearchSelect` 选择框，placeholder 为「请选择」。
- 可见范围共用 `PerformanceRadioGroup`，纵向排列：所有人 / 指定人员，默认所有人；选择指定人员后，在下一行显示共用 `PerformanceSearchSelect` 选择框，placeholder 为「请选择」。
- 确认知悉使用共用 `PerformanceSwitch`，默认关闭；「查看示例」保留为后续入口。
- 周期选择框打开时调用现有 `performanceCycleApi.list`，将周期 `cycle_ref` 作为 value、周期名称作为 label；人员范围选择框使用绩效域既有角色语义，选项为「管理范围内有人参评的 HRBP」和「管理范围内有人参评的实线上级」。
- 底部按钮顺序：取消、保存、启用；保存写入停用状态，启用写入启用状态。
- 入口弹窗复用同一壳体和标题/链接字段，追加图标标识字段；公告专属的周期、范围和确认开关不显示。

### 新增设计 token

新增 token 位于 `frontend/src/styles/tokens.css`：

- `--performance-workbench-editor-width: 600px`
- `--performance-workbench-editor-header-height: 72px`
- `--performance-workbench-editor-field-gap: 28px`
- `--performance-workbench-editor-language-tag-*`
- `--performance-workbench-editor-compact-switch-*`
- `--performance-dialog-header-padding-right: 56px`

完整的 hover、focus、指定周期/指定角色后续选择内容和弹窗截图 diff 未提供，仍不宣称像素级通过。
