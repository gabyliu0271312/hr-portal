# R0101 标准化规则范围澄清与统一 rule_type 枚举

> 决策日期：2026-07-06
> 适用范围：R0102-R0107 所有标准化规则相关任务
> 地位：唯一权威依据 — 后续任务不得引用其他规则表名或枚举定义

---

## 1. 核心决策

**只用一张 `standardization_rules` 表承载 ODS→DWD 的全部字段级转换规则。**
不建 `transform_rules` 表，不建独立的"去重规则表""空值规则表""格式规则表"。

### 设计原因

原文档存在四套平行设计：
- R0101 `transform_rules`（覆盖派生/枚举映射/格式标准化/空值处理）
- R0105 `standardization_rules`（覆盖重命名/类型转换/枚举映射/单位转换/拆分合并）
- R0102-R0104 各自独立成任务（去重/空值/格式标准化）

四者对同一类"字段级转换规则"给出了不一致的建模方式，会导致：
- 同一字段的多种清洗动作分散在多张表，编排和执行困难
- 规则执行顺序无法统一控制（先重命名还是先类型转换？）
- 影响分析和血缘追踪需要跨多表 JOIN
- 前端需要对接多套 CRUD API

**统一为一张表 + 一个 `rule_type` 枚举后**，同一字段的多条规则按 `display_order` 排序执行，所有清洗动作在一条链路中完成。

---

## 2. rule_type 枚举定义（8 类）

| # | rule_type | 中文 | 作用 | rule_config 示例 | 优先级 |
|---|-----------|------|------|------------------|--------|
| 1 | `rename` | 字段重命名 | 将源字段名映射为目标字段名 | `{"target_name": "emp_status_cn"}` | 最先执行 |
| 2 | `type_convert` | 类型转换 | 转换字段数据类型 | `{"target_type": "int", "on_error": "set_null"}` | 第二 |
| 3 | `value_map` | 枚举/值映射 | 离散值→标准值映射 | `{"mappings": {"A":"在职","B":"离职"},"unmapped":"keep"}` | 第三 |
| 4 | `unit_convert` | 单位转换 | 数值单位换算 | `{"from_unit": "分", "to_unit": "元", "multiplier": 0.01}` | 第四 |
| 5 | `split_merge` | 拆分/合并 | 单字段拆分或多字段合并 | `{"action": "split", "delimiter": ",", "target_fields": ["姓","名"]}` 或 `{"action": "merge", "sources": ["first_name","last_name"], "delimiter": ""}` | 第五 |
| 6 | `deduplicate` | 去重 | 按业务主键/字段组合去重 | `{"by": ["emp_id", "period"], "keep": "first"}` | 第六 |
| 7 | `null_handling` | 空值处理 | 填默认值/标记/取上游值 | `{"strategy": "fill_default", "default": "未知"}` | 第七 |
| 8 | `format_standardize` | 格式标准化 | 日期/编码/大小写/空格/长度 | `{"format": "date", "from_format": "yyyyMMdd", "to_format": "yyyy-MM-dd"}` | 最后执行 |

### 执行顺序规则

- 同一字段的多条规则按 `display_order` ASC 执行
- 默认顺序为 `rule_type` 的自然语义顺序（上表优先级列）
- `rename` 必须在最前面（后续规则操作的目标字段名由 rename 决定）
- `format_standardize` 必须在最后面（格式化通常依赖前面已完成的值映射和空值处理）

---

## 3. standardization_rules 表结构

R0102 的 ORM 必须基于以下字段定义：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | BIGINT PK | autoincrement | 规则 ID |
| `asset_type` | VARCHAR(16) | NOT NULL | `table` / `dataset` |
| `asset_code` | VARCHAR(256) | NOT NULL | ODS 表名或 DataSet ID |
| `rule_type` | VARCHAR(32) | NOT NULL | 8 类枚举之一 |
| `source_field` | VARCHAR(128) | NOT NULL | ODS 源字段名 |
| `target_field` | VARCHAR(128) | NOT NULL | DWD 目标字段名 |
| `rule_config` | JSON | NOT NULL, DEFAULT '{}' | 规则参数（类型相关） |
| `enabled` | BOOLEAN | NOT NULL, DEFAULT TRUE | 是否启用 |
| `display_order` | INT | NOT NULL, DEFAULT 0 | 同字段多条规则的执行顺序 |
| `description` | VARCHAR(512) | NULL | 规则说明/备注 |
| `created_at` | DATETIME | NOT NULL | |
| `updated_at` | DATETIME | NOT NULL | |

### 约束

- `(asset_code, source_field, target_field, rule_type)` 联合唯一
- `asset_code` 只允许引用 ODS 层资产（`warehouse_layer = 'ODS'` 的 RegisteredTable/DataSet）
- 规则声明方向 **只能** 是 ODS→DWD，不可配置为覆盖 ODS 原始表

---

## 4. 禁止项

- ❌ 不建 `transform_rules` 表
- ❌ 不建独立的 `deduplication_rules` / `null_handling_rules` / `format_rules` 表
- ❌ `rule_config` 不接受任意 SQL 片段或 Python 表达式
- ❌ 不允许声明非 ODS→DWD 方向的规则（如 DWD→DWS 直接用 R03 的聚合定义）

---

## 5. R0102-R0107 强制引用

| 后续任务 | 必须引用 | 说明 |
|----------|----------|------|
| R0102 | 本文档 §3 表结构 | ORM/migration 按此字段建模 |
| R0103 | 本文档 §2 枚举 | 8 类 `rule_type` 校验 |
| R0104 | 本文档 §2 前 5 类 | 结构转换引擎 |
| R0105 | 本文档 §2 后 3 类 | 清洗引擎 |
| R0106 | 本文档 §3 表名 | 模板加载到 standardization_rules |
| R0107 | 本文档 §2 全部 | 预览覆盖所有 8 类规则 |
| R0108 | 本文档 §2 全部 | DWD 视图基于全部 8 类规则生成 |
