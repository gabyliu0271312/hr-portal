# PM-T007 标签型填写题管理 UI 蓝图

- 功能：PM-T007 标签型填写题管理
- 蓝图文件：`specs/002-performance-management/ui-blueprints/PM-T007-tag-fill-question.md`
- 版本：v1
- 状态：已确认
- 确认人：用户
- 确认日期：2026-09-02
- 实现范围：fixture-only 前端，不接真实 API、不写数据库、不执行保存/删除
- 证据来源：PM-T007 `extracted-ui-contract.json`、`state-map.json`、`capture_model.json` 及 1920×1080/DPR1 采集截图

## 1. 页面范围

| 页面 | 路由 | 角色 | 入口 | 是否新增 |
|---|---|---|---|---|
| 标签型填写题列表 | `/perf/admin/tagged-fill-in-questions` | 绩效管理员 fixture | 评估题管理 > 标签型填写题 | 是 |
| 新建标签型填写题 | `/perf/admin/tagged-fill-in-questions/create` | 绩效管理员 fixture | 列表 > 新建 | 是 |
| 编辑标签型填写题 | `/perf/admin/tagged-fill-in-questions/{id}?from` | 绩效管理员 fixture | 列表 > 编辑 | 是 |

## 2. 信息架构

### 页面框架

```text
PerformanceAdminLayout
├── Header：飞书绩效设置
├── SideNavigation
│   └── 评估题管理
│       ├── 评估题
│       └── 标签型填写题
└── MainContent
```

### 列表页

```text
标签型填写题
└── PerformanceListPage
    ├── PerformanceListToolbar
    │   ├── 新建
    │   ├── 搜索：通过名称、备注搜索
    │   └── 筛选
    ├── TagFillQuestionTable
    │   ├── 名称
    │   ├── 创建人
    │   ├── 创建时间
    │   ├── 备注
    │   └── 操作：编辑 / 删除（fixture 状态）
    └── Pagination
```

### 新建/编辑页

新建和编辑复用同一主体表单组件，使用 `mode=create|edit`；标题文案由 mode 负责。

```text
TagFillQuestionPage
├── SharedPerformancePageHeader
│   ├── 返回
│   └── mode title
├── TagFillQuestionForm
│   ├── 中文 / 更多 / 多语言配置
│   ├── 名称 *
│   ├── 描述
│   ├── 标签
│   │   └── TagItemEditor × N
│   │       ├── 名称 *
│   │       ├── 说明
│   │       └── 提示
│   ├── 添加标签
│   └── 备注
└── SharedPerformanceActionBar
    ├── 提交
    ├── 预览
    └── 取消
```

新建和编辑是独立页面，不实现为居中弹窗。

## 3. 已确认的页面状态

| variant | source_state_ids | 状态 |
|---|---|---|
| `list-default` | `LIST-DEFAULT` | 已确认部分结构 |
| `list-row-hover` | `LIST-ROW-HOVER` | 已确认部分操作样式 |
| `create-default` | `CREATE-DEFAULT` | 已确认 |
| `edit-default` | `EDIT-DEFAULT` | 已确认部分回填 |
| `description-focus` | state-map 对应 3 个观察 | 已确认部分 |
| `remark-focus` | state-map 对应 3 个观察 | 已确认部分 |
| `preview-validation` | `FORM-PREVIEW-VALIDATION` | 已确认部分 |
| `preview-success` | state-map 对应 3 个观察 | 已确认部分 |
| `tag-added` | state-map 对应 3 个观察 | 已确认部分 |

未纳入本期独立变体：textarea dragging；直接复用既有多行文本框的垂直 resize 能力。

## 4. 三项不可变约束

以下行为不在本次开发中改动：

1. “计算规则”、“子评估题”以及“新建子评估题”按钮不放在“评估方式”大底框上。
2. 自评估题下方第一列表头固定为“子评估题”，不显示“名称”。
3. 新建子评估题选择器：点击外部区域关闭；已选择项再次点击取消选择，不新增重复子评估题。

这些约束属于既有评估题/子评估题流程的保护规则，不作为 PM-T007 标签型填写题页面的重新设计范围。

## 5. Fixture-only 边界

### 本期允许

- 使用本地 fixture 渲染列表记录、创建态和编辑回填态；
- 本地表单状态、focus、标签新增、预览和校验反馈；
- 使用既有列表、Header、Footer、textarea 和基础表单组件；
- 保留所有采集截图要求的结构和状态。

### 本期禁止

- 真实 GET/POST/PATCH/DELETE API；
- 数据库模型和迁移；
- 真实提交、保存、删除和审计写入；
- 修改 PM-T005 评估题或子评估题既有行为；
- 将未确认的导航 SVG、错误码或权限点写成产品事实。

## 6. 页面状态反馈

| 场景 | 反馈 |
|---|---|
| 列表加载 | fixture loading 状态 |
| 列表为空 | fixture empty 状态 |
| 新建 | 进入独立新建页面 |
| 编辑 | 进入独立编辑页面并回填 fixture |
| 空表单预览 | 显示名称和标签名称必填错误，不保存 |
| 合法草稿预览 | 打开预览状态，关闭后保留本地草稿 |
| 添加标签 | 新增标签编辑卡片并自然增加页面高度 |
| 返回/取消 | 仅清除本地 draft；未保存确认按后续 evidence 冻结 |

## 7. 组件确认要求

正式 UI 实现前需确认：

- 蓝图版本和路由；
- `PerformanceListToolbar`、列表表格和分页复用边界；
- `SharedPerformancePageHeader` 和 `SharedPerformanceActionBar` 复用边界；
- `TagFillQuestionForm(mode=create|edit)` 共享主体；
- fixture-only 非持久化范围；
- 三项不可变约束不被 PM-T007 改动。

## 8. 未决项

- 真实 API、数据模型、权限和引用限制转入后续 `PM-T007-T03`；
- 最新采集器 Brief 尚未自动生成正式 variants；当前以 `state-map.json` 和 PM-T007 机器契约作为待确认输入；
- 独立 PNG 蓝图产物待蓝图确认后生成或从实现页面生成，不能使用采集原图冒充实现截图。
