# HRBP不可见范围 · 被评估人组件复用评估（第三轮）

> 用户指正：系统「周期与项目 → 项目信息 → 被评估人」处已有该组件。
> 复核结论：**属实**。该组件即 `PerformanceAudienceRuleEditor.vue`（被评估人筛选条件组编辑器），
> 已内置 `scopeMode`（范围模式）—— 与 REA「设置范围」弹窗**同构**。
> 本报告：确认复用路径、量化差异、给出修复清单。不改代码。

---

## 1. 用户指正确认

用户指出的位置：绩效管理后台 → 周期与项目 → 项目信息 → 被评估人

```
PerformanceProjectSettingsPage.vue
└─ section「被评估人」（required）
   ├─ 提示：可圈定被评估人范围。同一评估周期中，每名被评估人只能参与 1 次「绩效评估」。
   ├─ audience-summary：符合条件的员工，共计 N人（任务生成/仅报表统计）
   └─ <PerformanceAudienceRuleEditor v-model="form.evaluator_rules.groups" ... />
      └─ 组件内条件组编辑器：PerformanceConditionLogicGroup（且）+ PerformanceSearchSelect（字段/操作符）
         + PerformanceOrganizationSelect（部门树）/ PerformancePersonSelect（员工）/ 日期/职级/职位族等专用选择器
```

**确认：该组件 = `PerformanceAudienceRuleEditor.vue`，且其 `scopeMode` 分支的布局
（条件行 `128px 88px minmax(0,1fr)`）与 REA「设置范围」弹窗逐像素一致。**

---

## 2. 复用路径确认（组件层）

| REA「设置范围」弹窗要素 | 现有 PerformanceAudienceRuleEditor（scopeMode） | 复用判定 |
|---|---|---|
| 条件行三列 128/88/值 | `.is-scope .__condition { grid-template-columns: 128px 88px minmax(0,1fr) }` | ✅ **逐像素一致** |
| 组内「且」逻辑（rail 20px） | `PerformanceConditionLogicGroup operator="且"`（rail 20px 连接线） | ✅ 结构一致（REA 27px 宽，rail 20px 略窄） |
| 组间「或」分隔 | `__or`（border-top + 文字「或」） | ✅ 一致 |
| 添加条件 | scopeMode →「添加条件」（14px 蓝 `#1456F0`） | ✅ 一致 |
| 添加人员范围 | 非 scopeMode →「＋ 添加人员范围」 | ✅ 文案一致 |
| 字段选择器 | `PerformanceSearchSelect` plain（默认显示字段名） | ✅ 组件一致 |
| 操作符 eq/neq | `operatorOptions: include（包含）/ exclude（不包含）` | ✅ 一致 |
| 部门值（树） | `PerformanceOrganizationSelect`（树） | ✅ 一致 |
| 员工值 | `PerformancePersonSelect`（多选） | ⚠️ 差异见 §3.3 |
| 删除条件/组 | `PerformanceIconButton`（DeleteTrash，24px） | ✅ 一致 |
| 组标题 | 非 scopeMode「范围 N」/ scopeMode 无标题 | ⚠️ REA 有「条件组 1/2」标题（见 §3.2） |

**结论：REA 弹窗主体 = 现有 `PerformanceAudienceRuleEditor` scopeMode + 外层弹窗壳（PerformanceDialogShell）。
组件已存在且同构，本轮无需新造组件，只需「裁剪字段 + 差异微调」。**

---

## 3. 量化差异与修复清单

### 3.1 字段裁剪（核心差异）

| 维度 | REA（hrbp_blacklist scene） | 现有组件 | 处置 |
|---|---|---|---|
| 可用字段 | **直属上级(directLeader) / 员工(employee) / 部门(department)** 仅 3 项 | `REVIEWEE_CONDITION_FIELDS` 10 项（部门/人员类型/入职日期/员工/在职状态/离职日期/职位族/职位类/职级/标准职位） | 传 `:allowed-fields` 裁剪为 3 项即可（组件已支持） |
| 直属上级 | **REA 独有**，现有字段表无 `directLeader` | `PERFORMANCE_CONDITION_FIELDS` 无此 key | **需新增**字段定义 `directLeader: { label: '直属上级', valueSource: 'people' }` |
| 操作符 | eq/neq（包含/不包含） | include/exclude | ✅ 一致 |
| 场景接口 | `GET .../resolve-scope/meta?scene=hrbp_blacklist` | 前端静态 `PERFORMANCE_CONDITION_FIELDS` | 组件已用 props 注入，接口可后续接 |

### 3.2 组标题差异

