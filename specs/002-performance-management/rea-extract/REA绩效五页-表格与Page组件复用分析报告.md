# REA 绩效五页 — 表格与 Page 组件复用分析报告

> 抓取时间：2026-11-04 ｜ 方式：真实登录态 Playwright 只读抓取（DOM / CSS / 接口响应 / 截图 / 像素测量）
> 采集脚本：`rea-extract/capture5.js`（探测 `probe5.js`）｜ 产物：`rea-extract/out/capture5/`（4 页 × 各自 css/api/measure/screenshot，另复用上轮 `out/capture-jf/` 部门页数据）

## 0. 抓取范围

| # | 页面 | URL | 归属壳 |
|---|---|---|---|
| p1 | 人员与部门（人员 tab） | `/perf/admin/semester-activities/…/info-list?activeKey=employee` | **管理后台壳**（飞书绩效设置） |
| p2 | 角色配置-管理角色 | `/perf/admin/permission/role-setting/list/manage-role` | **管理后台壳** |
| p3 | 飞书人事-部门 | `/smb-people/organization-manage/department` | **smb-people 壳**（上轮已抓，本报告复用其数据） |
| p4 | 项目管理-成员列表 | `/perf/management/v2/…/all-projects/members` | **v2 应用壳**（新版 react+tailwind） |
| p5 | 绩效校准-成员列表 | `/perf/review/…/adjust?tabKey=members` | **v2 应用壳** |

## 1. 总结论

**表格：一条产品线一个内核，全线共 2 个内核、2 种组装形态。**

- 4 个 perf 页共用**同一个表格组件 `ud__table`**（飞书 UD 设计系统、antd 系改造，全局类名 `ud__table-*`），差异全部由 props/包装层表达；
- smb-people（p3）用的是**旧一代 CSS-module 版表格**（哈希类 `WfiEYrMv1n6aXmkBUvzl` 等，上轮已证）——跨产品线不共用，但设计规格几乎同源；
- `ud__table` 有**两种组装形态**：A 单表（p1/p2）、B 头体分离双表（p4/p5，表头可吸顶）。

**Page：全线 3 种页面壳，但「页头 tab 行 + 工具栏 + 表格 + 分页」这一骨架在 3 种壳里完全同构。**

| 壳 | 页面 | 页头 | 滚动模型 | 白卡 |
|---|---|---|---|---|
| 管理后台壳 | p1、p2 | 「返回｜标题」灰条 + **tab 行**（人员(601)/部门(933)、管理角色/评估角色） | 无纵向滚动（分页承载数据量）；表格横向滚动在 `ud__table-content` 内部 | 全宽白卡、浅圆角、无阴影 |
| v2 应用壳 | p4、p5 | 左侧应用导航 + 顶部 56px 主导航 + **tab 行**（总览/成员列表/矩阵分析/统计报表） | **唯一滚动容器 = 页面级 simplebar**（`overflow:auto` 双向）；分页在滚动流底部 | 内容区白底、无卡片阴影 |
| smb 壳 | p3 | 左侧菜单 + 大标题/描述页头（18/26 w500） | 唯一滚动容器 `#smb-content-container`，表格自增长无分页 | 白卡 radius `8 8 0 0`、无阴影 |

## 2. 表格规格实测（像素级，全线一致项加粗）

| 项 | 实测值 | 备注 |
|---|---|---|
| 表头高 | **47px 全线一致**（p1/p2/p4/p5 都是 47） | smb 线是 46（序列页）/51（部门页） |
| 表头字色/字重 | **`#646a73` / 14px / w400** | 与 smb 一致 |
| **表头底色** | **白色/透明（白卡透出）** | ⚠️ 与 smb 线灰底 `#f2f3f5` **不同** |
| 表头分隔线 | **`1px solid rgba(31,35,41,.15)`** | CSS 规则：`.ud__table-content table, .ud__table-header table { border-top: 1px solid rgba(31,35,41,.15) }` |
| 行高 | p1 人员 53、p1 部门 47、p2 49、**p4/p5（v2）56** | 同一组件按密度参数化（`ud__table-md` 等），非固定值 |
| 行分隔线 | rgba(31,35,41,.15) | |
| 状态列（p2） | **绿点 ● + 纯文字「已启用」**，无彩色 tag 底 | ⚠️ 与 smb 线彩色 tag（绿底 rgba(52,199,36,.2)）**不同** |
| 评级 tag（p4/p5） | 绿色 pill「3星」浅绿底 | 仅 v2 新版使用彩色 pill |
| 操作链接 | `#1456f0` 14px h22，禁用 `#bbbfc4` | 全线一致 |
| 固定列 | p1/p2 **无固定列**（横向滚动整体滚）；p4/p5 表头 `position:sticky` 仅横向语义 | 均无投影 |

