# 004 AI 原生工作台文档导航

> 定位：本目录是 HR Portal AI 能力的技术宪法、公共协议与公共能力现状台账，不承载具体业务场景的完整任务清单。
> 最后核验：2026-07-18

## 1. 权威边界

| 内容 | 单一真理源 |
|---|---|
| AI 原生开发原则、Capability/Plan/Result/Handler 公共协议 | 本目录 |
| AI 公共能力真实状态和当前缺口 | [current-state-and-gaps.md](current-state-and-gaps.md) |
| HR Agent 产品战略、总架构、长期路线图和业务场景索引 | [HR-Agent建设方案-专家修订版.md](../../HR-Agent建设方案-专家修订版.md) |
| 组织与人员调整业务模型、状态机、API、页面和原子任务 | [008 atomic-tasks.md](../008-hr-adjustment-assistant/atomic-tasks.md) |
| 外部连接、凭证、Pipeline、审批、执行、重试和监控 | [011 implementation-plan.md](../011-universal-connector-platform/implementation-plan.md) |

公式/计算字段是 AI 公共底座的首个技术验证场景；`employee.profile.query` 可作为飞书公共渠道底座的首个低风险、只读受控验证 Capability；组织与人员调整助手仍是 HR Agent 的首个完整高风险业务场景。三者的“首个”口径不同，不互相替代。

## 2. 当前有效规范

1. [ai-native-development-principles.md](ai-native-development-principles.md)：AI 技术宪法和开发准入原则。
2. [current-state-and-gaps.md](current-state-and-gaps.md)：已实现、部分实现、未实现和禁止重建事项。
3. [ai-capability-registry.md](ai-capability-registry.md)：Capability、Plan、Result、Handler、权限、脱敏和 UCP 适配公共协议。
4. [ai-platform-roadmap.md](ai-platform-roadmap.md)：AI 公共平台能力路线图，不承载具体业务任务。
5. [capability-result-envelope-atomic-tasks.md](capability-result-envelope-atomic-tasks.md)：现有 `/ai/chat` 全量迁移到统一结果协议的原子级开发任务；不兼容删除旧顶层字段。

## 3. 历史与专项文档

| 文档 | 当前定位 |
|---|---|
| [architecture-review.md](architecture-review.md) | 历史架构评审与 ADR 依据 |
| [implementation-blueprint.md](implementation-blueprint.md) | Phase 0/1 历史实施蓝图与验收记录 |
| [formula-calculated-field-mvp.md](formula-calculated-field-mvp.md) | 已实施的首个 AI 技术验证场景 |
| [frontend-interaction-wireframes.md](frontend-interaction-wireframes.md) | 历史交互参考，不代表当前入口优先级 |

## 4. 固定阅读顺序

开发新的 AI 功能时依次阅读：

1. 本 README；
2. AI 原生开发原则；
3. 当前状态与缺口；
4. Capability 公共协议；
5. HR Agent 总方案；
6. 对应业务场景的 spec/atomic-tasks；
7. 涉及外部执行时阅读 011 UCP。

业务文档不得重复建设 Capability Runtime、权限闸、审计、Context Packet、UCP Pipeline 或飞书基础设施；公共改动应先回写本目录，再由业务文档引用。
