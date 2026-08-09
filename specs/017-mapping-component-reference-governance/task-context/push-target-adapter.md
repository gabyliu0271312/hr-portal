# PushTarget Adapter 上下文包

## 任务

U0420-U0423。

## 前置

- Foundation、Component Core、Rule Plugins 已验收。

## 必读

- `../spec.md` §4.9、§6
- `../testing-acceptance.md` §4 PushTarget
- `hr-portal/backend/app/push/router.py`
- `hr-portal/backend/app/push/push_service.py`
- `hr-portal/frontend/src/components/push/PushFieldMapper.vue`
- `hr-portal/frontend/src/components/push/PushTargetDialog.vue`

## 允许修改

- `hr-portal/backend/app/mapping/adapters/push_target_legacy.py`（新增）
- `hr-portal/backend/app/push/router.py`
- `hr-portal/backend/app/push/push_service.py`
- `hr-portal/backend/tests/test_push_mapping_adapter.py`（新增）
- `hr-portal/backend/tests/test_push_service_entity.py`
- `hr-portal/frontend/src/components/push/PushFieldMapper.vue`
- `hr-portal/frontend/src/components/push/PushTargetDialog.vue`
- `hr-portal/frontend/src/components/push/PushTargetDialog.spec.ts`（新增）

## 禁止修改

- 凭证加密/解密逻辑。
- PushTarget 调度和外部发送协议。
- Sink、Warehouse、UCP Legacy v1。

## 输入合同

- 旧 `field_mappings: [{source,target}]`；
- `MappingCallerPolicyV1(caller='push_target')`；
- 当前 PushTarget source/target schema。

## 输出合同

- 旧字段映射可读取、转换、编辑、无损回写；
- 空映射仍原样推送；
- 新公共规则只在 caller policy 和发送策略允许时可用；
- 发送、凭证、调度、错误合同仍由 PushTarget 负责；
- 不能无损表达的 legacy 字段保留并阻断保存。

## 测试合同

Given：空 mapping、普通 mapping、未知字段、敏感字段、不同 PushTarget 类型。

When：打开、保存、重开、手工运行、API expose。

Then：推送 payload 与旧实现一致；权限仍使用 `warehouse.service`；无凭证泄露；有损回写阻断。

## 完成证据

- 空映射、普通映射、未知字段和敏感字段 fixture；
- 保存/重开、手工运行和 payload 对比测试真实输出；
- Workspace 真实挂载组件测试；
- `git diff` 证明未修改凭证、调度和外部发送协议。

## 不在范围

- 修改凭证加密/解密、调度、外部发送协议或发送错误合同；
- 修改 Sink、Warehouse 或 UCP Legacy v1 语义。

- 需要改变发送协议或凭证模型；
- 新规则会改变旧空 mapping 原样推送语义；
- 无法保留旧 field_mappings 字段。
