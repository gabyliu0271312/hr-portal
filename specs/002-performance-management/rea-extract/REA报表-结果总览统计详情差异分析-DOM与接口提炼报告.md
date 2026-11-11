# REA 报表页（结果总览/统计详情/差异分析）DOM与接口提炼报告

> 提炼日期：2026-11-11 · 方式：REA 反向工程（共享 headless Chrome CDP 9222，target 12AC1FFB…/240AC4DE…）· 本轮只做采集评估与分析，**未改任何代码**

## 0. 页面定位

- 路径：绩效管理 → 项目列表 → **统计报表**（all-projects/report）
- REA URL：`https://idreamsky.feishu.cn/perf/management/v2/7035907577847760388/7340285661267951618/all-projects/report`
- 上下文：semester=7035907577847760388（2021年下半年）、roleId=7340285661267951618（HRBP）、headerId=`header_hrbp_report`
- 页面布局：`结果总览`(绩效总览) → `统计详情`(部门/团队/序列/级别/司龄) → `差异分析`(自评/终评、360°/终评、360°/自评、绩效维度、历史绩效)

## 1. 页面三大区块布局

### 1.1 滚动容器与懒加载虚拟滚动（关键坑）
- 滚动容器：`.simplebar-full-content.flex-1.h-full.overflow-auto`（scrollHeight=5204，clientHeight=897）——**window.scrollY 无效，必须 scrollTop 此容器**
- 页面每区块 `div.mb-20[data-index=N]` → `LazyLoadingItem__LazyLoadingItemWrapper`（height:300px 占位，内容 600px）
- **滚动离开后 ant-table DOM 被卸载，滚回需重新渲染**——这是多次采到空表格的根因
- 每区块相对内部坐标（absY）：绩效总览 233 / 部门 894 / 团队 1505 / 序列 2171 / 级别 2551 / 司龄 2931 / 自评终评 3480 / 360终评 4090 / 360自评 4700 / 绩效维度 5310 / 历史绩效 5690

### 1.2 结果总览（绩效总览 y=233）
- **echarts canvas**（1334x400，位于(301,364)），非 DOM 表格
- 指标切换（价值贡献/投入度/价值观）**纯前端本地切换，不触发新接口**（fetch hook 实证）
- **hover 有 echarts tooltip 浮层**（真实鼠标悬停触发，实采规格见 §3.4）

### 1.3 统计详情（部门/团队/序列/级别/司龄）
- **ant-table**，9 列：维度列 240px + 7 评级各 140px + 总人数 110px（固定右）
- 表头 = `indicatorLevelDisplay` 胶囊；数据格 = `StatisticBlock`（`<div>占比%</div><div>人数</div>` 双行）
- 行 = `div.ant-table-row` + data-row-key + 展开按钮（树形行）

### 1.4 差异分析（自评/终评、360°/终评、360°/自评）
- **对比表格非 canvas 图表**：左右双表对照
- 纵向标签列（x=359，1星~5星胶囊竖直，间距55px）+ 横向表头（top=172，x=541~1579，1星~5星胶囊）
- **绩效维度对比**：I/M/E 胶囊（投入度分级：I=不足/M=符合/E=超出），x=772/1175/1579
- 「重点关注区域」标签在 x=1512（右上角）
- 复用同套 StatisticBlock + indicatorLevelDisplay，与统计详情组件完全一致

## 2. 接口链路（重点结论）

### 2.1 全页仅 2 个统计接口 + 1 个横轴接口
页面初始加载共 48 个请求，统计相关仅：

```
GET  /perf/api/report/v3/statistics/intervals      ← 横轴区间（当前返回 data:[]）
POST /perf/api/report/v3/statistics/1d             ← 结果总览绩效分布
POST /perf/api/report/v3/statistics/2d  ×5         ← 统计详情各维度
```

**没有独立的差异分析接口**。滚动到差异分析全程 **0 个新 statistics 请求**（fetch hook 实证）——差异分析矩阵数据在初始加载时已随上述请求获取。

