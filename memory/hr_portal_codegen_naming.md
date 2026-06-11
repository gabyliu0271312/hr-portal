---
name: hr-portal-codegen-naming
description: 表名/字段 code 自动命名机制——AI主译+规则兜底+label复用防漂移,建表与同步共用
metadata:
  type: project
---

# Codegen 命名机制(2026-06-11 升级）

**Why 记这条**：表名/字段的英文 code 是数据库标识符,一旦落库改名就是连环迁移(改 raw key + 所有 config 的 alias.code + relation keys + 表达式索引,见 [[hr-portal-pitfalls]] 命名迁移)。所以"命名当下起对"至关重要。这次把命名生成器从"纯规则吐废名"升级成三层。

## 核心机制:三层定 code

含中文的新字段/新表,按顺序定 code:

1. **同中文 label 复用已有 code**(防漂移地基)——新字段先按 `column_label`(中文)查库,命中就复用那个 code,**根本不进 codegen/AI**。同 label 多条时取 `display_order` 最小(最早建)。这条保证同一字段多次同步 code 不漂移,也让 AI 永远只对真·全新字段调一次。
2. **AI 翻译**——复用不到才调。中文→英文 snake_case 标识符。
3. **规则兜底**——AI 失败/超时/未配置时。已不再吐 `field`/`employee` 误导名,翻不全的标 `_to_rename` / `unnamed_field`,管理员可在字段管理页按关键字筛出待改。

## 关键文件

- `backend/app/codegen/service.py` — `ai_translate_code()`：AI 翻译核心,**下沉到 service 层避免循环 import**(router 和 sync 都从这里 import,别从 router import)
- `backend/app/codegen/rules.py` — `normalize_code`/`deterministic_code`/`unique_code`：规则层 + 兜底。HR_TERM_MAP 是中文词→英文映射表,补词在这里;剥"表"后缀、`_mark_untranslated` 兜底也在这
- `backend/app/codegen/router.py` — `/codegen/suggest` 接口,建表/字段前端 `SmartCodeInput` 组件调它。走能力注册表 + policy guard
- `backend/app/datasources/sync_service.py` — `_ensure_columns()`：同步自动发现字段,三层逻辑在此(~218-255 行)
- `backend/app/ai/capabilities.py` — `codegen.suggest` 能力条目(low/draft_only/fast_json)

## 治理合规(Phase 0)

AI 调用走能力注册表 `codegen.suggest` + `validate_capability_policy` 闸门,不是绕过治理的野生调用。`formula.generate` 早就启用了 AI,所以 codegen 接 AI 在既定轨道内。

## 踩坑

- **第三方 AI 端点(aiapi.uu.cc)不遵守 `response_format=json_object`**——初版 prompt 命中率 1/4(模型返回 markdown 表格)。靠强化 prompt(明令禁止 markdown + 给 JSON 示例)拉到 5/5。改 codegen prompt 时务必保留"Output a single raw JSON object and NOTHING else"+ 示例。
- 旧 bug(已修):同步去重原本按 `column_code` 匹配而非中文 `label`,导致同字段重译生成 `xxx_2`。现按 label 复用。
- 前端 `SmartCodeInput` 已支持显示来源(AI生成/规则生成)+ 可编辑,接 AI 后**前端零改动**自动生效。

## 人工确认始终在

AI 只做候选,最终 code 用户能在 `SmartCodeInput`(建表)或字段管理页(同步后)改。AI 的不确定性被"人可改 + label 复用"双重兜住。
