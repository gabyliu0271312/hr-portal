# 自动化数仓三期 UI 交互一致性评审

> 评估日期：2026-07-16
> 评估范围：Z01（ODS→DWD）/ X05（指标驱动）/ Z03（L4 全自动）三期的自动化 UI 组件
> 评估方法：逐文件通读 7 个前端组件源码 + 对照 auto-cascade-plan.md 的 U27/U28/U29 线框与交互说明

---

## 总体结论

**部分一致。** 三期共享一套基础视觉语言（卡片折叠模式、feature flag 关闭态 el-alert、ElMessageBox 确认弹窗、共享状态条），但在 **L4 规则配置实现、风险策略文案、状态标签映射、关闭态文案** 上存在多处具体不一致，其中两项属于需要修复的严重问题。

---

## 评估对象清单

| 组件 | 归属 | 角色 |
|------|------|------|
| `OdsDwdAutomationPanel.vue` | Z01 | 资产详情/配方页内嵌面板 |
| `OdsDwdAutomationTab.vue` | Z01 | 自动化中心列表页 |
| `MetricAutomationPanel.vue` | X05 + 内嵌 Z03 | 指标详情抽屉面板（含 L4 规则配置段） |
| `MetricAutomationTab.vue` | X05 | 自动化中心说明卡 |
| `L4PilotTab.vue` | Z03 | 自动化中心试点管理列表 |
| `L4AutomationPanel.vue` | Z03 | **独立 L4 规则面板（死代码，无任何文件引用）** |
| `AutomationStatusBar.vue` | 共享 | 顶部状态条 |

---

## ✅ 一致的部分（做得好的）

1. **卡片 + 折叠交互模式统一**：`OdsDwdAutomationPanel` / `MetricAutomationPanel` / `L4AutomationPanel` 三者同构——`border:1px #e4e7ed; border-radius:8px`，头部标题 + `ArrowRight` 旋转 90° 展开，`border-top` 分隔 body，"进行中"状态标签。这是贯穿三期的统一语言。
2. **Feature flag 关闭 → 统一 el-alert**：四处均用 `el-alert type="info" :closable="false" show-icon`。
3. **确认弹窗统一**：开启/暂停/发布/回滚均用 `ElMessageBox.confirm({ type: 'warning' })` + `ElMessage` 反馈。
4. **共享 `AutomationStatusBar`**：三能力状态、紧急停止/恢复集中在一处。

---

## 🔴 严重不一致（建议必改）

### 1. L4 规则配置面板重复实现，且代码已发散
- `MetricAutomationPanel.vue`（行 269–320）内嵌一份 L4 规则配置；
- `L4AutomationPanel.vue` 又独立实现一份**完全相同功能**的面板，但 **全局搜索确认它未被任何文件 import**（死代码）。
- 两份代码已经发散：
  - 变量名：`TRIGGER_OPTIONS` vs `TRIGGERS`
  - 保存字段：内嵌版 `saveL4Rule` 传 `risk_strategies`；独立版 `saveRule` **不传 `risk_strategies`**（一旦启用会导致该字段丢失）
  - 风险策略文案：内嵌版有 3 行静态文案；独立版完全没有
- **风险**：复活死代码会悄悄丢掉 `risk_strategies`；两处维护不同步。

### 2. L4 风险状态策略文案错误，与 spec 不符
`MetricAutomationPanel.vue` 行 309–314 写的是：
```
低风险 → 自动发布
中风险 → 自动发布 + 通知        ← 错误
高风险 → 阻断，生成草稿待确认
```
而 spec Z00（行 206–212）与 U29 的 **5 态风险状态机** 明确要求：
```
PASS(低风险+门禁通过)   → 自动发布/刷新
WARN(低风险+非阻断告警) → 自动继续并通知
REVIEW_REQUIRED(中风险) → 自动生成方案，用户确认后继续   ← 不是"自动发布+通知"
APPROVAL_REQUIRED(高风险) → 审批通过后继续/回滚
FAILED → 保留旧版本
```
"中风险 → 自动发布 + 通知" 把 **WARN（低风险+告警）** 的行为误标到了中风险上，且漏掉了 PASS/WARN/APPROVAL_REQUIRED 的完整区分。同时该段是**静态写死**的，spec Z0302 要求风险策略可配置（用户应能选择 PASS/WARN/REVIEW/APPROVAL/FAILED 的处理方式），UI 并未提供编辑入口。

