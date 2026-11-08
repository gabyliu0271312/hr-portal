# REA 提炼：人员组管理「添加人员范围」弹窗

> 像素级还原 + DOM 组件提炼 + 全局组件复用评估。**已实施完成（2026-11-08）**，本报告标注验收证据。

## 0. 实施状态（本轮交付）

| 项 | 状态 | 证据 |
| --- | --- | --- |
| 弹窗重构 840 规则弹窗 | ✅ 已实施 | `hr-portal/frontend/src/components/performance/focus-group/FocusGroupMemberAddDialog.vue` |
| 840 宽档 token | ✅ 已实施 | `tokens.css` → `--performance-dialog-md-width: 840px` |
| 共享 scopes 转换 | ✅ 已实施 | `api/performance.ts` → `toFeishuScopes` / `hasCompleteScopeRule`（新建页同步复用） |
| 弹窗单测 | ✅ 通过 | `FocusGroupMemberAddDialog.spec.ts` 3 用例（壳/统计/提交链路） |
| 相关套件回归 | ✅ 7 文件 51 用例通过 | focus-group + create + HRBP + ruleEditor specs |
| 类型检查 | ✅ 通过 | `vue-tsc --noEmit` |

**提交链路**：`resolveScope`（-1 → task_id 轮询）取名单 → 与 `currentEmployeeNos` 去重合并 → `updateMembers`。**不伪造名单，选人由后端规则解析。**

## 1. 采集信息

| 项 | 值 |
| --- | --- |
| 页面 | 周期级人员组 → 详情页 → 手动维护组 →「添加」 |
| 弹窗标题 | 添加人员范围 |
| REA URL | `https://idreamsky.feishu.cn/perf/admin/semester-activities/7654423719619710195/focus-people/management/7669998387978046396?from=...` |
| 采集方式 | CDP connect + scenario（goto → settle → click 添加 → settle）→ DOM artifact |
| 弹窗节点 | `ud__dialog__content ud__modal ud__dialog__content-md` |
| 关键证据 | `add-dialog-dom.html`（本采集场景 DOM）、HRBP V2 报告同弹窗体系规格 |

## 2. 弹窗三段式像素规格（840 档）

**总尺寸 840 × 656**，居中，左右 margin 220（viewport 1280 下 840+440=1280 精确对齐）。

```
┌─────────────────────────────────────────────┐
│ header（含说明 96px）                          │
│   添加人员范围             [×]                │
│   按规则选择用户添加到人员组中，…不支持动态更新。 │
├─────────────────────────────────────────────┤
│ body                                          │
│   适用范围 *                                  │
│   ┌─ 符合条件的人员，共 0 人 ──────────────┐   │
│   │ 条件组 1                                 │   │
│   │ 同时满足以下条件：0 人                    │   │
│   │ ┌128┐ ┌88┐ ┌──55%──┐        ┌del┐      │   │
│   │ └────┘ └──┘ └────────┘        └───┘      │   │
│   │ ＋ 添加条件                               │   │
│   │ ＋ 添加人员范围                           │   │
│   └────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│ footer（56px）    [确定] [取消] 右对齐          │
└─────────────────────────────────────────────┘
```

### 2.1 各段规格

| 段 | 尺寸 / 样式 | 来源 |
| --- | --- | --- |
| 弹窗宽 | `content-md` 840px | `ud__dialog__content-md` |
| 弹窗高 | 656px（单条件态，内容撑开） | `height: 656px` |
| header 高 | **96px**（含说明：24 padding-top + 24 title + 4 gap + 22 des + 22 padding-bottom） | HRBP V2 同体系报告 |
| 标题 | 16 / 24 / 600，`ud-typography-title-4` | DOM class |
| 说明 | 14 / 22 / 400，`ud-typography-body-0`，`ud__modal__des` | DOM class |
| 标题↔说明间距 | **4px** | `--performance-dialog-header-desc-gap` 已有 |
| 关闭按钮 | icon-size-md（icon 20×20，热区 28×28.8） | `ud__button--icon-size-md` |
| body 顶部（中间区↔顶部距离） | form item label「适用范围」距 body 顶 24px（body padding 24） | form 垂直布局默认 |
| footer 高 | **56px**，确定/取消右对齐，按钮 size-md | `ud__modal__footer` |