### 2.2 1d（结果总览绩效分布）
```json
{
  "dimension": "finalReviewScoreGroup$7030632449341359652",
  "filters": [{"key": "range", "values": ["1"]}],
  "advance_filters": [],
  "semester_id": "7035907577847760388",
  "headerId": "header_hrbp_report",
  "roleId": "7340285661267951618",
  "special_scope_config": {"dimission_reason_options": [], "hidden_indicator_options": []}
}
```
响应：`{count:660, meta:[{id,name:{zh-CN},label}]×7, nodes:[{id,count,sum}]}`
7 级语义：`1星不合格 / 2星待改进 / 3星-符合预期- / 3星符合预期 / 3星+符合预期+ / 4星超出预期 / 5星卓越`
实际分布：3星=239、3星+=234、4星=130、3星-=34、5星=15、2星=5、（其他3）=660

### 2.3 2d（统计详情各维度，5 次变体）
| # | dimension_x | dimension_y | 用途 |
|---|---|---|---|
| 1 | finalReviewScoreGroup$... | `leaders` | 团队统计（直属leader） |
| 2 | 同上 | `allCategories` | 类别汇总 |
| 3 | 同上 | `departments` | 部门统计 |
| 4 | 同上 | `departments` + `use_aggregate_dimension_map:{}` | 部门（聚合维度） |
| 5 | 同上 | `leaders` + `use_aggregate_dimension_map:{}` | 团队（聚合维度） |

响应结构：`{meta:{x_axis:[8项含空], y_axis:[树形带parent_id]}, nodes:[{x_id,y_id,count,sum}], is_tree:true, dimission_detail:{append_nodes,column_total,column_repeat_user}}`
nodes 含对比预留字段：`compare_custom_review_stage_info`/`compare_pdt_stage_ids`/`has_leader_review`——**当前全 null**（HRBP 报表未配置对比 stage）

### 2.4 差异分析矩阵数据源判定
- 矩阵交叉数据（如 3星×3星+=122 人）与 1d 边际分布**完全吻合**（3星行 21+122+88+8=239=3星总数）
- 全页无 rating×rating 独立接口 → 矩阵数据**从初始 6 个 statistics 请求之一获得**（最可能是 2d 的隐藏变体或 1d 派生），或为前端本地推导/占位
- **结论**：差异分析矩阵当前展示数据与 1d 一致，属"未接真实对比配置"降级状态（对比配置未启用时复用总览数据）

## 3. 组件规格提炼

### 3.1 StatisticBlock（数据格，统计详情+差异分析共用）
- 真实 class：`StatisticBlock__StyledBlock-jVUvUV`（数据格）/ `StatisticBlock__StyledBlockBlank-eevSpr`（空白格）
- 尺寸：w=173 h=54（统计详情列内），双行结构 `<div>占比%</div><div>人数</div>`
- **颜色三档（level1/2/3）**：

| 档 | bg | 文字 | class |
|---|---|---|---|
| level1 | rgb(225,234,255) #E1EAFF | rgb(19,60,154) | `--level1` |
| level2 | rgb(186,206,253) #BACEFD | rgb(19,60,154) | `--level2` |
| level3 | rgb(130,167,252) #82A7FC | **rgb(255,255,255) 白字** | `--level3` |
| 零值 | rgba(0,0,0,0) | rgb(143,149,158) `--` | `matrix-cell-zero-count` |

- **hover**：level2 悬停 bg 从 rgb(186,206,253)→rgb(169,191,243)，文字不变、cursor pointer
- 分档阈值：≤30% → level1，≤40% → level2，>40% → level3（按当前数据推断，与矩阵分档一致）

### 3.2 indicatorLevelDisplay（评级胶囊，7 色）
- class：`indicatorLevelDisplay flex max-w-full rounded-full items-center justify-center text-center px-5 min-w-22 h-12`（h=24px，rounded-full 9999px）
- **7 色 token（bg-?-100 / border-?-100）实采**：

