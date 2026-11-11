# HRBP 设置范围弹窗 · 6 项 REA 定位分析（本轮不改代码）

> 用户反馈 6 项与 REA 的差异，基于抓包 DOM 证据逐条定位。
> 证据：`rea-extract/out/hrbp-invisible/01~16`（05/06 轮多组态、15/16 轮本轮）
> 现状代码：`hr-portal/frontend/src/components/performance/PerformanceAudienceRuleEditor.vue`、`PerformanceConditionLogicGroup.vue`、`PerformanceSearchSelect.vue`、`PerformanceSelectShell.vue`

---

## 逐条定位

### 1️⃣ 条件组之间的「或」应该是左对齐的

| 项 | REA 实测 | 现状 |
|---|---|---|
| 「或」容器 | `condition-group__separator`：444,477 **792×22**，`text-align:start`（左对齐） | `.performance-audience-rule-editor__or`：`display:flex; justify-content:center`（**居中**） |
| 底色 | 透明（bg 空） | 透明 ✅ |

**结论**：REA「或」文本在 792 宽整行容器内**靠左**（text-align:start），现状**居中**。需将 `.or` 改为左对齐（去掉 justify-content:center，容器左缘 x=444 与条件组左缘一致）。

### 2️⃣ 添加条件按钮与上面的距离太近

| 项 | REA 实测 | 现状 |
|---|---|---|
| 组内「添加条件」距上方条件行 | 组1: 列表底 419 → 按钮 y427 = **8px**；组2: 589 → 597 = **8px** | `PerformanceTextButton` 自带 `margin-top:-2px`；组内「添加条件」无 scope 专用间距，有效间距 ≈ **6px** |
| 底部「添加人员范围」 | 距组2底 647-639 = 8px | `.scope-add { margin-top: var(--spacing-2) }` = 8px ✅ |

**结论**：组内「添加条件」按钮距上方条件行 **REA=8px、现状≈6px**（按钮 -2px 吃掉 2px）。需给 scope-mode 下组内「添加条件」补 8px 间距（margin-top:8px 抵消 -2px）。

### 3️⃣ 条件组内后面的删除按钮应一直存在（非 hover）

| 项 | REA 实测 | 现状 |
|---|---|---|
| 条件行删除按钮 | `condition-delete-btn` 1174,456 **24×24.2**，`color:#bbb fc4`（#BBBFC4），**opacity 空 = 常显** | `.is-scope .performance-audience-rule-editor__condition > :deep(.performance-icon-button) { opacity: 0; hover→1 }`（**hover 显隐**，上一轮误加） |

**结论**：REA 条件行删除按钮**常显**（DOM 无 opacity/visibility 隐藏）。现状上一轮改成 hover 显隐是**误判**（上午报告 §7「hover 可见」不准确，DOM 实测 opacity 为空）。需移除 hover 逻辑、恢复常显。

### 4️⃣ 条件组删除按钮应在条件组上面（顶部）、有 2 组就存在（非 hover）

| 项 | REA 实测 | 现状 |
|---|---|---|
| 组删除按钮位置 | `condition-group__group` 右上角外侧：组1 **1212,297** 24×24.2（y=组容器顶）、组2 **1212,507**；color `#646A73` | `position:absolute; top:0; right:calc(-1*var(--spacing-3)-2px)`（右上外侧 ✅） |
| 显示条件 | 常显（DOM opacity 空） | `v-if="modelValue.length > 1"`（2 组才渲染 ✅）+ 上一轮 hover 显隐 ❌ |
| 位置 | **y=组顶对齐**（与组标题同高，右外侧） | top:0 对齐组顶 ✅ |

**结论**：REA 组删除按钮**常显**（有 2 组就存在，无 hover），位于组容器右上外侧与组顶对齐。现状位置/条件 ✅，但**上一轮加的 hover 显隐需移除**。

### 5️⃣ 员工筛选时 active 态没有弹窗，只有筛选后才有弹窗

| 项 | REA 实测 | 现状 |
|---|---|---|
| 点击空值选择器（active） | **不弹层**（08/09 轮截图同图，无面板；需输入才触发 `/user/query` 渲染） | `PerformanceSelectShell.openMenu()` 点击即 `open.value=true` 弹层；`remoteSearch` 下弹层打开但**列表为空**（显示「暂无可选项」空态） |
| 输入关键词后 | 弹层出现 + 列表渲染（`ud__select__dropdown` 449×114） | 弹层已开 + 列表显示 ✅ |

**结论**：REA active 态**弹层也不出现**（不是弹空面板）。现状点击会弹出空面板（显示空态文字）。需在 `remoteSearch` 模式下**有搜索词才打开弹层**（`openMenu` 时 query 为空则不开）。

### 6️⃣ 筛选条件以及逻辑框没有底色，只有条件组才有底色

| 项 | REA 实测 | 现状 |
|---|---|---|
| 条件组容器 | `condition-group__condition-wrap`：**bg=`rgb(248,249,250)` = #F8F9FA** | `.is-scope .group { background: var(--performance-review-readonly-surface) }` = **#F5F6F7**（偏浅） |
| 条件行/逻辑框 | `list__row`、`logic-group__logic` bg 空（透明） | `.condition` 无背景 ✅、`logic-group__rail` 无背景 ✅ |
| 「或」分隔 | bg 空（透明） | 透明 ✅ |

**结论**：REA 条件组底色 **#F8F9FA**（= 现有 `--performance-evaluation-rule-surface`），现状误用 `--performance-review-readonly-surface`（#F5F6F7）。需把 scope-mode 组底色改为 `--performance-evaluation-rule-surface`（#f8f9fa）。条件行/逻辑框保持透明（现状已正确）。

---

## 汇总（改动方向，本轮未改）

| # | 问题 | 现状 | REA 目标 | 改动 |
|---|---|---|---|---|
| 1 | 或左对齐 | 居中 | 左对齐（text-align:start） | `.or` 去掉 justify-content:center |
| 2 | 添加条件间距 | ≈6px | 8px | 组内「添加条件」补 margin-top:8px |
| 3 | 条件行删除常显 | hover 显隐 | 常显 #BBBFC4 | 移除 hover opacity |
| 4 | 组删除常显 | hover 显隐 | 常显 #646A73 | 移除 hover opacity（保留 2 组才渲染） |
| 5 | active 不弹层 | 弹空面板 | 有搜索词才弹层 | `remoteSearch` 下 query 空不开层 |
| 6 | 组底色 | #F5F6F7 | #F8F9FA | scope 组底色用 `--performance-evaluation-rule-surface` |

> 修正项：上午报告 §7「删除按钮 hover 显示」为**误判**——DOM 实测删除按钮 opacity 为空（常显）；我上一轮实现的 hover 显隐需回滚。
