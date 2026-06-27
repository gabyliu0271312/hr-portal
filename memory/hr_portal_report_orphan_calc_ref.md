---
name: hr_portal_report_orphan_calc_ref
description: 报表"计算字段已删除"告警反复出现的完整根因——孤儿引用藏在 columns+column_settings,删除守卫漏检 key,且生产前端长期未部署
metadata:
  type: project
---

报表查看时反复弹「报表引用的计算字段「calc.xxx」已被删除,已自动跳过」一串告警(2026-06-26 成本分摊表 id=3,7个 calc 字段)。排查多轮,完整根因链:

**1. 孤儿引用的产生(源头)**:删除计算字段是软删(`is_active=false`),删除守卫 `_calc_field_reference_reasons` 调 `_json_refs_column(report.config,...)` 检查是否被引用。但 `_json_refs_column`(columns_router.py:166)**只递归 dict 的 value、不看 key**,而 `column_settings` 以 `calc.xxx` 为 key 持有引用 → 漏检 → 字段被误删 → 报表 config 留下孤儿。

**2. 孤儿藏身两处**:`config.columns`(选中列)和 `config.column_settings`(以字段限定名为 key 的聚合/拆分设置)。后端取数只认 `is_active=true` 计算字段(sql_builder active_calculated_fields),孤儿 calc 解析不到 → sql_builder.py:1272 逐个告警。告警**只由 columns 触发**;column_settings 的孤儿要清不然换前端版本后又会被读回 columns。

**3. 为什么"保存清不掉/反复"**:① 前端 buildPayload 原本不过滤孤儿;② 即便加了过滤,**生产前端长期没部署**(git log 停在旧 commit,改了推了 GitHub 但没 `docker compose up --build`)——用户每次"编辑保存"用的都是旧版前端,清不掉还把孤儿写回 columns。**这是"修了却反复"的总症结:代码改了 ≠ 生产生效。**

**修复(commit 链,2026-06-26)**:dbfe7a4 过滤 columns / 69948e9 过滤 column_settings(前端 buildPayload 按 allColumns 剔除孤儿,守卫 length 非空防误删)/ f23a38d 守卫 `_json_refs_column` 同时按 key 精确匹配字段限定名(源头杜绝)。存量用 SQL 清(jsonb_set 重建 columns/column_settings,WHERE 过滤掉指向非 active calc 的项)。

**How to apply**:
- 再遇此告警先用 `json_each(config)` 定位 calc 引用藏在哪个 section(别凭印象),columns 和 column_settings 都要查。
- **每次改完必须确认生产真部署**:`git log --oneline -5` 看生产 commit;前端改动必须 `docker compose up -d --build frontend`,光 restart 不生效(代码 COPY 进镜像)。
- 相关:[[hr_portal_report_dangling_field_ref]](早期只覆盖 columns 的不完整版)、[[hr_portal_server_deploy]]。
