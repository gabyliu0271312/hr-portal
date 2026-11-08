# 360°评估率弹窗 — DOM 与接口提炼报告

> REA 逆向提炼 · 飞书绩效管理前台
> 页面：`绩效管理前台 → 项目管理 → 成员列表 → 360° 评估率列`（hover 完成率弹出）
> URL：`https://idreamsky.feishu.cn/perf/management/v2/7654423719619710195/7340285661313974274/all-projects/members`
> 采集时间：2026-11-08 · 采集工具：Playwright + CDP 共享浏览器（`rea-extract/capture-rate-tooltip-*.js`）
> 采集数据：`rea-extract/out/rate-tooltip/*.json`（00~29 序列，含 DOM/样式/接口全量）

---

## 1. 页面与列定位

| 项 | 值 |
| --- | --- |
| 页路由 | `all-projects/members`（成员列表 tab） |
| 数据接口 | `POST /perf/api/report/v3/semesters/{semesterId}/users/list` |
| 360°评估率列 | 表格第 5 列，x≈2246，宽 443px，内容形如 `1/2` |
| 分页 | 服务端 50 条/页，406 人共 9 页（分页器 `.ud__pagination`，可 DOM click 跳页） |
| hover 弹窗 | `ud__popover.EvaluateRatio-popover`，360px 宽，z-index 1030 |

### 表格行数据 → 弹窗展示链路

```
users/list 行字段（每行）：
  semesterStageInviteReviewDonePercentageGroupKey: "<stageId>:"  → { numerator, denominator }  // 360° 邀请评估完成比例
  semesterStageStatusGroup: "invite_review:<stageId>"             → status                       // statusNotExist / statusFinished / statusHasEnd
  realTimeDimissionStatus                                          → in_service / dimissed
  rootReviewId                                                     → 本行绩效评估根 review id
```

弹窗内容按**该行 numerator/denominator/status** 决定渲染哪一态（见 §3 判定逻辑）。

---

## 2. 弹窗整体规格（三态通用）

| 属性 | 值 |
| --- | --- |
| 外层容器 | `ud__popover EvaluateRatio-popover ud__popover--mode-normal`，flex column |
| 内容区 | `ud__popover-content`，白底 `#FFFFFF`、圆角 8px、边框 1px `#DEE0E3`、`padding: 12px 16px`、阴影多层 `rgba(31,35,41)` |
| 标题行 | `flex items-center justify-between mb-10`，标题 16px/600 `#1F2329`，前有蓝色竖条 `inline-block mr-4 my-2 align-bottom w-1 h-8 bg-B-500`（`#3370FF`，1.4×11.2px） |
| 标题文案 | 「邀请和评估情况」 |
| 分区块 | `EmpLabelList__EmpLabelListContainDismissionStyle-*`，背景 `#F8F9FA`、圆角 6px、`padding: 12px`、`margin-bottom: 20px` |
| 区块标题行 | `leading-22 flex justify-between items-center mb-4`，左「已评估：N / 未评估：N」（14px/600），右可选按钮 |
| person 标签 | `ee-user-card` 自定义元素 → `ud__tag employee-label-internal ud__tag-md ud__tag-round ud__tag-neutral`，内嵌头像（20×20 圆）+ 姓名 `name truncate max-w-100` |
| 头像图标 | 分区标题左 7×7 `MemberFilled` 图标（人员图标） |
| 箭头 | `ud__popover__arrow__streamline`（8×16 描边箭头，跟随弹窗） |

### 三态尺寸与高度

| 状态 | 示例人 | 弹窗尺寸 |
| --- | --- | --- |
| 空态（无 360° 评估人） | alice.xiao 肖惠方 | 380 × **92** |
| 未评估人含离职（有 1 名离职） | huixiang.chen 陈慧祥 | 380 × **195** |
| 已评估/未评估双分组（进行中） | aaron.zhu 朱鹏旭 | 380 × **246** |

---

## 3. 三态判定逻辑与弹窗内容

### 3.1 空态 —— 「暂未邀请360°评估人」

**触发条件**：`semesterStageInviteReviewDonePercentageGroupKey` 中 denominator = 0（如 `0/0`，statusNotExist）。