### 2.1 分页器（全线同一组件 `ud__pagination`）

- 高 **28px**、页码 28×28、圆角 **6px**、白底；
- 激活页：白底 + **`#1456f0` 蓝字**；非激活 `#1f2329`；前后箭头禁用色 `#bbbfc4`；
- 挂载方式两种：admin 壳 `ud__table-pagination ud__table-pagination-right`（`justify-content:flex-end`，与表同宽右对齐）；v2 壳 `ud__pagination ml-auto mt-8`（tailwind 布局类包同一组件）；
- 容量选择：p1/p2「10 条/页」、p4「50 条/页 + 跳至页」、p2 小数据「共 3 条」。

### 2.2 无虚拟滚动（重要反直觉结论）

p4 共 **406 个结果**，实测内容高度 2980px ≈ 50 行 × 56px + 头尾——**就是普通分页（9 页 × 50），没有虚拟滚动**。全线数据量策略：**分页承载，不做虚拟滚动**（smb 部门页 933 条则是树形全量 + 外层滚动）。

## 3. 两种表格组装形态（`ud__table` 的复用方式）

### 形态 A：单表（p1 人员/部门、p2 角色配置）

```
ud__table-wrapper > ud__loading > ud__table.ud__table-md
  > ud__table-container
    > ud__table-header (thead，一体)
    > ud__table-content  ← 横向滚动发生地（p1: sw 2028 / cw 1600, overflow-x:auto; y:hidden）
  > ud__table-pagination-right
```

- 纵向永不滚动：`ud__table-content` overflow-y hidden，数据量由分页承载；
- 表头不吸顶（页面也不滚，无吸顶需求）；
- 无固定列：p1 横向滚动时「操作」列随内容滚走。

### 形态 B：头体分离双表（p4 成员列表、p5 校准成员）

```
ud__table-header  ← 独立 <table>（仅 thead），wrap 白底 rgb(255,255,255)
ud__table-body    ← 独立 <table>（tbody）
```

- **表头吸顶是业务层可选能力**，实现于业务 CSS（p4 实测命中）：
  ```css
  .ksxsOq .ud__table-header { position: sticky; z-index: 20; top: 76px; background: white; }
  ```
  滚动测试：页面滚 600px 后表头仍在视口内（y=133，其上还有吸顶的工具区），而 smb 线 `th top:auto` 完全不吸顶——**两条线对表头吸顶的取态不同**；
- 分页在滚动流最底部（y=2968，滚到底才可见），不在视口常驻。

## 4. Page 壳的复用与参数化点

### 4.1 tab 行（三壳通用骨架）

- admin 壳（p1/p2）与 v2 壳（p4/p5）页头 tab 完全同规格：**16px/24px**，激活 **w600 + `#1456f0` + 2px 蓝色底条**，非激活 w400 `#1f2329`，项间距 28px，行高 48；
- p1 的 tab 带 count：`人员 (601)`、`部门 (933)`——切 tab 不换页，同壳内换数据源（p1 部门 tab 实测同壳同表，仅列与接口变化）。

### 4.2 工具栏（同一模式，两种参数化）

| 项 | admin 壳（p1/p2） | v2 壳（p4/p5） |
|---|---|---|
| 搜索框 | 胶囊带边框 ~172px，右置 | **大输入框 flex-1 占满行宽**（placeholder 搜索成员），左置 |
| 筛选 | 次按钮 80×32 | 同 |
| 主操作 | 新建角色（主蓝 #1456f0 白字 32px r6 padding 4px 11px） | 添加被评估人/完成校准（同规格主按钮） |
| 次操作 | 导出（白底 border `#d0d3d6`） | 同 |
| 计数行 | 无 | 「406个结果」/「3个结果」 |
| 列设置 | 无 | 「15 列被隐藏」/「5 列被隐藏」（右对齐蓝字链接） |

按钮三态全线统一：主按钮 `#1456f0` / 次按钮白底 `#d0d3d6` 边框 / 文字按钮 `#1456f0` h22 / 禁用 `#bbbfc4`。

### 4.3 组件库层复用证据（硬证据）

1. **4 个 perf 页共享同 URL 的 4 个 CSS chunk**（`6327.bac018a8 / 2525.f707d40d / 7255.032b5a6a / inline`），即同一个组件库 bundle 全局加载；
2. 共享 chunk `6327` 中规则数：`ud__table` ×548、`ud__pagination` ×524、`ud__input` ×1815、`ud__tag` ×481、`ud__menu` ×480——一个 chunk 打包全部基础组件；
3. `.ud__table-content / .ud__table-header` 核心规则去重 14 条中 **12 条被 ≥2 页完全共享**（规则文本 hash 一致）；
4. 业务差异只存在于各自业务 chunk：p4=`ManagementMembers.chunk`、p5=`AdjustHome.chunk`、p1/p2=admin chunks——**业务层只写数据与动作，渲染全部下沉 UD 库**；
5. 分页器同一组件两种挂法（见 2.1）——组件与布局解耦：布局类（tailwind `ml-auto mt-8`）由页面壳提供，组件本身不带定位。