### 2.2 规则编辑器（EmployeeScopeEditor）规格

| 元素 | 规格 |
| --- | --- |
| 统计行 | 「符合条件的人员，共 **0** 人」（人数为 text-primary 按钮，disabled） |
| 组标题 | 「条件组 1」+「同时满足以下条件：0 人」，行高 22px |
| 条件行 | 三列：**128px**（字段 select）+ **88px**（操作符 select）+ **55%**（值 select，多选） |
| 条件行下边距 | **16px** |
| 删除按钮 | icon-size-sm，单条件时 disabled（`pointer-events: none`） |
| 添加条件 | text-primary size-md（AddOutlined 前缀） |
| 添加人员范围 | text-primary size-md（AddOutlined 前缀） |

## 3. 全局组件复用评估

### 3.1 弹窗壳 → `PerformanceDialogShell`（✅ 复用，需补 token 档位）

`PerformanceHrbpScopeDialog.vue` 已证明完全够用：

```vue
<PerformanceDialogShell v-model="open" title="添加人员范围" width="840px" ...>
  <template #description>按规则选择用户添加到人员组中，人员范围不支持动态更新。</template>
  ...body...
  <template #footer>…UiButton 确定/取消…</template>
</PerformanceDialogShell>
```

- 说明 slot、关闭按钮（20×20 CloseOutlined）、`@close` 语义均已内置
- **缺口 1**：`tokens.css` 目前只有 `--performance-dialog-width: 420px` 与 `--performance-dialog-wide-width: 600px` 两档，**缺 840px 档**
- **缺口 2**：`--performance-dialog-header-height: 72px` 为无说明弹窗档；含说明时内容自然撑到 96px（72 为 min-height）。建议将 96 显式 token 化，避免"靠内容撑高"的隐性约定

### 3.2 中间人员选择 → `PerformanceAudienceRuleEditor` scopeMode（✅ 复用；**接线以「新建人员组页 → 人员范围设置」为准**）

目标弹窗中间即「新建人员组 → 人员范围设置」的规则编辑器（EmployeeScopeEditor）。代码实证（`FocusPeopleGroupCreate.vue:360-378`）：**新建页「人员范围设置」挂的就是 `PerformanceAudienceRuleEditor` scopeMode**，且比 HRBP 弹窗（`PerformanceHrbpScopeDialog`）更接近目标弹窗，作为接线样板：

```vue
<PerformanceAudienceRuleEditor
  v-model="scopeGroups"
  scope-mode
  :show-scope-heading="false"
  :allowed-fields="[...allowedScopeFields]"   <!-- 人员组业务字段（department/employee/directLeader/superior/…共10个） -->
  :organization-tree="organizationTree"
  :person-options="rulePersonOptions"
  :employee-type-options="employeeTypeOptions"
  :snapshot-options="options || undefined"
  group-title-pattern="条件组 {index}"
  @search-people="searchPeople"
/>
```

| 维度 | 新建人员组页（权威样板） | HRBP 弹窗 | 目标弹窗（REA 抓包） |
| --- | --- | --- | --- |
| 组件 | `PerformanceAudienceRuleEditor` scopeMode | 同组件 scopeMode | EmployeeScopeEditor（即此组件） |
| 统计行 | 「符合条件的人员，**共计** N 人」（独立 `<p>`，走 `refreshScopeCount` 轮询） | 无 | 「符合条件的人员，**共** N 人」 |
| allowed-fields | 10 个人员组业务字段 | HRBP 黑名单字段 | 人员组业务字段（抓包默认字段 select 显示「部门」） |
| default-field | 未显式传 | `directLeader` | `department`（部门） |
| 组标题 | `条件组 {index}` + 同时满足 | 同 | 同 |

**差异点（实施时处理）**：

