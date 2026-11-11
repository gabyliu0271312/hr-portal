# HRBP · 组标题提炼修正（用户指正版）

> 用户指正：scopeMode 无组标题的说法不正确——组件本来就有组标题，叫「范围 N」，
> 只是应该提炼成**可配置组件**，标题文本按使用场景可改。
> 复核确认：属实。本文修正第四轮实施方案中关于组标题的部分。

---

## 1. 现状核实（组件内既有组标题）

`PerformanceAudienceRuleEditor.vue` 第 30-36 行（非 scopeMode 分支）：

```html
<div class="performance-audience-rule-editor__group-heading">
  <span>范围 {{ groupIndex + 1 }}</span>          <!-- ← 既有组标题，硬编码「范围」 -->
  <div class="performance-audience-rule-editor__group-heading-actions">
    <span class="performance-audience-rule-editor__group-count">同时满足以下条件：<button ...>{{ groupCounts[groupIndex] ?? 0 }}</button></span>
    <PerformanceIconButton v-if="modelValue.length > 1" ... />
  </div>
</div>
```

- 样式：`__group-heading` = 14px/22px/400 `#646a73`（第 243 行）
- spec 已有断言：`expect(wrapper.get('...__group-heading > span').text()).toBe('范围 1')`（第 326 行）
- **scopeMode 分支（第 14-26 行）确实没渲染组标题**——但这是当初「scope 紧凑卡片」的设计选择，并非组件缺失

## 2. 修正结论

**不是「新增组标题」，而是「把既有组标题提炼为可配置 prop」**：

| 现状 | 修正 |
|---|---|
| 标题文本硬编码 `范围 {{ index + 1 }}` | 提炼 prop `groupTitlePattern?: string`，默认 `'范围 {index}'`，支持 `'条件组 {index}'` 等 |
| 标题只在非 scopeMode 显示 | prop `showGroupTitle?: boolean`（默认随 scopeMode 关闭、非 scopeMode 开启；HRBP 弹窗传 `showGroupTitle` 开启） |
| 颜色 `#646a73`（REA 实测组标题 `#1F2329`） | 按 REA 修正为 `#1F2329`（属全局 token 修正，见下） |

### 2.1 具体改动（PerformanceAudienceRuleEditor.vue）

```
1. 新增 props：
   groupTitlePattern?: string    // 默认 '范围 {index}'；替换 {index} 为 groupIndex+1
   showGroupTitle?: boolean      // 默认 undefined：非 scopeMode 显示、scopeMode 不显示
2. 模板：
   - 非 scopeMode 分支：<span>{{ groupTitleText(groupIndex) }}</span>（替换硬编码）
   - scopeMode 分支：v-if="showGroupTitle" 时渲染同一 __group-heading（仅标题部分，
     不含 group-count「同时满足以下条件」——REA 组标题旁无计数）
3. computed groupTitleText(index) = (groupTitlePattern || '范围 {index}').replace('{index}', String(index + 1))
4. scopeMode 的 __group-heading 布局微调：
   - 标题左对齐，删除按钮（删除范围）右侧保留
   - 背景透明（scope 卡片内），margin-bottom 8px
```

### 2.2 Token 修正

```css
--performance-scope-group-title-color: #1f2329;   /* REA 实测（现有 __group-heading 用 #646a73） */
--performance-scope-group-title-height: 22px;
--performance-scope-group-title-size: 14px;
--performance-scope-group-title-weight: 400;
--performance-scope-group-title-gap: 8px;          /* 标题与下方条件行间距 */
```

> 说明：REA「设置范围」弹窗组标题「条件组 1」实测 14px/22px `#1F2329`；
> 现有「范围 N」是 `#646a73`。全局统一按 REA 改 `#1F2329`（涉及被评估人页面「范围 N」
> 也会从灰变深，属正向对齐，需回归确认）。

### 2.3 spec 更新

- 既有断言「范围 1」（:326）在 `groupTitlePattern` 默认值下保持通过
- 新增用例：`groupTitlePattern="条件组 {index}"` → 渲染「条件组 1」；scopeMode + `showGroupTitle` → 渲染标题
- HRBP 弹窗薄壳传 `group-title-pattern="条件组 {index}" show-group-title`

## 3. 对实施方案的影响

第四轮方案第 4 步「PerformanceAudienceRuleEditor 组标题 prop」由**新增 prop groupTitleEnabled**
修正为**提炼 groupTitlePattern + showGroupTitle 两个 prop**（复用既有 __group-heading 结构，
不新造标题组件）。其余步骤（token / 薄壳 / 挂载 / 后端接入）不变。
