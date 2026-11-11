# REA 模板使用弹窗（已有N个周期的项目）— DOM/UI/接口提炼与组件复用评估

> 对应规格：[PM-T004 绩效模板创建：流程设置](../features/PM-T004-template-create/spec.md) 第 6.2 节「已有周期只读规则」
> 本轮范围：**仅 REA 采集 + 组件/接口提炼评估 + 复用关系确认，不改任何代码**
> 采集日期：2026-11-08
> 路径：绩效管理后台 → 绩效模板 → 编辑（已使用模板）
> URL：`https://idreamsky.feishu.cn/perf/admin/templates/7311617095791296514/1?from=%3FcurrentPage%3D1%26pageSize%3D10`
> 权威：无头 Chrome（复用已登录 profile，CDP 9333）+ Playwright 实采，证据 `rea-extract/out/tpl-usage-dialog/`
> 关联：[表格与全局组件层-差异核对与治理方案.md](./表格与全局组件层-差异核对与治理方案.md)、[REA周期概览-添加被评估人-DOM与接口提炼报告.md](./REA周期概览-添加被评估人-DOM与接口提炼报告.md)

---

## 0. 三句话结论

1. **顶部提示条 hr-portal 已实现且像素已对齐飞书**：`PerformanceTemplateWorkflowSettings.vue` 的 `.usage-banner`（40px 高、`#e1eaff` 底、16px 蓝底白 `i` 图标、超链接 `#1890ff`）与 REA 实测完全一致；**缺口是「点击超链接无弹窗」**——REA 中该 `<a>` 是 JS 触发居中弹窗的 token，hr-portal 当前无 `@click`。
2. **弹窗整体可 1:1 复用 `PerformanceDialogShell`**：飞书弹窗 600px 宽、header 72px、关闭 28×28、遮罩 `rgba(0,0,0,0.55)`，与 hr-portal `--performance-dialog-wide-width: 600px` + header 72px + close 28px + `--performance-overlay-dark: rgba(0,0,0,0.55)` 逐项一致；body 内做「周期折叠 + 项目行」列表，飞书用 `ud__collapse`，hr-portal 无现成折叠组件，需新建（可用 `UiSortableList`/原生实现）。
3. **接口缺口**：hr-portal 后端 `usage_summary` 只返回 `cycle_count/project_count` 两个数字，**无弹窗所需的周期+项目列表明细**。飞书 `GET /perf/api/review/v2/template_groups/{id}/ref_semester_activity` 返回 `semesterActivity[]`（周期名 + 项目名 + progress）；hr-portal 需在 `GET /performance/templates/{id}/workflow` 响应中新增 `ref_semester_activity` 或独立接口，数据源 `PerformanceCycle.template_id` + `PerformanceProject.settings["template_id"]` 已具备。

---

## 1. 页面级证据（编辑页顶部提示条）

### 1.1 REA 实测（`01-hint-info.json` / `10-hint-container.json`）

| 参数 | REA 实测值 | hr-portal 现状（`PerformanceTemplateWorkflowSettings.vue:648`） | 判定 |
|---|---|---|---|
| 容器 | `flex flex-row items-center h-20 px-8`，**40px 高**，`padding 0 16px`，全宽 | `.usage-banner{display:flex;align-items:center;height:40px;padding:0 16px}` | ✅ 一致 |
| 背景 | `rgb(225,234,255)` = `#E1EAFF` | `background:#e1eaff` | ✅ 一致 |
| 图标 | `InfoFilled` **16×16**，`rgb(51,112,255)` = `#3370FF` | `.banner-icon{width:16px;height:16px;border-radius:50%;background:#3370ff;color:#fff;font-size:12px}` | ✅ 一致（白 `i` 字） |
| 图标位置 | x=16, y=68（页顶 56px 之下） | 同（flex row 内首个元素） | ✅ |
| 超链接 | `<a>` 「4 个周期的项目」，14px/400 `#1F2329` 行内，**链接色 `rgb(24,144,255)`=`#1890FF`**，`cursor:pointer`，无 href（JS token） | `.banner-copy a{color:#1890ff}` | ✅ 一致 |
| 完整文案 | 「已有 4 个周期的项目 使用此模板，新修改将在保存后同步至用户，仅支持编辑所有的参考、提示内容，但无法修改评估流程、数据写入相关的设置。」 | 模板 `v-if="usageSummary.cycle_count > 0"`，`<a>{{ usageSummary.cycle_count }} 个周期的项目</a>` | ✅ 一致 |
| 关闭按钮 | 提示条右侧 `×`（`universe-icon`，16px，`#646A73`） | `.banner-close`（`#646a73`，20px `×`） | ≈ 有 |
| **点击超链接** | **JS 打开居中弹窗「使用该模板的周期与项目」** | **`<a>` 无 `@click`，点击无响应** | ❌ **缺口** |