---

## 🟡 中等不一致

### 3. Feature flag 关闭态文案不一致
| 组件 | 关闭态文案 |
|------|-----------|
| Z01 面板 | 仅"ODS→DWD 自动化未启用" |
| Z01 tab | "请联系管理员在 .env 中设置 `WAREHOUSE_FEATURE_ODS_DWD_AUTOMATION=true`" |
| X05 面板 | 仅"指标自动化生成未启用" |
| X05 tab | "开启 `WAREHOUSE_FEATURE_METRIC_AUTOMATION=true` 后…" |
| Z03 tab | "开启 `WAREHOUSE_FEATURE_L4_FULL_AUTO=true`，并完成 Z0306 专项验收后开放试点" |

是否告知 `.env` 变量、是否提及 Z0306 门槛，三处口径不统一。

### 4. 状态标签 / 颜色映射发散
- **running 态缺失**：Z01 实现了 `running → 蓝 #409EFF + Loading 旋转`（符合 U28"执行中(蓝旋转)"），但 X05 / Z03 时间线**没有 running 态**，只区分 success/failed/warning。
- **REVIEW_REQUIRED / APPROVAL_REQUIRED 无独立呈现**：X05 把 `blocked → warning`，L4 把"其余 → warning"，两者都被 lump 成 warning。与 U29 要求的 ✓通过 / ⛔阻断 / ✗失败 / →跳过 区分不符。
- 同一 success 在 Z01 用 `statusColor` 返回 hex + el-icon，其余用 el-tag type，风格不统一。

### 5. "已启用/进行中" 标签用词不统一
同一 "enabled/active" 语义，三处用了三个词：
- Z01 面板：`运行中`
- X05 面板：`进行中`
- Z03：`试点中`

---

## 🟢 轻微不一致

### 6. 回滚确认深度不一
- `L4PilotTab.vue`：富 `el-dialog`，列出将撤回的 DWS/ADS/BI 资产清单（符合 U29 回滚确认弹窗）。
- `L4AutomationPanel.vue`（死代码）/ X05 `doRollback`：简单 `ElMessageBox.confirm`。
- 指标详情抽屉里的 L4 回滚（经内嵌段）也未用资产清单式确认。

### 7. 术语漂移
- "ODS→DWD 自动化"（tab / 状态条） vs "ODS→DWD 自动同步"（面板标题）——同一能力两种叫法。

---

## 建议修复清单

| 优先级 | 项 | 建议 |
|--------|----|------|
| 🔴 P0 | L4 重复面板 | 删除死代码 `L4AutomationPanel.vue`；L4 规则配置只保留 `MetricAutomationPanel` 内嵌版（或将两段抽成共享 `L4RuleConfigPanel`） |
| 🔴 P0 | 风险策略文案 | 改为完整 5 态（PASS/WARN/REVIEW_REQUIRED/APPROVAL_REQUIRED/FAILED），与 spec Z00 对齐；并按 Z0302 提供可编辑入口或展示后端实际策略 |
| 🟡 P1 | 关闭态文案 | 统一为模板："本能力当前未启用（feature flag 默认关闭）。[试点空间] 请联系管理员开启；L4 还需完成 Z0306 专项验收。" |
| 🟡 P1 | 状态标签映射 | X05/Z03 时间线补 running 态；将 REVIEW_REQUIRED/APPROVAL_REQUIRED 与 WARN/FAILED 区分配色（参考 U29 符号） |
| 🟡 P1 | 启用标签词 | 统一为单一词（建议"试点中"或"运行中"） |
| 🟢 P2 | 回滚确认 | 指标详情抽屉内的 L4 回滚也采用资产清单式确认，与 `L4PilotTab` 一致 |
| 🟢 P2 | 术语 | 统一"ODS→DWD 自动化"命名 |

---

## 一句话总结

> 三期 UI 的**骨架和交互模式一致**（卡片折叠 + 状态条 + 确认弹窗），但 **L4 规则配置存在重复且发散的实现**，且 **L4 风险状态策略文案与 spec 的 5 态状态机不符**——这两个是必须修的严重问题；其余为关闭态文案、状态配色、用词等中等/轻微不一致，建议统一。
