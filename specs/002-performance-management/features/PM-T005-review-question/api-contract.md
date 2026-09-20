# PM-T005 评估规则关联与接口契约

## 1. 文档状态

```text
completion_status: implemented_locally
pixel_restore_status: blocked
uncovered_reasons:
- API 已在本地后端实现并通过聚焦测试，但正式环境真实保存请求尚未观察
- 评估规则列表未按普通题/子题过滤，过滤逻辑作为后续独立任务
- 规则更新后读取最新配置已按 rule_id 实现；并发和缓存专项验证未运行
```

本契约服务于 PM-T005 像素级开发还原和接口实现。当前本地后端、迁移和前端 API 客户端已实现；正式环境保存与生产部署仍需独立验收。

## 2. 决策摘要

| 决策 | 结论 |
|---|---|
| 评估题关联键 | `rule_id`，正式字段名为 `rule_id` 的语义对应字段 |
| 下拉 label | 来自评估规则记录的 `name`，前端不得维护静态选项 |
| 下拉 value | 来自评估规则记录的稳定唯一 ID，前端不得使用名称、类型或选项顺序 |
| 普通题/子题过滤 | 本次不实现、不设计差异化过滤参数；后续单独开发 |
| 规则更新 | 评估题读取时按同一 `rule_id` 获取最新规则配置 |
| 规则版本/快照 | 评估题不保存规则版本号，不保存规则配置快照 |
| 规则不存在/不可用 | 由后端返回明确错误；前端不能用旧静态选项或本地快照兜底 |

## 2.1 采集夹具与生产语义

文档中的“测试评级…”、“测试评分…”和“测试--评分映射等级型”仅是正式环境采集夹具名称，用于 evidence replay。生产实现不得硬编码这些名称，也不得根据名称判断模块。正式判断键为：

```text
entry_mode + rule.review_type + rule.config discriminator
```

下拉列表和详情均消费当前已实现 API；任意新名称但相同 `review_type/config` 的规则必须进入同一组件变体。


### 3.1 `GET /api/v1/performance/review-rules`

用途：为新建评估题和新建子评估题提供评估规则下拉选项及当前规则配置摘要。

本次只支持通用可用规则列表，不传入普通题/子题过滤参数。`question_scope`、`is_sub_question`、`parent_question_id` 等过滤参数不属于本次契约。

响应：

```json
{
  "items": [
    {
      "id": 7679656987218430963,
      "name": "测试评级--评级可参与计算开关关闭",
      "review_type": "评级",
      "status": "active",
      "updated_at": "2026-08-30T03:11:00Z",
      "config_summary": {
        "grade_participates_in_calculation": false
      }
    }
  ]
}
```

规则列表的排序由后端确定并在接口文档中固定；前端只展示返回顺序，不把顺序当作关联键。重名规则必须通过 `id` 区分。

### 3.2 选项映射

```text
option.label = item.name
option.value = item.id
```

`review_type` 和 `config_summary` 用于选择后的模块呈现、审计和测试断言，不替代 `id`。

接口必须返回当前可读的规则。过滤逻辑后续单独开发时，可以新增明确的查询参数或专用接口，但不得改变 `id`、`name` 和 `review_type` 的含义。

## 4. 规则详情接口

### `GET /api/v1/performance/review-rules/{rule_id}`

用途：选择规则后加载评估规则模块的最新配置。

响应最小结构：

```json
{
  "id": 7679656987218430963,
  "name": "测试评级--评级可参与计算开关关闭",
  "review_type": "评级",
  "status": "active",
  "updated_at": "2026-08-30T03:11:00Z",
  "config": {}
}
```

`config` 根据 `review_type` 返回真实规则配置：

- `评级`：评级可参与计算开关、等级、量化分等配置；
- `评分`：评分方式、分数上下限或固定分值选项等配置；
- `评分映射等级型`：评分边界、区间、等级映射等配置。

评估题页面每次打开或选择规则后读取该接口的当前数据。不得从评估题记录中读取旧的规则配置副本。

## 5. 新建评估题接口

### `POST /api/v1/performance/review-questions`

