# REA 组织架构-序列（job-family）架构提炼报告
## ——像素级还原评估 · 组件 / 设计 Token / 系统架构提炼（本轮只评估，不改代码）

> 路径：飞书人事 → 组织 → 序列（左侧含 部门/职务/职级/序列/工作地点/公司 六个同类页）
> URL：`https://idreamsky.feishu.cn/smb-people/organization-manage/job-family`
> 对照页：`/smb-people/organization-manage/department`（部门页，同步抓取）
> 抓取方式：真实登录态浏览器（Playwright，复用 rea-extract/profile），DOM/网络/CSS/截图落盘，证据目录 `rea-extract/out/capture-jf/`
> 全部结论基于实测 DOM、computed style、接口响应与两页交叉比对，无猜测部分已标注。

---

## 1. 页面定位与技术栈

| 层 | 事实 | 证据 |
|---|---|---|
| 应用 | 飞书人事（smb-people），根节点 `div.smb-people-app`，顶部导航 人员/组织/报表/假勤/更多 | DOM |
| 路由 | `/smb-people/organization-manage/{job-family\|department\|position\|level\|location\|contract-company}`，左侧竖向菜单 w=220px | DOM 菜单 teakey |
| 组件库 | 飞书 Universe UI：`ud__table` / `ud__button` / `ud__input(--search)` / `ud__menu` / `ud__expandButton` / `ud__popover-disabled-compatible-wrapper` | DOM class |
| 页面骨架 | `#smb-content-container`（唯一滚动容器）> 标题描述头 `Xd_zZTJnreFiFZB06_s4` + 内容卡 `gHB7b5qVDiJc9r8c0HeC` | DOM |
| API 域 | `/smb/web/corehr/v1/orm/*`（组织实体）+ `/smb/web/corehr/v2/authorization`（操作权限）+ `/people-suite/api/*` | network.json |

## 2. 滚动架构（本轮核心结论：滚动条在「外层」）

**实测整页只有 1 个滚动容器**（遍历全部元素的 overflow + scrollHeight 判定）：

```
#smb-content-container   rect { x:220, y:56, w:1460, h:894 }   ← 顶栏 h56 / 左菜单 w220 之外的整个内容区
  overflow: auto (x & y)
  padding: 20px 20px 0
  scrollHeight 8127 ≫ clientHeight 894（序列页 156 行全部渲染，表格本体 h=7951）
```

- **表格本体（`ud__table-wrapper`）没有任何内部滚动**：无 max-height、无 overflow，行全部展开平铺渲染（156 行 7951px，无虚拟滚动，DOM 无 virtual 痕迹）。
- 垂直滚动条出现在内容区右缘（即"目标的表格的滚动条在外层"）；横向滚动同样归外层容器（表格 `min-width: 980px` 由卡片层声明 `style="padding-bottom:20px; min-width:980px"`）。
- 内容卡：白底、`border-radius: 8px 8px 0 0`（仅上圆角，下缘随滚动延续）、`box-shadow: none`、padding 20px。页面整体白底（与绩效 REA 的 `#f5f6f7` 灰底+卡片不同）。
- 无分页组件（`ud__pagination` 不存在），数据一次性/滚动续载。

**部门页对照**：同一容器结构；部门数据量小（表 h=561 < 894）时不出现滚动条，容器行为完全一致 → 滚动策略是「页面级唯一容器」而非每表自管。

## 3. 树形表格规格（序列页实测）

| 部位 | 实测值 |
|---|---|
| 表头 | bg `#f2f3f5`，文字 14px w400 `#646a73`，padding 12px，**h=46px**（部门页实测 51px，两页头部行高不完全一致，以各自实测为准） |
| 列 | 名称 / 状态 / 描述 / 更新人 / 更新时间（各 215px 均分）+ 操作 287px（合计 1365px，均分列宽策略） |
| 行 | h=51px（padding 12 + 内容 26 + 边框），名称 14px w400 `#1f2329`；行分隔线 `0.67px solid rgba(31,35,41,0.15)` |
| 树形 | 展开按钮 `ud__table-row-expand-icon` 18×18、图标 12px `#646a73`、margin `1px 4px 0 0`；缩进 `ud__table-row-indent indent-level-N`，level-0 宽 0、level-1 宽 **14px**（每级 14px）；子级默认展开，点击切换 ▼/▶ |
| 状态 tag | h24、radius 4、padding 0 6px、14px：已启用=绿 `rgba(52,199,36,0.2)` / 字 `#124b0c`；已停用=灰 `rgba(31,35,41,0.1)` / 字 `#646a73` |
| 操作列 | `ud__table-cell-fix-right` + `position: sticky; right: 0` 固定右列；文字按钮 `ud__button--text-primary` `#3370ff` 14px，间距 margin-right 8px |
| 禁用操作 | 「添加下级序列」无权限时：`disabled` + `pointer-events:none` + `ud__popover-disabled-compatible-wrapper`（悬浮提示载体）；编辑/启用是否可见同受 `GET /corehr/v2/authorization` 控制（本次返回 admin_type=32） |
| 空值 | `--` 占位，颜色 `#bdbfc4` |
| 更新时间 | `YYYY-MM-DD HH:mm` |
| 部门页列 | 名称 273 / 部门负责人 186 / 部门 HRBP 186 / 人数 124 / 更新人 186 / 更新时间 186 / 操作 240（操作含 编辑/添加子部门/删除） |

