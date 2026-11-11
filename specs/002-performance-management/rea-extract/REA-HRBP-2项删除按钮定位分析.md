# HRBP 设置范围弹窗 · 2 项删除按钮定位分析（本轮不改代码）

> 用户反馈 2 项：① 组删除按钮位置；② 条件行删除按钮颜色/显示条件。
> 证据：`rea-extract/out/hrbp-invisible/`（01/05/06/15-combo 轮 DOM + 截图）
> 现状代码：`PerformanceAudienceRuleEditor.vue`（scope-mode）

---

## 1️⃣ 组删除按钮位置：应在灰底框右上方（框内），现状在「旁边」

### REA 实测（15-combo dialog.json + after-add-both.json）

| 元素 | REA 几何 | 说明 |
|---|---|---|
| 组容器 `condition-group__group` | 444,402 792×132 | 外层容器（无底） |
| 灰底 `condition-wrap` | 444,402 **766×132**，bg=#F8F9FA | 右缘 = 444+766 = **1210** |
| **组删除按钮** | **1212,402 24×24.2** | x=1212（灰底右缘 1210 + **2px**），y=402（**与灰底顶对齐**），color=#646A73 |

> REA 组删除按钮：紧贴灰底右缘外侧 2px、与灰底顶部对齐（视觉上就是「灰底右上角」）。

### 现状（scope-mode）

```css
.performance-audience-rule-editor.is-scope .performance-audience-rule-editor__group-delete {
  position: absolute; top: 0; right: calc(-1 * var(--spacing-3) - 2px); /* = -14px */
}
```

- `right: -14px` 相对**组容器**（792 宽）右缘外扩 14px → 按钮 x≈1226，比 REA（x=1212）**更靠外 14px**
- 且按钮位于灰底右缘（1210）之外约 **16px**，视觉上「在旁边」，不在灰底框内/右上角

**结论**：定位偏移错误。REA 按钮右缘 ≈ 灰底右缘 +2px（按钮 x=1212），现状右缘外扩 14px（x≈1226）。需把 `right: -14px` 改为**贴近灰底右缘**（如 `right: 26px` 使按钮右缘贴灰底右缘 1210，或微调使按钮落入灰底右上角内，top 保持 0 与灰底顶对齐）。

---

## 2️⃣ 条件行删除按钮：颜色像 disabled + 显示条件应与被评估人一致

### REA 实测

| 状态 | 条件行删除按钮 |
|---|---|
| 01-condition-list（弹窗初始**单条件**） | **存在**：1174,456 24×24.2，**color=#BBBFC4（浅灰）** |
| after-add-both（组1两条件、组2单条件） | **无**（DOM 无该按钮） |

> REA 条件行删除按钮：**#BBBFC4 浅灰**（用户感知为「disable 状态」正源于此），且出现时机在真实页面中不稳定（01 轮单条件有、多条件轮次无——疑似 hover/聚焦态才出现，或与行状态相关）。

### 现状（scope-mode）

```css
.performance-audience-rule-editor.is-scope .performance-audience-rule-editor__condition > :deep(.performance-icon-button) {
  --performance-icon-button-size: 24px; color: #bbbfc4;   /* 我上一轮加的浅灰 */
}
```
模板：`v-if="scopeMode || group.conditions.length > 1"`（scope 恒显示）

### 用户期望（与被评估人一致）

被评估人场景（非 scopeMode，同一组件）：
```css
/* 无颜色 override → 默认 --color-text-secondary #646A73（正常次灰，非 disabled 色） */
```
模板：`v-if="group.conditions.length > 1"`（**1 条件没有、2 条件才出现**）

**结论**：
- **颜色**：移除 scope-mode 的 `color:#bbbfc4` override，恢复默认（与颜色与被评估人一致 = #646A73 正常色，非浅灰 disabled 感）
- **显示条件**：`v-if` 去掉 `scopeMode ||`，统一为 `group.conditions.length > 1`（1 条件不显示、2 条件才出现，与被评估人完全一致）
- `has-delete` class 同步改回 `group.conditions.length > 1`

---

## 汇总（改动方向，本轮未改）

| # | 问题 | 现状 | REA/期望 | 改动 |
|---|---|---|---|---|
| 1 | 组删除位置 | 灰底右外侧 14px（x≈1226） | 灰底右上角（x=1212 贴灰底右缘+2px、顶对齐） | `.group-delete` 的 `right` 由 `-14px` 改贴灰底右缘（框内右上） |
| 2 | 条件行删除 | `#bbbfc4` 浅灰 + scope 恒显示 | 与被评估人一致：正常色 #646A73 + 1 条件没有/2 条件才有 | 移除颜色 override；`v-if` 统一 `length>1`；`has-delete` 同步 |