```
ud__popover-content
└── flex items-center justify-between mb-10（标题行）
    └──「邀请和评估情况」
└── 空态块：无 EmpLabelList 分区
    └──「暂未邀请360°评估人」（灰 #646A73，14px/400，pd 12px 0px 0px）
```

alice.xiao：接口 `0/0`，弹窗只显示标题 + 「暂未邀请360°评估人」。**无任何 person 标签、无催办按钮**。

### 3.2 有评估人双分组（已评估 / 未评估）

**触发条件**：denominator > 0（`1/2`、`1/1` 等）。

```
ud__popover-content
└── 标题行「邀请和评估情况」
├── EmpLabelList 分区① 已评估
│   ├── leading-22 flex justify-between items-center mb-4
│   │   ├── span.font-medium「已评估：N」
│   │   └── （无催办按钮）
│   └── flex-wrap -mb-4
│       └── ee-user-card > ud__tag（每名已评估人：头像 + 姓名）
├── EmpLabelList 分区② 未评估
│   ├── leading-22 flex justify-between items-center mb-4
│   │   ├── span.font-medium「未评估：N」
│   │   └── button「催办」← 仅「未评估」分区有，且仅在**评估进行中**显示
│   └── flex-wrap -mb-4
│       └── ee-user-card > ud__tag（每名未评估人：头像 + 姓名）
```

aaron.zhu 朱鹏旭：接口 `1/2`（1 人已评估 danny.deng 邓超、1 人未评估 ryan1.zhang 张宏宇），弹窗 380×246。

### 3.3 未评估人含离职 —— 附加说明

**触发条件**：未评估人列表中有人 `realTimeDimissionStatus = dimissed`。

```
在「未评估」分区**之后**追加一行灰字：
「有 1 名已离职或账号暂停使用的成员：」
（rgb(100,106,115)，14px/400，padding: 12px 0px 0px）
```

huixiang.chen 陈慧祥：`0/1`，未评估 1 人 yuzhu.zhang 张玉柱 `dimissed`，弹窗 380×195。离职人仍以 person 标签展示（头像 + 姓名），下方灰色说明。**说明文案数量随离职人数变化**（如「有 2 名已离职…」）。

### 3.4 催办按钮（★本次补采关键结果）

**位置**：仅「未评估」分区的标题行右侧（`justify-between` 右端）。

```html
<button type="button" class="ud__button ud__button--text ud__button--text-primary ud__button--size-md ml-6">
  <span class="ud__button__icon-inline ud__button__icon-inline-start">
    <span class="universe-icon">
      <svg viewBox="0 0 24 24" fill="none" data-icon="BellOutlined"><!-- 铃铛图标 BellOutlined --></svg>
    </span>
  </span>
  催办
</button>
```

| 属性 | 值 |
| --- | --- |
| 按钮 | `ud__button--text--primary`，文字按钮 54×22px，`padding: 2px 4px`，圆角 6px |
| 图标 | 铃铛 `BellOutlined`（1em，跟随文字色 `#1456F0`） |
| 文字 | 「催办」14px/400 `#1456F0`，前置图标 `ml-6`（12px） |
| 出现条件 | **邀请评估进行中（未结束）+ 该分区有未评估人** |

> ⚠️ **采集说明（催办态）**：本次指定周期（2026 年半年度，stage 全部 `statusHasEnd`/`statusFinished`）没有「评估进行中」的行，初次探测时 aaron 弹窗不显示催办。**将鼠标移到未评估人 person 标签上后，催办按钮才出现**（本报告 27/28/29 号脚本抓取）。已完整抓到按钮 DOM 与交互，但未真实点击触发飞书消息（避免对真实人员产生打扰）；点击后应触发「催办提醒」接口，本次未观测到对应请求，实际请求需在开发环境验证。
> 界面判定：`statusNotExist`（无数据）→ 空态；`statusFinished`（已完成）→ 已评估分组；`statusHasEnd`（已结束）→ 无催办按钮，仅双分组展示；**进行中 + 有未评估** → 未评估分区显示催办按钮。

---

## 4. 接口数据（users/list 全量字段结论）

### 4.1 请求

