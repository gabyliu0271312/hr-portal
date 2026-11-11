# REA 绩效校准「强制 / 建议分布」提示区 — DOM 与接口提炼与组件复用评估

> 逆向对象：飞书绩效「绩效评估 → 绩效校准」页顶部「强制分布 / 建议分布」比例与人数差异提示卡（含「收起全部」交互）
> REA 目标：`https://idreamsky.feishu.cn/perf/review/7706454297084431623/7706453791633309700/adjust?tabKey=report`
> 方法：CDP 9222 被动抓取（inspect_web_page + Node 22 原生 WebSocket 网络抓包 + `Runtime.evaluate` 提取 DOM 计算样式/像素）
> 评估基线：本地当前代码（`PerformanceProjectFlowSettings.vue` + `performanceProjectCalibration.ts` 分布规则配置 + `calibration_service.py` `distribution_summary`）
> 日期：2026-11-11 ｜ 本轮只评估不改码，零生产操作
>
> 测试账号/周期：gaby `6733065964654462476`；semester `7706454297084431623`；stage（校准环节）`7706453791633309700`；adjust_task `7706457367587605539`
> 证据：`.tmp-rea-calibration-responses.json`（65 个业务接口含请求/响应体）、`.tmp-rea-distribution-full.json`（5343 字符完整响应）、`.tmp-rea-card.html` / `.tmp-rea-card-collapsed.html`（展开/收起态完整 HTML）、`.tmp-rea-stat2.json`、`.tmp-rea-cdp-*.js` 采集脚本

---

## 1. 采集目标与证据链

| 项 | 值 |
|---|---|
| 页面 URL | `/perf/review/{semester}/{stage}/adjust?tabKey=report`（绩效评估 → 绩效校准，**report 页签**） |
| 提示区位置 | 页签内容最上方，即用户描述的「强制分布和建议分布比例与人数差异提示」，右上角有「收起全部」按钮 |
| 校准逻辑配置来源 | 绩效管理后端 → 周期与项目 → 项目设置 → 流程设置 → 绩效校准 → 绩效结果强制/建议分布（配置端下发 `distribution_rules`） |
| 数据链路 | `adjust/tasks`（任务+规则配置）→ `report/v3/.../users/list`（成员评级）→ `adjust/distribution`（分布计算 + 违反标记）→ 前端渲染提示卡 |
| 交互 | 「收起全部」→ 卡折叠为 2 条规则标题摘要；「展开全部」恢复（纯前端，无业务接口） |

**核心结论（一句话）**：飞书「强制/建议分布」提示区是一个**运行期分布规则校验的只读提示组件**，数据源为独立的 `POST /review/adjust/distribution` 接口（返回规则、范围内人数、满足/违反人数、violated_types），前端按 `constraint`/`recommend` 分组渲染为两张提示卡；**本地前后端均无该功能**（无 adjust 路由/接口/组件），配置端已有分布规则结构（`PerformanceDistributionRule` + `distribution_summary`）可作为映射基础。

---

## 2. 飞书侧接口清单（report 页签实采，65 个业务接口中筛出）

### 2.1 分布提示主链路（3 个接口 = 数据闭环）

| # | 接口 | 方法与参数 | 响应要点 | 本地对应 |
|---|---|---|---|---|
| B1 | `POST /review/adjust/tasks/list` | `{semester_id, stageIds:[]}` | `data.tasks[]`：`task_id`、`scope_rules`（adjuster_rule_groups/scope_rule_groups/distribution_adjust_rule_id）、`distribution_rules[]`（**规则配置快照**，结构见 §2.2）、`reviewee_count`、`editable`、`overdue` | `PerformanceProjectFlowSettings` 配置的 `calibration.distribution.rules` + `force_distribution_enabled`（配置态）；本地无运行期任务快照 |
| B2 | `POST /review/adjust/tasks` | `{semester_id, stageIds:[...]}` | 同构（task 详情重载，tab 切换时再发） | 同上 |
| B3 | `POST /review/adjust/distribution` | `{semester_id, adjust_task_ids:[...]}` | `data.adjust_tasks[].distribution_rules[]`：规则 + `range[].{range_condition_value,satisfied_count,current_count,total}` + `violated_infos[]`；`violated_types:["constraint","recommend"]`；**`distribution_rules_v2.{constraint,recommend}.violated[]` 聚合违反组** | **无**（全新接口） |

### 2.2 distribution 响应结构（B3，核心数据结构）

