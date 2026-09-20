# PM-T007 UI 交互契约

```text
completion_status: incomplete
pixel_restore_status: blocked
```

## 1. 路由和入口

- 列表入口：`/perf/admin/tagged-fill-in-questions?currentPage=1&pageSize=10`。
- 采集到的新建入口：`/perf/admin/tagged-fill-in-questions/create`。
- “评估题管理”父菜单下至少显示“评估题”和“标签型填写题”两个子项；展开/收起及选中态证据尚未完成语义映射。

## 2. 列表默认态

已观察：

- 页面标题：`标签型填写题`；
- 工具栏：左侧“新建”，右侧搜索和“筛选”；
- 搜索 placeholder：`通过名称、备注搜索`；
- 表头：`名称 / 创建人 / 创建时间 / 备注 / 操作`；
- 默认可见记录：`价值观`、`投入度`、`价值贡献`；
- 分页显示当前共 3 条、1 页和 10 条/页。

列表与 PM-T006 评估规则列表应共享基础列表外壳，但 T007 的标题、列、列宽和间距以自身证据为准。

## 3. 新建页面

新建按钮点击后不是居中弹窗，而是进入独立表单页面：

```text
Header
├── 返回
└── 新建标签型填写题

Main
├── 中文 / 更多 / 多语言配置
├── 名称 *
├── 描述
├── 标签
│   └── 标签项
│       ├── 名称 *
│       ├── 说明
│       └── 提示
├── 添加标签
└── 备注

Footer
├── 提交
├── 预览
└── 取消
```

已确认的主体几何：

- Header：1920×56；
- 表单根：x=584、y=64、752×719.333374；
- 标签区：x=584、y=311.333343、752×352.666687；
- Footer：x=584、y=767.333374、752×64。

## 4.1 表单补采状态

已补采：

- 描述字段 focus：边框进入蓝色 focus 状态；
- 备注字段 focus：边框进入蓝色 focus 状态；
- 点击“添加标签”：新增第二组标签卡片，页面出现纵向滚动，新增标签项包含名称、说明、提示和删除控件；
- 空表单点击“预览”：不产生写入，显示“名称为必填”错误，名称输入框/标签名称输入框进入红色错误状态，并在中文区域显示错误图标。

尚未补采：

- 文本域 dragging/after-drag；
- 预览成功态已获得，具体预览内容/布局仍待投影；
- 新增/删除标签的完整键盘和错误行为。


已补采第一条记录“价值观”的编辑分支：

- 编辑按钮 bbox：`x=1638.47,y=246.33,w=28,h=22`；
- 编辑按钮文字颜色：`rgb(36,91,219)`；
- 编辑路由：`/perf/admin/tagged-fill-in-questions/7173973572648894465?from`；
- Header 标题：`价值观`；
- 名称字段回填：`价值观`；
- 描述字段已有内容，计数器为 `47/20000`；
- 标签名称回填：`价值观测评语`；
- 说明、提示和备注的编辑态仍需逐字段确认。

已观察到编辑页面与新建页面主体几何一致，当前可将 `TagFillQuestionForm(mode=create|edit)` 作为高可信共享候选；但 Footer 差异、字段 disabled/readonly 差异和完整 DOM ownership 仍需进一步对照，尚不能标记为已确认复用。

## 5. 状态矩阵

| 组件 | default | hover | focus | active | disabled | expanded | after-click |
|---|---|---|---|---|---|---|---|
| 评估题管理父菜单 | partial | blocked | blocked | blocked | blocked | blocked | blocked |
| 标签型填写题子项 | partial | blocked | blocked | partial | blocked | N/A | blocked |
| 新建按钮 | confirmed | event recorded | blocked | blocked | blocked | N/A | partial route evidence |
| 列表行 | confirmed | blocked | N/A | N/A | blocked | N/A | edit missing |
| 标签项编辑器 | confirmed default | blocked | blocked | blocked | blocked | N/A | add missing |
| Header 返回 | confirmed default visual | blocked | blocked | N/A | blocked | N/A | blocked |
| Footer 操作 | confirmed default visual | blocked | blocked | blocked | blocked | N/A | dangerous actions excluded |

## 6. 安全与离开页面

- 提交、保存、确认创建和删除属于写入/危险动作，未授权时不得自动执行。
- 返回和取消是否弹出未保存确认尚未采集。
- 失败时应保留用户输入；错误文案和重试行为待 API 契约冻结。
- 编辑页面被周期/模板引用时的锁定行为待产品和后端确认。

## 7. 无障碍与键盘

待补采并确认：

- 父菜单 `aria-expanded`；
- 子项 `aria-current`/`aria-selected`；
- Header 返回按钮名称；
- 表单 label 与 input 关联；
- 必填标记的语义；
- 键盘 focus 顺序；
- Escape、Enter 和 Tab 行为。

## 8. 当前实现边界

本文件是证据投影，不授权前端实现。正式 UI 实现前必须：

1. 补齐导航和编辑证据；
2. 创建并确认 PM-T007 UI 蓝图；
3. 生成完整 `variant_contracts` 和容器四边约束；
4. 冻结 API、数据模型和权限；
5. 为 visible/forbidden/line-group 生成测试契约。