```
POST /perf/api/report/v3/semesters/7654423719619710195/users/list
Body: { offset, limit(50), headerId, orders, roleId, filters }
```

### 4.2 关键行字段（弹窗数据源）

| 字段 | 示例 | 用途 |
| --- | --- | --- |
| `semesterStageInviteReviewDonePercentageGroupKey` | `"7340285661313974274:"` → `{ numerator, denominator }` | 弹窗「已评估：N / 未评估：N」与空态判定 |
| `semesterStageStatusGroup` | `"invite_review:7340285661313974274"` → `statusNotExist/statusFinished/statusHasEnd` | 空态 / 已评估 / 已结束判定 |
| `realTimeDimissionStatus` | `in_service / dimissed` | 离职说明行是否出现 |
| `rootReviewId` | 数字 | 行级 review 关联（弹窗不直接使用，成员详情用） |

### 4.3 采样统计（本周期 406 人）

| 分布 | 人数 | 状态 |
| --- | --- | --- |
| `0/0` | 401 | statusNotExist（空态） |
| `1/1` | 1（judy） | statusFinished |
| `0/1` | 3（huixiang/nick1/ryan.mao） | statusHasEnd |
| `1/2` | 1（aaron） | statusHasEnd |
| `dimissed` | 43 人 | 离职标记（含 yuzhu.zhang 张玉柱） |

---

## 5. 全局组件复用评估（对照 hr-portal 现有组件）

> 用户关注点：「鼠标放上去的弹窗应该已经有全局组件直接可以复用，但以弹窗内部的展示形式」。
> 结论：**弹窗本体有可直接复用的成熟全局组件；person 标签链尚无 1:1 组件，需从展示层抽取。**

### 5.1 可直接复用的全局组件 ✅

| 飞书弹窗元素 | hr-portal 现成组件 | 复用方式 |
| --- | --- | --- |
| 浮层定位/hover 控制 | [`PerformancePopover.vue`](../../../hr-portal/frontend/src/components/performance/PerformancePopover.vue) | 已实现 anchor 定位 + hover/focus/Esc 关闭 + 上下 placement + ResizeObserver 自适应，**正是鼠标悬停浮层的骨架** |
| 信息弹窗封装（icon 锚点+hover） | [`PerformanceInfoPopover.vue`](../../../hr-portal/frontend/src/components/performance/PerformanceInfoPopover.vue) | 已封装 anchor+delay+keepOpen+close 全套悬停逻辑，本弹窗可参照其模式 |
| 催办铃铛图标 | [`BellOutlinedIcon.vue`](../../../hr-portal/frontend/src/components/performance/BellOutlinedIcon.vue) | **与飞书 `BellOutlined` 完全同款**（同一 SVG path），催办按钮图标直接用它 |
| 成员头像 | [`PerformanceMemberIdentity.vue`](../../../hr-portal/frontend/src/components/performance/PerformanceMemberIdentity.vue) | 圆形头像 + 姓名行，弹窗 person 标签的「头像+姓名」即此形态 |
| 文字按钮（催办） | [`PerformanceTextButton.vue` / `UiButton.vue`](../../../hr-portal/frontend/src/components/performance/) | `ud__button--text` 对应平台文字按钮组件，variant 对齐即可 |
| 弹窗容器（若扩成点击展开大卡片） | [`PerformanceDialogShell.vue`](../../../hr-portal/frontend/src/components/performance/PerformanceDialogShell.vue) | 弹窗内容如需升级为完整对话框，容器直接用它 |

### 5.2 需在展示层抽取/新建的 ⚠️

| 飞书元素 | hr-portal 现状 | 差距 |
| --- | --- | --- |
| `ee-user-card` person 标签（头像+姓名，可含离职态） | 有 `PerformanceMemberIdentity`（无离职态）、`PerformanceExecutorTag`（纯文字 tag，无头像） | 缺「成员 person 标签」组合组件：头像 + 姓名 + 离职/暂停标记 + 可选按钮（催办），即弹窗内的 `ud__tag employee-label-internal` 形态。属展示层，可在 `components/performance/` 新增一个小型展示组件 |
| 「邀请和评估情况」卡片（标题竖条 + 分区块 + 分组标题行 + 灰色说明） | 无 1:1 | 弹窗专属组合，建议以 `PerformancePopover` 为壳，内层做成 `EvaluateRatioPopover` 组合组件（分区块复用） |
| 已评估/未评估 分组标签容器 | 无 | 灰底 `#F8F9FA` 圆角 6px 分区块，抽取为通用「分组列表块」 |