## 5. 接口形态

| 页 | 核心接口 | 形态 |
|---|---|---|
| p1 | `POST /perf/api/review/snapshot/emp-list`；`/perf/api/user/snapshot/department/list` | 快照人员/部门分离接口，分页参数 |
| p2 | `GET /perf/api/permission/roles/list`；页面路由即 `?currentPage=1&pageSize=10` | 分页参数在 URL query（可分享/可回退） |
| p4 | `/perf/management/v2/…/members`（页面路由）+ 成员接口 87 个响应 | 计数 406、50/页 |
| p5 | `GET /perf/api/review/adjust/tasks/list`；`/perf/api/report/v3/semesters/:id/users/list` | 校准任务与成员分离 |

共性：**列表数据全部服务端分页，URL 承载分页/ tab 状态**（p1 `activeKey=employee`、p2 `currentPage/pageSize`、p5 `tabKey=members`）。

## 6. 对我方架构的映射（含对上一轮结论的修正）

### 6.1 修正：表头吸顶不是「REA 不做」，而是「分产品线」

上一轮我们依据 smb 部门页删除了 UiTable 的 `stickyHeader` 口子。本轮实证：**perf v2 线（p4/p5）真实存在表头吸顶**（头体分离 + 业务类 `sticky top:76px`），smb 线不存在。结论应修正为：

- 若还原 smb 风格页面（组织架构类）→ 不吸顶 ✅（现状正确）；
- 若还原 perf 管理端/校准类页面（与人员与部门弹窗同构）→ **需要吸顶能力**，且实现方式应是「头体分离 + 页面级滚动 + sticky」，而非表格内滚。

建议 `UiTable` 保留单一外滚模型不变，吸顶作为**可选 prop**（`stickyHeaderTop?: number`，渲染为头体分离或 `th sticky top:N`）按需启用——这是 REA 的真实形态，不是过度设计。

### 6.2 表头底色基准需要决策

- smb 线：灰底 `#f2f3f5`（我方 UiTable 现行基准）；
- perf 线（本轮 4 页全部）：**白底/透明**。

两线并存于同一公司产品体系。建议：`UiTable` 默认维持 `#f2f3f5`（组织架构页已验收），将表头底色提为 token（如 `--ui-table-header-bg`），绩效类页面覆盖为白色，而不是二选一。

### 6.3 可直接抄录的规格（本轮新增实测）

| Token | 值 |
|---|---|
| 页头 tab（激活） | 16/24 w600 `#1456f0` + 2px 底条；非激活 w400 `#1f2329`；间距 28 |
| 分页 | h28、页码 28×28 r6、激活 `#1456f0` 白底、箭头 `#bbbfc4`、右对齐 |
| 次按钮 | 32px、r6、padding 4px 11px、border `#d0d3d6`、字 `#1f2329` 14px w400 |
| 表头 | h47、`#646a73` w400 14px、底线 `rgba(31,35,41,.15)`、白底 |
| v2 行高 | 56（宽松密度）；admin 行高 47–53 |
| 状态列（perf） | 绿点 + 纯文字（非彩色 tag） |

### 6.4 印证我方收敛方向

REA 的事实（1 个内核 + 2 种组装 + 3 种壳 + 业务层零表格代码）与我们正在做的「UiTable 单内核 + PerformanceManagementTable 退化为能力壳」完全同构。REA 额外的两个借鉴点：

1. **分页/搜索/筛选/列设置是独立组件，由页面壳布局类组装**——我方把这些都塞在 PerformanceManagementTable 里，拆开后才能像 REA 一样两壳复用；
2. **tab/分页状态进 URL**（activeKey/currentPage/tabKey）——我方人员与部门弹窗已做 activeKey，分页状态可跟进。

## 7. 未捕获项（如实标注）

- p1/p2 筛选面板展开态、批量更新弹窗未抓取；
- p4 列设置下拉（15 列被隐藏）展开态未抓取；
- p2 翻页按钮未命中（选择器没匹配上 `ud__pagination` 的下一页箭头），翻页行为以 p1 分页组件规格推断；
- p4 表头 sticky 的完整祖先链（top:76 与实测 y=133 之间隔着吸顶工具区）未逐层展开；
- 未做 5 页交互后回归二抓（tab 切换仅 p1 抓了部门 tab）。