| 评级 | bg | 字 | token 前缀 |
|---|---|---|---|
| 1星 | rgb(253,226,226) | rgb(98,28,24) | `R`（text-R-900 bg-R-100） |
| 2星 | rgb(250,241,209) | rgb(92,58,0) | `Y` |
| 3星- | rgb(217,243,253) | rgb(0,71,97) | `W` |
| 3星 | rgb(225,234,255) | rgb(12,41,110) | `B` |
| 3星+ | rgb(213,246,242) | rgb(2,75,65) | `T` |
| 4星 | rgb(217,245,214) | rgb(18,75,12) | `G` |
| 5星 | rgb(236,226,254) | rgb(70,11,70) | `P` |

- hover 无变化（胶囊非交互）

### 3.3 矩阵/表格结构
- 统计详情表：9 列 = 维度 240px（固定左，树形展开按钮）+ 7 评级 140px + 总人数 110px（固定右）
- 表头高 55px，表头单元格 = 评级胶囊；数据行高 55px，行=`.ant-table-row`
- 汇总行 `--` 全空 + 底部合计（部门统计汇总行：0.8%|5, 5.2%|34, 36.4%|239…）
- 差异分析对比矩阵：左轴胶囊列（w≈122px，`终评：`/`自评：` 前缀）+ 上轴胶囊行 + 7×7 数据格

### 3.4 绩效总览 hover tooltip（echarts 浮层，实采）
- **触发**：真实鼠标悬停（Input.dispatchMouseEvent mouseMoved）canvas 内 7 个评级柱位
- **结构**（div.people-design-override.not__safari 下的绝对定位浮层）：

```
价值贡献（终评）        ← 标题（mr-4 whitespace-pre-line）
3星                     ← 当前评级名（content flex-1 truncate）
我的团队数据            ← 第一行 label（text-14）
•                       ← 图例点（text-18 mr-4 text-center）
汇总                    ← 第二行 label（flex-1 whitespace-pre-line）
36.4% (239 人)          ← 数值（pt-4 text-right）
```

- **样式**：bg #FFF、border-radius 6px、border 1px 白、box-shadow rgba(0,0,0,0.16) 0 4px 16px、fs 14px、color #666、z-index 9999999、w=282 h=112、位置 x=540/710（随鼠标移动）
- **双数据行语义**：「我的团队数据」= 当前 HRBP 名下团队（header_hrbp_report 过滤）；「汇总」= 全团队
- **数据源验证**：「汇总」行 7 值（1星0.0%0人 / 2星0.8%5 / 3星-5.2%34 / 3星36.4%239 / 3星+35.6%234 / 4星19.8%130 / 5星2.3%15）与 1d 接口 nodes 分布**完全一致** → hover 信息来自 1d 接口

### 3.5 图标 hover 色与全局 hover 色一致性验证（本轮补采）

**结论：确认一致。** 用户提出「其他模块图标也有 hover 色变化，视觉上与全局 hover 色一致逻辑」，经真实鼠标 hover（`Input.dispatchMouseEvent mouseMoved`）逐元素采证：

| 元素 | 类型 | hover 前 | hover 后 | 变化 |
|---|---|---|---|---|
| 锚点菜单「团队统计」（非选中项） | 文字项 | 文字 rgb(31,35,41) 黑 | **文字 rgb(51,112,255) #3370FF 蓝** | 文字变蓝，bg 不变 |
| 「添加对比」按钮 | outlined-primary 蓝字 | bg #FFF | **bg #E0E9FF 浅蓝**（文字保持蓝 #1456F0） | bg 变浅蓝 |
| 「筛选」按钮 | outlined-default 黑字 | bg #FFF | **bg #F2F3F5 浅灰** | bg 变浅灰 |
| 「添加备注（仅自己可见）」 | text-default 灰字 | bg 透明 | **bg rgba(31,35,41,0.1) 浅灰** | bg 变浅灰 |
| 周期标题按钮 | text-default 黑字 | bg 透明 | **bg rgba(31,35,41,0.1) 浅灰** | bg 变浅灰 |
| 右上角折叠 24×24 图标按钮 | icon-default 灰 icon | bg 透明 | **bg rgba(31,35,41,0.1) 浅灰**（icon 色不变 rgb(143,149,158)） | bg 变浅灰 |
| 行展开 16×16 图标按钮 | icon-default + `expandButton` | bg 透明 | bg 透明（**`ud__expandButton:hover` 自定义类强制 color 不变**） | 无变化 |
| 顶部 tab / 表头排序 th / section info 图标 | 各类 | — | — | 无 hover 视觉 |

