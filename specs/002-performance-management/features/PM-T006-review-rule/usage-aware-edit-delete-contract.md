# 评估规则使用状态与受限编辑开发契约

```text
completion_status: implementation_completed
pixel_restore_status: blocked
ui_confirmation_status: confirmed
confirmed_by: user
confirmed_date: 2026-08-31
```

## 1. 目标

当评估规则被普通评估题或子评估题引用后，禁止删除并按评估类型限制可编辑字段；未被引用时保留完整编辑能力。删除采用软删除，不改变既有数据库结构。

## 2. 使用状态真源

唯一真源为 `performance_review_questions.rule_id`：

```text
存在任一 performance_review_questions.rule_id = performance_review_rules.id
→ is_used = true
```

普通评估题与子评估题统一适用，不因 `is_sub_question` 取值区别编辑或删除策略。

使用状态必须由后端实时派生，前端不得根据列表位置、规则名称、规则类型或缓存猜测。

## 3. 生命周期与删除

| 状态 | 列表删除 | API 行为 |
| --- | --- | --- |
| `active + unused` | 可用 | `DELETE` 将 `status` 更新为 `inactive` |
| `active + used` | 置灰 | 返回 `409 PERFORMANCE_REVIEW_RULE_IN_USE` |
| `inactive` | 不进入活动列表 | 重复删除按 404 处理 |

删除提示固定为：`此评估规则已被使用，不允许删除`。

禁用删除使用绩效共享系统组件承载：外层命中区提供 `cursor:not-allowed`，复用编辑页禁用评估类型时的红圈斜线鼠标样式；同时通过系统 Tooltip 展示固定原因。disabled button 本身不作为 Tooltip 唯一触发节点。

## 4. DTO 与 API 契约

### 4.1 列表/详情字段

`ReviewRuleOption` 与 `ReviewRuleDetail` 增加：

```json
{
  "is_used": true,
  "deletable": false
}
```

两字段由服务端计算，客户端不得提交。

### 4.2 删除

```text
DELETE /api/v1/performance/review-rules/{rule_id}
permission: performance.configuration.manage
success: 204 No Content
not found/inactive: 404 PERFORMANCE_REVIEW_RULE_NOT_FOUND
used: 409 PERFORMANCE_REVIEW_RULE_IN_USE
```

### 4.3 更新

```text
PATCH /api/v1/performance/review-rules/{rule_id}
```

未使用时允许修改 `name`、`review_type`、`config`、`remark`，行为与新建一致。

已使用时由后端比较持久化旧值与请求新值；请求包含任何未授权变化时返回：

```text
409 PERFORMANCE_REVIEW_RULE_EDIT_RESTRICTED
message: 此评估规则已被使用，部分内容不允许修改
```

前端 disabled/hidden 仅负责体验，不替代服务端校验。

## 5. 已使用规则字段矩阵

### 5.1 通用基本信息

| 字段 | 可编辑 |
| --- | --- |
| 名称 | 是 |
| 语言 | 否 |
| 评估类型 | 否 |
| 备注 | 否 |

### 5.2 评级

| 配置 | 可编辑 | UI |
| --- | --- | --- |
| 评级可参与计算 | 否 | switch 置灰 |
| 等级颜色 | 是 | 保持输入能力 |
| 等级代号 | 是 | 保持输入能力 |
| 等级名称 | 是 | 保持输入能力 |
| 量化分 | 否 | 数字输入置灰 |
| 量化值 | 是 | 保持输入能力 |
| 添加/删除等级 | 否 | 按钮不渲染 |
| 拖拽排序 | 否 | drag handle 置灰且不可触发 |

服务端要求等级数量不变、量化开关不变、各位置量化分不变；只接受上述允许字段变化。

### 5.3 评分

除名称外全部锁定：

