# R0002 三期分层流转主线确认

> 日期：2026-07-06
> 前置任务：R0001（三期边界评估）已通过
> 本任务完成后：R01-R07 才可开始功能开发

---

## 1. ODS → DWD → DWS → ADS 流转主线

```
外部系统 / 文件 / API
  ↓ DataSource / UCP / 手工导入
ODS：原始入仓资产 (RegisteredTable, warehouse_layer=ODS)
  ↓ R01: 标准化 + 清洗 + DWD 视图
DWD：标准明细资产 (DWD 逻辑视图 / 派生 DataSet, warehouse_layer=DWD)
  ↓ R03: 维度绑定 + 指标口径 + DWS 聚合
DWS：汇总服务资产 (DWS 聚合视图 / 指标结果, warehouse_layer=DWS)
  ↓ R07: 消费场景组装 + 权限/脱敏 + 发布
ADS：应用消费资产 (ADS 宽表 / 数据视图 / API候选 / PushTarget候选, warehouse_layer=ADS)
  ↓
BI / API / PushTarget / 报表 / 业务应用
```

**全链路支撑**：R02 物化与刷新、R04 快照与拉链、R05 仓内调度、R06 数据开放。

---

## 2. 输入/输出层级矩阵

| 任务 | 输入层 | 输入资产 | 输出层 | 输出资产 | 分层校验 |
|------|--------|----------|--------|----------|----------|
| R0102 | - | ODS 表注册信息 | - | `standardization_rules` 表 | 规则声明为 ODS→DWD |
| R0103 | - | ODS 表字段元数据 | - | 规则 CRUD | 源字段必须在 ODS 资产上 |
| R0104 | ODS | ODS 原始表数据 | DWD | 派生/清洗后数据 | ODS→DWD ✅ |
| R0105 | ODS | ODS 原始表数据 | DWD | 去重/空值/格式化后数据 | ODS→DWD ✅ |
| R0106 | - | 规则模板 | - | 模板加载到指定 ODS 表 | - |
| R0107 | ODS | ODS 样例数据 | - | 转换预览（不落库） | - |
| R0108 | (R0102-R0105) | 标准化规则集 | DWD | DWD 逻辑视图/DataSet | ODS→DWD ✅ |
| R0201 | - | DataSet 元数据 | - | `dataset_builds` 表 | - |
| R0202 | DWD/DWS/ADS | virtual DataSet | DWD/DWS/ADS | materialized 物理表 | 校验输入→输出层顺序 |
| R0203 | - | 同上（UI触发） | - | 同上 | 同上 |
| R0204 | - | `SyncRun` 摘要 + 仓内时间字段 | - | 增量范围计算 | - |
| R0205 | - | 同上（UI展示） | - | 同上 | - |
| R0301 | - | 指标定义 | - | `metric_results`/`metric_runs` | - |
| R0302 | DWD/DWS | DWD/DWS DataSet | DWS | `metric_results` | DWD/DWS→DWS ✅ |
| R0303 | - | 同上（UI展示） | - | 趋势图/失败详情 | - |
| R0304 | - | 表字段绑定 | - | `dimensions` 层级表 | - |
| R0305 | - | 同上（API） | - | 维度 CRUD | - |
| R0306 | - | 同上（UI） | - | 维度树展示 | - |
| R0307 | - | 指标+维度定义 | - | `dws_aggregate_definitions` | 声明 DWD→DWS |
| R0308 | - | 同上（API校验） | - | 聚合定义 CRUD | DWD→DWS ✅ |
| R0309 | - | 同上（UI） | - | 聚合配置表单 | - |
| R0310 | DWD+维度 | `dws_aggregate_definitions` | DWS | DWS 逻辑视图/DataSet | DWD→DWS ✅ |
| R0311 | - | 同上（UI） | - | SQL 摘要/影响分析展示 | - |
| R0401 | 仓内表 | 仓内表/模型 | - | `snapshot_jobs`/`snapshot_runs` | - |
| R0402 | - | 同上（UI） | - | 快照列表/触发 | - |
| R0403 | 仓内表 | 仓内表（业务键字段） | - | SCD 拉链表 | - |
| R0501 | - | 仓内任务类型 | - | 4 个 scheduler handler | - |
| R0502 | - | 同上（UI） | - | 定时配置入口 | - |
| R0503 | - | `job_runs` 失败记录 | - | 重跑 + 审计日志 | - |
| R0504 | - | 同上（UI） | - | 重跑按钮 + 原因输入 | - |
| R0601 | - | 已发布数据集/指标 | - | Open API 契约文档 | - |
| R0602 | - | 同上（UI） | - | 发布状态/调用说明/权限提示 | - |
| R0701 | - | DWS+维度定义 | - | `ads_definitions` 表 | 声明 DWS→ADS |
| R0702 | - | 同上（API） | - | 组装配置 CRUD | DWS→ADS ✅ |
| R0703 | - | 同上（UI） | - | 向导多步表单 | - |
| R0704 | ADS | `ads_definitions` | ADS | 数据资产/视图/API候选/PushTarget候选 | DWS→ADS ✅ |
| R0705 | - | 同上（UI） | - | 发布弹窗/页面 | - |
| R0706 | - | 全部 ADS 产物 | - | 验收记录 | - |