### 5.3 复用路线图（不做永久兼容壳，直接整合）

1. **壳**：直接复用 `PerformancePopover`（已实现 hover 浮层全套机制）。
2. **图标**：复用 `BellOutlinedIcon`（铃铛催办）+ 平台已有点击按钮组件。
3. **person 标签**：~~新增展示组件（头像+姓名+离职态），供本项目与后续成员列表/人员选择复用~~ ✅ 已实施：`PerformanceMemberIdentity` 增强 `dimission` prop（置灰 + 「（已离职）」后缀），弹窗直接复用同一组件。
4. **内容组合**：`EvaluateRatioPopover.vue` 组合（标题竖条 + 已评估分区 + 未评估分区 + 催办按钮 + 离职说明），数据驱动三态。

### 5.4 实施记录（2026-11-08 已交付）

| 组件/文件 | 变更 |
| --- | --- |
| [`PerformanceEvaluateRatioPopover.vue`](../../../hr-portal/frontend/src/components/performance/PerformanceEvaluateRatioPopover.vue) | **新建**。以 `PerformancePopover` 为壳（380px），标题竖条 + 已评估/未评估双分组（灰底 #F8F9FA 12px 内距 6px 圆角）+ 未评估催办按钮（仅 `invite_stage=in_progress`）+ 离职灰说明，数据驱动三态 |
| [`PerformanceMemberIdentity.vue`](../../../hr-portal/frontend/src/components/performance/PerformanceMemberIdentity.vue) | 阶段 A 加 `size="sm"`（20px 头像/12px 字号/6px 间距）；阶段 B 加 `dimission` prop（离职置灰） |
| [`PerformanceReminderPanel.vue`](../../../hr-portal/frontend/src/components/performance/PerformanceReminderPanel.vue) | 催办按钮 `primary` → `text`（文字蓝 + BellOutlined 铃铛 14px 前置），头像统一 sm；上级评估成员列表与弹窗催办同款 |
| [`projects_router.py`](../../../hr-portal/backend/app/performance/projects_router.py) | 新增 `_communication_progress_detail`：同源查询 + snapshot person join 解析评估人姓名/离职，返回 `evaluate_ratio`（completion/evaluated/pending/dimission_count/invite_stage） |
| [`ProjectMemberListPanel.vue`](../../../hr-portal/frontend/src/components/performance/ProjectMemberListPanel.vue) | completion 列挂载 `PerformanceEvaluateRatioPopover`，emit `remind-evaluate` |
| [`ProjectManagement.vue`](../../../hr-portal/frontend/src/views/performance/ProjectManagement.vue) | `@remind-evaluate` → 打开 `PerformanceReminderPanel`（mode=remind，nodeId=review-360） |

---

## 6. 采证文件索引

| 文件 | 内容 |
| --- | --- |
| `out/rate-tooltip/06-alice.json` | 空态弹窗（380×92） |
| `out/rate-tooltip/20-aaron.json` | 双分组弹窗（380×246） |
| `out/rate-tooltip/20-huixiang.json` | 离职弹窗（380×195） |
| `out/rate-tooltip/22-hx-labels.json` | 离职态 person 标签 DOM |
| `out/rate-tooltip/24-hx-full.json` | 离职说明样式（灰 #646A73 14px） |
| `out/rate-tooltip/29-remind4.json` | **催办按钮完整 DOM + 祖先链 + 点击后 UI** |
| `out/rate-tooltip/02-pages.json` | 406 人接口全量数据（三态分布统计） |
| `out/rate-tooltip/26/27/28-*.json` | 催办按钮出现条件探测（hover 标签触发） |

> 提示：催办按钮「点击后请求」本次未观测到（避免打扰真实人员）；开发验证时在测试周期触发一次，抓 `/perf/api/` 下 remind/notify 类请求即可确认。
