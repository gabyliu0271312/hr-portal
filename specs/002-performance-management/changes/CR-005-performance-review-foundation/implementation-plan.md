# CR-005 实施计划：绩效评估公共基座

- 状态：T01-T05 已实施；T06 的自动化与构建已完成，运行时 P2 视觉证据待补充
- 当前分支：main
- 目标等级：P0/P1；P2 仅对已有完整采集状态单独验收
- 不直接修改数据模型、迁移或历史项目快照

## 实施结果

- T01：`task_kind + entry_mode + task_id` 入口 registry 已替换节点名称推断；工作总结作为首个注册项。
- T02：评估白卡与完成提示已使用公共 `PerformanceReviewContent` 和 `PerformanceReviewCompletionNotice`；稳定的 surface/notice 值已进入 review token。
- T03：`PerformanceTemplateRenderer`、`PerformanceTemplateSection`、`PerformanceTemplateFieldRenderer` 与 rich text/rating/tag-with-followup registry 已落地；未知 field type 受控显示错误。
- T04：`performanceTemplateAnswers` 已成为唯一实现；旧 `performanceRepeatableAnswers` 和 SelfSummary 组件仅保留兼容 wrapper。
- T05：工作总结详情与概览均下发 `task_kind=work_summary`、`entry_mode=template_task`；权限、快照和 JSONB 持久化模型未变。
- T06：前端聚焦测试 35 passed、后端聚焦测试 27 passed、`vue-tsc --noEmit` 与 Vite 构建通过；Docker 运行时截图/完整 P2 contract 尚未执行。

## 技术上下文

| 维度 | 决策 |
|---|---|
| 前端 | Vue 3、TypeScript、Pinia、Vite、Element Plus |
| 后端 | FastAPI、SQLAlchemy async、PostgreSQL JSONB |
| 当前任务真源 | `PerformanceNodeTask`、节点/模板/人员快照 |
| 首个适配实例 | `work_summary` / PM-T009 自我总结任务 |
| 公共 DTO | `PerformanceTemplateSection/Field/Option` 前端兼容 alias |
| 页面入口 | `entry_mode + task_kind + task_id` registry |
| 公共状态 | `PerformanceReviewContent` + completion notice |
| 内容渲染 | section renderer + field renderer registry |
| 答案 | `performanceTemplateAnswers`，从现有 repeatable adapter 演进 |
| UI 证据 | 当前工作总结完成态已有参数；其他 task variants 的 P2 证据待采集 |

## Constitution / 基线检查

- 模块化单体：通过。公共基座保持在 `performance` 模块内，不引入跨域共享服务。
- 历史快照：通过。只消费已冻结 schema/answers，不迁移或覆盖已启动项目。
- 权限：通过。前端 entry 不替代后端任务权限与 editability。
- 组件化：通过。页面只组装；公共 renderer、状态和 adapter 位于 `components/performance`。
- UI 门禁：P1 可实施；全量 P2 被缺少其他节点 target/rendered contract 阻塞。

## 文件边界

### 允许修改

```text
hr-portal/frontend/src/api/performance.ts
hr-portal/frontend/src/api/performance.js
hr-portal/frontend/src/views/performance/Review.vue
hr-portal/frontend/src/views/performance/Review.spec.ts
hr-portal/frontend/src/views/performance/Review.spec.js
hr-portal/frontend/src/views/performance/SelfSummaryTask.vue
hr-portal/frontend/src/views/performance/SelfSummaryTask.spec.js
hr-portal/frontend/src/components/performance/PerformanceReviewContent.vue
hr-portal/frontend/src/components/performance/PerformanceSelfSummaryForm.vue
hr-portal/frontend/src/components/performance/PerformanceSelfSummaryReadOnly.vue
hr-portal/frontend/src/components/performance/performanceRepeatableAnswers.ts
hr-portal/frontend/src/styles/tokens.css
hr-portal/frontend/docs/design-system.md
hr-portal/backend/app/performance/projects_router.py
hr-portal/backend/app/performance/self_summary_service.py
hr-portal/backend/tests/test_performance_projects.py
specs/002-performance-management/changes/CR-005-performance-review-foundation/
```

### 允许新建

```text
hr-portal/frontend/src/components/performance/PerformanceReviewCompletionNotice.vue
hr-portal/frontend/src/components/performance/PerformanceTemplateRenderer.vue
hr-portal/frontend/src/components/performance/PerformanceTemplateSection.vue
hr-portal/frontend/src/components/performance/PerformanceTemplateFieldRenderer.vue
hr-portal/frontend/src/components/performance/performanceTaskEntry.ts
hr-portal/frontend/src/components/performance/performanceTemplateAnswers.ts
hr-portal/frontend/src/components/performance/*.spec.ts
```

### 禁止修改

```text
已存在 Alembic migration
已启动项目的模板/人员/节点快照数据
其他模块的路由、权限和数据模型
未在公共契约注册的未来业务节点语义
```

