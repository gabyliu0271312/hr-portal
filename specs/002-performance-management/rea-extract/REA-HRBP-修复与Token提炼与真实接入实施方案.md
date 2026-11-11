# HRBP不可见范围 · 组件修复 + Token 提炼 + 真实能力接入实施方案

> 承接第三轮评估（被评估人组件 = PerformanceAudienceRuleEditor scopeMode 已确认复用）。
> 本报告把「人员组件修正 / 弹窗三段式 token 提炼 / 全局 HRBP 不可见真实接入」落成可执行方案。
> 本轮聚焦分析与方案定稿，实施代码改动按本报告步骤执行。

---

## 一、人员组件修正（复用 PerformanceAudienceRuleEditor，对齐 REA）

### 1.1 已确认的复用点与差距

| REA「设置范围」弹窗 | 现有组件（scopeMode） | 差距 |
|---|---|---|
| 条件行 128/88/值 | `grid-template-columns: 128px 88px minmax(0,1fr)` | ✅ 一致 |
| 字段选择（级联：直属上级/员工/部门） | PerformanceSearchSelect plain | ✅ 结构可用，字段需裁剪+补 directLeader |
| 操作符 包含/不包含 | operatorOptions include/exclude | ✅ 一致 |
| 组内「且」rail | PerformanceConditionLogicGroup 且 | ✅ 一致 |
| 组间「或」rail | scope-or rail | ✅ 一致（REA 22 高「或」，现有 rail 竖线形态，可接受） |
| 「添加条件」（组内加条件） | **scopeMode 下「添加条件」实为 addGroup（加组）** | ❌ **语义错位，需修正** |
| 「添加人员范围」（加组） | 非 scopeMode 的「＋ 添加人员范围」 | ❌ scopeMode 下缺失，需补 |
| 组标题「条件组 N」 | scopeMode 无标题 | ❌ 需补（22 高，14px） |
| 删除按钮 | has-delete 恒显示 | ⚠️ REA 为 hover 显示，可微调 |

### 1.2 修正动作（PerformanceAudienceRuleEditor.vue）

```
A1. 新增 prop：groupTitleEnabled?: boolean（默认 false，scopeMode+弹窗场景传 true）
    → scopeMode 下每组渲染「条件组 {{ groupIndex + 1 }}」标题（22 高，复用 group-heading 样式）
A2. 修正 scopeMode 的按钮语义：
    - 「添加条件」→ 组内 addCondition（scopeMode 下每组下方显示）
    - 新增「添加人员范围」按钮（scopeMode 下显示，addGroup）
    - 现有 spec 中 scopeMode 用例（:270~290）需同步更新断言
A3. 删除按钮 hover 显隐：scopeMode 下 has-delete 改为 hover 显示（CSS :hover 控制 opacity）
```

### 1.3 字段层修正（performanceConditionFields.ts）

```
B1. 新增字段定义（REA hrbp_blacklist 场景 3 项中的「直属上级」）：
    directLeader: { label: '直属上级', valueSource: 'people' }
B2. 新增导出 HRBP 场景裁剪表：
    export const HRBP_BLACKLIST_FIELDS = ['directLeader', 'employee', 'department'] as const
    （供 HRBP 弹窗传入 allowedFields；沿用既有 performanceConditionFields 体系）
B3. 校验函数复用：isDateConditionField / validHireDateCondition 对 HRBP 场景无日期字段，无需动
```

### 1.4 新增薄壳组件 PerformanceHrbpScopeDialog.vue

```
<PerformanceDialogShell v-model title="设置范围" width="840px">
  <template #description>设置后，将向 HRBP 隐藏实时满足该范围的人的绩效详情。</template>
  <PerformanceAudienceRuleEditor
    v-model="groups" scope-mode group-title-enabled
    :allowed-fields="HRBP_BLACKLIST_FIELDS"
    :organization-tree :person-options ...
    @open-options @open-preview />
  <template #footer>取消 / 确定（UiButton secondary/primary 80×32）</template>
</PerformanceDialogShell>
```

---

## 二、设计 Token 全局提炼（弹窗三段式 + 范围规则）

### 2.1 弹窗容器三段式 token 治理（tokens.css）

**发现的问题**：现有 `--performance-dialog-header-height: 72px`（组件实际引用）与
`--performance-dialog-header-min-height: 96px`（声明但未用）并存冲突；REA 实测 header 96。