请求：

```json
{
  "language": "zh-CN",
  "name": "题目名称",
  "description": "题目描述",
  "type": "regular",
  "is_sub_question": false,
  "parent_question_id": null,
  "rule_id": 7679656987218430963,
  "remark": "备注"
}
```

字段规则：

| 字段 | 类型 | 规则 |
|---|---|---|
| `language` | enum | 当前采集语言值；按现有页面契约执行 |
| `name` | string | 必填，沿用页面名称校验 |
| `description` | string | 可选，沿用页面长度约束 |
| `type` | enum | 常规评估项、OKR 评估项、加分项、减分项对应的稳定编码 |
| `is_sub_question` | boolean | 明确区分普通评估题和子评估题 |
| `parent_question_id` | integer/null | 当前子评估题库入口可为 null；若未来从父题上下文进入可传父题 ID；普通评估题必须为 null |
| `rule_id` | integer | 必填，必须指向当前可用评估规则 |
| `remark` | string | 可选，沿用页面长度约束 |

后端必须根据 `rule_id` 校验规则存在、状态可用和配置可读取；不得接受规则名称或规则类型作为关联键。

成功响应至少返回：

```json
{
  "id": 10001,
  "language": "zh-CN",
  "name": "题目名称",
  "type": "regular",
  "is_sub_question": false,
  "parent_question_id": null,
  "rule_id": 7679656987218430963,
  "remark": "备注"
}
```

成功响应不需要嵌入规则配置快照。需要展示规则模块时，前端按 `rule_id` 请求最新规则。

## 6. 评估题读取与规则更新语义

### 6.1 读取评估题

`GET /api/v1/performance/review-questions/{question_id}` 返回 `rule_id`，并可返回当前规则摘要。完整规则配置必须从规则详情资源获取，或由同一响应明确标记为当前实时配置。

### 6.2 规则变更后读取

规则变更后：

1. 评估题记录中的 `rule_id` 不变；
2. 重新打开评估题时获取该 ID 对应的最新规则名称、类型和配置；
3. 页面模块按最新配置重新渲染；
4. 不读取评估题保存时的旧配置；
5. 不保存规则版本号或配置快照到评估题。

这意味着历史评估题的评估规则展示和可用配置会随关联规则更新而变化。本语义是本次已确认决策，不得被前端缓存或本地 draft 改写。

### 6.3 规则不可用

如果关联规则被停用、删除或当前用户无权读取：

- 规则详情接口返回 `404` 或 `409`，具体错误码由后端错误规范冻结；
- 评估题读取必须明确显示规则不可用状态；
- 不自动切换到其他规则；
- 不回退到旧静态选项；
- 不静默清空 `rule_id`。

## 7. 错误和权限契约

| 场景 | HTTP | 语义 |
|---|---:|---|
| 未认证 | 401 | 未建立绩效登录态 |
| 无绩效后台权限 | 403 | 无权读取或创建 |
| `rule_id` 不存在 | 404 | 关联规则不存在 |
| 规则不可用或状态冲突 | 409 | 规则存在但当前不能关联/读取 |
| 字段校验失败 | 422 | 请求字段或父子题关系非法 |
| 服务/规则加载失败 | 503 | 可重试，不得提交部分题目 |

权限判断沿用绩效应用和后台权限模型；本契约不新增角色权限。

## 8. 不属于本次契约的内容

- 普通评估题与子评估题的规则过滤逻辑；
- 评估规则新建、编辑、删除页面的业务实现；
- 规则版本表、题目配置快照表或迁移；
- 规则更新后的历史结果重算策略；
- 真实保存请求的已运行证据；本轮正式环境采集未执行保存。

## 9. 像素实现约束

`ReviewRuleSelect` 必须从接口选项渲染下拉，选择后将 `rule_id` 传给页面状态，并由规则详情驱动对应评估规则模块。实现验收需分别覆盖 PM-T005 采集的评级关闭、评级打开、评分上线限、评分固定分值和评分映射等级型状态；不得用 `REVIEW_RULE_OPTIONS` 静态数组替代真实规则数据。