## 原子任务

### CR-005-T01 冻结公共 DTO 与入口注册契约

- 类型：前端/契约
- 前置条件：CR-005 spec、research、data-model、frontend contract 已确认
- 输入：当前 `PerformanceReviewNode`、`SelfSummaryTask`、任务概览 API
- 输出：`task_kind`、`entry_mode`、`PerformanceTaskPresentation` 和 entry registry 类型；名称正则仅可作为迁移期显式 compatibility adapter
- 允许修改：API type、Review、task entry utility、契约和测试
- 禁止：新增未来任务路由、改数据库
- Given：模板任务返回已注册 task kind
- When：点击去完成或编辑
- Then：使用 task ID 和注册路由进入同一任务；未知组合显示受控状态
- 测试：Review entry registry 单测、现有 Review 回归

### CR-005-T02 提炼公共评估 surface 与完成提示

- 类型：前端/UI
- 前置条件：T01
- 输出：大白卡、外边界、滚动规则、状态壳和 `PerformanceReviewCompletionNotice`
- 不变式：completed/pending/not_started/overdue 共享大白卡左右边界；completed 隐藏 heading 时间，其余状态保留
- UI：沿用已有 `/performance/review` 信息架构；无新页面
- token：新增或消费已存在的 review surface/completion token；不得复制字面值到多个组件
- 测试：状态切换、notice editable/readonly、白卡 class/source CSS、标题时间可见性
- 验收：工作总结完成态与其他节点空状态外边界一致；P2 screenshot 另列 blocked

### CR-005-T03 提炼模板 section 与 field renderer registry

- 类型：前端/组件
- 前置条件：T01、T02
- 输出：`PerformanceTemplateRenderer`、`PerformanceTemplateSection` 和 `PerformanceTemplateFieldRenderer`
- 当前 renderer：rich text、rating、tag-with-followup；每个有 `edit` 与 `readonly` mode
- 兼容：工作总结 UI/字段顺序/重复规则保持不变
- 禁止：为未冻结的 score/comment/calibration 类型虚构 renderer
- 测试：三类字段在 edit/readonly 的正向与反向断言，未知 field type 受控失败

### CR-005-T04 演进统一答案 adapter 并迁移工作总结调用方

- 类型：前端/适配器
- 前置条件：T03
- 输出：`performanceTemplateAnswers`，或兼容导出层；现有 `performanceRepeatableAnswers` 不再是 self-summary 私有命名事实
- 规则：单值、数组、标签 note、实例数、add/remove、error key、readonly accessor 使用同一实现
- 兼容：旧单值/旧 tag array 仍可读取；接口 payload 不变
- 测试：工作总结编辑、草稿、提交、重新打开、只读展示；重复实例边界

### CR-005-T05 后端最小概览/详情 presentation 对齐

- 类型：后端/API
- 前置条件：T01、T04
- 输出：工作总结概览/详情稳定下发 task kind、entry mode、completed presentation 所需 schema/answers
- 权限：沿用 `_self_summary_task` 与任务所属判断；不得因公共 presentation 扩大管理员或普通用户可见范围
- 持久化：不改 `PerformanceNodeTask` 表；不更改 snapshot fallback 语义
- 测试：授权/拒绝、提交后概览、task ID 固定、重开答案一致、未知 entry 受控

### CR-005-T06 Token、文档与验收收口

- 类型：文档/UI/验收
- 前置条件：T02-T05
- 输出：`tokens.css`、design-system、CR-005 契约、PM-T009 交接记录、截图/运行时证据
- 验收：执行 quickstart；更新实际通过/未运行/blocked；不因构建成功把 P2 标记为 passed
- 证据：API payload、DB/readback、Vitest、pytest、Docker build、运行容器状态、同视口截图/contract（如已采集）

## 执行顺序

```text
T01 → T02 → T03 → T04 → T05 → T06
```

T02 与 T03 可在 API 类型冻结后并行设计，但不得并行编辑 `PerformanceReviewContent.vue`、`performance.ts`、`projects_router.py`。

## 回滚

- 前端公共 renderer 保留兼容 adapter；若某个注册项未覆盖既有答案，回退该 task-kind registry 项到现有 `SelfSummaryTask` 适配器。
- 无数据库迁移，因此不需要 schema downgrade。
- 不回滚历史任务答案或项目快照。

## 实施前阻塞项

1. 需要用户确认是否将 `work_summary` 的当前页面视为“自我总结首个适配实例”，还是将未来自评作为独立 `task_kind` 但共享同一 renderer；本计划默认前者。
2. 其他节点的真实 `task_kind/entry_mode/form_schema/answers` 尚未冻结，因此本轮不实现其业务 renderer，只建立显式扩展点。
3. P2 需要其他节点完成态完整采集和 rendered contract；不阻塞 P0/P1 公共基座。