## 4. 标题 + 描述设计 Token 提炼（要点 3 的「描述与标题」）

标题/描述是一个共享头部组件，两页 DOM 结构逐层同构：

```
div.Xd_zZTJnreFiFZB06_s4            ← 头部块 h48，无底色无分隔线
  div.dyd0QyTq837Dlk2AxfXn > h3.MfeP0sWXUFA9mgio1LeC      「序列」/「部门」
  div.dyd0QyTq837Dlk2AxfXn > span.y6KLmp7gmGwRTNCheKp7    描述文案
```

| Token | REA 实测值 | 我方现状（frontend/src/styles/tokens.css） | 差异结论 |
|---|---|---|---|
| 标题字号/行高 | **18px / 26px** | `--page-title-size: 18px`、`--page-title-line-height: 32px` | 字号一致，行高 32≠26 |
| 标题字重 | **500** | `--page-title-weight: 600` | 500≠600 |
| 标题颜色 | `#1f2329`（= N-900） | `--page-title-color: #1f2329` | 一致 |
| 描述字号/行高 | **14px / 22px** | `--page-title-desc-size: 12px`、`--page-title-desc-line-height: 20px` | 14≠12、22≠20 |
| 描述颜色 | **`#8f959e`**（= 飞书 N-500） | `--page-title-desc-color: #999999`（另有 `--color-text-placeholder: #8f959e` 未用于此） | 色值不一致；我方 token 库已有 #8f959e，仅未接到页面描述 |
| 标题块间距 | 头部块 h48（26+22），描述下即接工具栏（内容卡 padding 20 起） | `--page-title-gap-bottom: 8px` 等 | 结构不同：REA 头部在卡外、我方惯例在卡内/统一组件 |
| 描述文案模板 | `管理{实体}信息，并将同步至飞书相关应用`（序列）/ `管理部门信息，并将同步至飞书相关应用`（部门） | — | 文案同构，可做参数化模板 |

## 5. 组件复用与提炼关系（要点 1、2）

### 5.1 REA 内部：六个组织实体页是同一个「组织实体管理页」组件

序列页与部门页 **7 个 CSS-module 类名完全一致**（同一构建产物中的共享样式哈希）：
`q5GjYf9w0ZynxHmu298E`（滚动容器）/ `Xd_zZTJnreFiFZB06_s4`（头部）/ `MfeP0sWXUFA9mgio1LeC`（标题）/ `y6KLmp7gmGwRTNCheKp7`（描述）/ `gHB7b5qVDiJc9r8c0HeC`（内容卡）/ `NSzQINY3Dw8P9xmVLq6Q`（工具栏）/ `WfiEYrMv1n6aXmkBUvzl`（表格壳）。

即 REA 把「左侧分类菜单 + 标题描述头 + 工具栏(搜索框+次按钮+主按钮) + 树形表格(展开/缩进/状态tag/固定操作列)」做成 **一个参数化组件**，六个实体页只换：标题、描述、列定义、接口路径、操作项。左侧菜单序列/职务/职级/工作地点/公司推断同为该组件（同路由段、同骨架，未逐一抓取验证——已标注为推断）。

### 5.2 与我方已实现「部门」的对照（hr-portal frontend）

| 维度 | 我方现状 | REA 目标 | 复用/提炼建议（仅评估） |
|---|---|---|---|
| 数据结构 | `PerformanceDepartmentListPanel` 平铺列表：部门名称/上级部门/人数 + 关键词分页（offset/limit） | 树形全量：`sub_departments[]` / `sublist[]` 内嵌，根 `parent_id="0"`，含 member_count、hrbps、update_by(含 avatar)、order_weight | 树形渲染组件可提炼；我方接口需补树形出参或前端组装 |
| 滚动 | `PerformanceManagementTable scroll-mode="inner"` + `max-height 600` → **滚动条在表格内部** | 外层唯一容器滚动，表格自增长 | **组件已支持 `scroll-mode="page"`**，切换即可对齐外层滚动条，无需新组件 |
| 分页 | 有（el 分页 10/页） | 无分页、无虚拟滚动，一次性平铺 + 续载 | 数据量 655 行全渲染；我方若照搬需评估行数上限（约 7951px 高度×9 屏） |
| 表头 | 14px、灰底 | 同（#f2f3f5/#646a73/12px padding） | 已一致，可继续共用 |
| 状态 tag | — | 已启用/已停用 双色 tag（见 §3 规格） | 提炼为通用状态 tag（绿系 `rgba(52,199,36,0.2)`/灰系 `rgba(31,35,41,0.1)`，h24/r4） |
| 树形交互 | — | 18×18 展开钮 + 每级 14px 缩进 + 默认展开 | 提炼 `indent-level-N` 缩进体系与展开按钮规格 |
| 操作列 | 固定右（fixed right，占位"—"） | sticky right 文字按钮组 + 权限禁用态（disabled + tooltip wrapper） | 禁用+悬浮提示模式可复用（同绩效 REA §2 的 Tooltip 模式） |
| 标题/描述 | `--page-title-*`：18/32、w600、描述 12px #999999 | 18/26、w500、描述 14px #8f959e | 需决策：若以创梦人力为像素基准，更新 `--page-title-weight/line-height` 与 `--page-title-desc-*`（§4 差异表）；注意该 token 被全站共享，改动有联动面 |

