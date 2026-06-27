---
name: hr_portal_sensitive_three_switches
description: HR报表"关了敏感还脱敏/超管也被脱敏"——三套独立敏感开关,关错地方;计算字段引用列级敏感列对超管也脱敏
metadata:
  type: project
---

HR 提效工具有**三套独立的"敏感"开关**,写不同字段、对超管行为不同,关错地方就关不掉脱敏:

| 开关 | 设置入口 | 写入 | 对超管 |
|---|---|---|---|
| 列级敏感 | **字段管理模块**(数据表字段) | `table_columns.is_sensitive` | **强制脱敏(不豁免)** |
| 分类敏感 | **字段分类模块** | `field_categories.is_sensitive` + `field_category_assignments` | 豁免可见(走 masker `_is_super_admin`) |
| 计算字段绝密 | 新建计算字段的"绝密"开关 | `dataset_calculated_fields.is_sensitive` | **强制脱敏(不豁免)** |

**计算字段脱敏裁决** `_calc_field_masked`(reports/sql_builder.py:635):① `field.is_sensitive`(绝密)→ 对所有人脱敏;② 否则递归依赖,任一依赖**物理列 `col.is_sensitive=True`** 或 `code in sensitive_by_alias`(=分类敏感,超管已豁免)→ 脱敏。**所以引用了列级敏感物理列的计算字段,超管也会被脱敏——这是设计,非 bug。**

**踩坑实例(2026-06-26)**:用户"预估年终奖"计算字段引用 `cost_center_monthly.year_end_bonus_estimate_factor`,该物理列列级 `is_sensitive=true` 残留 → 报表查看时 admin 也显示 `*****`。用户以为关了(实际关的是字段分类那套),列级开关没动。改 `table_columns.is_sensitive=false` 后解决。

**How to apply**:遇到"关了敏感还脱敏/超管被脱敏" → 先查 `SELECT table_name,column_code FROM table_columns WHERE is_sensitive=true;` 和计算字段 `is_sensitive`,定位是哪套开关残留;列级/绝密对超管强制脱敏,分类敏感才超管豁免。语义上想"普通用户脱敏+超管可见"应走**字段分类敏感**,而非列级。连库方式见 [[hr_portal_server_deploy]]。相关:[[hr_portal_field_permission_semantics]]。
