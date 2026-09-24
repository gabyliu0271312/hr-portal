# PM-T017 指标库页面框架

- 状态：指标库列表框架已实现；指标数据、指标字段编辑和接口联调未接入
- UI 目标：P0 + P1 框架
- 采集来源：`D:\\乐逗\\Desktop\\指标库.txt`
- 采集页面：`/perf/admin/metrics-management/metrics-lib?currentPage=1&pageSize=10`
- 采集视口：894x631 Tablet

## 1. 本轮范围

根据采集到的指标库页面结构，实现后台「应用设置 → 指标管理 → 指标库」页面框架：

- 页面标题“指标库”；
- 标题右侧字段与公式入口的视觉占位；
- 白色内容卡片、克制阴影与 20px 内容内边距；
- 新建指标文字按钮（包含公共加号图标）；
- 按名称搜索、筛选、自定义列抽屉、使用多维表格编辑入口；
- 空状态“暂无内容”；
- 空状态辅助说明“指标库中的指标可以由管理员和被评估人在添加指标时选用”；
- 从绩效后台应用设置路由进入页面。

## 2. 明确非范围

- 不根据空状态采集结果推断指标行字段；
- 不实现指标新建/编辑表单；
- 不实现字段、公式管理页；
- 不接入指标库查询、新建、筛选或多维表格接口；
- 不新增数据库迁移、后端 API 或绩效指标业务规则；
- 不宣称像素级还原通过。

## 3. 实现约束

- 标题和内容卡片复用 `PerformanceListPage` 与 `PerformanceContentSurface`，标题右侧操作使用公共页面壳插槽；
- 复用 `PerformanceCreateButton`、`PerformanceButton`、`PerformanceSearchInput`、`PerformanceFilterButton` 等全局组件；
- 颜色、字号、间距、圆角和阴影只消费 `src/styles/tokens.css` 的设计 Token；
- 保留已有 `PerformanceAdminLayout` 和 `PerformanceMetricLibrary` 路由，不改动应用设置导航结构；
- 未采集的操作只作为入口占位并给出后续接入提示，不写入虚拟数据。
