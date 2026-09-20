# CR-005 绩效评估公共基座

- 状态：核心公共基座已实施；运行时 P2 像素验收待补充
- 日期：2026-09-17
- 关联功能：PM-T009 自我总结任务填写；后续上级评价、项目评价、360°评价与校准任务
- UI 目标：P1 结构与设计系统一致；已采集的工作总结完成态可继续推进 P2，但本变更不宣称整体像素验收完成。

## 1. 背景

当前绩效评估页已经共享侧栏和大白色内容卡，但任务入口、完成提示、答案只读展示与视觉 token 仍有部分绑定在工作总结实现中。继续按节点分别开发会造成容器边界、提交后状态、编辑入口和题型展示逐页分叉。

本变更把稳定的页面骨架、状态机、模板内容渲染和答案访问规则提炼为公共基座；工作总结是首个真实适配实例，不以其名称或字段文案作为任何公共分支依据。

## 2. 目标

1. 所有绩效评估节点共用同一页面白卡、左右边界、滚动策略、加载、错误、空状态和标题区域。
2. 所有模板驱动任务使用同一内容区块模型和 field renderer 注册机制；当前支持 `rich_text`、`rating`、`tag_with_followup`。
3. 所有任务入口按稳定的 `task_kind`、`entry_mode` 和 `task_id` 路由；禁止根据节点名称正则决定业务入口。
4. 所有完成态共用成功提示、编辑可用性判断和只读内容容器；字段内容由 renderer 按 `mode=readonly` 展示。
5. 答案数组、重复内容块、草稿合并、提交和重开读取使用同一 answer adapter。
6. 稳定的白卡、完成提示和只读字段视觉值优先消费既有 `tokens.css` 语义 token；只有已在多个公共组件重复且有证据的值才新增组件 token。

## 3. 非目标

- 不在本变更新增上级评价、项目评价、360°评价、校准或申诉的业务规则、接口、数据库表或任务生成逻辑。
- 不将不同角色的权限、匿名性、评分计算、校准调整或申诉动作抽象为通用字段行为。
- 不更改已启动项目的模板、节点、人员或答案快照语义。
- 不迁移或重写历史任务答案。
- 不承诺缺少完整目标截图与 rendered contract 的 P2 像素验收。

## 4. 冻结的公共契约

### 4.1 评估任务节点

```ts
PerformanceReviewNode {
  task_id?: number
  node_id: string
  node_type: string
  task_kind?: string
  entry_mode?: 'template_task' | 'route' | 'none'
  status: 'pending' | 'not_started' | 'overdue' | 'completed'
  editable?: boolean
  submit_allowed?: boolean
  submitted_at?: string | null
  form_schema?: PerformanceTemplateSection[]
  answers?: Record<string, unknown>
  action_url: string
}
```

- `node_type` 表示流程节点语义；`task_kind` 表示任务答案协议；二者不得由展示名称推断。
- `entry_mode=template_task` 时要求 `task_id`；路由由 task-kind registry 决定。
- `entry_mode=route` 时只允许已注册且经权限验证的 `action_url`。
- `entry_mode=none` 时不展示可执行入口。

### 4.2 模板内容与答案

```ts
PerformanceTemplateSection {
  id: string
  name: string
  description?: string
  allow_multiple?: boolean
  fields: PerformanceTemplateField[]
}

PerformanceTemplateField {
  id: string
  type: 'rich_text' | 'rating' | 'tag_with_followup'
  label: string
  required?: boolean
  placeholder?: string
  options?: PerformanceTemplateOption[]
  display_mode?: '标签样式' | '下拉样式'
}
```

- `PerformanceTemplate*` 是公共前端模型；现有 `SelfSummary*` 类型可在迁移期作为兼容 alias，不复制结构。
- `allow_multiple` 仍是 section root 规则，所有字段按实例索引对齐。
- 答案 adapter 是唯一允许读写、增加、删除和校验重复实例的入口。

### 4.3 页面状态

```text
loading | error | empty | not_started | actionable | overdue | completed_editable | completed_readonly
```

- 完成态是否显示编辑入口仅由服务端返回的 `editable` 决定。
- 完成态不显示标题下时间；未完成态保持启动时间、截止时间或模板副标题。
- 各节点共用外层白卡；只允许内部 renderer 因题型和任务状态不同而变化。

## 5. 公共组件边界

| 组件 | 职责 | 当前实例 | 后续复用 |
|---|---|---|---|
| `PerformanceReviewContent` | 页面白卡、标题、状态机、完成态容器 | 工作总结 | 所有评估节点 |
| `PerformanceReviewTaskEntry` | 按 `entry_mode + task_kind` 产生内部路由或标准事件 | 工作总结 | 所有模板任务 |
| `PerformanceReviewCompletionNotice` | 完成提示、编辑按钮、只读提示 | 工作总结 | 所有完成态任务 |
| `PerformanceTemplateRenderer` | section 循环、renderer registry、`edit/readonly` mode | 工作总结 | 所有模板任务 |
| `PerformanceTemplateSection` | 标题、描述、蓝色标识线、实例容器 | 工作总结只读展示 | 所有模板内容块 |
| `PerformanceTemplateFieldRenderer` | 根据 field type 选择 renderer | rich text/rating/tag | 后续评分、评语等新增类型 |
| `performanceTemplateAnswers` | 单值/数组/标签答案的访问和更新 | `performanceRepeatableAnswers` 的演进 | 所有模板任务 |

## 6. 兼容与安全

- 不删除现有 `SelfSummaryTask` API；先由适配层映射到公共模型。
- 只读富文本继续使用 allowlist 净化，禁止脚本、事件属性和不安全链接。
- 前端隐藏不替代后端的 `editable`、`submit_allowed`、任务归属和权限校验。
- 公共 task entry 仅消费后端已授权的任务数据，不接受前端构造的任意目标 URL。

## 7. 开发环境评估型节点接入

开发项目 `2026年全年` 的节点 `evaluation-1`（名称“上级评估”）是公共基座的第二个真实接入点：节点快照 `executor_types=["DIRECT_MANAGER"]` 决定处理人；运行时项目设置决定当前已开放。该节点以 `task_kind=evaluation`、`entry_mode=template_task` 进入 `/performance/review/template-task`，复用公共模板 renderer、答案 adapter、页面白卡和完成态组件。处理人规则、节点内容和时间不得由前端名称或常量重写。

## 8. 验收要求

- 工作总结 edit → draft → submit → overview → readonly/editable → reopen 链路保持通过。
- 同一大白卡在 completed、pending、not_started、overdue 状态使用同一外层边界与滚动规则。
- 当前三个字段类型在 `edit` 与 `readonly` 模式共享同一 schema 和答案 adapter。
- 新节点若未注册 `task_kind/entry_mode/renderer`，必须显式失败或显示受控不可处理状态，禁止名称猜测或静默回退。
- 后续模块接入只新增 registry 项、业务策略与必要的 field renderer；不得复制页面壳、完成提示、答案适配器或基础题型 DOM。
