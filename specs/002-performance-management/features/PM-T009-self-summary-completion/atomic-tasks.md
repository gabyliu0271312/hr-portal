# PM-T009 原子任务

## 状态规则

本目录仅完成需求澄清，所有任务保持 `[ ]`。只有组件复用核对、代码、测试和验收证据齐全后才可勾选。

- [x] PM-T009-T01 核对模板 schema 与现有表单组件复用边界
  - 输出：模板字段映射、组件 props/emits、缺口清单
  - 禁止：重新实现富文本、评级、标签基础组件

- [x] PM-T009-T02 冻结任务详情、答案、草稿保存与提交 API
  - 前置：T01
  - 输出：正式 API、错误码、幂等、版本和权限契约

- [x] PM-T009-T03 冻结答案模型与状态迁移
  - 前置：T01/T02
  - 输出：复用模型确认、答案结构、截止后提交一次并锁定规则

- [x] PM-T009-T04 实现自我总结任务详情编排
  - 前置：T01/T02/T03
  - 范围：模板适配、组件组装、自动保存、校验、提交和只读状态
  - 不包含：基础表单组件重写、OKR、翻译、全屏、移动端
  - 代码证据：`self_summary_service.py`、`projects_router.py`、`PerformanceSelfSummaryHeader.vue`、`PerformanceSelfSummaryForm.vue`、`PerformanceSelfSummaryFooter.vue`、`PerformanceRepeatableContent.vue`、`PerformanceAddAnotherButton.vue`、`performanceRepeatableAnswers.ts`、`SelfSummaryTask.vue`
  - 测试证据：后端相关回归 64 passed；展示方式联动相关前端回归 68 passed；`npm run build` 通过
  - 运行时证据：1534×911 下头部 1534×64、页签 1510×48、内容卡 1510px、底栏 1534×63 且 `position=fixed/bottom=0`，无横向溢出；动态夹具覆盖 4 个内容块、7 个评级项/6 条连接线和标签共用富文本；真实浏览器连续输入 `ABC` 后光标保持在 offset 3；`allow_multiple=true` 时实测新增 2 个实例，字段显示“名称1/名称2”，无“第 N 条”和横线，2 条均使用 `PerformanceIconButton/DeleteTrashOutlined`；删除第一条后剩 1 条且删除按钮归零；PATCH/POST 数组载荷验证通过
  - 评级联动证据：真实模板历史记录含 2 个 rating item，运行时配置预览归一为 1 个最终评估项“名称”和 9 个当前规则等级；任务 API 同样只返回该 1 个评估项及相同 9 个等级，验收写请求已拦截且数据库未改写。
  - 展示方式证据：真实题目 2 的编辑页正确回填“下拉样式”；模板配置使用 `PerformanceRatingControl is-dropdown` 且不出现旧等级；绩效填写页渲染同一共享组件的下拉选择器，无标签控件；所有验收写请求均拦截。
  - 视觉边界：结构与采集参数已对齐；缺目标截图/rendered contract，像素 diff 验收仍 blocked

- [ ] PM-T009-T05 组件/API/权限/真实页面验收
  - 前置：T04
  - 覆盖：必填分支、颜色配置、标签+补充输入、保存失败、提交失败、截止后锁定和重复提交
  - 2026-09-17 提交后重读缺陷证据：数据库确认任务 145/146/147 的 `status=completed`、`submitted_at` 和答案均已持久化；请求日志确认旧概览在提交 145 后错误切换到 146、再切换到 147/148。修复后真实 API 使用 `project_id=3&task_id=145` 返回同一任务、`status=completed`、2 个冻结表单区块及一致答案；任务详情重开与概览 `same_task=true`、`same_answers=true`。
  - 自动化证据：`pytest -q tests/test_performance_projects.py` 为 27 passed；Review/SelfSummary 聚焦 Vitest 为 20 passed；`npm run build` 与 Docker 前端构建通过。真实浏览器截图与完整像素契约仍未运行，T05 保持未完成。

## 依赖

```text
PM-T007 / PM-T008 / 现有表单组件
          ↓
T01 → T02 → T03 → T04 → T05
```

## 当前待决

- 现有组件的真实入口和能力；
- 模板 schema 与评级规则颜色字段；
- 现有答案模型和任务详情路由；
- 自动保存并发版本字段；
- 价值贡献补充输入的空值判定规则。