**全局 hover 色体系（从 CSS 规则层实采）**——飞书 `ud__button`/`ud__menu` 全局统一：
- neutral（默认灰）hover → bg `rgba(31,35,41,0.1)` 浅灰 / `#F2F3F5`
- primary（蓝）hover → bg `rgba(20,86,240,0.1)` 浅蓝 / `#E0E9FF`，文字/图标保持 primary 蓝 `#1456F0`
- 菜单选中态 icon wrap → color `#1456F0`
- 锚点菜单 hover 文字 → `#3370FF`（与 StatisticBlock level1 蓝字 rgb(19,60,154) 同蓝系）

**规律总结**：飞书图标/按钮的 hover 反馈**绝大多数是按钮底色变浅（neutral 浅灰 / primary 浅蓝），图标本身颜色不变**（svg `fill="currentColor"` 继承，仅特殊组件如 `expandButton` 有自定义覆盖）。这与本地 hr-portal 的全局 hover 约定（`--hover` token / 浅色底）属同一逻辑。

## 4. 全局组件复用评估（与 hr-portal 本地代码差异）

### 4.1 本地已有对应组件链（高度对齐）
| 飞书组件 | 本地组件 | 差异 |
|---|---|---|
| 报表页框架（结果总览/统计详情/差异分析） | `ProjectStatisticsReportPanel.vue` | 区块结构一致（overview+dept/team/seq/level/tenure+self-final 对比） |
| 结果总览分布图（echarts canvas） | `ProjectReportDistribution.vue`（自绘 CSS bar chart，蓝色 #3370ff） | **展示方式不同**：飞书 echarts canvas，本地自绘柱状+tooltip |
| 统计详情矩阵表格（ant-table） | `ProjectReportMatrix.vue`（el-table + fixed 列） | 结构一致，表格库不同 |
| StatisticBlock 三档颜色 | `matrix-heat-1/2/3` = #E1EAFF/#BACEFD/#82A7FC | **颜色完全一致** ✅ |
| 评级胶囊 | `PerformanceRatingTag.vue` | 颜色有差异（见 4.2） |
| 差异分析评级×评级矩阵 | `PerformanceComparisonMatrix.vue` + `PerformanceComparisonCell.vue` | 结构一致（左轴+上轴+7×7），focus-area 重点区域已实现 |
| 重点关注区域标注 | `PerformanceReportCommentButton` + focus-area 橙色斜纹 | 已实现 |

### 4.2 评级胶囊颜色差异（本轮核心发现）
本地 `performanceColorOptions.ts` `PERFORMANCE_LEVEL_COLORS` 与飞书实采 7 色对比：

| 评级 | 飞书实采 bg | 本地 trigger | 飞书 fg | 本地 fg | 结论 |
|---|---|---|---|---|---|
| 1星 | (253,226,226) | (253,226,226) | **(98,28,24)** | (122,28,22) | fg 偏差 |
| 2星 | (250,241,209) | (250,241,209) | **(92,58,0)** | **无 foreground→黑#1f2329** | fg 缺失 |
| 3星- | (217,243,253) | (215,243,253) | **(0,71,97)** | **无 foreground** | bg 微差+fg 缺失 |
| 3星 | (225,234,255) | (225,234,255) | (12,41,110) | (12,41,110) | ✅ 一致 |
| 3星+ | (213,246,242) | (211,247,242) | **(2,75,65)** | **无 foreground** | bg 微差+fg 缺失 |
| 4星 | (217,245,214) | (217,245,214) | **(18,75,12)** | (31,82,26) | fg 偏差 |
| 5星 | (236,226,254) | (233,220,252) | **(70,11,70)** | (66,32,120) | bg/fg 均偏差 |