> **结论**：提示条本身已对齐，无需改动；仅需给 `<a>` 挂 `@click` 打开弹窗。

---

## 2. 弹窗整体结构（REA 实测 `03-dialog-structure.json` / `02-dialog-info.json`）

### 2.1 弹窗容器

```
ud__dialog__wrap ud__dialog--centered（居中）
└─ ud__dialog__content ud__modal ud__dialog__content-md  →  **600×838px**，x=649,y=32（1920 视口下居中）
   └─ ud__modal__content ud__modal-closable
      ├─ ud__modal__header  →  **600×72**，padding 24px 56px 24px 24px
      ├─ ud__modal__body    →  **600×421**，padding 0 24px，margin-bottom 24px，可滚动
      └─ ud__modal__footer  →  **600×56**（本弹窗实际无按钮，空 footer 或省略）
遮罩：ud__dialog__mask = rgba(0,0,0,0.55)
```

### 2.2 标题与关闭

| 参数 | REA 实测 | hr-portal `PerformanceDialogShell` | 判定 |
|---|---|---|---|
| 标题 | 「使用该模板的周期与项目」`ud__modal__title` **16px/600/24px** `#1F2329` | `.performance-dialog__header h2` font-size `--performance-dialog-header-title-size:16px`、weight 600、line-height 24px | ✅ 一致 |
| 关闭按钮 | `ud__button--icon ud__button--icon-size-md` **28×28**，右上 | `.performance-dialog__close{width:var(--performance-dialog-close-size)}` = **28px** | ✅ 一致 |
| header 高 | 72px | `--performance-dialog-header-height:72px`，padding-y 24px、right 56px | ✅ 一致 |
| 弹窗宽 | 600px | `--performance-dialog-wide-width:600px` | ✅ 一致 |
| 遮罩 | `rgba(0,0,0,0.55)` | `--performance-overlay-dark: rgba(0,0,0,0.55)` | ✅ 一致 |
| 圆角/阴影 | `ud__dialog__content` 标准（REA 未测精确值） | `--performance-dialog-radius: var(--radius-lg)`、shadow `none` | 待最终像素比对 |

> **复用结论：整个弹窗壳 = `PerformanceDialogShell`（`fullscreen=false` + 默认 width 600px），零改动直接复用。** head、关闭按钮、遮罩、居中逻辑全部已具备（该项目已有 56 处引用，是绩效线标准弹窗壳）。

---

## 3. 弹窗 body：周期折叠 + 项目行（REA 实测 `04/05/06/08-*.json`）

### 3.1 数据来源（接口实测）

**`GET /perf/api/review/v2/template_groups/{templateGroupId}/ref_semester_activity`**

响应（实采，`api-bodies.json`）：

