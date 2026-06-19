# HR Portal AI 文档动作约定

日期：2026-06-19

## 背景

全局 AI 已有补偿金只读试算能力。补偿金试算后，需要支持用户继续在对话中要求预览或打印解除协议。

## 约定

- 继续坚持 LLM-first：`ai.chat` 路由由大模型意图分类决定，各能力的语义槽位由 LLM extractor 输出；不要在调度层、handler 或前端用关键词/正则判断“预览”“打印”。
- 补偿金 extractor 输出结构化 `followup_action`，例如 `calculate`、`agreement_preview`、`agreement_print`。确定性代码只做上下文合并、权限校验、参数完整性校验和 action 组装。
- 后端返回给前端的文档动作使用通用 action type：`document_preview` / `document_print`。action query 中携带 `business_type`、`template_code`、`source_capability_id`、`employee_id`、`leave_date`、`plan`、`region` 等已校验参数。
- 前端应抽取可复用的文档 action 组件，内部复用 `DocumentPaperPreview.vue` 和业务 API。补偿金解除协议只是第一个调用方，后续收入证明、协议草稿、其他模板预览/打印应接同一组件。
- 预览不写数据；打印是用户明确发起的 export 类动作，必须走业务接口和生成日志，不能绕过模板、权限、数据范围和字段白名单。