---

## 3. 产物资产类型清单

| 分层 | 资产类型 | 物理形态 | 生命周期 |
|------|----------|----------|----------|
| ODS | `asset_type=table` | `RegisteredTable`（已有） | DataSource/UCP 同步写入 |
| DWD | `asset_type=view` 或 `dataset_view` | DWD 逻辑视图/派生 DataSet | R0108 生成，可版本化/回滚 |
| DWD | `asset_type=model` | DataSet（已有，继承一期） | 一期已有，R02 增强物化 |
| DWS | `asset_type=model` | DWS 聚合视图 | R0310 生成，可版本化/回滚 |
| DWS | `asset_type=metric` | 指标计算结果 (metric_results) | R0302 计算/重算/归档 |
| DWS | `asset_type=dimension` | 维度目录（dimensions） | R0304-R0305 CRUD |
| ADS | `asset_type=view` | ADS 宽表/数据视图 | R0704 发布为消费资产 |
| ADS | `asset_type=api` | API 候选 | R0704 标记为开放候选（R06 仅定义契约） |
| ADS | - | PushTarget 候选 | R0704 标记为推送候选 |

**禁止项**：
- ❌ `warehouse_layer` 不允许出现 `RAW`、`DM`、`METRIC`
- ❌ ADS 发布不直接创建 UCP 连接器
- ❌ 不开放在意 SQL/脚本编辑器入口

---

## 4. op_code 归属分配

沿用一期 `require_op(op_code, action)` 模式。

### 现有 op_code（一期 + 二期已建）

| op_code | 中文名 | 已有功能 |
|---------|--------|----------|
| `warehouse.assets` | 数据资产 | 资产列表/详情/编辑、字段、分层、来源与开放 |
| `warehouse.modeling` | 数据建模 | DataSet 创建/编辑/预览/发布、字段、血缘 |
| `warehouse.metrics` | 指标管理 | 指标 CRUD、公式、关联资产 |
| `warehouse.governance` | 数据治理 | 质量规则/运行、告警规则 |
| `warehouse.impact` | 影响分析 | 影响/血缘图 |

### R 章新增能力归属

| 能力 | 归属 op_code | 理由 |
|------|-------------|------|
| R01 标准化规则 CRUD | `warehouse.modeling` | ODS→DWD 规则是建模活动 |
| R01 标准化执行引擎 | `warehouse.modeling` | 同上 |
| R01 标准化模板 | `warehouse.modeling` | 同上 |
| R01 预览/DWD 视图生成 | `warehouse.modeling` | DWD 视图 = 模型资产 |
| R02 物化执行 API | `warehouse.modeling` | 模型构建 |
| R02 物化 UI/刷新策略 | `warehouse.modeling` | 同上 |
| R03 维度定义 | `warehouse.modeling` | 维度 = 建模元数据 |
| R03 DWS 聚合定义 | `warehouse.modeling` | DWS 聚合 = 模型语义 |
| R03 DWS 视图生成 | `warehouse.modeling` | DWS 视图 = 模型资产 |
| R03 指标计算/重算 | `warehouse.metrics` | 指标执行 |
| R03 指标计算结果 UI | `warehouse.metrics` | 同上 |
| R04 快照/拉链 | `warehouse.governance` | 数据生命周期治理 |
| R05 仓内调度 handler | **`warehouse.orchestration`** 🆕 | 新建叶子节点 |
| R05 定时配置/重跑 UI | **`warehouse.orchestration`** 🆕 | 同上 |
| R05 重跑审计 | `warehouse.governance` | 审计归治理 |
| R06 数据开放契约 | `warehouse.assets` | 资产状态/开放是资产生命周期 |
| R06 数据开放状态 UI | `warehouse.assets` | 同上 |
| R07 ADS 组装 | `warehouse.modeling` | ADS 组装 = 模型组装 |
| R07 ADS 发布 | `warehouse.modeling` | 发布 = 模型生命周期 |
| R07 ADS 验收 | `warehouse.modeling` | 同上 |