```json
{
  "code": 0,
  "data": {
    "templateGroupID": "7311617095791296514",
    "semesterActivity": [
      {
        "semesterId": "7702053437998894368",
        "semesterName": {"zh-CN": "测试绩效", "en-US": ""},
        "activities": [
          {"activityId": "7704278623921900804", "activityName": {"zh-CN": "gaby测试", "en-US": ""}, "progress": "enabled"}
        ]
      },
      {
        "semesterId": "7582047029224852679",
        "semesterName": {"zh-CN": "2025年全年度绩效考核", "en-US": ""},
        "activities": [{"activityId": "7582047604662406370", "activityName": {"zh-CN": "2025年全年度绩效考核"}, "progress": "finished"}]
      },
      { "semesterId": "7446241584558997506", "semesterName": {"zh-CN": "2024年全年度绩效考核"}, "activities": [{..., "progress": "finished"}] },
      { "semesterId": "7314953140334264348", "semesterName": {"zh-CN": "2023年全年度绩效考核"}, "activities": [{..., "progress": "finished"}] }
    ]
  },
  "msg": "查询成功", "success": true
}
```

- 结构：`semesterActivity[]`（周期列表）→ 每周期内 `activities[]`（项目列表）
- 状态：`progress: "enabled"`（已启动）/ `"finished"`（已结束）
- 顶部提示条数字「4 个周期的项目」= `semesterActivity.length`（4 个周期）；`template_groups/{id}` 另有 `ref_by_project: 12`（被 12 个项目引用，前端未直接用）

### 3.2 折叠列表 DOM/像素（REA 实测）

**周期行（折叠头）**：

```
.h-15（= 30px 高）flex row items-center，padding 0 12px
├── svg[data-icon=ExpandRightFilled]（10×10，颜色 #646A73）
├── 周期名（14px/22，#1F2329）
背景：#F5F6F7；底部：1px solid rgba(187,191,196,0.5)；cursor:pointer
```

**项目行（折叠内容）**：

```
.h-27（= 54px 高）flex row items-center，padding-left 7px
├── 项目名（14px/22，#1F2329，flex-1 truncate）
└── 状态 badge：`ud__badge ud__badge-dot-inline`（56×22，14px #1F2329）
    ├── 圆点 6×6：已启动 = #32A645（绿）；已结束 = #8F959E（灰）
    └── 文字：已启动 / 已结束
背景：transparent；底部：1px solid rgba(187,191,196,0.5)
```

**折叠交互（`08-collapse-verified.json`）**：默认全部展开（`ud__collapse-item-active`）；点击周期折叠头收起，其下项目行隐藏；再点展开。

### 3.3 页面结构图（目标弹窗布局）

```text
┌─────────── 600px 居中弹窗（PerformanceDialogShell） ───────────┐
│ Header（72px）：「使用该模板的周期与项目」16/600        [× 28px] │
├──────────────────────────────────────────────────────────────┤
│ Body（padding 0 24px）                                        │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ 折叠头 30px：#F5F6F7 ▸ 测试绩效（ExpandRightFilled）│     │
│  ├─────────────────────────────────────────────────────┤     │
│  │ 项目行 54px：  gaby测试               ● 已启动        │     │
│  │ 项目行 54px：  2025年…                ● 已结束        │     │
│  │ 折叠头 30px： 2025年全年度绩效考核    ▸              │     │
│  │ 项目行 54px：  2025年…                ● 已结束        │     │
│  │ 折叠头 30px： 2024年全年度绩效考核    ▸              │     │
│  │ …（body 内纵向滚动）                                 │     │
│  └─────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. 与系统已有组件的复用关系确认

### 4.1 弹窗壳 → `PerformanceDialogShell`（直接复用 ✅）

| 弹窗要素 | REA 飞书 | hr-portal 组件 | 复用判定 |
|---|---|---|---|
| 居中遮罩弹窗 | `ud__dialog--centered` + mask 0.55 | `PerformanceDialogShell`（`grid place-items:center` + overlay `--performance-overlay-dark`） | ✅ 直接复用 |
| header + 标题 | 72px / 16px 600 | `.performance-dialog__header` token 全对齐 | ✅ |
| 关闭按钮 | 28×28 icon | `.performance-dialog__close` 28px + `CloseOutlined` | ✅ |
| 弹窗宽度 | 600px | `width` 默认 `--performance-dialog-wide-width: 600px` | ✅ 默认值即中 |
| body 滚动 | 内部滚动 | `.performance-dialog__body{overflow:auto}` | ✅ |
| footer | 本弹窗无按钮 | `slot name="footer"` 不传即无 | ✅ |

### 4.2 折叠列表 → **无现成组件，需新建**（❌ 缺口）

- hr-portal `components/ui/`、`components/performance/` 中**无 collapse 折叠组件**；REA 用 `ud__collapse`（含 `ud__collapse-item-active` 展开态、动画）。
- 现有相近：`UiSortableList`（可排序列表，语义不符）、`PerformanceReviewCategorySidebar`（侧栏折叠，非弹窗列表）。
- **建议**：弹窗 body 内新建 `PerformanceTemplateUsageDialog.vue`（列表折叠用原生 `div + v-if/v-show` + 旋转箭头即可，规模小，不必抽象通用 collapse 组件；若未来跨模块复用再提炼 `UiCollapse`）。

### 4.3 状态 badge → 复用现有点 dot 样式，新建小组件（❌ 缺口）

- REA 用 `ud__badge-dot-inline`（6px 圆点 + 14px 文字）；hr-portal 无对应 badge 组件（`UiTag` 是色块标签，非 dot badge）。
- 现有可参考：`PerformanceMemberIdentity` 的 avatar（圆点语义不同）。
- **建议**：新建 `PerformanceStatusDot`（或并入弹窗组件内联实现）。仅弹窗内部使用可先内联，避免过早抽象。

**状态口径（已确认，2026-11-08）**：与飞书一致采用**四态**——`待完成配置 / 待启动 / 已启动 / 已结束`。飞书 REA 实测两态（`enabled→#32A645 已启动`、`finished→#8F959E 已结束`），当前正进行四态统一与优化，实施轮以最新四态映射为准，dot 颜色/文案与状态统一改造联动。