- 评分方式置灰；
- 评分上下限置灰；
- 固定分值输入、删除和拖拽置灰；
- 不渲染“添加分值”；
- 小数位数置灰；
- config 与 remark 必须和持久化旧值完全一致。

### 5.4 评分映射等级型

| 配置 | 可编辑 |
| --- | --- |
| 评分方式 | 是 |
| 评分上下限 | 否 |
| 分数子区间规则 | 是 |
| 中间区间边界 | 是 |
| 等级代号/名称 | 是 |
| 小数位数 | 是 |
| 添加/删除区间 | 否 |

服务端要求评分上下限和区间数量不变；除通用锁定字段外，其他映射配置允许更新。

## 6. 组件职责

| 组件 | 新增职责 |
| --- | --- |
| `PerformanceDisabledReason` | 共享 disabled 命中区、not-allowed cursor 和原因 Tooltip |
| `ReviewRuleTable` | 按 `deletable` 切换删除事件或禁用原因 |
| `ReviewRuleManagement` | 加载派生状态、确认软删除、删除后刷新 |
| `ReviewRuleForm` | 根据 `mode + isUsed + reviewType` 生成字段策略 |
| `LevelConfigEditor` | 独立控制结构锁定和量化分锁定 |
| `ScoreConfig` | 整体 readonly 策略 |
| `FixedScoreOptionsEditor` | 锁输入/排序/删除并隐藏新增 |
| `ScoreMappingConfig` | 锁全局上下限和区间增删，保留其余映射编辑 |
| `ScoreIntervalEditor` | 通过 `structureLocked` 隐藏增删区间 |

新建与编辑继续复用同一组件树；不得复制三套编辑表单。

## 7. 并发与事务

规则更新、软删除、评估题创建和评估题改绑必须先锁定同一 `performance_review_rules` 行，再读取使用状态或写入关联，避免以下竞态：

```text
事务 A 检查 unused
事务 B 创建评估题引用
事务 A 继续执行全量编辑/删除
```

数据库 `ON DELETE RESTRICT` 继续保留，但软删除和友好错误由业务 API 负责。

## 8. Given / When / Then

### AC-U01 未使用规则

Given 规则没有普通评估题或子评估题引用  
When 打开编辑页  
Then 评估类型和全部新建页可编辑内容可调整。  
When 删除并确认  
Then 状态变为 `inactive`，规则从活动列表消失。

### AC-U02 已使用删除

Given 任一普通评估题或子评估题引用规则  
When 查看列表  
Then 删除按钮置灰，命中区为 `cursor:not-allowed`。  
When 悬停  
Then 显示“此评估规则已被使用，不允许删除”。  
When 直接调用删除 API  
Then 返回 409 且不修改状态。

### AC-U03 已使用评级

Given 已使用评级规则  
When 打开编辑页  
Then 只开放名称、等级颜色/代号/名称/量化值；量化开关和量化分置灰；等级增删不可见；拖拽不可用。  
When 请求修改锁定字段  
Then 后端返回 409。

### AC-U04 已使用评分

Given 已使用评分规则  
When 打开编辑页  
Then 只允许修改名称，评分配置全部锁定且无添加分值按钮。  
When 请求修改评分配置  
Then 后端返回 409。

### AC-U05 已使用评分映射

Given 已使用评分映射等级型规则  
When 打开编辑页  
Then 名称、评分方式、子区间规则、区间内容和小数位数可编辑；评估类型与评分上下限置灰；无区间添加/删除按钮。  
When 请求改变评分上下限或区间数量  
Then 后端返回 409。

### AC-U06 普通题与子题统一

Given 规则只被子评估题引用  
When 查询列表、编辑或删除  
Then 行为与被普通评估题引用完全一致。

## 9. 非范围

- 不新增数据库字段或迁移；
- 不改变评估题/子评估题自身的创建与编辑字段；
- 不处理周期启动后的规则快照；
- 不将本次行为测试声明为 PM-T006 全功能像素验收通过。
