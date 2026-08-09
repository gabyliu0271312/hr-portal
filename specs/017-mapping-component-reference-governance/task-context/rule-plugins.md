# Rule Plugins 上下文包

## 任务

M0110-M0116。每个规则类型是独立执行单元；公共 core 验收后，允许在不修改共享 registry 文件的前提下隔离并行。涉及 registry 注册的合并必须串行。

## 前置

- A0001-A0009、M0101-M0105 已验收。
- M0120 的公共字段/Policy 校验接口已可用；未完成时插件只能实现纯规则逻辑和 fixture，不得接入页面。

## 必读

- `../spec.md` §4.2-§4.4
- `../ui-interaction.md` §2.3
- `../testing-acceptance.md` §2
- `../ai-execution-protocol.md` §7-§9
- `component-core.md`

## 允许修改

- `hr-portal/backend/app/mapping/rules/<rule_type>.py`（新增）
- `hr-portal/backend/tests/test_mapping_rule_<rule_type>.py`（新增）
- `hr-portal/frontend/src/components/mapping/rules/<RuleType>Editor.vue`（新增）
- `hr-portal/frontend/src/components/mapping/rules/<RuleType>Editor.spec.ts`（新增）
- 由主代理串行修改 `hr-portal/backend/app/mapping/rule_registry.py`
- 由主代理串行修改 `hr-portal/frontend/src/components/mapping/ruleRegistry.ts`

## 禁止修改

- DTO、Policy、executor 核心接口。
- 调用方页面、adapter、标准化引擎、Sink、PushTarget。
- 任意业务表、migration。

## 统一输入/输出

输入：`MappingRuleV1` 对应 discriminated config、内存 `row(s)`、服务端已校验 policy、预加载 reference snapshot。

输出：转换后的内存行、`MappingResultV1.trace`、稳定错误码。插件不得写库、访问网络、创建事务或读取凭证。

## 子任务卡

### M0110 `field`

- 输入：一个 source、一个 target、`mode: rename|copy`。
- 输出：rename 删除源字段；copy 保留源字段。保护主键/只读目标由公共校验拒绝。
- 必测：同名、目标冲突、缺源、受保护目标、敏感 trace。

### M0111 `value_map`

- 输入：`mappings`、`unmatched`、可选 `defaultValue`。
- 必测：命中、keep、default、null、flag、reject、旧对象/数组规范化、重复源值。
- 禁止：用未受控表达式或任意正则替代映射。

### M0112 `reference_lookup`

- 输入：受控 `referenceDatasetId`、`outputMap`、排序 `matchRules`、固定 conditions、`onMatch`、`unmatched`。
- 必测：priority、use_and_stop、continue、only_fill_empty、默认值、空值、重复同结果 warning、重复异结果 `MAPPING_LOOKUP_CONFLICT`、预加载无 N+1。
- 禁止：自由 Join、任意物理表名、每行查询数据库。

### M0113 `identity_with_overrides`

- 输入：`defaultBehavior: keep_source`、稀疏 `overrides`。
- 必测：默认透传、例外覆盖、未映射策略、无冗余自映射行、冲突目标。

### M0114 `type_convert`

- 输入：受控标量 `targetType`、`onError`。
- 必测：成功转换、keep/null/flag/reject、非法类型、前导零字符串保护、敏感 trace。

### M0115 `format`

- 输入：注册表中 `formatType`、`options`、`onError`。
- 必测：日期、trim、大小写、补齐、截断、单位换算、受控正则、非法 options。
- 禁止：用户输入可执行脚本；正则必须有长度和安全限制。

### M0116 `split_merge`

- 输入：`action`、`delimiter`、`nullBehavior`、source/target arrays。
- 必测：split、merge、字段数量不符、循环、重复 target、主键保护、空字段。

## 完成证据

每个子任务必须提供：规则 fixture、正常/异常测试、UI 表单测试、trace 样例、稳定错误码、未修改禁止文件证明。

## 阻塞条件

- 发现 DTO 或 Policy 无法表达业务需求；
- 需要新增公共错误码；
- 需要改 executor/core；
- 需要调用方上下文才能完成规则算法。

出现阻塞时不得自行修改 core，提交主代理审核。

## 不在范围

- 修改 DTO、Policy、executor 核心接口或调用方 adapter；
- 修改业务表、migration、标准化引擎、Sink、PushTarget；
- 把规则正文写入 `standardization_rules` 以外的新事实源。