## 10. 子评估题候选查询契约

### `GET /api/v1/performance/review-questions/sub-question-options`

查询参数：

```text
calculation_rule = none | condition
```

响应：

```json
{
  "items": [
    {
      "id": 201,
      "name": "团队协作",
      "rule_id": 101,
      "rule_name": "五级评级",
      "review_type": "评级",
      "grade_participates_in_calculation": true,
      "score_min": 1,
      "score_max": 5
    }
  ]
}
```

筛选由后端执行：

```text
none:
  is_sub_question=true
  AND rule.status=active
  AND (
    rule.review_type=评分
    OR (rule.review_type=评级 AND grade_participates_in_calculation=true)
  )

condition:
  is_sub_question=true
  AND rule.status=active
  AND rule.review_type=评级
  AND grade_participates_in_calculation=true
```

`评分映射等级型` 不进入候选。

上下限派生：

- 评级：`levels[].quantifiedScore/quantified_score` 的数值 min/max；
- 上下限评分：兼容 `config.min/max` 与 `config.score.min/max`；
- 固定分值评分：兼容 `fixedOptions/fixed_options`，按所有有效 option value 的数值 min/max；
- 无有效数值时返回 `null/null`，前端显示 `--`。

下拉 option 第一行显示 `name`，第二行显示 `review_type`；选择后规则列只读显示 `rule_name`，上下限列显示 `score_min - score_max`。本接口不返回规则配置快照，不接受规则名称作为关联键。

本节只冻结候选查询和页面联动；父题保存子题选择及顺序不在本接口范围。

### 10.1 本地实现结果（2026-09-01）

```text
endpoint: implemented
backend filtering: implemented
rating/score/fixed bounds: implemented
frontend API client: implemented
dropdown linkage: implemented
selection persistence: not-in-scope
runtime screenshot diff: not-run
```

## 10.2 2026-09-01 评分上下限专项证据关联

本次采集只确认页面状态，不新增 API 请求契约。目标规则的页面稳定标识为 `rule_id=7680421437210954714`，下拉 label 为「评估规则--拼分（在分数上下限内输入评分）」，`review_type=评分`，评分方式为「按子评估项评分」。

四个页面状态使用 `calculation_rule` 作为 UI 变体上下文：`none`、`weighted_sum`、`direct_sum`、`average`。四个状态均显示既有子评估题区域和展示方式/填写查看顺序区域；仅 `weighted_sum` 观察到「权重」列。

评估题保存请求包含题目级 `display_mode`，取值仅为 `标签样式` 或 `下拉样式`；该字段不写入共享评估规则 `config`。`rule_id`、`is_sub_question`、`parent_question_id` 和 `display_mode` 随题目独立持久化。计算规则和「权重」列仍不作为本轮新增保存字段。

## 10.3 2026-09-02 提交校验补采边界

空子评估题提交校验已取得真实浏览器 after 证据：页面在 `regular_question`、`rule_id=7680421437210954714`、`calculation_rule=none` 上显示「该字段是必填字段」，且未创建评估题。该结果只确认前端 validation feedback，不构成成功 POST、请求 payload 或后端错误码证据；真实保存请求仍为 `not-run`。

该校验状态不增加评估题保存字段，不改变 `rule_id`、`is_sub_question` 或 `parent_question_id` 契约。「新建子评估题」弹窗尚未采集，弹窗内部请求边界继续保持未决。

## 10.4 2026-09-02 子评估题选择后派生边界

真实候选 `question_id=7680531263614094288` 的选择后状态确认了前端派生关系：`question_id` 读取候选题名称，并从其关联规则详情派生规则名称和评分上下限。该选择不增加评估题保存字段；`rule_id`、`is_sub_question` 和 `parent_question_id` 契约保持不变。

本次只执行前端候选选择和只读状态校验，没有执行删除、创建或保存请求，不构成成功 POST 或后端持久化证据。候选下拉的 `data-cy/data-id` 可用于本次证据追踪，但生产实现不得硬编码该候选名称或 ID 作为业务枚举。
