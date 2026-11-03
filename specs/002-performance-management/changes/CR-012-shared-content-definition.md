# CR-012 模板内容定义跨环节共享（方案 C）

- 状态：本地代码、定向测试与类型检查完成；真实登录态浏览器验收未执行
- 确认日期：2026-11-03
- 关联：PM-T004-T05-F07（旧口径被本记录取代）、PM-T004-T05-F09、CR-011
- 影响模块：绩效模板 → 内容设置（`PerformanceTemplateContentSettings.vue`）、评价内容抽屉（`PerformanceAssessmentContentLayers.vue`）、评级等级解析（`performanceRatingOptions.ts`）、模板流程服务（`template_workflow_service.py`）

## 1. 背景

用户观察到：在自评环节修改同一评估内容的名称/描述后，上级评估环节再添加该内容时仍显示添加时的旧快照。定位到四处断点：

1. 前端 `mergeContentLibrary` 对已存在的 `content_id` 采用 `if (!next.has(id))` 跳过，编辑后的定义进不了内容库；
2. 前端 `handleContentConfirm` 只把编辑结果写进当前节点 `node.content`，其他环节的节点副本保持旧定义；
3. 后端 `_merge_content_library` 用 `setdefault` 且旧库优先，节点定义无法刷新库；
4. 评级等级被快照进 `content.options`，`mergeRatingOptions` 只补缺失字段，题库改了等级也不会影响已有内容。

飞书实际实现是：环节节点只持有对共享 `templateItem` 的引用，内容定义只有一份；评级等级定义在评级题库（`indicator.props.options[]`）中共享。据此用户选择方案 C：**节点只存引用，彻底对齐飞书**。

## 2. 新口径

- **内容库是唯一权威**。`content_library` 保存共享定义（type/name/description/items/options/ratingOptionId/prompt），同一 `content_id` 只有一份定义。
- **节点只存引用 + 环节级设置**。节点 `content_bindings` 决定每个页签引用哪些内容；节点侧只保留本环节的显示/填写/必填设置、`content_slot`、提示的 `allowView|onlyWhenFilling`、`calibration_settings`、`reference_settings`。
- **任一环节修改内容定义 → 其他环节同步**。修改写入内容库后立即投影到所有引用该内容的节点副本；保存时仍按内容库投影，因此重新打开后各环节一致。
- **评级等级以评级题库为唯一来源**。`resolveRatingOptions` 以题库返回的等级为准，本地 `options` 只在题库缺失（题目被删除/离线）时兜底；题库等级的顺序、数量、代号、名称、描述、颜色都会同步。
- **环节级设置不共享**。同一内容在不同环节可以有不同显示/填写/必填设置，互不影响。

## 3. 兼容性

- 节点 `content` 仍然被保存，但它现在是**内容库的投影**（定义来自库、设置来自节点）。原因是项目、周期、评审、校准、自助总结等运行期消费方都直接读取物化后的 `nodes[].content`，保留投影可避免大面积改造运行期链路。
- 读取时若历史数据中节点副本比库更新（旧数据不一致），以节点副本回填内容库（读取自愈），再投影到所有节点，避免结果查看等场景回退到更旧的库定义。
- 写入优先级：显式提交的 `content_library` > 已存内容库 / 节点上的填写内容（仅补缺口，兼容旧客户端）。因此旧客户端只提交节点内联内容时行为不变。
- 不改变 API 路径、JSONB 结构、权限、审计、已使用模板 409 锁定和历史周期快照；无数据库迁移。

## 4. 非目标

- 不引入飞书服务端 `templateItem`、`indicator` 表结构，不新增迁移。
- 不改结果查看页的可选范围规则、校准修改记录、参考内容查看设置语义。
- 不做历史差异人工回填脚本；历史不一致数据在读取时按“节点优先”自愈。

## 5. 测试要求与结果

- 前端：`PerformanceTemplateContentSettings.spec.ts` 83 例通过，新增/改写用例覆盖：同一内容跨环节同步定义、环节级设置独立、其他环节从内容库添加时看到新名称、评级题库等级覆盖本地快照、结果查看回写真实终评定义。
- 前端：`performanceRatingOptions.spec.ts` 7 例通过（`resolveRatingOptions` 题库权威 + `mergeRatingOptions` 展示兜底两套语义）。
- 前端：`PerformanceContentRenderer.spec.ts`、`PerformanceAssessmentContentLayers.spec.ts` 105 例通过（渲染层仍保持“条目自身等级优先”的展示语义）。
- 后端：`tests/test_performance_template_workflow.py` 235 例、`tests/test_performance_projects.py` 386 例通过；新增“内容库定义刷新后传播到所有绑定节点”和“共享定义 + 节点设置独立”用例。
- 已知非本次引入的失败：`test_performance_cycles.py` 两条（员工花名册契约缺 `standard_position`，需数据库环境）；前端 `PerformanceSegmentedControl`、`OtherSettings`、`PerformanceTemplateManagement`、`PerformanceProjectSettingsPage` 相关用例在 HEAD 上同样失败。
- 未执行：真实登录态浏览器交互、真实数据库保存重开、部署与生产验收。
