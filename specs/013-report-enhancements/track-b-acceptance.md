# Track B 验收记录：重复报表列实例

> 规格：`specs/013-report-enhancements/spec.md`
>
> 记录日期：2026-07-17
>
> 状态说明：自动化用例由本地工作区执行；需要真实浏览器、已授权账号和可用数据集的步骤不能由当前命令行环境伪造，统一标记为“待人工执行”。

## 1. 自动化验收证据

| 编号 | 验收目标 | 自动化证据 | 状态 |
|---|---|---|---|
| A01 | 旧 `string[]` 自动升级为首实例 | `test_track_b_report_column_instances.py`、`test_legacy_string_columns_keep_export_path_compatible` | 通过 |
| A02 | 同源字段按 `instance_id` 独立投影、聚合和排序 | `test_report_duplicate_instances_project_and_aggregate_independently` | 通过 |
| A03 | 输出、导出和推送保留 `r.amount` / `r.amount#2` 与区分标签 | `test_duplicate_instances_keep_export_and_push_identifiers` | 通过 |
| A04 | 失效输出实例在保存、运行、导出、推送返回 `422` | `test_track_b_report_runtime_validation.py` | 通过 |
| A05 | 所有查询前 `source_code` 引用均进入元数据与权限校验 | `test_iter_report_source_references_covers_all_query_time_source_codes` | 通过 |
| A06 | 不存在、不可见、无权限、失效计算字段依赖返回 `422` | `test_track_b_report_field_validation.py` | 通过 |
| A07 | 历史无效筛选在运行、导出与推送前被阻断 | `test_invalid_filter_returns_422_in_run_export_and_push_paths` | 通过 |
| A08 | AI 解释保留 `ColumnInstance` 语义 | `test_track_b_ai_column_instances.py` | 通过 |
| A09 | 前端类型契约和生产构建 | `npm.cmd run build` | 通过 |
| A10 | 移除字段时按 `instance_id` 清理排序、聚合、分摊与舍入依赖 | `src/utils/reportColumnDependencies.spec.ts` | 通过 |

## 2. 浏览器人工验收用例

### 环境与证据

- 执行人：待填写。
- 执行日期：待填写。
- 数据集：待填写（至少包含一个数值度量字段，例如 `r.amount`）。
- 报表 ID：待填写。
- 截图或录屏目录：待填写。
- 网络响应或保存 payload：待填写。

| 编号 | 操作步骤 | 期望结果 | 状态 | 证据 |
|---|---|---|---|---|
| M01 | 在报表设计器连续两次点击同一数值字段 | 工作台显示“金额”和“金额 (2)”，配置列为 `r.amount`、`r.amount#2` | 待人工执行 | 待补充 |
| M02 | 第一实例设 `SUM`，第二实例设 `COUNT`；保存并刷新 | `aggregations` 和 `column_settings` 以两个不同 `instance_id` 为键；重新加载后不丢失 | 待人工执行 | 待补充 |
| M03 | 将第二实例拖到第一实例前，保存并重新打开 | 列顺序保持，排序/配置不串列 | 待人工执行 | 待补充 |
| M04 | 删除首实例 `r.amount` | `r.amount#2` 仍保留；任何仍指向首实例的输出后配置返回带路径的 `422`，不静默映射 | 待人工执行 | 待补充 |
| M05 | 再次添加同源字段 | 实例 ID 使用当前最大后缀加一，例如 `r.amount#3` | 待人工执行 | 待补充 |
| M06 | 配置拆分、值规则、列转行、行转列和舍入修正后删除其中一个实例 | 失效引用在保存/运行时返回可定位 `422` | 待人工执行 | 待补充 |
| M07 | 两实例分别为 `SUM` / `COUNT` 后运行、导出 CSV/XLSX | 预览与两个文件的表头区分正确；数值分别对应聚合结果 | 待人工执行 | 待补充 |
| M08 | 查看推送字段映射并执行测试推送 | 映射键为 `r.amount`、`r.amount#2`；推送值为原始数值，不受千分位展示影响 | 待人工执行 | 待补充 |
| M09 | 打开旧报表 `columns: ["r.amount"]`，编辑、保存、运行、导出和推送 | 首实例保持 `r.amount`；行为不产生 `#2` 且不回归 | 待人工执行 | 待补充 |
| M10 | 移除被排序、聚合或分摊规则引用的字段 | 显示影响确认；确认后保存和运行不产生失效 `instance_id` 引用 | 待人工执行 | 待补充 |

## 3. 执行命令

```powershell
cd D:\AI项目\HR提效工具搭建\hr-portal\backend
python -m pytest tests\test_track_a_report_number_format.py tests\test_track_b_report_column_instances.py tests\test_track_b_report_runtime_validation.py tests\test_track_b_report_field_validation.py tests\test_track_b_ai_column_instances.py tests\test_reports_sql_builder_entity.py -q

cd ..\frontend
npm.cmd run build
```

## 4. 结论规则

- A01–A09 必须全部通过。
- M01–M09 必须完成并附证据后，才能将 Track B 的 B0106 标记为完成。
- 任一保存、运行、导出或推送路径返回非预期 `500`、`403`，或静默忽略失效引用，Track B 验收立即判定为不通过。
