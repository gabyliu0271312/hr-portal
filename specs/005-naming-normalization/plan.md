# 命名规范化原子迁移 — 实施计划

## 背景与根因

今天的表迁移后,"成本分摊→配置→数据重塑"下拉框失效。排查暴露出三层命名问题,本次一次性根治:

1. **两张动态表名词不达意**:`field`(实为补偿金分期发放表)、`bonus`(实为年终奖金发放表)
2. **字段 code 错乱**:`field`/`field_2/3/4`、`bonus`/`field`(币种)——表名与字段 code 撞名
3. **数据集别名误导**:dataset 4 别名(`realtime`→分摊表、`roster`→成本中心)与指向严重脱节;源头是 `DatasetEdit.vue` 的硬编码 `_shortAlias` 简称机制

**决策(用户拍板)**:别名直接 = 物理表名,废除简称机制;新建视图 UI 只显示一个名称(去掉别名输入框)。

## 影响面(已实测)

- 引用 dataset 4 的对象:**scheme 1「员工月度成本分摊」+ report 5「测试报表」**,仅此 2 个
- 数据量:`field` 11 行 / `bonus` 1 行
- 别名/动态表名**均不在代码硬编码**,纯 DB 驱动 → 代码侧改动极小
- 动态表由 `registered_tables` + `dynamic_loader.load_dynamic_tables` 驱动,改表名后重启即按新名加载

## 命名映射(最终)

### 物理表
| 现 | 新 | 中文 |
|---|---|---|
| `field` | `emp_severance_installment` | 补偿金分期发放表 |
| `bonus` | `emp_year_end_bonus` | 年终奖金发放表 |

### 字段 code
`emp_severance_installment`:`field`→`installment_1`、`field_2`→`installment_2`、`field_3`→`installment_3`、`field_4`→`installment_4`
`emp_year_end_bonus`:`bonus`→`bonus_year`、`field`→`currency`

### dataset 4 别名(= 物理表名)
| 现别名 | 新别名 |
|---|---|
| `salary` | `emp_monthly_salary` |
| `realtime` | `emp_monthly_allocation` |
| `roster` | `cost_center_monthly` |
| `allocation` | `emp_year_end_bonus` |
| `cc` | `emp_severance_installment` |

## 执行步骤(单事务原子迁移脚本 `migrate_rename_normalize.py`)

### A. 物理层(SQL,在一个事务内)
1. `ALTER TABLE field RENAME TO emp_severance_installment`;`bonus RENAME TO emp_year_end_bonus`
2. 同步改名:序列 `field_id_seq`/`bonus_id_seq`、约束 `*_pkey`/`uq_*_pk`、索引 `ix_*_pk_hash`、表达式索引 `ix_jk_*`(避免旧名残留)
3. 重写两表所有行的 `raw` JSON key(字段 code 迁移):`field`→`installment_1` 等
4. 重建依赖字段 code 的表达式索引 `ix_jk_*`(指向新 key)

### B. 元数据层
5. `registered_tables`:更新 `table_name`(field→新、bonus→新)
6. `table_columns`:更新 `table_name` + 这两表的 `column_code`(字段迁移)
7. `dataset_tables`(dataset 4):更新 `table_name`(field/bonus 行)+ 全部 5 行 `alias`=物理表名

### C. 关联层
8. `dataset_relations`(dataset 4,relation 51-54):
   - `left_alias`/`right_alias` 按别名映射重写(realtime→emp_monthly_allocation 等)
   - `keys[].left/right` 中涉及 field/bonus 表的字段 code 同步(如 `bonus_month` 不变、确认无 field_* 出现)

### D. config 层(复用 `migrate_config(cfg, amap)`)
9. scheme 1 `config`:
   - columns/sorts/filters/transpose 全量按 **(别名映射 + 字段 code 映射)** 重写
   - 含今天遗漏的 `transpose.rules`(已修脚本):`salary.推荐奖`→`emp_monthly_salary.referral_bonus`、`roster.名称`→`cost_center_monthly.name`、`salary.应发工资(含补偿金)`→`...gross_salary_including_compensation`
10. report 5 `config`:同样按别名映射重写(`realtime.* / salary.* / roster.*` → 新别名前缀)

### E. 代码层
11. **修源头** `DatasetEdit.vue`:删除 `_shortAlias` 简称 map,新建视图时 `alias = table_name`;UI 去掉别名输入框,只留"选源表"下拉(满足"只显示一个名称")
12. `DataTableView.vue`:详情页标题中文名后显示英文表名(已改,等迁移后自动显示新名)
13. 已修复(本会话):`ReportTransposeConfig.vue` / `ReportFilterList.vue` 的中文 distinct 硬编码 → 英文 code;`migrate_allocation_schemes.py` 的 rules key bug

### F. 迁移资产更新(供未来重跑)
14. `code_migration.json` / `field_mapping.json`:补 `emp_severance_installment`/`emp_year_end_bonus` 两表的字段映射条目

## 安全措施

- **全程单事务**:A–D 在一个 DB 事务内,失败整体回滚,绝不留半新半旧
- **先备份**:`pg_dump` 全库,文件名带时间戳存 `backups/`
- **先 dry-run**:打印所有将变更的对象(表名/字段/别名/config diff),用户确认后再 `--apply`
- **验证脚本**:迁移后自动校验——两表新名可查、raw key 全英文新 code、scheme 1/report 5 config 无中文引用、relation 别名一致、下拉接口 distinct 返回非空

## 验收

1. 数据视图能打开两张新表(标题显示中文名 + 新英文表名),数据完整
2. 成本分摊→配置→数据重塑下拉框恢复有数据
3. scheme 1 跑一次分摊计算结果与迁移前一致
4. 新建视图时别名自动=表名,UI 只显示一个名称
5. 全库无 `field`/`bonus` 旧表名残留(除无关的 field_categories 等)

## 漏网点教训(2026-06-11 补)

首版迁移脚本只覆盖了 `allocation_schemes` / `reports` 的 config,**漏了 `dataset_calculated_fields` 表**(计算字段)。该表的 `depends_on`(JSON 数组)、`formula`(`FIELD("alias.col")`)、`formula_display`(含中文 code)三字段都引用别名+字段 code,迁移后成悬空旧别名,导致成本分摊「计算」时 `KeyError('cc')`/`KeyError('allocation')` → 前端报 `参数校验失败：'cc'`(后端 `str(KeyError)` 转 422 detail)。补丁脚本:`scripts/fix_calc_fields_dataset4.py`。

**未来任何别名/字段 code 迁移,引用面核对清单**(凡是存"alias.code"字符串的地方都要扫):
- `allocation_schemes.config` / `reports.config`(columns/sorts/filters/value_rules/aggregations/transpose/rounding_corrections)
- `dataset_calculated_fields`:`depends_on` + `formula` + `formula_display` ← **最易漏**
- `dataset_relations`:`left_alias`/`right_alias` + `keys[].left/right`
- `dataset_tables`:`table_name` + `alias`
- `table_columns`:`table_name` + `column_code`
- 物理表名/序列/约束/索引(含 `ix_jk_*` 表达式索引)

诊断手法:报错 `参数校验失败：'xxx'`(纯字段名带引号)= 后端 `str(KeyError)` → 422,用 `print(traceback.format_exc())` 临时插桩抓真实栈,定位到 `sql_builder.py:699` 的 `alias_to_model[a]`。