1. **统计行文案**：新建页「共计」vs 目标「共」，HRBP 无统计行 → scopeMode 的统计行需要「显隐 + 文案」可配置（目标弹窗可沿用「共 N 人」，与抓包一致）。
2. **字段范围**：目标弹窗应传**人员组业务字段**（同新建页），`default-field="department"`（与抓包默认「部门」对齐）；HRBP 弹窗的 `default-field="directLeader"` + 黑名单字段**不适用于本弹窗**。
3. **计数逻辑**：新建页用 `resolveScope` + 500ms 轮询刷新「符合条件的人数」；目标弹窗抓包同样有「共 0 人」统计（disabled text-primary 按钮）。实施时复用新建页的 `refreshScopeCount` 接线。

底层三列 128 / 88 / 值（`grid-template-columns: 128px 88px minmax(0, 1fr)`）、组卡灰底、组间「或」、删除按钮 hover 显隐/单条 disabled、添加条件/添加人员范围按钮：scopeMode 均已对齐，无需改动。

### 3.3 底部取消/确定 → `UiButton` + `PerformanceDialogShell` footer（✅ 复用）

参照 `PerformanceHrbpScopeDialog`：primary「确定」+ secondary「取消」右对齐，`gap: var(--performance-dialog-footer-gap)`。footer 56px 已 token 化（`--performance-dialog-footer-height`）。

### 3.4 现状差距：`FocusGroupMemberAddDialog` 需重构

当前「添加成员」弹窗是 **600 宽默认档** + `PerformancePersonSelect` 搜索多选，与飞书「添加人员范围」弹窗形态不符：

| 维度 | 当前 | 目标（REA） |
| --- | --- | --- |
| 宽度 | 600（默认 wide） | 840（content-md 档） |
| 标题 | 添加成员 | 添加人员范围 + 说明 |
| 中间 | 搜索多选 | 规则编辑器（EmployeeScopeEditor） |
| 提交 | 更新成员列表（`updateMembers`） | 待定（按规则选人 → 人员组规则） |

即：把中间部分换成 `PerformanceAudienceRuleEditor`（scopeMode），壳加说明 + 840 档，footer 复用现有确定/取消。

## 4. 全局 token 约定提炼（本次不改，下轮实施）

目标：弹窗尺寸 / 标题-说明间距 / 中间区与顶部距离全部走 token，不硬编码。

| 建议 token | 值 | 现状 |
| --- | --- | --- |
| `--performance-dialog-md-width: 840px` | 840 | ❌ 缺（仅有 420/600 档） |
| `--performance-dialog-header-height--with-desc: 96px`（或 scope 内覆写） | 96 | ⚠️ 72 为无说明档，96 靠内容撑高 |
| `--performance-dialog-header-desc-gap: 4px` | 4 | ✅ 已有 |
| `--performance-dialog-body-padding-x / gap-top: 24px` | 24 | ✅ 已有（`--performance-dialog-padding`） |
| `--performance-dialog-footer-height: 56px` | 56 | ✅ 已有 |
| 条件行三列 128/88 | editor scopeMode 内 grid | ✅ 已硬编码在组件样式（可再 token 化，非弹窗层级） |

**复用组合（下轮目标结构）**：

```
PerformanceDialogShell (width=840, #description)        → 弹窗壳 + 顶部
  └─ PerformanceAudienceRuleEditor (scopeMode)           → 中间人员范围选择
  └─ #footer: UiButton 确定 / 取消                        → 底部
```

## 5. 结论

- 目标弹窗与 HRBP「设置范围」弹窗（840 档 + 96 header + scopeMode 编辑器）**同一弹窗体系、完全同构**；`PerformanceHrbpScopeDialog` 即为现成参照实现。
- 三段式全部可复用：壳 = `PerformanceDialogShell`，中间 = `PerformanceAudienceRuleEditor` scopeMode，底部 = `UiButton`。
- 实质工作：① `FocusGroupMemberAddDialog` 重构为 840 规则弹窗；② tokens 补 840 宽档 + 96 含说明 header 档。
- 本轮未改任何代码；依据本报告进入下一轮实施时需按仓库规则声明目标卡/复用点/验收口径。
