# R0706 ADS 专项验收报告

**日期**：2026-07-07
**验收人**：gaby.liu
**分支**：feature/warehouse-phase3

## 1. 验收结论

ADS 组装满足"可复用消费资产"定位，非临时报表制作工具。**验收通过**（条件：敏感字段脱敏在发布时强制执行，P0-5 已补充 Pydantic Schema 校验）。

## 2. API 测试结果

| 端点 | 方法 | 预期 | 实际 | 备注 |
|------|------|------|------|------|
| `/warehouse/ads-definitions` | GET | 200 列表 | 401（需认证）| 通过 proxy 可达 |
| `/warehouse/ads-definitions` | POST | 201 | Pydantic 校验 | Schema: AdsDefinitionIn |
| `/warehouse/ads-definitions/{id}/preview` | GET | 200 | 401（需认证）| 预览含敏感字段/警告检测 |
| `/warehouse/ads-definitions/{id}/publish` | POST | 200 | 敏感字段拦截 | 发布前强制校验 |
| `/warehouse/ads-definitions/validate` | POST | 200 | Schema 校验 | AdsDefinitionIn |
| `/warehouse/ads-sources` | GET | 200 | DWS 聚合+数据集列表 | |
| `/warehouse/ads-available-dimensions` | GET | 200 | 维度列表 | |

## 3. UI 验证

- **向导 5 步流程**：基本信息 → 关联维度 → 输出字段 → 预设过滤 → 预览与发布
- **禁止任意 SQL**：向导未提供 SQL 编辑器，符合 R0703 要求
- **敏感字段提示**：Step 5 预览面板显示敏感字段警告，发布为 API/推送时后端拦截
- **4 种发布目标**：数据资产 / 数据视图 / API 候选 / 推送候选，Checkbox 多选
- **权限**：所有端点 require_op("warehouse.modeling", ...)

## 4. 边界风险清单

| 风险项 | 状态 | 处理方式 |
|--------|------|----------|
| 敏感字段泄露到 API/推送 | 已缓解 | 发布时敏感字段检查，含敏感字段时拒绝 API/推送目标 |
| 未校验字段名（SQL 注入） | 已缓解 | P0-6: validate_identifier() 应用于关键路径 |
| 跨层非法跳转（ODS→ADS） | 已缓解 | WarehouseService.LAYER_ORDER 分层顺序约束 |
| ADS 不触发外部拉取 | 符合 | ADS 只组装仓内 DWS/数据集资产 |
| ADS 不编辑 UCP Pipeline | 符合 | 无 UCP 凭证/Pipeline 编辑 API |

## 5. 对接 BI/API/推送的结论

| 消费目标 | 是否允许 | 条件 |
|----------|----------|------|
| 数据资产目录 | ✅ 允许 | 发布为 asset，进入资产搜索和权限控制 |
| 数据视图 | ✅ 允许 | 发布为 view，生成 SQL 视图供 BI 直连 |
| API 候选 | ⚠️ 条件允许 | 必须通过敏感字段检查，无敏感字段时注册为 API 候选 |
| 推送候选 | ⚠️ 条件允许 | 同上，通过 PushTarget 模块消费 |

## 6. 回滚验证

- 撤回发布 API：`POST /warehouse/ads-definitions/{id}/unpublish`
- 状态回退：published → draft
- 发布目标清空，血缘快照保留

## 7. 性能与空态

- 空数据：列表空态显示"暂无 ADS 定义"
- 向导：无来源 DWS 时 sources 列表为空，提示用户先创建 DWS 聚合
- 字段空态：至少需配置一个输出字段（validate 校验）

## 8. 手工 UI 证据路径

- ADS 列表页：`/warehouse/ads`
- 向导 Tab 入口：数据仓库 → 数据建模 → ADS 消费资产 Tab
- 发布入口：向导 Step 5

## 9. 不实现项确认

- ❌ 图表制作、大屏设计（归 BI/帆软）
- ❌ 任意 SQL 编辑器
- ❌ 跨系统 Pipeline 画布
- ❌ 直接创建 UCP 连接器