| REA | 现有 | 差异 |
|---|---|---|
| 组内显示「条件组 1」「条件组 2」22 高 14px `#1F2329` | scopeMode 无组标题；非 scopeMode 显示「范围 1」（`__group-heading` 带计数链接） | **REA 弹窗需要组标题**。可在 scopeMode 下加 `__group-title`「条件组 N」 |

### 3.3 员工值选择器差异（复用 PerformancePersonSelect 但需扩展）

| 维度 | REA | 现有 PersonSelect | 处置 |
|---|---|---|---|
| 搜索行为 | 输入关键词 → `POST /user/query` → 结果列表（头像 32 圆 + 姓名 + 部门 + 高亮） | 本地 filter 扁平选项（无头像/部门/高亮） | 差异最大处，见下方 |
| 已选 tag | 蓝底 `#F0F4FF` 蓝字 `#3370FF` | 灰底 `rgba(31,35,41,.1)` 黑字 | 全局 token 修正（同前报告 §4.1） |
| 结果项高 | 52 | 32（option-height） | 需专用行高 |

> 员工搜索器与 REA 形态差异，属**可选增强**：若验收要求"搜索成员"占位 + 头像/部门展示，则需扩展 PersonSelect 或新增 EmployeeSearchSelect；若仅要求布局/交互一致，现有 PersonSelect 已满足"选择员工"语义。

### 3.4 弹窗壳差异

| 维度 | REA | 现有 DialogShell | 处置 |
|---|---|---|---|
| 标题 | 设置范围 | `title="设置范围"` | 复用 |
| 副标题 | 设置后，将向 HRBP 隐藏实时满足该范围的人的绩效详情。 | `description` slot | 复用 |
| 宽度 | 840 | `width="840px"` | 复用传参 |
| footer | 确定(蓝 `#1456F0`)/取消(描边) 80×32 | UiButton primary/secondary | 复用 |

### 3.5 删除按钮交互差异

| REA | 现有 |
|---|---|
| 条件组删除按钮 24×24，**hover 组才显示** | scopeMode 下 `has-delete`（多组时恒显示） |

> 微调：REA 是 hover 显示；现有是恒显示（有组即显示）。可按 REA 改 hover 显隐。

---

## 4. 结论：复用方案（相比前两轮报告的修正）

### 4.1 修正前两轮结论

前两轮报告结论是「**需新增 EmployeeScopeEditor 组件族**」——**已被用户指正推翻**。
修正后：**组件已存在（PerformanceAudienceRuleEditor scopeMode），无需新增组件族**，改为：

| 步骤 | 内容 | 规模 |
|---|---|---|
| R1 | tokens.css：追加 scope token + 修正 select tag 配色/line-control | 低（见前报告 §4） |
| R2 | `performanceConditionFields.ts` 新增 `directLeader` 字段定义 | 1 行级 |
| R3 | 新增 `PerformanceHrbpScopeDialog.vue`（弹窗壳 + AudienceRuleEditor 组合，allowedFields 裁剪为 3 项，加组标题「条件组 N」） | 新 1 组件（薄壳） |
| R4 | OtherPermissionSettings.vue「特定范围」编辑入口改挂 R3 弹窗 | 替换挂载 |
| R5 | API：自研契约映射（见前报告 §5.1） | 后端 |
| R6 | 员工搜索器增强（头像/部门/高亮，接搜索接口） | 可选增强 |
| R7 | 删除按钮 hover 显隐（对齐 REA） | 微调 |

### 4.2 与既有使用的兼容性

- `PerformanceAudienceRuleEditor` 已有 3 处调用（项目设置页/分配规则/项目弹窗）+ spec 测试覆盖 scopeMode
- 所有改动为**增量**（新增 directLeader 字段、新增薄壳组件、scopeMode 下加组标题），**不破坏既有调用**；仅 token 全局修正需回归

---

## 5. 证据索引

| 证据 | 路径 |
|---|---|
| 被评估人条件组组件 | `hr-portal/frontend/src/components/performance/PerformanceAudienceRuleEditor.vue`（scopeMode 128/88 布局） |
| 条件字段定义 | `.../performanceConditionFields.ts`（10 类字段 + operator + 日期操作符） |
| 逻辑组（且/或 rail） | `.../PerformanceConditionLogicGroup.vue`（20px rail + 连接线） |
| 调用点 3 处 | `PerformanceProjectSettingsPage.vue:40` / `PerformanceDistributionRuleEditor.vue:13,29` / `PerformanceProjectDialog.vue:140` |
| 组件测试 | `.../PerformanceAudienceRuleEditor.spec.ts`（含 scopeMode 用例 :270） |
| REA 弹窗基线 | `rea-extract/REA-HRBP不可见范围-编辑弹窗-抓包分析报告.md`（§3 条件组规格） |