```jsonc
{
  "adjust_tasks": [{
    "task_id": "7706457367587605539",
    "violated_types": ["constraint", "recommend"],          // 违反类型标记：两条规则都未满足
    "distribution_config_id": "7706456949881212195",
    "distribution_rules": [
      {
        "item_id": "7655170451575966923",                   // 评估项（绩效评级）
        "distribution_type": "unify",
        "scope_limit": { "condition": "ge", "condition_value": "0" },
        "round_type": "Round",                              // 取整：四舍五入
        "rule_id": "7706456949881212195_0_0",               // {config_id}_{group}_{idx}
        "rule_type": "constraint",                          // constraint=强制 / recommend=建议
        "indicator_option_ids": ["7111633368893440001", "7111633368893423617"],  // 命中档位（5星+4星）
        "condition": "lt", "condition_value": "25", "value_type": "percent",
        "range": [{ "scope_option": "all_scope", "range_condition_value": 1,
                    "satisfied_count": 0, "current_count": 3, "total": 3 }],     // 比例→人数：应<1人
        "violated_infos": [{ "range_condition_value": 1, "satisfied_count": 0,
                    "current_count": 3, "total": 3 }]
      },
      { /* rule_type: "recommend", indicator_option_ids: [1星~3星+ 5档],
          condition: "ge", condition_value: "75", value_type: "percent",
          range: [{ "range_condition_value": 2, "satisfied_count": 2, "current_count": 0, "total": 3 }] */ }
    ],
    "distribution_rules_v2": {   // 按类型聚合违反组（前端渲染提示的直接数据源）
      "recommend": { "violated": [{ "rule_group_index": 0, "indicator_id": "...",
          "scope_index": 1, "scope_option": "all_scope", "distribution_type": "unify",
          "rules": [ /* 同上 rule 结构 */ ] }] },
      "constraint": { "violated": [ ... ] }
    }
  }],
  "item_name_map": { "aggregate_dimensions": [ { "id": "-1", "name": {"zh-CN": "司龄"},
      "intervals": [ {"id": "1", "name": {"zh-CN": "1个月内"}}, ... ] } ] }
}
```

### 2.3 成员评级数据源（B4/B5，分布计算依据）

| # | 接口 | 方法与参数 | 响应要点 |
|---|---|---|---|
| B4 | `POST /report/v3/semesters/{semester}/users/list` | `{offset, limit, filters:[{key:"adjust_task_ids",values:[...]}], headerId:"header_adjust_review_list", stageIds:[...], orders:[{key:"user",order:"ASC"}]}` | `data.users[]`：`userId`、`finalReviewScoreGroup${item_id}: {option_id, score}`（**评级档位**）、`rootReviewId`、`directLeader`、`level`；`user_count/review_user_count/selectable_user_count` |
| B5 | `POST /report/v3/semesters/{semester}/users/meta` | POST | `data`：53 个 meta（user/category/department/level 等维度定义）、`reportKeys`、`filterKeys` |

**数据闭环验证（真实账期）**：
- users/list 返回 3 人评级：`alice.xiao肖惠方`=5星（option `7111633368893440001`）、`cynthia.lin林少娜`=4星（`7111633368893423617`）、`rita.tang唐洁`=4星（`7111633368893423617`）
- **强制分布** `5星+4星 < 25%`（percent）：3 人全部命中 → 应 <1 人、当前 3 人 → **需减少 3 人**（数字红 `rgb(226,46,40)`）
- **建议分布** `1星+2星+3星-+3星+3星+ ≥ 75%`（percent）：0 人命中 → 最少需 2 人、当前 0 人 → **需增加 2 人**（数字橙 `rgb(194,87,5)`）
- `violated_types=["constraint","recommend"]`：两条规则同时未满足

### 2.4 report 页签辅助接口（非分布提示，但同页触发）

`GET /review/import_adjust/check_permission?adjust_task_id=`（导入校验）、`GET /review/adjust/can_import_coefficient/{task_id}`（系数导入）、`GET /report/v3/settings/{semester}?header_id=header_adjust_review_report`、`GET /report/v3/leader_differentiation/rules/{semester}`（leader 区分规则）、`GET /report/remark/{semester}?headerId=header_adjust_review_report`（备注）、`GET /foundation/draft?key={semester}__adjust_review_report_draft__{user}__{stage}`（报表草稿）、`POST /report/v3/filter_criteria/{semester}/query`、`GET /report/v3/focus/settings/{semester}`、`POST /report/v3/semesters/{semester}/users/lazy_load_meta_status`、`POST /user/snapshot/department/all`、`GET /user/aggregate_dimension?semester_id=&only_enable=true`（司龄区间）、`GET /user/snapshot/level?semesterId=`（等级）、`GET /review/semester/overdue_config?semester_id=&stage_id=`（逾期配置）、`GET /review/semesters/{semester}/stages`、`GET /review/360reviewer/semester_tags?semester_id=`。
`GET /report/v3/statistics/intervals` → `data:[]`（**本账期空配置**，未渲染统计区块；触发逻辑待确认）。