### 4.4 周期/项目接口 → **后端缺明细接口**（❌ 缺口）

| 能力 | 飞书 | hr-portal 现状 |
|---|---|---|
| 周期+项目列表明细 | `GET /perf/api/review/v2/template_groups/{id}/ref_semester_activity` | **无**；`GET /performance/templates/{id}/workflow` 仅返回 `usage_summary{cycle_count, project_count}` |
| 周期名称 | `semesterName.zh-CN` | `PerformanceCycle` 表有 `name` 字段（待确认） |
| 项目名称 | `activityName.zh-CN` | `PerformanceProject` 表有 name/settings |
| 项目状态 | `progress: enabled/finished` | `PerformanceProject.status`（DRAFT/STARTED/ARCHIVED）→ 四态口径：`待完成配置 / 待启动 / 已启动 / 已结束`（统一与优化进行中，见 4.3） |
| 引用模板关系 | `templateGroupId` | `PerformanceCycle.template_id/template_ids`、`PerformanceProject.settings["template_id"]`（`template_workflow_service.py:754-762` 已按此统计） |

> **接口建议（最小改动）**：在 `GET /performance/templates/{id}/workflow` 响应 `usage_summary` 旁新增 `ref_semester_activity: [{semester_id, semester_name, activities:[{project_id, project_name, status}]}]`，复用 `template_workflow_service.usage_summary` 同源查询逻辑扩展出明细；或独立 `GET /performance/templates/{id}/ref-semester-activities`。后端数据链路已具备，无迁移。

---

## 5. 结论与建议（本轮不改代码）

| 项 | 结论 |
|---|---|
| 顶部提示条 | ✅ hr-portal 已实现且像素对齐；**仅需给 `<a>` 加 `@click` 打开弹窗** |
| 弹窗壳 | ✅ **1:1 复用 `PerformanceDialogShell`**（600px 默认宽，header/关闭/遮罩全对齐） |
| 折叠列表 | ❌ 需新建弹窗内容组件 `PerformanceTemplateUsageDialog`（body 内周期折叠 + 项目行） |
| 状态 badge | ❌ 需新建 dot badge（或弹窗内联），**四态**：待完成配置 / 待启动 / 已启动 / 已结束（dot 颜色/文案随状态统一改造联动） |
| 明细接口 | ❌ 后端 `workflow` 响应补 `ref_semester_activity` 明细（复用现有 usage 查询扩展），前端类型 `PerformanceWorkflowResponse` 同步扩展 |
| 折叠图标 | ✅ 已有 `PerformanceIconButton` 的 `ExpandRightFilled`（与 REA `data-icon=ExpandRightFilled` 同源），直接用 |

