# 017 UI 与交互说明

## 1. 信息架构

不新增独立“参考映射”模块。全系统使用同一个 `MappingWorkspace`，嵌入：

- 数据仓库→数据清洗→数据映射步骤。
- 数据连接→流程编排→数据映射节点。
- UCP `TRANSFORM` 配置区。
- `WAREHOUSE_ASSET_SINK` 映射配置区。
- PushTarget 映射配置抽屉。

允许调用方薄包装组件注入 context、policy、adapter、保存和发布动作；不得复制规则编辑、校验、预览和命中轨迹实现。

## 2. MappingWorkspace 统一结构

### 2.1 Header

显示调用方、来源/目标资产、规则集或调用方配置、公共 DTO schema version、旧格式版本、Schema hash、权限、草稿/发布/重算状态和兼容提示。

### 2.2 规则列表

统一支持添加、删除、启停、展开、复制、拖拽和排序。页面必须分别标识：

- 数据清洗阶段顺序；
- Lookup priority；
- 仅用于展示的 display order。

添加菜单固定提供七类首期插件：字段映射、枚举/值映射、参考 Lookup、默认自映射+例外、类型转换、格式转换、拆分/合并。

### 2.3 规则插件面板

#### `field`

选择一个来源字段和一个目标字段；显示标签、code、类型、敏感、主键和可选状态。禁止选择未登记字段和不允许覆盖的目标主键。

#### `value_map`

维护源值→目标值；支持批量粘贴、重复源值提示、未命中保留/默认/置空/标记/拒绝；兼容旧对象和 `[{from,to}]` 数组。

#### `reference_lookup`

配置参考数据集、输出字段、多条 priority 规则、来源字段、参考字段、固定条件和命中动作。命中动作支持“命中即停止、继续、仅填空”。重复异结果阻断发布。

#### `identity_with_overrides`

显示总数、默认自映射、例外、未映射、冲突；只编辑例外。支持批量新增/删除例外、只看变化和预览实际结果，不录入全量自映射行。

#### `type_convert`

配置源/目标类型和失败策略；UI 只展示 caller policy 允许的受控类型转换，不允许表达式。

#### `format`

配置日期、大小写、trim、补齐、截断、受控正则和单位换算子类型。必须显示输入输出样例和失败策略。

#### `split_merge`

配置 split/merge、来源字段、目标字段、分隔符和空值策略；目标字段重复、循环和主键覆盖必须即时提示。

### 2.4 Preview

统一显示原值、命中规则、priority、参考键、目标值、错误原因和字段级差异。工资额外显示工号命中、甲方命中、默认工资、冲突统计；成本中心显示默认自映射与例外统计。

### 2.5 Caller policy 区

Workspace 按 `MappingCallerPolicyV1` 渲染调用方限制；policy 至少显示规则可用性、来源/目标 Schema hash、只读字段、主键保护、可用参考数据集、legacy 状态和可执行效果。调用方不得用隐藏字段绕过 policy。

- Warehouse：`warehouse.modeling`，ODS/DWD、012 规则阶段、DWD 门禁和重算影响。
- Workflow：`ucp.pipelines`，节点输入/输出 Schema、错误处理和试运行。
- UCP TRANSFORM：`ucp.pipelines`，UCP Transform Legacy v1 或 Component v1 的版本和兼容状态。
- Sink：`ucp.pipelines` 加 Sink 资产权限，已发布资产、只读复合主键、期间、字段白名单、批次和写入模式。
- PushTarget：`warehouse.service`，目标字段、发送上下文和旧 `field_mappings` 提示。

被 policy 禁止时显示稳定错误码和业务原因；调用方 RBAC 不足显示 403，不得伪装成公共组件不支持。

### 2.6 Footer

公共组件提供校验、预览和 dirty 状态；保存、发布、重算、流程试运行或推送测试由调用方提供。发布成功和下游重算成功必须分开展示。

## 3. 兼容交互

- 旧配置打开时显示来源格式和 adapter 状态。
- 可无损回写时允许保存；保存后重开语义必须一致。
- 只能读取但不能无损回写时，允许预览但禁止保存，并列出无法保留的字段。
- 未识别字段保存在 compatibility metadata，禁止静默删除。
- 升级旧节点必须二次确认，并保留可回滚快照。

## 4. 状态覆盖

统一覆盖 loading、empty、forbidden、schema_changed、conflict、unsaved、validating、preview_failed、published、rebuild_pending、rebuild_failed、legacy_readonly、lossy_write_blocked。

## 5. 数据清洗

`WarehouseDataRecipe.vue` 保留步骤流和 DWD 上下文，但七类规则编辑区替换为统一 `MappingWorkspace`。012 既有 `deduplicate`、`null_handling` 等数仓专属清洗能力可由 caller extension 展示，不复制公共七类插件。

工资页面明确：当前兼容期旧逻辑仍在同步服务；目标是 ODS 不写 `expense_type`，DWD 由费用类型规则生成。保存/发布必须展示差异、DWD 门禁和依赖影响。

## 6. 流程编排和 UCP

原字段转换节点统一展示为“数据映射节点”，旧节点兼容回显。UCP `TRANSFORM version=1` 通过 adapter 打开；新规则无法被 v1 无损表达时必须显式升级 DTO 版本，不能偷偷扩展 v1。

流程引擎继续负责上下文、顺序、条件、重试、执行记录和入库动作。

## 7. Sink 与 PushTarget

Sink 嵌入同一 Workspace，但资产、主键、期间、白名单、批次和写入模式仍由 Sink 表单和后端合同控制。PushTarget 嵌入同一 Workspace，发送、凭证和错误合同不进入公共组件。

## 8. 发布确认

展示 DTO/配置版本、Schema hash、规则校验、命中统计、冲突/未命中、受影响 DWD/流程/UCP/Sink/PushTarget、兼容转换和重算策略。复制上月和旧配置升级默认不能自动发布。

## 9. UI 验收

- [ ] 七类规则菜单、表单、校验和预览全部存在。
- [ ] 各入口实际挂载同一 `MappingWorkspace`，而非视觉相似的独立实现。
- [ ] 调用方薄包装只负责 context、policy、adapter 和业务动作。
- [ ] 优先级、阶段顺序和展示顺序不会混淆。
- [ ] 成本中心只维护例外。
- [ ] 工资 ODS/DWD 边界和兼容期状态清晰。
- [ ] 旧节点/旧配置可无损回显、执行、保存和重开。
- [ ] 未知旧字段和有损回写被阻断，不静默丢失。
- [ ] Sink 强约束不会被映射 UI 绕过。
- [ ] 所有异常和重算失败状态可恢复。