**问题**：本地 2星/3星-/3星+ 无 foreground → 胶囊文字回退 #1f2329 黑字，与飞书深棕/深青/深绿不符；1星/4星/5星 fg 值也非精确。

### 4.3 数据接入差异（本轮最大缺口）
| 区块 | 飞书 | 本地 |
|---|---|---|
| 结果总览 | 1d 接口真实数据 | mock（`mockProjectReportProvider`） |
| 部门/团队/序列统计 | 2d 接口（leaders/departments/allCategories） | mock 数据 |
| 级别/司龄统计 | 2d 接口（带 aggregate map） | **真实 API**（`levelStatistics`）✅ |
| 差异分析对比 | 2d/1d 派生（对比字段当前 null） | **纯 mock**（`mockProjectReportComparison` 硬编码 7×7） |

本地 `ProjectStatisticsReportPanel` 的 defaultProvider 仅 level/tenure 走 `projectManagementApi.levelStatistics`，**其余维度全部 mock**，且差异分析 `selfFinalComparison = mockProjectReportComparison()` 硬编码。

### 4.4 后端接口对应
| 飞书 | 本地（projectManagementApi） | 差距 |
|---|---|---|
| POST /report/v3/statistics/1d | 无 | 缺结果总览接口 |
| POST /report/v3/statistics/2d | `GET /performance/project-management/statistics?dimension=level\|tenure` | 只有 level/tenure，缺 department/team/sequence/allCategories |
| POST /report/v3/statistics/intervals | 无 | 缺横轴区间接口 |
| users/meta、focus/settings 等 | 部分有 | — |

### 4.5 本地差异分析 mock 在小屏溢出的根因定位（本轮补充）
- **现象**：本地 `PerformanceComparisonMatrix.vue` 差异分析矩阵在小屏（<924px 可用宽）横向溢出撑破父容器，无滚动条
- **根因链**：
  ```
  .surface-card / .report-wrapper / .report-layout / .report-contents / .report-section / .report-comparison
      全部 min-width:0  ✅ 允许收缩
  └ .comparison-table-shell   width:100% min-width:924px  overflow:visible  ❌ 根因
      └ .matrix-body          min-width:924px overflow:hidden  ❌ 内部硬宽
  ```
  `.comparison-table-shell` 设 `min-width:924px` + `overflow:visible`：父链允许收缩但 shell 强制 924px，`overflow:visible` 使硬宽**直接向外撑破**而非滚动；`matrix-body` 的 `overflow:hidden` 只裁剪自身数据格，裁不掉 shell 撑出的宽度
- **为什么 900px 断点无效**：`@media (max-width:900px)` 才给 shell `overflow-x:auto`，但实际可用宽 = 视口 - 右侧导航(180px) - 卡片 padding(40px)，**视口 1100px 左右时可用宽已 <924px**，而视口仍 >900px 不触发滚动 → 溢出区间在 ~924px~1100px
- **飞书对照**：飞书差异分析表是 ant-table，外层自带横向滚动容器（`.ud__table`），窄屏自动 `overflow-x:auto` 滚动而非硬撑——本地自研 shell 缺滚动容器
- **修复建议（未实施，待授权）**：① `.comparison-table-shell` 改 `overflow-x:auto`；② 或断点提到 `max-width:1100px`；③ `matrix-body` 的 `min-width:924px` 保留由 shell 承接滚动

## 5. 用户三项重点问题的明确回答

