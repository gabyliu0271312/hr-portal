# PM-T005 实现缺口分析

## 当前状态

本轮有效采集产物的截图、after HTML、computed、interaction 和独立 `target_contract.json` 均已生成，viewport 均为 `1920x1080`。字段、checkbox、radio、footer、评估规则 expanded/selected 以及五个 after-click 场景均已有独立契约；核心页面 bbox 和样式 token 已写入 `pixel-contract.md`。

## 已解除的缺口

- 默认新建评估题页面真实截图和 HTML/layout/computed 证据
- 名称、描述、备注的 empty/focus/filled/count
- 语言 checkbox checked/unchecked
- 四种类型 radio 选中态
- 评估规则下拉展开、真实选项和选中态
- 返回、提交、预览、取消的 hover/focus/after-click
- 预览和提交的空表单校验反馈
- 全部 10 个 session / 35 个 after 状态已使用修复后的采集器重跑，严格 JSON 校验通过，`NaN/Infinity=0`

## 尚未解除的缺口

1. 页面未观察到真实 disabled 控件状态，不能猜测 disabled 样式。
2. 主要 SVG path 已提炼到 `pixel-contract.md`；`LarkOutlined` 已通过全页面 SVG inventory 补齐，`ErrorFilled` 当前没有真实实例，继续标记为 unresolved。
3. 返回按钮 DOM 是不可聚焦的 `div`，其键盘 focus 记录为 `N/A`，不能作为普通 focus 状态实现。

## 证据入口

- 基础结构：`C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260825_153141/captures/capture_model.json`
- 字段状态：`..._191949_338542`
- checkbox/radio：`..._192219_038154`
- footer：`..._192442_079083`
- expanded/selected：`..._192706_982839`、`..._192927_379131`
- after-click：`..._190403_023043`、`..._190550_626183`、`..._190736_735382`、`..._190921_581205`、`..._191106_099217`


## 2026-08-30 规则关联与接口设计补充

本次正式环境补采确认：评估规则下拉实际返回 6 项，其中 5 项为本次目标规则；评估规则列表行 `data-row-key` 与下拉选项 `data-cy` 一致。新建子评估题覆盖 4 个目标变体，新建评估题覆盖 5 个目标变体。证据 session 和状态映射见 `capture-manifest.md`、`state-matrix.md`。

接口设计决策：

- 评估题正式关联字段为 `rule_id`，语义对应评估规则实体的 `rule_id`；
- 下拉 `label` 来源于规则名称，`value` 来源于规则唯一 ID；
- 新建评估题保存请求同时提交 `is_sub_question` 和 `parent_question_id`，不提交规则名称作为关联键；
- 普通题/子题规则过滤逻辑不在本次实现，后续单独开发；
- 评估题不保存规则版本或配置快照；规则变更后按同一 `rule_id` 获取最新规则配置；
- 规则列表和详情的运行时 API、评估题 POST、规则更新后重开读取仍需实现和测试。

当前状态保持 `completion_status: incomplete`、`pixel_restore_status: blocked`。新增 10 个状态（1 个下拉展开、9 个规则选择后）已投影到 `extracted-ui-contract.json` 的 `schema_version: 2`；剩余阻塞是历史 textarea resize after-drag 证据、运行时 API/最新读取验证和 rendered screenshot diff。

## 2026-09-01 评分上下限按子评估项评分专项

已完成部分已追加到 `extracted-ui-contract.json`（`schema_version: 3`）并同步至规格文档：

- 固定普通评估题、常规评估项、目标评分规则 `rule_id=7680421437210954714` 和「按子评估项评分」上下文；
- 记录四个计算规则 after 状态：不设置计算规则、加权求和、直接求和、求平均分；
- 确认四个状态均加载子评估题区域和既有展示方式/填写查看顺序区域；
- 确认「加权求和」分支增加「权重」列，其余三个状态未观察到该列；
- 通过 `calculation_rule` 将计算规则、子评估题区域和展示方式复用结构绑定，禁止为每个规则复制展示方式组件。

本次已补采提交校验：空子评估题提交后显示「该字段是必填字段」红色错误，未创建评估题；新建子评估题弹窗仍未采集，未执行保存、确认创建、删除或发布。新增局部变体可标记 `implementation_readiness=ready`，但全功能仍为 `capture_completeness=incomplete`、`pixel_restore_status=blocked`。

## 2026-09-02 提交校验缺口更新

已解除一项原专项缺口：空子评估题提交后的 validation after 已取得完整证据。目标状态为 `idreamsky.feishu.cn_20260902_105330_185791:submit-empty-sub-question-validation`，提交后显示红色「该字段是必填字段」，页面未创建题目或跳转。

仍未解除：

- 「新建子评估题」弹窗完整 after 证据；
- 展示方式和填写/查看顺序点击后的专项状态；
- rendered contract 与截图 diff；
- 全功能 disabled、ErrorFilled SVG、textarea resize after-drag 和运行时 API/最新读取验证。

本次校验不改变保存 API 契约，未产生成功创建请求；全功能 `completion_status=incomplete`、`pixel_restore_status=blocked` 保持不变。

## 2026-09-02 真实子评估题选择后补采更新

已补齐一项选择后状态：在计算规则「不设置计算规则」下，用户实际选择 `question_id=7680531263614094288`，页面成功派生显示子评估题名称、关联评估规则名称和 `1 - 10` 评分上下限，并显示删除按钮。候选面板打开态、选择后态和关闭面板后的稳定态均有证据。

仍未解除：

- 选择后删除行为；
- 创建新的子评估题并返回父页面后的状态；
- 展示方式/顺序卡片的全部点击后组合；
- rendered contract 与截图 diff；
- after HTML 部分中文编码异常的根因修复。

本次不产生成功创建或保存请求；全功能 `completion_status=incomplete`、`pixel_restore_status=blocked` 不变。
