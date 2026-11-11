# REA 矩阵分析-人员数量超链接弹窗 DOM与接口提炼报告

> 提炼日期：2026-11-08 · 方式：REA 反向工程（共享 headless Chrome CDP 9333）· 本轮只做组件提炼与复用对比，**未改任何代码**

## 0. 页面定位

- 路径：绩效管理前台 → 项目管理 → 矩阵分析 → **已完成评估** → 右侧「展示方式」选 **人员数量** → 点击矩阵中的蓝色数量数字（超链接）跳转
- REA URL（带 drilldown 过滤，J5/3星/已完成）：
  `perf/management/v2/7654423719619710195/7340285661313974274/all-projects/matrix?drilldown={...finalReviewStatus=statusFinished, level, finalReviewScoreGroup, range=2...}`

## 1. 矩阵数字（触发源）规格

### 1.1 矩阵容器
- 外层：`MatrixBlock__MatrixBlockWrapper`（x=300 y=164 w=1550 h=838）
- 表格：`.ud__table`（x=300 y=559 w=1550 h=443），thead 57px / 行 55px
- 列：`职级`(100px 固定左) + 7 个星级列各 206.8px（1星/2星/3星-/3星/3星+/4星/5星）
- **`BasicDistributeMatrix__BasicMatrix` class 名不稳定**（带 hashed suffix `-buCItP kOiAAl`），切展示方式后失效——**不能作为选择器依赖**，应以 `td.matrixColumn` 定位

### 1.2 数字单元格（超链接载体）
```
td.ud__table-cell.matrixColumn   (行高 55px, 列宽 206.8px)
 └─ div.StatisticBlock__StyledBlock.level2   ← 整块可点击
     ├─ div: 40.0%   (占比)
     └─ div: 4       (人数)
```
- 可点击块样式：`color: rgb(19,60,154)`（蓝）、`cursor: pointer`、`bg: rgb(186,206,253)`（浅蓝底）、font-size 14px/400
- 空值：`div.matrix-cell-zero-count` → `--`，`color: rgb(143,149,158)`（灰）、cursor default、**不可点击**
- 点击整块 `StyledBlock.level2` 触发跳转（非 a 标签，是 div+JS 路由）

## 2. 跳转后弹窗 = 全屏 Modal（head + 表格）

### 2.1 弹窗骨架
| 项 | 值 |
|---|---|
| 容器 class | `full-screen-modal click-close-drawer`（父 `DrillDownList__Style`） |
| 尺寸 | 全屏 x=0 y=0 **w=1898 h=902**，`position: fixed`，`z-index: 49` |
| 背景 | `rgb(245,246,247)`（#F5F6F7） |
| 弹层 | 无 mask（全屏接管） |
| 内容区 | `full-screen-modal-content`，x=0 y=56 w=1898 h=846，`padding: 20px`，bg #F5F6F7 |

### 2.2 Head 规格（白色 56px 条，关键复用参数）
```
full-screen-modal-header            x=0 y=0 w=1898 h=56  bg #FFF  padding 0 20px 0 16px  z=2
 └─ full-screen-modal-header-left   x=16 y=11.5 w=1069 h=32  (flex, align-center)
     ├─ full-screen-modal-header-back    x=16 y=11.5 w=68 h=32
     │    └─ span「返回」                fs 16px / fw 600 / lh 24px / color rgb(31,35,41)
     ├─ div「人员列表」                    x=113 y=15.5 w=64 h=24
     │                                  fs 16px / fw 600 / lh 24px / color rgb(31,35,41)
     └─ span「符合「2026年半年度绩效评估-终评状态：已完成，2026年半年度绩效评估-职级：J6，2026年半年度绩效评估-绩效评级（终评）：3星」的员工」
                                          x=185 y=19.5 w=884 h=17
                                          fs 14px / fw 400 / lh 24px / color rgb(100,106,115)  ← 副标题（钻取条件描述）
```
- **head 描述参数 = drilldown 条件拼装**：「符合「{维度名}：{维度值}，{维度名}：{维度值}，…」的员工」
  - 维度名模板：`{周期名}-{维度key}` → 「2026年半年度绩效评估-终评状态」「-职级」「-绩效评级（终评）」
  - 值：终评状态=已完成、职级=J6、绩效评级（终评）=3星
  - 收尾固定「的员工」
