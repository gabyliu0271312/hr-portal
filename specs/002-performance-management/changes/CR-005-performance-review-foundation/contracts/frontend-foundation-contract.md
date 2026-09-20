# CR-005 前端公共基座契约

## 1. Task Entry Registry

```ts
type PerformanceTaskEntry = {
  entryMode: 'template_task' | 'route' | 'none'
  taskKind: string
  route?: (task: PerformanceTaskPresentation) => string
}
```

### 规则

- `template_task + work_summary` 的首个注册项继续进入 `/performance/review/self-summary?task_id={id}&project_id={id}`。
- `template_task` 必须有 `task_id`；缺失时显示不可处理状态，不发起不确定跳转。
- `route` 必须使用前端注册路由键或已验证 `action_url`；禁止从节点名称产生 URL。
- 未注册组合返回受控“不支持的绩效任务类型”，不能自动套用工作总结页面。

## 2. Template Renderer Registry

```ts
type PerformanceFieldRenderer = {
  type: 'rich_text' | 'rating' | 'tag_with_followup'
  edit: Component
  readonly: Component
  getValue(section, field, index, answers): unknown
  validate?(field, value): string | null
}
```

### 当前支持

| type | edit | readonly | answer adapter |
|---|---|---|---|
| rich_text | `PerformanceRichTextBox` + editable content | rich-text readonly renderer | HTML value |
| rating | `PerformanceRatingControl` | rating badge/read-only renderer | option ID |
| tag_with_followup | `PerformanceCheckbox` + `PerformanceRichTextBox` | tag panel/read-only renderer | tags + note |

## 3. Completion Notice

```ts
type PerformanceCompletionNoticeProps = {
  editable: boolean
  deadlineAt?: string | null
  onEdit?: () => void
}
```

- `editable=false`：显示“该环节已在 {deadlineAt} 截止；如有疑问，请联系你的 HRBP。”；不显示编辑操作，已提交内容保持只读可见。
- `editable=true`：显示成功 notice、时区格式化截止文案和 `EditOutlined + 编辑` 按钮。
- notice 容器、按钮尺寸、成功色和右侧操作留白由 review component token 消费。

## 4. Shared Surface

所有 `PerformanceReviewContent` 状态必须共享：

```css
padding-inline: var(--performance-review-surface-inset);
scrollbar-width: none;
```

父 `review-main` 与 `html:has(.review-page)` 不得保留稳定 scrollbar gutter。completed 与非 completed 状态只允许内容差异，不允许白卡左右边界差异。

## 5. Token Contract

优先复用：

```css
--color-surface-card
--color-text-primary
--color-text-secondary
--color-primary-active
--spacing-4
--spacing-5
--spacing-7
--radius-md
--radius-lg
--shadow-dialog
```

计划新增的组件 token（仅在共用组件落地后）：

```css
--performance-review-surface-inset: var(--spacing-5)
--performance-review-content-max-width: 984px
--performance-review-completion-bg: #e4fae1
--performance-review-completion-icon: #32a645
--performance-review-readonly-surface: #f5f6f7
```

新增 token 必须同步更新 `tokens.css` 与 `design-system.md`，不得在页面内另造同义变量。