### 后续开发顺序建议（进入实施轮时）

1. **后端**：`templates_router.py` workflow 响应加 `ref_semester_activity`（周期+项目+status 明细），`template_workflow_service` 加查询；`api/performance.ts` 类型扩展。
2. **前端弹窗**：新建 `PerformanceTemplateUsageDialog.vue`，复用 `PerformanceDialogShell` 承载，body 内折叠列表（周期行 30px/`#F5F6F7`/`ExpandRightFilled` 10px `#646A73`，项目行 54px/dot badge），调 `ref_semester_activity`。
3. **接线**：`PerformanceTemplateWorkflowSettings.vue` 顶部 `.usage-banner` 的 `<a>` 加 `@click` → 打开弹窗；弹窗关闭按钮复用 `PerformanceDialogShell` 自带关闭。
4. **验收**：1920 视口截图比对（600px 居中、header 72、折叠/展开、badge 颜色）、`UI → GET /performance/templates/{id}/workflow → 弹窗列表` 数据链一致。

### 已确认决策（2026-11-08）

1. **弹窗无 footer / 纯查看关闭**：去按钮，仅右上 `×` 关闭（`PerformanceDialogShell` 自带关闭）。
2. **项目状态四态**：`待完成配置 / 待启动 / 已启动 / 已结束`，与飞书一致（当前进行中的统一与优化为准，见 4.3）。
3. **折叠默认态**：以 REA 为准，**默认全部展开**。

---

## 6. 实施结果（2026-11-08，代码已交付）

| 项 | 实施 | 证据 |
|---|---|---|
| 后端明细 | `template_workflow_service.py` 新增 `ref_semester_activity()`（周期+项目+status，与 `usage_summary` 同源）；`templates_router.py` `WorkflowResponse` 增 `ref_semester_activity`，GET/PATCH 端点组装 | pytest 265 passed（workflow）+468 passed（projects），含新增 2 项 `ref_semester` 专项 |
| 前端类型 | `api/performance.ts` 增 `PerformanceRefSemesterActivity` / `PerformanceRefActivityProject`，`PerformanceWorkflowResponse.ref_semester_activity?` | vue-tsc 通过 |
| 弹窗组件 | 新建 `components/performance/PerformanceTemplateUsageDialog.vue`：复用 `PerformanceDialogShell`（600px 默认宽），body 周期折叠（30px/`#F5F6F7`/ExpandRightFilled 10px `#646A73`）+ 项目行（54px/dot badge），四态 `DRAFT→待完成配置 / STARTED→已启动 / ARCHIVED→已结束`，默认全展开，无 footer 纯关闭 | Vitest 组件 5/5 通过 |
| 接线 | `PerformanceTemplateWorkflowSettings.vue` banner `<a>` 挂 `@click` → 打开弹窗；onMounted 存 `ref_semester_activity` | Vitest 页面 58/58 通过（含新增弹窗交互 1 项） |
| 构建 | 生产 bundle 含「使用该模板的周期与项目」组件代码 | `npm run build` exit 0，dist 产物验证 |
| diff | — | `git diff --check` 通过 |

**四态映射说明**：后端返回原始 `status` code（`DRAFT/STARTED/ARCHIVED`），前端展示层映射文案；`待启动` 状态值待系统四态统一改造引入后自然衔接，本弹窗不新增状态值、不改 schema。

**未做 / not-run**：真实数据库分组查询验证（测试替身 guard 测试仅验证空/结构，真实 SQL `JSONB contains + 分组 + 排序` 需连接 PostgreSQL 复核）；登录态浏览器截图比对（1920 视口、像素级对齐）；生产部署。均保持 not-run，不冒充验收。