- 标题「人员列表」固定（与项目管理-成员列表弹窗一致）
- 「返回」按钮点击 = 关弹窗回矩阵（不换路由）

### 2.3 表格规格（与成员列表弹窗同源）
- **6 列**，thead 47px 高、行 55px 高、fs 14px、`color: rgb(100,106,115)`（表头）、`rgb(31,35,41)`（内容）

| # | 列 | 宽 | 特殊 class |
|---|---|---|---|
| 1 | 姓名 | 422 | `ud__table-column-sort ud__table-cell-fix-left`（固定左+可排序） |
| 2 | 部门全路径 | 422 | — |
| 3 | 绩效评级 | 271.3 | `ud__table-column-has-sorters` |
| 4 | 360° 评估率 | 271.3 | `ud__table-column-has-sorters` |
| 5 | 序列 | 195.9 | `ud__table-column-has-sorters` |
| 6 | 职级 | 233.6 | `ud__table-column-has-sorters` |

- 表头 `padding: 12px`，表头容器 `bg: rgb(255,255,255)`，首列表头 bg 白（固定列底色）
- 工具栏：y=99 h=28「搜索成员」「筛选」（搜索框 `ud__select__selector__search` 区，筛选按钮在右侧）
- 分页：y=443 h=28，`ud__pagination`，文本「1」（当前页），右下
- 示例行：`bruce.lan 蓝应志 | 技术中台/研发中心/后端开发组 | 3星 | 0/0 | 创梦天地集 | J6`，共 4 个结果（bodyText：「4个结果」「7 列被隐藏」= 本次钻取命中 4 人，其余列收起）

## 3. 接口链路（点击数字时）

### 3.1 矩阵加载（页面初始化，3 个接口）
```
POST /perf/api/report/v3/statistics/matrix_header
  {"dimension_x":"finalReviewScoreGroup$7655170451575966923","dimension_y":"allCategories",
   "filters":[{"key":"range","values":["2"]}],"semester_id":"7654423719619710195",
   "headerId":"header_activity_manager_matrix","roleId":"7340285661313974274"}
POST /perf/api/report/v3/statistics/2d/detail
  {"dimension_x":"finalReviewScoreGroup$7655170451575966923","dimension_y":"level",
   "filters":[{"key":"range","values":["2"]}],"semester_id":"7654423719619710195",
   "headerId":"header_activity_manager_matrix","roleId":"7340285661313974274","sub_num":250,"need_sub_num":4000}
POST /perf/api/report/v3/semesters/{semester_id}/users/list   ← 待完成/已完成两区共用
```

### 3.2 点击数字 → 弹窗数据（核心）
```
POST /perf/api/report/v3/semesters/7654423719619710195/users/list
{
  "offset": 0, "limit": 50,
  "filters": [
    {"key":"finalReviewStatus","values":["statusFinished"]},          ← 已完成（不变）
    {"key":"level","values":["7638922735033273568"]},                 ← 行=J6（本次点击行的 rowKey）
    {"key":"finalReviewScoreGroup$7655170451575966923","values":["7111633368893390849"]}, ← 列=3星
    {"key":"range","values":["2"]}                                    ← 周期范围（不变）
  ],
  "advance_filters": [],
  "headerId": "header_activity_manager_report",                        ← 弹窗表格数据源 header
  "orders": [{"key":"user","order":"ASC"}],                            ← 默认姓名升序
  "roleId": "7340285661313974274"
}
```
- **弹窗 = 复用成员列表的 users/list 接口**，只是 filters 动态加入钻取的行/列维度（`level` = 行维度值 id、`finalReviewScoreGroup$...` = 列维度值 id）
- 与矩阵初始加载的 users/list 差别：初始只带 `finalReviewStatus+level+finalReviewScoreGroup+range`（页面 URL drilldown 过滤），点击数字后 `level` 变为**点击行的 rowKey**（如 J6 = 7638922735033273568）
- 表头标题「人员列表符合「...」的员工」即由 filters 反推出描述