统一为「上中下三段」token 族：

```css
/* ===== 弹窗容器三段式（REA ud__dialog 实测基线） ===== */
/* 上段 header */
--performance-dialog-header-height: 96px;        /* 修正 72→96，与 REA 一致 */
--performance-dialog-header-padding-y: 24px;     /* 上/下内边距 */
--performance-dialog-header-padding-x: 24px;     /* 左右内边距（title 与 close 间 56） */
--performance-dialog-header-title-size: 16px;
--performance-dialog-header-title-weight: 600;
--performance-dialog-header-title-line-height: 24px;
--performance-dialog-header-desc-size: 14px;     /* 说明文字 */
--performance-dialog-header-desc-weight: 400;
--performance-dialog-header-desc-line-height: 22px;
--performance-dialog-header-desc-gap: 4px;       /* 标题与说明间距（REA 标题 48 高内 24+说明） */

/* 中段 body */
--performance-dialog-body-padding-x: 24px;
--performance-dialog-body-gap-top: 24px;         /* header 与 body 间距 */
--performance-dialog-body-gap-bottom: 24px;      /* body 与 footer 间距 */

/* 下段 footer */
--performance-dialog-footer-height: 56px;
--performance-dialog-footer-padding-x: 24px;
--performance-dialog-footer-button-height: 32px;
--performance-dialog-footer-button-min-width: 80px;
--performance-dialog-footer-button-gap: 12px;
```

**修正**：`PerformanceDialogShell.vue` 的 header 改用 `--performance-dialog-header-height`（96）
并显式声明三段 gap；移除/弃用 `--performance-dialog-header-min-height`。

### 2.2 范围规则（scope）token 族（新增，REA 实测）

```css
/* ===== 范围规则编辑器（REA /perf/admin/selection 实测） ===== */
--performance-scope-field-width: 128px;          /* 字段选择器 */
--performance-scope-operator-width: 88px;        /* 操作符 */
--performance-scope-value-width: 476px;          /* 值选择器（基准） */
--performance-scope-row-gap: 8px;                /* 条件行内列间距 */
--performance-scope-group-title-height: 22px;    /* 「条件组 N」行高 */
--performance-scope-group-title-size: 14px;
--performance-scope-group-title-color: #1f2329;
--performance-scope-group-title-weight: 400;
--performance-scope-logic-rail-width: 27px;      /* 组内「且」rail（REA 27） */
--performance-scope-or-height: 22px;             /* 组间「或」 */
--performance-scope-add-btn-size: 14px;          /* 添加条件/人员范围（蓝 #1456f0） */
--performance-scope-delete-size: 24px;
/* 员工搜索（REA 实测） */
--performance-scope-search-item-height: 52px;
--performance-scope-search-avatar-size: 32px;
--performance-scope-search-name-line-height: 22px;
--performance-scope-search-dept-line-height: 22px;
--performance-scope-search-dept-color: #8f959e;
--performance-scope-highlight-color: #1456f0;
/* 部门树（REA 实测） */
--performance-tree-node-height: 30px;
--performance-tree-expand-size: 16px;
--performance-tree-expand-icon-size: 10px;
--performance-tree-indent: 16px;
```

### 2.3 与现有不一致处的全局修正

| token | 现值 | REA | 修正 |
|---|---|---|---|
| `--color-line-control` | `#d0d3d6` | `#D0D3D4` | `#d0d3d4` |
| `--performance-select-tag-background` | `rgba(31,35,41,.1)` 灰 | `#F0F4FF` 蓝 | `#f0f4ff` |
| `--performance-select-tag-text` | `#1F2329` | `#3370FF` | `#3370ff` |
| `--performance-dialog-header-height` | `72px`（使用） | 96 | `96px` |

> 以上修正影响面：全站 select 边框/tag 配色、所有弹窗 header 高度。属 REA 色板正向对齐，
> 但需执行一次全站视觉回归；若个别页面依赖旧高度/配色，走组件级 override 而非回退全局值。

---

## 三、真实能力接入（关键：全局不可见 → 运行时真的看不到）

### 3.1 现状（两套不可见机制）