### 5.3 系统架构数据流

```
[smb-people SPA /organization-manage/:entity]
  ├─ GET  /smb/web/corehr/v2/authorization        → 操作权限门（控制 编辑/添加下级序列/启用 禁用态）
  ├─ POST /smb/web/corehr/v1/orm/job_family/list  → 树形数据 {list[120], count:655}，parent_id="0" + sublist[]
  └─ POST /smb/web/corehr/v1/department/list      → {departments[]}，sub_departments[] + member_count/hrbps/update_by
       └─ 表格直接全量平铺渲染；无分页/虚拟滚动；写操作经独立弹窗（本轮未触发）
```

## 6. 真实接口清单（本页实测）

| # | 接口 | 方法 | 作用 | 证据 |
|---|---|---|---|---|
| 1 | `/smb/web/corehr/v1/orm/job_family/list` | POST | 序列树形列表（120/批，count=655，i18n name） | 实测响应 |
| 2 | `/smb/web/corehr/v1/department/list` | POST | 部门树形列表（sub_departments/member_count/hrbps） | 实测响应 |
| 3 | `/smb/web/corehr/v2/authorization` | GET | 管理员/操作授权 `{admin_type, employee_id}` | 实测响应 |
| 4 | `/smb/web/corehr/v1/employee_setting/batch_get` 等 tenant/employee_setting 组 | GET/POST | 租户与应用配置（平台层，与本页 UI 无直接耦合） | 实测响应 |
| 5 | 新建/编辑/启停的写接口 | — | **未捕获**（本轮不触发写操作弹窗提交路径） | — |

**未捕获项**：① 列表分批加载参数（count=655 仅返回 120，滚动续载的请求体未抓到，需滚动到底部复抓）；② 写操作弹窗（新建序列/编辑）DOM 与接口；③ 六实体页中 职务/职级/工作地点/公司 未逐一抓取（复用结论基于 部门+序列 双样本类名一致，已标注推断）。

## 7. 设计 Token 总表（实测值）

| Token | 值 | 用途 |
|---|---|---|
| 主蓝 | `#3370ff` (rgb 51,112,255) | 主按钮/操作链接/菜单选中项（注意：绩效 REA 为 `#1456f0`，两产品蓝不一致） |
| 主文字 | `#1f2329` | 标题/名称/正文 |
| 次要文字 | `#646a73` | 表头/禁用 tag 字/展开图标 |
| 弱文字 | `#8f959e` | **页面描述** |
| 占位符 | `#bdbfc4` | 空值 `--` |
| 控件边框 | `#d0d3d6` | 次按钮描边 |
| 行分隔线 | `rgba(31,35,41,0.15)` | 表格行 border-bottom |
| 表头底 | `#f2f3f5` | 表头背景 |
| tag-绿底/字 | `rgba(52,199,36,0.2)` / `#124b0c` | 已启用 |
| tag-灰底/字 | `rgba(31,35,41,0.1)` / `#646a73` | 已停用 |
| 排版 | 页标题 18/26 w500；描述/表格/按钮/菜单 14/22 w400 | |
| 圆角 | 卡片 8（仅上）；按钮/输入 6；tag 4 | |
| 尺寸 | 顶栏 56、左菜单 220、内容区 padding 20、工具栏 h32（搜索 310×32，按钮间距 12）、表头 46、行 51、tag 24、按钮 h32（次按钮 w80） | |
| 滚动条 | 外层容器原生滚动（未捕获 `::-webkit-scrollbar` 自定义规则，视觉为系统默认） | |

## 8. 证据产物索引

```
rea-extract/out/capture-jf/
├─ jf-list-viewport.png / probe.png        # 序列页首屏（默认展开态）
├─ jf-list-expanded.png                    # 树展开/收起切换后
├─ jf-list.html / jf-dept.html             # 两页完整 DOM
├─ jf-dept-viewport.png                    # 部门页截图（对照）
├─ measure-jf.json / measure-jf-dept.json  # 精确测量（含滚动容器遍历）
├─ measure-jf-detail.json                  # 补充测量（缩进/展开钮/卡片/工具栏）
├─ api/ (39 个响应体)                       # job_family/list、department/list、authorization…
├─ css/ (14 份样式表)                       # Universe UI 全量规则（CSS-module 页面样式在 JS 内联，未落盘，已用 computed style 补齐）
└─ network.json (127 条)
rea-extract/capture-job-family.js / capture-jf-full.js / capture-jf-detail2.js   # 抓取脚本（可重跑）
```
