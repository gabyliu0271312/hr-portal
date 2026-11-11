# HRBP · scopeMode「添加条件」语义澄清与配置化修正（用户指正版）

> 用户指正：scopeMode 下「添加条件」实为 addGroup 不算错位——组件之前就同时有
> 「添加条件」和「添加人员范围」，语义取决于使用场景。
> 复核确认：**属实**。分配规则编辑器（PerformanceDistributionRuleEditor）已用 scope-mode，
> 其数据模型 execution_scope.rules 天然是「一组一规则」，「添加条件=加组」在分配语义下正确。
> 本文澄清 REA 结构与现有结构的关系，并给出**语义可配置**的修正方案。

---

## 1. REA 真实结构（抓包证据，after-add-both.json）

```
条件组 1  ──────────────── 组标题（22 高）
  ├ 条件行 1（32 高）                    ← 组内多条条件
  ├ 条件行 2
  ├ 逻辑「且」（27px rail）
  ├ 添加条件（组内，82×22，y427）         ← 组内加条件
── 或 ──────────────── 组间分隔（22 高）
条件组 2
  ├ 条件行 1
  ├ 添加条件（组内，y597）
添加人员范围（底部，110×22，y647）        ← 加组
```

REA 语义：**组内多条条件（且）+ 多组（或）；「添加条件」= 组内加条件，「添加人员范围」= 加组**。

## 2. 现有 scopeMode 真实场景（分配规则编辑器）

`PerformanceDistributionRuleEditor.vue` 已用 scope-mode（:17/:32）：
- 数据模型 `execution_scope.rules`：每条 rule = 一个 type + values 列表
- `updateScopeGroups`（:148-152）：每个 group → 一条 rule
- `scopeValid`（:127-129）：要求 `group.conditions.length === 1`
- 「添加条件」（scope-add）→ `addGroup` = 新增一条独立规则 ✓ 在分配语义下正确

> 结论：scopeMode 的「添加条件=加组」在分配规则场景是**正确语义**，不是 bug。
> 我之前用 REA 弹窗语义断言它「错位」是片面的——两种语义各有真实场景。

## 3. 修正方案：按钮语义可配置（不破坏既有场景）

新增 prop `addActionMode?: 'add-condition' | 'add-group'`（默认 `'add-group'`，保持分配规则现有行为）：

| 场景 | addActionMode | 按钮表现 |
|---|---|---|
| 分配规则（现有） | `add-group`（默认） | 「添加条件」→ 加组（现状不变） |
| HRBP 设置范围（新） | `add-condition` | 组内「添加条件」→ addCondition；另渲染「添加人员范围」→ addGroup |

### 3.1 具体改动（PerformanceAudienceRuleEditor.vue）

```
1. props 新增：
   addActionMode?: 'add-condition' | 'add-group'   // 默认 'add-group'
   groupTitlePattern?: string                      // 默认 '范围 {index}'（上一轮已定）
   showGroupTitle?: boolean                        // 非 scopeMode 显示 / scopeMode 可开
2. scopeMode 分支模板：
   - addActionMode === 'add-group'：现状（scope-add 按钮「添加条件」→ addGroup）
   - addActionMode === 'add-condition'：
     a. 组内渲染「添加条件」（addCondition，每组一个，同 REA 组内按钮）
     b. 组底部渲染「添加人员范围」（addGroup，同 REA 底部按钮）
     c. 组标题「条件组 N」（showGroupTitle 开启时）
3. scopeMode + addActionMode='add-condition' 时，
   条件行 has-delete 判定改为「组内 conditions.length > 1」（REA 组内可删条件行）；
   add-group 模式保持「组数 > 1 显示删除组」（现状）
4. 数据模型兼容：add-condition 模式下 group.conditions 可多条（HRBP 全局 invisible 展开为
   employee_no 并集时按 conditions 遍历取 employee 值即可，无需改后端结构）
```

### 3.2 调用点调整

| 调用点 | 改动 |
|---|---|
| `PerformanceDistributionRuleEditor.vue`（2 处） | 不传 addActionMode → 默认 add-group，**零改动** |
| 新增 `PerformanceHrbpScopeDialog.vue` | `add-action-mode="add-condition"` + `group-title-pattern="条件组 {index}"` + `show-group-title` |

### 3.3 不影响既有

- 分配规则现有行为、spec 断言不变（默认值 add-group）
- 新增用例覆盖 add-condition 模式：组内添加条件、添加人员范围、组标题渲染

---

## 4. 与「真实接入」的关系（不变）

HRBP 弹窗（add-condition 模式）最终仍把全部条件组展开为 **employee_no 并集**，
PATCH `/performance/permission-settings/other` 的 `hrbp_invisible_people`；
后端运行时（projects_router C1~C3）并入全局 invisible 过滤 → 真实生效。
后端结构与「一组一条件/一组多条件」无关（只消费展开后的员工集合），不受语义配置影响。
