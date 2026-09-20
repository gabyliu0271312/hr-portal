# PM-T005 采集完成校验清单

## 已通过

- [x] 基础 session 生成 `capture_model.json`：`153141`
- [x] 所有当前有效 session 的 JSON 可标准解析，无 `NaN`/Infinity（10 sessions / 35 after states）
- [x] 所有有效截图和布局证据 viewport 为 `1920x1080`
- [x] 默认新建评估题页面、入口链路、字段填充、checkbox、radio、select、footer after-click 已采集
- [x] 2026-08-30 正式环境评估规则下拉实际选项已采集：5 个目标规则 + 1 个额外「评分映射等级型」，列表 `data-row-key` 与下拉 `data-cy` 已交叉确认
- [x] 预览/提交空表单校验反馈已采集，未写入业务数据
- [x] 五个 after-click session 已用修复后的采集器重采，layout.json 严格解析且无 NaN/Infinity
- [x] 字段、checkbox/radio、footer、expanded、selected 全部用修复后的采集器重采

## 仍阻塞

- [x] 每个补采状态生成独立 `target_contract.json`（五个 after-click session）
- [x] 卡片、字段、footer 的完整 bbox 与 computed token 汇总到 `pixel-contract.md`
- [ ] 真实 disabled 状态证据；当前页面未观察到可用 disabled 实例
- [x] 返回按钮 focus：记录为 N/A，因 DOM 为无 `role`/`tabindex` 的 `div`
- [x] 所有已采集状态绑定到可复放的 `source_state_ids`

## 判定

```text
capture_json_integrity = passed
capture_visual_coverage = substantially_captured
completion_status = incomplete
pixel_restore_status = blocked
```

本轮只完成采集证据校验和文档同步，不勾选 PM-T005-T01 至 PM-T005-T06，也不处理 mock 数据。

## 2026-08-30 开发契约状态

- [x] 普通评估题 5 个规则选择后状态已生成独立证据
- [x] 新建子评估题 4 个规则选择后状态已生成独立证据
- [x] 规则列表 row-key 与下拉 option data-cy 已交叉确认
- [x] `rule_id`、最新规则读取和评估题保存 payload 设计已写入 `api-contract.md`
- [x] `extracted-ui-contract.json` 已投影最新真实菜单采集的 21 个状态（7 个目标规则 × 入口/首屏/滚动后/选择后）并升级为 `schema_version: 2`
- [ ] 真实评估题 POST 请求和规则更新后重开读取测试
- [ ] 普通题/子题差异化规则过滤（后续独立任务）

开发文档当前仍保持 `completion_status: incomplete`、`pixel_restore_status: blocked`；接口设计确认不等于接口实现完成，规则更新后的最新读取语义尚未通过运行时测试。

## 2026-08-31 子评估题评级溢出补充状态

- [x] 目标页面确认 `entry_mode=sub_question`，新建/编辑共用该视觉分支
- [x] 10个长档位、9条连接线及内容自适应宽度已测量
- [x] 758.667×38 viewport、2442px track内容宽和1683px溢出量已测量
- [x] pill、connector、卡片和字段computed tokens已投影到 `rating-tier-overflow-capture-contract.json`
- [x] 只读 `pointer-events:none` 与右箭头出现条件已确认
- [ ] 右箭头独立bbox/owner computed未包含在用户返回片段；视觉复用PM-T006已验证 `RightOutlined`
- [ ] 实现后的 rendered contract 和目标截图diff

该补充状态支持确定性组件实现，但不解除全功能 `pixel_restore_status=blocked`。

## 2026-08-31 新建评估题评级动态分支专项补采

- [x] 目标规则「测试评级--评级可参与计算开关打开」重新定位成功，`rule_id` 关系沿用既有正式环境证据
- [x] `regular_question` 入口、常规评估项和 `rating-on` 基准态具备完整状态证据
- [x] 三种评级方式选择后状态具备完整 after artifacts：直接评级、通过子评估项评级、作为总分项计算评级
- [x] 通过子评估项评级下「不设置规则」与「按条件计算」具备完整 after artifacts
- [x] 已确认计算规则只在通过子评估项评级分支可见；直接评级/总分项评级的计算规则节点列入 forbidden contract
- [x] 新增状态均绑定 session 限定的 `source_state_id`、语义上下文和动作证据
- [ ] 展示方式「标签样式/下拉样式」点击后状态的专项补采
- [ ] 填写顺序和查看顺序四种组合的专项补采
- [ ] 新增动态状态的 rendered contract 和截图 diff

专项增量状态保持：

```text
capture_integrity = passed
capture_completeness = incomplete
implementation_readiness = ready（仅限新增五个评级/计算变体）
readiness_scope = variant
pixel_restore_status = blocked
uncovered_reasons:
- 展示方式与填写/查看顺序点击后状态尚未进入本次专项证据包
- rendered contract 与截图 diff 尚未运行
- 全功能历史 disabled、ErrorFilled SVG、textarea resize after-drag 缺口仍不变

## 2026-09-01 评分上下限专项已完成部分

- [x] 普通评估题入口、常规评估项、目标规则和「按子评估项评分」已复现并保存状态证据
- [x] 已采集四个计算规则：不设置计算规则、加权求和、直接求和、求平均分
- [x] 四个计算规则分别保存子评估题区域和既有展示方式/填写查看顺序区域
- [x] 已确认加权求和分支新增「权重」列，其余三个分支未观察到该列
- [x] 四个新增状态已投影到 `extracted-ui-contract.json`，并绑定同一 session 的完整 artifacts
- [x] 提交后的「该字段是必填字段」错误态已形成有效 after 证据；完整校验 after 归档于 2026-09-02 补采章节
- [ ] 「新建子评估题」弹窗尚未形成有效 after 证据

本次文档整理不修改业务代码，不勾选原子任务，不将提交确认点或工具失败记录写成校验完成证据。
```

## 2026-09-02 提交校验补采

- [x] 普通评估题、常规评估项、目标评分规则、按子评估项评分和不设置计算规则上下文恢复成功
- [x] 仅执行一次提交后采集到「该字段是必填字段」红色错误态
- [x] 校验 before/after、截图、layout、computed、validation、interaction 和 target contract 已落盘
- [x] 提交未创建评估题，未发生页面跳转
- [ ] 「新建子评估题」弹窗仍未采集
- [ ] 提交校验 after 的 rendered contract 和截图 diff

提交校验局部状态为 `capture_integrity=passed`、`capture_completeness=passed`、`implementation_readiness=ready`（仅限该 validation variant）；功能级状态仍为 `completion_status=incomplete`、`pixel_restore_status=blocked`。after HTML 存在部分中文编码异常，视觉文案以 after screenshot 为准。

## 2026-09-02 真实子评估题选择后补采

- [x] 候选面板打开状态已采集
- [x] 真实候选「子评估题--评分（在分数上下限内输入评分）」已通过可信用户 click 选择
- [x] 选择后题目名称、派生规则、派生评分上下限和删除按钮已采集
- [x] 候选面板关闭后选择结果保持已采集
- [x] 选择后稳定状态的只读校验和完整 artifacts 已落盘
- [ ] 顺序卡片点击后的其他组合状态
- [ ] 选择后 rendered contract 和截图 diff

本次没有执行创建、删除、保存或发布。选择后局部状态可标记 `capture_integrity=passed`、`implementation_readiness=ready`（`readiness_scope=variant`）；全功能 `completion_status=incomplete`、`pixel_restore_status=blocked` 保持不变。