---

## 3. 页面 DOM 结构（卡片 HTML 实采）

### 3.1 整体容器

```
div.bg-N-100.rounded-4.px-6.pb-6        ← 展开态；收起态无 pb-6
├─ div.text-N-900.relative (padding-top: 11px)
│   ├─ button.ud__button--link.ud__button--size-md.absolute (top: 11px; right: 12px)
│   │   「收起全部」+ UpBoldOutlined 图标（展开态）/ 「展开全部」+ DownBoldOutlined（收起态）
│   └─ div#scrollToTopId
├─ 强制分布分区
│   ├─ div.font-medium.mb-5 「强制分布」
│   └─ 规则行（三角 + tag + 规则详情，见 3.2）
├─ div.h-8  （32px 分区间隔）
├─ 建议分布分区（同构）
└─ 底部说明 div.text-N-600
    「说明：当基于比例计算所得的人数为小数时，会采用【四舍五入】的方式取整。」
    （展开态 margin-top: 12px；收起态 margin-top: -8px; padding-bottom: 12px）
```

### 3.2 规则行结构（强制/建议各一行）

```
div.flex.justify-start.items-start
├─ span.universe-icon.mt-1.mr-4.adjustTriangleToCollapsButton
│   GlobalTrianglesmallOutlined（右三角，可点击折叠单条）
├─ div
│   ├─ div.flex.justify-start
│   │   ├─ span.ud__tag.adjustRuleTypeTag.ud__tag-sm.ud__tag-rect
│   │   │   ud__tag-error（强制分布「不符合」）/ ud__tag-warning（建议分布「不符合」）
│   │   └─ div.ml-5
│   │       ├─ div.font-medium.whitespace-pre-line 「绩效评级：校准范围内全部人员需满足」
│   │       └─ div.leading-24.whitespace-pre-line
│   │           「5星 + 4星 < 25%」（font-medium）：「
│   │           需小于 1 人｜当前 3 人｜需减少 <span style="color:rgb(226,46,40)"> 3 </span> 人」
│   │           建议分布对应「最少需 2 人｜当前 0 人｜需增加 <span style="color:rgb(194,87,5)"> 2 </span> 人」
```

### 3.3 收起交互验证

- 展开态卡高 **224px**、「收起全部」UpBoldOutlined；收起态卡高 **67px**、「展开全部」DownBoldOutlined
- 收起后仅保留分区标题（「强制分布」「建议分布」）+ 底部说明，规则行整体隐藏
- **纯前端状态切换，无业务接口**：仅埋点 `adjustReport_adjustRuleTips_expandbutton_click`（`button_status: 收起全部`）
- 单条规则也可经 `adjustTriangleToCollapsButton` 折叠（三角形点击）

---

## 4. 像素级样式提炼（token 对应）

| 元素 | 实测值 | 语义 token 映射（本地） |
|---|---|---|
| 卡片背景 | `bg-N-100` | tokens.css 灰阶 N-100 系 |
| 卡片圆角 | `rounded-4`（4px） | `--radius-*` 4px |
| 卡片横向内边距 | `px-6`（24px） | 24px 间距 token |
| 卡片顶部内边距 | `padding-top: 11px` | 11px（非标准间距，需新增或内联） |
| 分区标题 | `font-medium` `mb-5`（20px） | 字重 500 |
| 强制分布 tag | `ud__tag-error`（红语义） | **本地无** `ud__tag-error`；`PerformanceExecutorTag` 为 `neutral-option` 灰 |
| 建议分布 tag | `ud__tag-warning`（橙语义） | **本地无** `ud__tag-warning` |
| 「需减少」数字 | `rgb(226,46,40)` 红 | `--color-danger` 系（本地有） |
| 「需增加」数字 | `rgb(194,87,5)` 橙 | `--color-warning` 系（本地有） |
| 说明文字 | `text-N-600` | 灰阶 N-600 |
| 规则正文行高 | `leading-24`（24px） | 24px 行高 |
| 三角图标 | `GlobalTrianglesmallOutlined` 16px `mt-1 mr-4` | 本地 `AdjustTriangleToCollaps` 语义（新增小三角图标） |
| 右上按钮 | `ud__button--link` `--size-md`，`top:11px;right:12px` | 本地 `PerformanceCollapseButton`/link 按钮 |
| 分区间隔 | `h-8`（32px） | 32px |