## 4. 全局组件复用评估（与 hr-portal 已有组件对比）

### 4.1 可直接复用的组件链
| 组件 | 用途 | 与本弹窗对应 |
|---|---|---|
| `UiFullScreenModal` | 全屏弹窗壳（无 mask、固定 z、bg #F5F6F7） | **完全对应** full-screen-modal 骨架 |
| `PerformanceManagementTable` | ud__table 封装（thead 47px / 行 55px / 排序 / 固定左列） | **完全对应** 6 列表格 |
| `PerformanceSearchInput` | 「搜索成员」工具栏 | 对应 y=99 搜索框 |
| `PerformanceFilterButton` | 「筛选」按钮 | 对应右侧筛选 |
| `PerformanceDialogShell` | 弹窗 head 壳（返回+标题+副标题） | **复用点：本弹窗 head 与成员列表 head 同构** |
| `FocusGroupPeopleDialog.vue` | 人员列表弹窗（UiFullScreenModal+搜索+表格+分页） | **本弹窗的 1:1 复用基准** |

### 4.2 与本弹窗的差异点（需要新增/适配）
1. **head 副标题**：成员列表弹窗副标题 = 组名；本弹窗副标题 = 「符合「{周期}-{维度}:{值},…」的员工」（**drilldown 条件描述**）→ 需把副标题做成 slot，钻取场景传入条件串
2. **列集**：成员列表 5 列（姓名/直属上级/一级部门/末级部门/序列）；本弹窗 6 列（姓名/部门全路径/绩效评级/360°评估率/序列/职级）→ 列集按场景配置
3. **数据源**：成员列表 loadFn 注入；本弹窗 = `users/list` + 动态 filters（点击行的 level + 点击列的 scoreGroup）→ 复用 loadFn 注入机制，钻取场景传 filters
4. **触发源**：矩阵数字 `div.level2`（非 a 标签）→ ProjectPerformanceMatrix 当前数字是纯 `<span class="count-value">`，**需补上超链接交互**（hover 蓝底 rgb(186,206,253)+cursor pointer+点击跳转）
5. 分页器「1」文本样式、工具栏位置(y=99) 与成员列表一致

### 4.3 结论
- **弹窗本体可直接复用 FocusGroupPeopleDialog 的组件链**（UiFullScreenModal + PerformanceManagementTable + SearchInput + FilterButton + DialogShell），差异集中在：
  - head 副标题 slot 化（钻取条件描述 vs 组名）
  - 列配置（6 列 vs 5 列）
  - filters 动态注入（行/列维度值 id）
- **矩阵数字需新增超链接交互**（当前 ProjectPerformanceMatrix count 模式为纯数字 span，无点击）

## 5. 采证文件索引（out/matrix-people/）
| 文件 | 内容 |
|---|---|
| 08-leftover-modal.json | 遗留弹窗 head+列结构（坐标 0，验证结构） |
| 10-matrix-cells.json | 27 个数字块（styled block）坐标+样式 |
| 10-dialog.json / 12-dialog.json | 弹窗结构（坐标 0，验证字体参数） |
| 13-dialog.json | **完整可见像素规格（本报告数据源）** |
| 13-dialog.png | 弹窗截图 |
| 13-dialog-dom.html | 弹窗完整 DOM |
| 09-matrix.png / 08-mode.png | 人员数量模式矩阵截图 |

## 6. 下一步（供参考，本轮未执行）
1. 矩阵数字加超链接（div 可点 + 蓝底 hover），点击调 `users/list`（filters 动态）
2. 弹窗复用 FocusGroupPeopleDialog 壳，副标题 slot 化 + 6 列配置 + drilldown filters
3. 像素对齐：head 56px / 返回 16px-600 / 标题「人员列表」16px-600 / 副标题 14px-400 #646a73 / 表头 47px #646a73 / 行 55px / 分页 y 底 28px