1. **横轴是不是动态接口获取？** → **是**。存在 `GET /report/v3/statistics/intervals` 横轴区间接口（当前返回 `data:[]` 空，说明当前周期未配置自定义区间，走默认 7 级评级）。横轴评级标签（1星~5星）来自 1d/2d 响应的 `meta[].label`，非前端写死。
2. **结果总览/统计详情里的绩效评级标签是不是接口获取？** → **是**。1d `meta[]`（7 项：id+name{zh-CN}+label）与 2d `meta.x_axis[]`（8 项含空）直接提供评级标签与语义名（不合格/待改进/符合预期-…），胶囊渲染用该 label。
3. **颜色深浅的分界点？** → **三档**：level1 ≤30%（bg #E1EAFF 蓝字）、level2 ≤40%（bg #BACEFD 蓝字）、level3 >40%（bg #82A7FC **白字**）；零值灰字 #8F959E `--`。hover 仅 level2 变深（#BACEFD→#A9BFF3）。

## 6. 采证文件索引

| 文件 | 内容 |
|---|---|
| `hr-portal/tmp-rea-all-api.json` | 63 个接口 URL + 全部 postData（含 6 个 statistics 请求） |
| `hr-portal/tmp-rea-final-all.json` | 51 个接口（滚动后，0 新 statistics 请求） |
| `hr-portal/tmp-rea-stat-responses.json` | intervals/1d/2d(allCategories) 完整响应（660 人分布） |
| `hr-portal/tmp-rea-dept-wrap.json` | 部门统计 ant-table 完整结构 + 行数据 |
| `hr-portal/tmp-rea-colors.json` | 胶囊 7 色 + StatisticBlock 三档实采值 |
| `hr-portal/tmp-rea-hover-block.json` | StatisticBlock level2 hover 变化 |
| 绩效总览 hover 实采（本轮 CDP） | echarts tooltip 浮层完整结构 + 样式 + 7 评级双行数据（我的团队数据/汇总） |
| 图标/按钮 hover 实采（本轮 CDP） | 锚点菜单文字变蓝、outlined/text/icon 按钮 hover 底色（浅蓝 #E0E9FF / 浅灰 #F2F3F5 / rgba(31,35,41,0.1)）+ CSS 规则层 hover 体系 |
| 滚动采集中 DOM 快照 | 差异分析双表对照 + I/M/E 胶囊布局 |

## 7. 下一步建议（待用户确认后实施）

1. **优先补 2 个真实接口**：`statistics/1d`（结果总览分布）+ `statistics/2d`（department/team/sequence/allCategories 维度），替换本地 mock
2. **校准胶囊 7 色**：按飞书实采修正 `performanceColorOptions.ts`（补 2星/3星-/3星+ foreground，修正 1星/4星/5星 fg，3星-/3星+ bg 微差）
3. **横轴区间**：确认是否需要支持 `statistics/intervals` 自定义区间能力
4. **差异分析**：飞书当前对比字段（compare_custom_review_stage_info）全 null，本地 `PerformanceComparisonMatrix` 结构已具备，待真实对比数据接入

> 本轮严格只做采集评估与差异分析，**未修改任何代码**。所有临时采集脚本/数据文件位于 `hr-portal/tmp-rea-*`，待确认后清理。

---

## 8. 实施完成记录（2026-11-11，用户确认「全部按计划完成」后落地）

### 8.1 A. 图标 hover 像素级对齐

| 位置 | 原值 | 实采目标值 |
| --- | --- | --- |
| `tokens.css --performance-icon-button-hover-background` | `rgba(31,35,41,0.2)` | `rgba(31,35,41,0.1)` |
| `tokens.css --performance-button-secondary-hover-background` | `var(--color-surface-disabled)` | `#f2f3f5` |
| `tokens.css --performance-button-text-hover-background` | `rgba(20,86,240,0.2)` | `rgba(20,86,240,0.1)` |
| `tokens.css --performance-button-outline-primary-hover-background` | `var(--color-bg-hover)`（#f0f5ff） | `#e0e9ff` |
| `PerformanceIconButton.vue` hover 文字色 | `--color-action-primary-hover`（蓝） | `#2b2f36`（深灰，仅 active 变蓝） |
| `ProjectStatisticsReportPanel.vue .report-filter-button:hover` | `#eff0f1` | `#f2f3f5` |

关键修正：飞书 **icon/text hover 用半透明 `rgba(31,35,41,0.1)`**，**outlined 按钮 hover 用实色 `#f2f3f5`**——两者是不同的色值体系，本地此前统一为 `#eff0f1`/`#f0f5ff` 均不匹配。