**关键差异**：飞书 tag 为 **4px 圆角**（`ud__tag-rect`）红/橙语义；本地 `PerformanceRatingTag` 是全圆角胶囊、`PerformanceExecutorTag` 是 4px 圆角但灰底色。**语义色 tag（error/warning）本地缺失**。

---

## 5. 本地组件复用评估

### 5.1 配置端已有（可作映射基础，非提示组件）

| 本地物 | 位置 | 与飞书对应 |
|---|---|---|
| `PerformanceDistributionRule` | [api/performance.ts:1979](hr-portal/frontend/src/api/performance.ts#L1979)：`assessment_item_id`、`min_people_operator/count`、`conditions[{control_mode HARD/SOFT, grade_codes[], operator EQ/LT/LTE/GT/GTE, value, unit PERCENT/PEOPLE}]`、`rounding_method ROUND/CEIL/FLOOR/NONE` | 飞书 `condition/condition_value/value_type percent` ↔ 本地 `operator/value/unit PERCENT`；`round_type Round` ↔ `rounding_method ROUND`；`indicator_option_ids` ↔ 本地 `grade_codes`（档位标识不同：飞书 option_id 数字 vs 本地 grade code 字符串，需映射表） |
| `PerformanceDistributionSettings` | `mode: 'UNIFIED' | 'BY_CALIBRATION_SCOPE'`、`rules[]`、`scope_configured` | 飞书 `distribution_type: "unify"` 对应 UNIFIED；`distribution_scope_rules` 对应 BY_CALIBRATION_SCOPE 的执行范围 |
| `calibration_service.py::distribution_summary` | [calibration_service.py:48](hr-portal/backend/app/performance/calibration_service.py#L48)（解析 phase 级 `distribution_rules` 覆盖节点级，格式化 lines） | **复用点**：运行期提示可复用同一解析逻辑（或另建运行期计算），生成「评估项名 + 各等级条件 + 取整方式」文本；已有测试 |
| `PerformanceProjectFlowSettings.vue` | 流程设置页分布规则配置 UI（`force_distribution_enabled`、UNIFIED 模式、rules 编辑） | 配置端源头；运行期提示只需读取配置 + 计算人数 |

### 5.2 前端组件复用判断

| 组件 | 复用点 | 状态 |
|---|---|---|
| `PerformanceExecutorTag.vue` | **壳可复用**（`ud__tag ud__tag-md ud__tag-rect` 4px 圆角、`ud__tag__content`、同一套 class），换背景色语义即可表达 error/warning | 复用改造：加语义色变体（error/warning），不需新组件 |
| `PerformanceRatingTag.vue` | 不可直接复用（全圆角胶囊 vs 飞书 4px rect） | 不用于提示卡 |
| `PerformanceCollapseButton`（如有）/ link 按钮 | 「收起全部/展开全部」右上按钮（ud__button--link + 上下箭头图标） | 复用 link 按钮体系 |
| `PerformanceInfoPopover` / `PerformancePopover` | 如需 hover 明细（同授权弹窗「沿用此任务的分布规则」交互） | 备用 |
| 图标 | `GlobalTrianglesmallOutlined`（单条折叠三角）| 本地无同名图标，需新增或复用现有三角 |

**结论**：本地**无现成分布提示组件**，需要新建一个只读提示卡组件（如 `PerformanceDistributionTips.vue`：接收 `distribution_rules` + 人数统计，渲染强制/建议两张卡 + 收起交互）。**组件壳复用 `PerformanceExecutorTag` 的 ud__tag 结构，仅扩展语义色**，非全新造轮子。

### 5.3 后端差异（运行期计算）

| 维度 | 飞书 `adjust/distribution` | 本地现状 | 差异 |
|---|---|---|---|
| 人数计算 | 后端权威计算：`range.current_count/total`（当前命中人数/总数）+ `satisfied_count`（满足规则人数）+ 比例→人数取整 | `distribution_summary` 仅格式化配置文本，**无人数统计** | 需要运行期统计接口或复用报表结果数据 |
| 违反标记 | `violated_types` + `violated_infos`（按范围） | 无 | 需新增 |
| 数据源 | 任务快照 `distribution_rules` + 最终评级 `finalReviewScoreGroup` | 评级数据在本地报表链路（`report/v3/*` 或本地等效） | 需打通 |

---

## 6. 差异项与待确认事项

### 已确认差异（建议实施方向，本轮不改码）

1. **全新功能**：本地前后端均无 adjust 分布提示链路——路由（`router/index.ts` 无 `.../adjust` 页）、接口（`api/performance.ts` 无 `/review/adjust/*`）、后端（无 `adjust/distribution` 计算）。需按 021「一条正式计算链」原则设计：运行期人数统计应基于既有评级结果数据，不建平行报表链。
2. **语义色 tag 缺失**：本地 tokens.css 无 `ud__tag-error/warning`；`PerformanceExecutorTag` 只有 neutral 灰。飞书红 `rgb(226,46,40)` / 橙 `rgb(194,87,5)` 需落到 token（本地 `--color-danger`/`--color-warning` 已存在，只需 tag 语义变体）。
3. **规则文本格式**：飞书提示文案 = `评级档位名 + 档位 + 条件 + 比例%`（如 `5星 + 4星 < 25%`）+ 人数推导（`需小于 1 人，当前 3 人，需减少 3 人`）。本地 `_distribution_rule_lines` 输出 `绩效评级：适用人数 X 人时生效 / 强制：... / 取整方式：...`——格式不同，运行期提示需按飞书文案重排。评级档位名（5星/4星）需从评估项 `grade_options` 映射 `option_id → label`。

### 待确认项（需真实交互/更多账期确认，本轮未触发）

- **`statistics/intervals` 触发条件**：本账期返回空配置（`data:[]`），前端未渲染统计区块。需有司龄区间等聚合配置的账期确认渲染形态。
- **多任务聚合**：B3 body 为 `adjust_task_ids:[...]`（数组），当前仅 1 个任务（`7706457367587605539`）。多任务时 `distribution_rules_v2` 是否按任务分组、前端是否逐任务渲染多卡，待采。
- **收起状态持久化**：收起/展开是否写 `localStorage`/`user/custom_settings`（页面内 2 次 `POST /user/custom_settings` 疑似），重进页面是否保留，待交互确认。
- **满足态样式**：本账期两条规则均违反（violated）。规则**满足时**（`violated_types` 为空）卡片是否隐藏、tag 是否变绿（如「符合」），需构造满足账期确认。
- **「需减少/需增加」文案分支**：本账期命中「需减少」（当前>上限）与「需增加」（当前<下限）。`min`/`max` 双向、相等时不显示差异的文案分支未全采。
- **BUTTON 埋点域名**：`adjustReport_adjustRuleTips_expandbutton_click` 属内部埋点体系，本地无等效。

---

## 7. 本轮不做事项与影响面

### 不做事项（明确排除）
- **不改任何代码**（用户指令：本轮只做评估和提炼）。
- **不新增接口**：运行期人数计算如何落地留待实施轮决策（复用报表结果数据 vs 新增统计接口），本轮仅记录飞书契约。
- **不触发真实分布计算/校准操作**：仅被动观察，零提交、零修改。

### 影响面总览（供实施轮参考）
- 前端：新页面路由（`.../adjust`）+ 新组件 `PerformanceDistributionTips.vue`（提示卡）+ `PerformanceExecutorTag` 语义色变体 + tokens.css 补 `--ud-tag-error/warning`。
- 后端：运行期分布人数统计（复用既有评级结果）或新增 `adjust/distribution` 等效接口。
- 测试：新组件 spec + 分布统计测试（参照 `distribution_summary` 已有测试）。
- 生产边界：零生产操作；实施沿开发推送发布流程，禁止生产现场补丁。

---

*附：证据文件 `.tmp-rea-calibration-responses.json`（65 业务接口全量请求/响应体）、`.tmp-rea-distribution-full.json`、`.tmp-rea-card.html`/`.tmp-rea-card-collapsed.html`（卡片完整 HTML）、`.tmp-rea-stat2.json`（users/list + statistics/intervals）、`.tmp-rea-cdp-*.js`（CDP 采集脚本，均在仓库根目录 .tmp- 前缀）。分布文案（需减少/需增加）、收起交互、像素色值均为 CDP 实测，非推断；`adjust/distribution` 请求时机为 tabKey=report 加载触发，属观察所得。*
