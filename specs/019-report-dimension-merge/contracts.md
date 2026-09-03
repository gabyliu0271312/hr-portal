# 维度组合重映射与归并合同

## 配置

`ReportConfig.dimension_merge_rules` 为规则数组；缺失等价于空数组，不设置独立启停开关。每条规则支持两种模式：`exact` 精确组合和 `expand` 按维度展开。`expand_by` 指定按值分别应用的维度，例如选择“月份”后，甲方/成本中心关系会在每个月内独立匹配，月份原样保留。

```json
{
  "id": "rule-uuid",
  "name": "按月归并甲方成本中心",
  "mode": "expand",
  "expand_by": ["employee.month"],
  "dimension_signature": ["employee.month", "employee.party", "employee.cost_center"],
  "sources": [
    {"values": {"employee.party": "甲方1", "employee.cost_center": "成本中心1"}},
    {"values": {"employee.party": "甲方2", "employee.cost_center": "成本中心2"}}
  ],
  "target": {
    "values": {"employee.party": "甲方1", "employee.cost_center": "成本中心1"},
    "modes": {"employee.month": "preserve", "employee.party": "source", "employee.cost_center": "source"}
  }
}
```

`exact` 模式的来源和目标必须包含全部维度；`expand` 模式的来源和目标值只配置未展开维度，展开维度的目标 mode 必须为 `preserve`，且至少保留一个未展开匹配维度。展开规则不使用通配符，不跨展开维度值匹配。

值保留 JSON 类型。`null`、`""`、`0`、`"0"`、`false` 不等价。数字按十进制规范化；日期和日期时间按字段类型规范化；文本不做隐式 trim 或大小写转换。

## 执行顺序

数据权限和基础范围 → 数值拆分 → 度量重映射 → 维度归并 → 归并后维度筛选 → 最终组合聚合 → 指标既有统计规则 → 余差收口 → 排序/分页/导出/推送。

每条基础记录仅按原始组合查表一次。未命中保持原样。多条规则或原始数据得到相同最终组合时由标准聚合阶段自动汇总。

## 校验错误

| code | 含义 |
|---|---|
| `DIMENSION_MERGE_REQUIRES_AGGREGATE` | 明细表包含归并规则 |
| `DIMENSION_MERGE_SIGNATURE_MISMATCH` | 规则维度签名与当前全部维度不一致 |
| `DIMENSION_MERGE_RULE_NAME_DUPLICATE` | 规则名重复 |
| `DIMENSION_MERGE_SOURCE_DUPLICATE` | 来源组合被多条规则使用 |
| `DIMENSION_MERGE_NOOP` | 单来源映射到自身 |
| `DIMENSION_MERGE_CHAIN` | 某规则目标是另一规则来源 |
| `DIMENSION_MERGE_STRUCTURAL_RESHAPE_CONFLICT` | 与列转行或行转列同时启用 |
| `DIMENSION_MERGE_TARGET_MODE_INVALID` | 目标模式非法或不完整 |
| `DIMENSION_MERGE_TARGET_TYPE_INVALID` | 自定义目标不符合字段类型 |
| `DIMENSION_MERGE_EXPANSION_INVALID` | 展开维度非法、为空或占用了全部匹配维度 |
| `DIMENSION_MERGE_SOURCE_NOT_AVAILABLE` | 新增来源不在当前授权数据范围 |
| `DIMENSION_MERGE_FILTER_INVALID` | 归并后筛选值全部或部分失效 |

错误响应使用 HTTP 422，`detail` 为 `{code, message, errors[]}`；每个 error 可携带 `rule_id`、`field`、`value` 和 `path`。

## API

### POST `/api/v1/reports/_dimension-merge/combinations/search`

请求包含 `report_id?`、`dataset_id`、当前 `config`、`dimension_signature`、`expand_by`、`page`、`page_size`（1—100）和逐维度筛选。精确模式返回当前用户授权范围内、归并前的完整维度组合分页；按维度展开模式返回去掉 `expand_by` 后的来源匹配组合分页，并在响应中标明展开维度；两者均不返回原始明细。

### POST `/api/v1/reports/_dimension-merge/preview`

请求包含同一报表草稿和待预览规则。返回来源组合数、当前范围命中基础行数、结果组合及是否与已有组合碰撞。

### GET `/api/v1/system-logs/{log_id}/details`

沿用父日志分类权限，分页返回 `report_dimension_merge_diff` 差异明细。父日志仅保存摘要、计数及前后哈希。

## 前端入口

字段编排标题栏增加“维度归并 N”按钮；高级配置抽屉增加“维度归并”一级页签，内部使用左侧规则列表和右侧规则编辑器。无独立路由、菜单或权限点。

## 审计

报表保存继续写一条 `category=report_access, action=update` 父日志。只记录发生变化的规则和组合。敏感值只保存脱敏显示及 HMAC。审计写入失败记录应用错误但不回滚报表保存。