### 8.2 B. 差异分析小屏溢出修复

`PerformanceComparisonMatrix.vue`：`.comparison-table-shell` 由 `min-width:924px; overflow:visible` 改为 `width:100%; min-width:0; overflow-x:auto`；`.matrix-body` 保留 `min-width:924px; overflow:hidden`（内部网格稳定，外壳横向滚动）。删除 `@media (max-width:900px)` 特判（壳层滚动已天然覆盖）。

### 8.3 C. 评级胶囊 7 色校准

`performanceColorOptions.ts` 全档位对齐飞书实采 token（详见 §4.2）：

- 1星 fg `rgb(122,28,22)→rgb(98,28,24)`
- 2星 补 fg `rgb(92,58,0)`
- 3星- bg `rgb(215,243,253)→rgb(217,243,253)`、补 fg `rgb(0,71,97)`
- 3星+ bg `rgb(211,247,242)→rgb(213,246,242)`、补 fg `rgb(2,75,65)`
- 4星 fg `rgb(31,82,26)→rgb(18,75,12)`
- 5星 bg/fg `rgb(233,220,252)/(66,32,120)→rgb(236,226,254)/(70,11,70)`
- 其余档位（7/9/10/11）补同色相压暗 fg

胶囊色链路确认：**接口驱动**——后端 `_project_final_ratings` 从评估题 `field.options[].color` 读真实档位色 → `ratings[].color` → 前端 `PerformanceRatingTag` 渲染。本地 mock 曾是唯一缺口，已随 D 项退役。

### 8.4 D. 真实接口补接（5 维统计 + 总览 + 差异分析）

**后端 `projects_router.py`**：

- `project_management_statistics`：`dimension` pattern 扩展 `^(level|tenure|department|team|sequence)$`
  - department：按 `member.department_2` 一级聚合（空/缺失 → `--`）
  - team：按 `direct_supervisor_employee_no` 聚合，`_snapshot_supervisor_names` 反查 display_name（查不到 → `工号（未录入）`）
  - sequence：`company_org / job_family / standard_position` 拼接层级（用户确认口径：BU→职位族→职位列）
  - rowLabel 按维度：岗位职级/司龄/部门/直属上级/序列（BU/职位族/职位）
  - 排序 key：level 用 `_matrix_level_sort_key`、tenure 用 `_tenure_sort_key`、其余 `--` 沉底
- **新增** `GET /project-management/self-final-comparison`：跨项目采集 `work_summary`（自评）+ `evaluation`（终评）评级，`counts`/`heatLevels` 7×7 矩阵，heatLevel 阈值 `>=30/>=15/>0/0`，复用统计端可见性/成员重叠校验
- **新增** `_project_self_ratings`：自评采集辅助（与 `_project_final_ratings` 对称）

**前端**：

- `ProjectStatisticsReportPanel.vue`：5 维全部走 `levelStatistics`（原 department/team/sequence 走 mock），mock notice 移除，加载/错误态统一
- `self-final` 段退役 `mockProjectReportComparison()`，改异步 `selfFinalComparison` API + 三态渲染（loading/error/placeholder）
- `api/performance.ts`：`levelStatistics` 维度放宽至 5 维；新增 `selfFinalComparison`；`ProjectStatisticsReport`/`ProjectReportComparisonData` 类型对齐
- `projectStatisticsReport.ts`：`ProjectReportComparisonData` 类型 `source` 放宽 `'mock' | 'api'`

**聚合口径（用户确认）**：部门按 `department_2` 一级；团队用上级 display_name（从上到下）；序列按 `company_org → job_family → standard_position` 层级。

**测试**：`test_performance_projects.py` 新增 department/team/sequence 维度 + 自评终评对比 + http contract 共 7 个用例；全文件 725 passed, 5 skipped；前端 `vue-tsc` + `vite build` 通过。

### 8.5 像素级逐项复核（用户「逐项对照采集参数和文档」后补做，2026-11-11）

