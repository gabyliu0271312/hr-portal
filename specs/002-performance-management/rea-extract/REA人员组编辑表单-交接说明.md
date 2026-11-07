# REA 人员组编辑表单 — 交接说明

- 状态：**REA 已采集完成（2026-11-07），待开发**
- 日期：2026-11-07
- 交接人：gaby.liu / Claude（本仓库）
- 接收方：负责「REA 后开发」的另一 AI
- 关联提交：`7f0f8d6b`（项目版人员组新建：空白 / 422 / inner_leader 权限，已推 main）
- 关联报告：[REA人员组管理页-DOM与接口提炼报告.md](./REA人员组管理页-DOM与接口提炼报告.md)、[REA新建人员组页-DOM与接口提炼报告.md](./REA新建人员组页-DOM与接口提炼报告.md)、**[REA人员组编辑表单-DOM与接口提炼报告.md](./REA人员组编辑表单-DOM与接口提炼报告.md)**（本轮新增）
- **REA 实测结论（2026-11-07）**：
  - 编辑链路是两层跳转：列表行内「编辑」→ **详情管理页** → 头部「编辑」→ 编辑表单（两页签一致）。项目版编辑表单路由 `activity-focus-people/{groupId}`。
  - 开放点 #1 已确认：**周期版编辑「设置方式」radio 禁改**（原生 `disabled=true` + `cursor:not-allowed`）→ 现有 `:disabled="isEditing"` 正确。
  - 开放点 #2 已确认：**项目版编辑无设置方式 radio**（手动维护固定），**全部字段可改**（含关联评估项目下拉）。
  - 两版本编辑保存 payload（`follow/group/edit`）已实测拦截，字段集不同（周期版含 scope/标签/沟通时间，项目版含 activity_ids）。

## 1. 背景：保存后跳转的「另一个页面」是哪里

新建/编辑人员组保存成功后，前端统一跳转回**人员组管理页**：

- 路由 `PerformanceCycleFocusPeople` → `views/performance/FocusPeopleManagement.vue`（URL `cycles/:cycleId/focus-people`）
- 保存跳转代码（新建/编辑共用）：
  - 项目版：`FocusPeopleGroupProjectCreate.vue` submit → `router.push({ name: 'PerformanceCycleFocusPeople', ... })`
  - 周期版：`FocusPeopleGroupCreate.vue` submit → 同上
- 该页已是「全屏页形态弹窗 + 两页签（周期级/关联评估项目）+ 列表 + 搜索 + 空态 + 删除」的**已实现状态**（见管理页报告 §7，2026-11-07 本轮交付）

## 2. 交接目标（REA 后开发对象）

**人员组「编辑」表单**——当前编辑能力是「复用新建表单组件 + edit 语义」，编辑态差异未按飞书真实编辑弹窗补采。缺口点：

1. **编辑回显是否对齐飞书**：当前编辑页 = 新建表单套 `loadDetail()` 回填（`FocusPeopleGroupCreate.vue`），未用 REA 采集飞书「编辑人员组」弹窗的真实 DOM/接口验证字段、禁用态、布局是否一致。
2. **项目版编辑态**：`FocusPeopleGroupProjectCreate.vue` 的 `loadDetail()` 已回填 `activity_ids`/`roles_of_managing_scope`/`employee_nos`，但**未像周期版那样把「人员范围设置方式」做编辑禁用**（周期版 `PerformanceRadioGroup :disabled="isEditing"`）。需确认飞书项目版编辑是否同样禁改设置方式（项目版只有「手动维护」一种，禁不禁改需 REA 实测确认）。
3. **管理页「编辑」入口**：`FocusPeopleManagement.vue` 已接（`row-action` 编辑按钮 → `router.push({ name: 'PerformanceCycleFocusPeopleEdit', params: { groupId: row.id }, query: { tab: activeTab } })`），路由已存在（`PerformanceCycleFocusPeopleEdit`），但编辑表单视觉/交互未按飞书编辑弹窗还原。

## 3. 必读材料（接收方开工前）

1. [REA人员组管理页-DOM与接口提炼报告.md](./REA人员组管理页-DOM与接口提炼报告.md)
   - §1 页面结构、§3 组件规格（head 56px / Tab 48px / 按钮 80×32 / 表格列宽两页签 / 空态 250×163）、§4 复用评估、§5 待确认事项、§7 已实现
   - **§5 #4**：编辑弹窗留待 REA 补采，是本交接的直接依据
2. [REA新建人员组页-DOM与接口提炼报告.md](./REA新建人员组页-DOM与接口提炼报告.md)
   - 新建弹窗的字段/布局/token 基线，编辑弹窗应先从其对照差异
3. 仓库规则：[根 CLAUDE.md](../../../../CLAUDE.md)（改 HR Portal 前读 [hr-portal/CLAUDE.md](../../../../hr-portal/CLAUDE.md)）、[performance-spec-development](../../../../.claude/skills/performance-spec-development/) 开发模式

## 4. REA 采集范围（给接收方 AI 的动作清单）

对飞书「人员组管理 → 编辑」弹窗（周期级 + 项目级两个页签各采一次）：

- [x] 编辑弹窗完整 DOM / 计算样式 / 截图（对齐新建弹窗采集脚本 `capture-focus-create-*.js` 的产出格式）→ 报告 §3/§4，证据 `out/focus-edit/`
- [x] 编辑态字段差异：哪些字段可改、哪些禁用（重点：人员范围设置方式、关联评估项目、角色勾选、标签）→ 周期版设置方式禁改、其余字段全可改；项目版全可改
- [x] 编辑弹窗提交走的接口（POST create 复用 / 独立 update 接口？payload 字段与新建差异）→ `POST follow/group/edit`，两版本 payload 实测见报告 §3.3/§4.3
- [x] 编辑回显接口（详情接口返回字段 → 表单映射）→ `GET follow/group/info` 两版本响应见报告 §3.3/§4.3
- [x] 管理页「编辑」按钮的触发与飞书行为核对（当前是行内 button，飞书若是「更多」菜单入口需对齐）→ **飞书列表行内「编辑」先进详情管理页，头部「编辑」才进表单**（两层链路，与当前一步直达不同，见报告 §1/§6）

采集产出落盘为 [REA人员组编辑表单-DOM与接口提炼报告.md](./REA人员组编辑表单-DOM与接口提炼报告.md)，证据 `out/focus-edit/`（项目版）与 `out/focus-edit/semester/`（周期版）。

## 5. 开发范围（REA 完成后）

- [ ] 周期版 + 项目版编辑表单按飞书编辑弹窗对齐（字段回显、禁用态、布局）
- [ ] 项目版编辑态「设置方式」禁用与否按 REA 实测结论实现
- [ ] 管理页编辑入口与飞书行为对齐（若 REA 发现差异）
- [ ] 补齐编辑态 vitest + 后端无改动则回归

**不做**：不改已推 main 的 `7f0f8d6b` 行为；不重建新建表单；不动管理页列表/搜索/删除已实现能力。

## 6. 验收

- REA 采集报告落盘（DOM/样式/接口证据齐全）
- 编辑表单像素/token 与飞书编辑弹窗对照通过
- vitest（编辑态）+ vue-tsc 通过；`7f0f8d6b` 新建链路回归不破