| 机制 | 位置 | 作用域 | 运行时消费 |
|---|---|---|---|
| 周期级单个 HRBP | `PerformanceHrbpPermission.invisible_people`（表 `performance_hrbp_permissions`，按 cycle_ref+hrbp_employee_no） | 该 HRBP × 该周期 | `projects_router.py:1700`（成员过滤）`_person_hrbp_project_refs`（可见项目） |
| 全局（REA 目标） | `PerformanceOtherPermissionSetting.hrbp_invisible_people`（单例 id=1） | **租户级，所有 HRBP** | **当前未接入运行时** ❌ |

### 3.2 接入点（后端，runtime 判定合并）

```
C1. projects_router.py:1698-1702（_resolve_project_data_scope HRBP 分支）
    → visible 计算中追加全局过滤：
      global_invisible = (await _global_hrbp_invisible_people(db))  # 读单例 setting.hrbp_invisible_people
      member.employee_no not in (permission.invisible_people or []) AND member.employee_no not in global_invisible

C2. projects_router.py:2266 _person_hrbp_invisible_people(db, actor_ref, cycle_ref)
    → 返回值并集追加全局：return per_hrbp_invisible | global_invisible

C3. projects_router.py _person_hrbp_project_refs（可见项目判定）
    → 成员 IN scope 且 NOT IN (per_hrbp_invisible ∪ global_invisible) 才纳入可见项目
    （否则 HRBP 的"我的项目"里会出现他不可见的项目）

C4. 新 helper：_global_hrbp_invisible_people(db) → set[str]
    读 PerformanceOtherPermissionSetting(id=1).hrbp_invisible_people（含未来 scopes 展开的员工集）
```

### 3.3 全局配置写入（前端 → 后端）

```
D1. 前端 PerformanceHrbpScopeDialog「确定」→ 组装 groups → PATCH
    /performance/permission-settings/other { hrbp_invisible_people: [所有员工 employee_no 并集] }
    （沿用现有 performanceOtherPermissionSettingsApi.update；保持 hrbp_permissions 原值不覆盖）

D2. 可选增强：后端将 scopes 结构化存储（groups→conditions）供未来场景复用；
    当前最小接入：仅展开为 employee_no 集合写入 hrbp_invisible_people 即满足"真实生效"
```

### 3.4 权限

- 写：`performance.configuration.manage`（现有 other_permission_settings_router 已带）
- 前端入口：PerformancePermissionButton op="U"（现有约定）
- 读（运行时消费）：HRBP 视角已有权限校验（PROJECT_DATA_FORBIDDEN 403），全局不可见只收窄可见集，不新开权限

---

## 四、实施顺序（代码改动清单）

| 序 | 文件 | 改动 |
|---|---|---|
| 1 | `styles/tokens.css` | §2.1 弹窗三段式 token + §2.2 scope token 族 + §2.3 三处修正 |
| 2 | `PerformanceDialogShell.vue` | header 用 96 token；body/footer 显式三段 gap |
| 3 | `performanceConditionFields.ts` | 新增 directLeader + HRBP_BLACKLIST_FIELDS |
| 4 | `PerformanceAudienceRuleEditor.vue` | scopeMode 按钮语义修正 + 组标题 prop + 删除 hover |
| 5 | `PerformanceAudienceRuleEditor.spec.ts` | 更新 scopeMode 断言 |
| 6 | 新增 `PerformanceHrbpScopeDialog.vue` | 弹窗薄壳（840 + 标题/说明 + 规则编辑器） |
| 7 | `OtherPermissionSettings.vue` | 特定范围编辑入口改挂新弹窗 |
| 8 | 新增后端 `_global_hrbp_invisible_people` + C1~C3 接入 | 运行时全局过滤 |
| 9 | 后端测试 `test_performance_other_permission_settings.py` 补全局不可见用例 | 回归 |

---

## 五、验收口径（对应用户三条要求）

1. **组件复用**：复用 PerformanceAudienceRuleEditor scopeMode，不新造条件组组件（新增仅薄壳）
2. **token 全局提炼**：弹窗三段式 + scope token 族入 tokens.css，修正 3 处旧值
3. **真实接入**：配置保存后，`_resolve_project_data_scope` 等运行时判定合并全局 invisible →
   HRBP 真的看不到被筛选人员（对照「周期级 HRBP 权限管理」的不可见人员已生效路径）