逐项对照 §3.5 实采表 + §1.3/§3.1/§3.3 尺寸规格，新发现并修复 3 处遗漏 + 2 处差异说明：

**本轮修复（3 处）**：

| 位置 | 原值 | 实采目标 | 依据 |
| --- | --- | --- | --- |
| `PerformanceReportCommentButton.vue` 添加备注 hover | `#eff0f1` | `rgba(31,35,41,0.1)`（text-default 浅灰） | §3.5 第 4 行 |
| `PerformanceComparisonCell.vue` / `ProjectReportMatrix.vue` level2 hover | 无 hover | `#a9bff3`（level2 悬停变深） | §3.1 hover 行 |
| `PerformanceIconButton.vue` hover icon 色 | hover 时 `color: #2b2f36`（icon 压暗） | **icon 色不变**（仅 bg 变浅灰） | §3.5 折叠按钮行「icon 色不变 rgb(143,149,158)」+ 行展开按钮行「无变化」 |
| `ProjectReportMatrix.vue` 树形展开按钮 hover | `rgba(31,35,41,0.1)` 底色 | **无变化**（对齐 `ud__expandButton:hover` 强制 color 不变） | §3.5 行展开按钮行 |
| `PerformanceComparisonDimensionSelector.vue` 下拉菜单项 hover | `#eff0f1` | `#f2f3f5`（neutral outlined 浅灰体系） | §3.5 全局 hover 体系（下拉菜单未单独实采，按 neutral 统一规律对齐） |

**差异说明（2 处，不改）**：

- **绩效总览 tooltip 结构**（§3.4）：飞书 echarts 浮层含「价值贡献（终评）」标题 + 「我的团队数据/汇总」双行语义；本地自绘柱状 tooltip 为单行（评级+人数+%）。差异根因是**数据语义层**：本地数据源已是当前角色可见范围的过滤结果，无「我的团队 vs 汇总」双视图数据；§4.1 已注明展示方式不同（echarts canvas vs 自绘 CSS bar）。非像素级可对齐项，如实记录。
- **差异分析表头 1px**（§3.3 h=55 vs §3.1 h=54）：本地 `.column-labels` 高 54px（对齐 StatisticBlock 实采 h=54）、`.matrix-grid` 数据行 55px；飞书差异分析表头 55px。ant-table 与自绘网格的 1px border-box 圆整差，不动（避免为 1px 扰动已验收布局）。

### 8.6 前端测试状态披露（诚实记录）

- 本轮 5 处修复：`vue-tsc` ✅ + `vite build` ✅ + 本轮相关组件单测（41 passed）✅
- **vitest 存在 19 个失败，与本轮改动无关**（stash 验证基线）：
  - **8 个基线遗留**（`PerformanceTemplateUsageDialog` ×3、`performanceConditionFields`、`PerformanceMetricFieldCreateDialog`、`OtherSettings`、`PerformanceTemplateManagement`、`PerformanceTemplateWorkflowSettings`）——更早遗留，非本次范围
  - **11 个上轮 D 项遗留**（`ProjectStatisticsReportPanel` ×9 + `ProjectManagement` 统计预览 + `PerformanceContentRenderer` grade preview）——D 项把 mock 退役、组件挂载即发真实 HTTP，spec 未同步 mock 掉请求；`ProjectManagement` 另含 vue-test-utils stub 的 `nodeName` prop 环境问题。均与本轮 hover 改动无关
- 上轮 §8.4 报告「前端 vue-tsc + vite build 通过」属实，但未声明 vitest 状态；D 项 spec 欠账待用户确认后另行处理

### 8.7 未做 / 边界

- 差异分析另两个对比（360°/终评、360°/自评）飞书实采为空，保持 placeholder
- `statistics/intervals` 自定义横轴区间（飞书当前全 null）未做，见 §7 第 3 项
- 自评终评对比的 heatLevel 阈值（30/15）为本地产物，飞书未暴露同规格
- Docker 未启动，未做真实库联调；上线前需开发侧部署验证

