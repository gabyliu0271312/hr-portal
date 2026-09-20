# PM-T007 验收契约

```text
completion_status: incomplete
pixel_restore_status: blocked
```

## AC-00 证据门禁

Given 开始 PM-T007 UI 实现
When 检查 `capture-manifest.md`、`capture-completion-checklist.md`、`component-model.md` 和 `extracted-ui-contract.json`
Then 所有实现状态必须有完整 before/after HTML、layout、computed、interaction evidence、target contract 和截图。

当前结果：采集完整性已通过；列表、新建页和编辑页 after 有部分 artifacts；导航目标映射、语义上下文和 implementation brief 仍未完成，因此阻塞。

## AC-01 列表结构

Given `LIST-DEFAULT`
When 渲染标签型填写题管理列表
Then 标题为“标签型填写题”，工具栏包含“新建”和“筛选”，搜索 placeholder 为“通过名称、备注搜索”，表头顺序为“名称/创建人/创建时间/备注/操作”。

当前：列表默认和编辑按钮 hover 已有事件/after artifacts；完整列宽、间距和分页证据未完成。

## AC-02 列表复用边界

Given PM-T006 的 `PerformanceListToolbar`、表格外壳和分页组件
When 对照 T007 的 `LIST-DEFAULT`
Then 只复用 anatomy、基础状态和通用操作；标题、列名、列宽、行内容、间距和页面专属布局必须由 T007 证据驱动。

当前：not-run；需要完成逐列几何对照。

## AC-03 导航状态

Given 评估题管理父菜单处于默认态
When hover、展开、收起并分别选择“评估题”和“标签型填写题”
Then 每个状态都有独立截图、SVG、computed、aria-expanded、before/after 和 interaction evidence；标签型填写题选中态记录左侧底色与最边缘竖线。

当前：blocked。

## AC-04 新建入口

Given 标签型填写题列表已加载
When hover 并点击“新建”
Then 记录按钮 `80×32` 默认/hover 状态，并进入独立新建页面 `/perf/admin/tagged-fill-in-questions/create`；不得创建真实数据。

当前：路由和 after 页面已观察；触发检查点语义状态不完整。

## AC-05 新建页面字段

Given `CREATE-DEFAULT`
When 渲染新建标签型填写题页面
Then 显示返回、标题“新建标签型填写题”、中文/多语言配置、名称、描述、标签编辑区、添加标签、备注和提交/预览/取消操作；字段顺序和已确认 placeholder 与 `component-model.md` 一致。

当前：结构和主要几何部分通过；精确控件样式、所有视觉元素和交互状态 blocked。

## AC-06 标签配置

Given 标签编辑区已显示
When 检查标签名称、说明、提示及“添加标签”
Then 必填标记、placeholder、计数器、字段顺序和新增后的高度变化与采集证据一致。

当前：默认标签组、添加第二标签后的纵向增长和删除控件已获得 after artifacts；新增后的完整交互/删除语义仍未确认。

## AC-06A 表单焦点

Given 新建表单已打开
When 聚焦描述或备注文本域
Then 控件边框进入 focus 样式，页面不跳转、不产生写入。

当前：描述和备注 focus after 已生成；完整控件 focus 矩阵仍未完成。

## AC-06B 空表单预览校验

Given 新建表单为空
When 点击“预览”
Then 不产生保存请求，显示名称和标签名称的“名称为必填”错误，并显示中文区域错误状态；预览成功内容不应覆盖当前表单。

当前：`FORM-PREVIEW-VALIDATION` after 已生成；错误元素精确 SVG 和完整行为仍待投影。
## AC-06C 合法草稿预览

Given 名称为`示例标签型填写题`且至少一个标签名称为`价值观`
When 点击“预览”并关闭预览
Then 记录预览成功态、关闭后表单状态和本地草稿保留；不产生真实保存请求。

当前：合法草稿预览、关闭和添加标签 after artifacts 已生成；具体预览内容和结构仍需投影。

## AC-07 编辑页面

Given 列表存在可编辑记录
When 点击第一条可用记录的“编辑”
Then 进入编辑状态，记录标题、回填值、字段可编辑性和 Footer；新建与编辑在 DOM/组件层面对照后，才能确认共享 `TagFillQuestionForm`。

当前：已获得编辑按钮 hover 和编辑页面稳定 after；触发检查点闭环、所有字段可编辑性、Footer 差异及新建/编辑 DOM ownership 对照仍未完成。

## AC-08 危险动作阻断

Given 新建或编辑页面
When 用户未明确授权
Then 不触发提交、保存、确认创建或删除；采集器只记录安全的打开、hover、focus 和关闭动作。

当前：本轮未执行危险动作。

## AC-09 视觉关系

Given 任一已确认状态
When 比较运行时 rendered contract 与 extracted target contract
Then 逐项比较容器四边 inset、first/terminal visible child、bbox、字体、颜色、边框、圆角、阴影、SVG、overflow、z-index 和状态差异。

当前：rendered contract 和截图 diff 未运行，pixel 状态必须保持 blocked。

## AC-10 权限和错误

Given 无权限、接口失败、空列表、重复标签、超长输入或并发更新
When 访问或操作 T007
Then 展示真实契约规定的权限/错误/校验反馈，不泄露数据且不产生部分写入。

当前：后端错误码、权限矩阵和持久化契约未确认，blocked。