### 🆕 `warehouse.orchestration` 新建要求

- 在 `seed.py` 中 `warehouse` 子树下新增叶子节点：
  ```json
  {"code": "warehouse.orchestration", "label": "仓内调度", "icon": "Timer"}
  ```
- 补 alembic migration（参考 `0057_warehouse_menus.py` 写法）
- 默认授予 admin 角色 CRUD，其他角色仅 V（查看）

---

## 5. UI 入口清单

### 已有页面（改造）

| 页面路径 | 当前内容 | R 章改造 |
|----------|----------|----------|
| `/warehouse/assets` | 数据资产列表/详情 | R06：资产详情增加"发布状态/调用说明" |
| `/warehouse/modeling` | 数据建模（DataSet CRUD） | R02：增加"构建/重建"按钮、刷新策略；R03：指标详情聚合配置区；R07：ADS 组装向导入口 |
| `/warehouse/metrics` | 指标管理 | R03：增加计算结果趋势/计算触发；R09：增加 DWS 聚合配置区 |
| `/warehouse/governance` | 质量规则/告警 | R04：增加快照管理区域；R05：增加定时配置入口 |

### 新增页面（创建）

| 页面路径 | 对应任务 | 说明 |
|----------|----------|------|
| `/warehouse/standardization` | R01 | 标准化规则 CRUD + 模板 + 预览 + DWD 视图生成 |
| `/warehouse/dimensions` | R0304-R0306 | 维度目录管理（层级树） |
| `/warehouse/ads-assembly` | R07 | ADS 组装向导（多步表单） |
| `/warehouse/orchestration` | R05 | 仓内调度配置/重跑（轻量，不建独立调度中心） |

### 分层流转总览

- 是否展示分层流转总览：**是**，在 `/warehouse/assets` 数据资产首页增加 ODS→DWD→DWS→ADS 分层概览卡片（引用 U25 线框图），展示各层资产数量、最近加工状态。
- UI 示意图引用：`U25 ODS-DWD-DWS-ADS 分层流转总览线框图`

---

## 6. 不可做项（红线）

1. ❌ **不编辑 UCP 凭证、连接器或跨系统 Pipeline** — 所有 R 章能力只处理已入仓资产
2. ❌ **不在 ODS 做业务口径加工** — ODS 层只保留原始落地数据
3. ❌ **不提供任意 SQL/Python 编辑器** — 规则只通过受控表单配置
4. ❌ **不把 DM/METRIC 写入 `warehouse_layer`** — DM 用主题域/消费域标签，METRIC 用 `asset_type=metric`
5. ❌ **不跳过 DWS 直接拼装 ODS→ADS** — 所有加工必须走完整分层链路
6. ❌ **不新建第二套调度系统** — R05 必须复用 `app/scheduler/`
7. ❌ **不把 ADS 做成 BI 报表制作工具** — ADS 是消费资产定义，不是图表/大屏设计器
8. ❌ **开放能力不绕过权限和审批** — R06 只定义契约和状态，不直接暴露外部 API

---

## 7. 后续 R01-R07 任务检查清单

每个后续原子任务必须满足：
- [x] 输入层/输出层已在本文档矩阵中明确
- [x] op_code 归属已分配
- [x] UI 入口已规划（如涉及 UI）
- [x] 分层校验要求已写入任务（非法跳转 → 400）
- [x] 不违反本文档不可做项

---

## 批准

- [x] ODS→DWD→DWS→ADS 四层流转主线确认
- [x] 43 个原子任务的输入/输出层级矩阵完成
- [x] op_code 分配完成，新增 `warehouse.orchestration`
- [x] UI 入口清单：4 个已有页面改造 + 4 个新增页面
- [x] 不可做项红线 8 条
- [x] R01 可开始开发
