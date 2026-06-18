---
name: hr_portal_chatbi_queryspec
description: HR提效工具 AI 自然语言查数走 Text-to-QuerySpec + 指标语义层,禁止模型生成裸 SQL
metadata:
  type: project
---

HR 提效工具的"自然语言查数据/ChatBI"需求,架构定调为 **Text-to-QuerySpec**,不是 Text-to-SQL。

- 模型只产 QuerySpec(白名单 JSON:选指标/维度/筛选),后端 QuerySpec Compiler 用预定义口径和 Join Path 编译成参数化 SQL。SQL 永不经模型的手。
- 行级 scope_filter + 列级 masker 在编译期强制注入,模型无从绕过。
- 新增资产:指标语义层 4 张表(ai_semantic_datasets/dimensions/metrics/join_paths);不开放任意 join,只走预定义 Join Path;指标口径由管理员定义、模型只引用不创造。
- 落点:Phase 2 新增能力 data.query + data.explain_result;Phase 0 地基需预留 semantic_layer/query_spec 扩展位(Context Packet / Capability schema / Tool Wrapper)。
- 已写入 specs/004-ai-native-workbench:architecture-review §8.7+§6+ADR-AI-010、roadmap 能力地图与 Phase 2、ai-capability-registry §6.3、implementation-blueprint §12。

**Why:** 权限管控是底线,让模型拼 SQL 等于绕过现有 require_op/scope_filter/脱敏。附件原需求是裸 Text-to-SQL,被否决。
**How to apply:** 后续做这块时引用 ADR-AI-010;口径定义/争议/版本化是后续治理待办,基础阶段只建注册表结构+编译器接口,不阻塞地基。关联 [[hr_portal_system]]。
