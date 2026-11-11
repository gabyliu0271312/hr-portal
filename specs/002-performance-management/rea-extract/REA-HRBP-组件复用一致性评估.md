# HRBP vs 被评估人 · 组件复用一致性评估（本轮不改代码）

> 用户三项质疑：同一 `PerformanceAudienceRuleEditor` 组件，为什么 HRBP（其他权限配置）与被评估人（周期与项目→项目设置→被评估人）行为不一致？
> 结论先行：**两个场景是同一个组件、被 `scopeMode` 布尔开关分成两种形态；「布局差异」是合理需求，「行为差异」（搜索机制/按钮间距/颜色）是设计缺陷，把本应统一的交互按 scope 开关硬分叉了。**

---

## 场景确认（两个入口）

| 场景 | 入口 | scopeMode | 用途 |
|---|---|---|---|
| 被评估人 | `PerformanceProjectSettingsPage.vue`（周期与项目→项目设置→被评估人） | **否**（默认非 scope） | 被评估人范围规则 |
| HRBP | `PerformanceHrbpScopeDialog.vue`（绩效管理后台→其他权限设置→设置范围） | **是** | HRBP 不可见范围 |
| （另有）项目弹窗限定考核范围 | `PerformanceProjectDialog.vue` | 是 | 限定圈选被评估人 |

> 三者是**同一组件**，`scope-mode` 只影响「布局形态」（灰底/白卡、或分隔样式），交互行为应天然一致。

---

## 1️⃣ 添加条件按钮与条件下方距离：不一致

| 维度 | 被评估人（非 scope） | HRBP（scope） | 差异 |
|---|---|---|---|
| 「＋添加条件」上方间距 | 条件行 `margin-top:8px` + TextButton `-2px` = **净 6px** | scope 下 `.__add-condition { margin-top:10px }` = **净 8px**（对齐 REA） | ❌ 差 2px |

**根因**：`margin-top:10px` 只写在 `.is-scope` 分支（为对齐 REA 8px 而加），被评估人（非 scope）没同步加。

**评估**：REA 实测「添加条件」距上方 8px 是**全局通用值**（被评估人页面在 REA 中也应是 8px）。当前把 REA 对齐只做在 scope 分支 → **应把间距提到组件基础层**（非 scope 也 8px），而不是 scope 独享。用户判断正确：**统一组件应一致**。

---

## 2️⃣ 删除按钮颜色：被评估人正确、HRBP 不正确

| 维度 | 被评估人（非 scope） | HRBP（scope） |
|---|---|---|
| 组删除按钮 | 默认 `--color-text-secondary`（#646A73） | scope 显式 `color: var(--color-text-secondary)`（#646A73）——**值相同** |
| 条件行删除按钮 | 默认 `#646A73` | scope 已移除 override → **默认 #646A73**（上一轮已对齐） |

**当前状态**：两场景删除按钮颜色**实际上已一致**（#646A73）。用户可能看到的是**上轮之前的旧状态**（scope 条件行删除曾为 `#bbbfc4` 浅灰）或**浏览器缓存**。

**但有一处真实残留差异**：scope 的组删除按钮**显式写了 `color: var(--color-text-secondary)`**，非 scope 是隐式继承——值一样，但**冗余 override 存在**，后续若基础色变化会分叉。应删除 scope 显式色（统一走默认）。

**评估**：颜色值已一致，但实现上有冗余 override，建议清理（非改视觉）。

---

## 3️⃣ 员工筛选「搜索才弹窗」：HRBP 实现了、被评估人没有

| 维度 | 被评估人（非 scope） | HRBP（scope） |
|---|---|---|
| `:remote-search` | `false`（点击即展开、本地过滤） | `true`（输入才弹窗、远程搜索） |

**根因**：组件内部写死 `:remote-search="scopeMode"` ——**把「搜索才弹窗」这个交互行为绑到了 scopeMode 布局开关上**。

**评估**：REA 的「输入→请求→列表」员工搜索机制是**全局一致的交互规范**（被评估人在 REA 中同样是输入才弹窗）。当前只有 HRBP 享受 REA 对齐，被评估人仍是旧的「点击即展开」——**这正是用户指出的核心不一致**。正确做法：`remoteSearch` 应作为**独立 prop**（或默认开启），与 scopeMode 解耦，两场景都按 REA 交互。

> 注意：被评估人 `PerformanceProjectSettingsPage` 没有接 `@search-people` 远程搜索回调（HRBP 有 `searchScopePeople`）。要真一致，被评估人侧需同样接搜索接口（或复用快照内 people 本地过滤 + 搜索才弹层）。

---

## 汇总与建议（不改代码，供后续实施）

| # | 差异 | 根因 | 建议 |
|---|---|---|---|
| 1 | 添加条件间距 6 vs 8px | `margin-top:10px` 写在 scope 分支 | 提到基础层（非 scope 也 8px） |
| 2 | 颜色（值已一致，有冗余 override） | scope 显式 color override | 删除 scope 显式色，统一默认 |
| 3 | 搜索才弹窗只 HRBP 有 | `:remote-search="scopeMode"` 耦合布局开关 | `remoteSearch` 独立 prop，两场景都开启 + 被评估人接搜索回调 |

**本质**：`scopeMode` 应只控制**布局**（灰底/白卡/组标题/或分隔），**交互行为**（搜索机制、按钮间距、颜色）应全局统一。当前把 REA 交互对齐做进了 scope 分支，导致两个场景分叉——需要**把交互对齐从 scope 分支提升为组件默认行为**。
