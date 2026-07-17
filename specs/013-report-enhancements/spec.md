# 报表模块三项增强

> 归属：`specs/013-report-enhancements/`
> 状态：设计评审稿 v2.0（返修版，按评审结论拆为 Track A + Track B）
> 最后更新：2026-07-17

---

## 0. 评审结论驱动的结构调整

根据评审反馈，将三项需求按改动范围分为两类：

| Track | 需求 | 定性 | 策略 |
|---|---|---|---|
| **Track A** | 数字千分位 + 报表复制 | 小改动可推进 | 修正细节后直接开发 |
| **Track B** | 字段重复选择 | 需重设计 | 重新设计后独立开发 |

**Track A 与 Track B 互不阻塞，可并行或先后开发。**

---

## 1. 背景与目标（通用）

### 背景

当前报表管理模块（`reports`）已具备完整的 CRUD、字段编排、数据预览、CSV/XLSX 导出和推送能力，但存在三个体验短板。

### 目标

| 目标 | 说明 | Track |
|---|---|---|
| 数字千分位显示 | 所有数字型字段在预览表格和导出文件中以千分位格式展示 | A |
| 报表一键复制 | 列表页可一键复制已有报表的完整配置 | A |
| 字段可重复选择 | 同一字段可多次加入报表，支持不同聚合方式 | B |

### 非目标 / 不做范围

- 不新增后端 API 端点（复制通过已有 `POST /reports` 实现）
- 不修改数据库 Schema
- **Track A 不改变**后端查询、聚合和拆分逻辑；Track B 为实现重复列实例，**明确需要**改造 `sql_builder` 的列投影、聚合、排序和输出映射
- 不引入千分位配置开关（全局缺省启用）
- **不修改推送（push）目标的数值格式**（推送原样传递后端原始值）

---

# Track A：数字千分位 + 报表复制

---

## A1. 用户场景

### A1.1 HR 查看报表（千分位）

1. **入口**：HR 分析师打开报表管理 → 运行某人力汇总报表
2. **操作**：查看在线预览表格 / 点击"导出 CSV"或"导出 XLSX"
3. **系统反馈**：
   - 在线预览：数字列如 `12,345`、`12,345.67`
   - CSV 导出：数字列为千分位格式字符串
   - XLSX 导出：数字列为原始数值 + Excel 数字格式，Excel 打开后显示千分位
4. **异常**：
   - `null`/`""` 数字字段 → 显示 `0`
   - 敏感字段（`is_sensitive=true`）→ 显示 `******`，不做千分位
   - 非数字字段 → 不受影响
   - 超过 6 位小数 → 按“四舍五入（ROUND_HALF_UP）”保留 6 位，防止精度膨胀
5. **推送**：不受影响，推送目标仍收到原始数值

### A1.2 报表管理员快速复制模板

1. **入口**：报表列表页，找到目标报表
2. **操作**：点击操作列"复制"按钮
3. **系统反馈**：确认弹窗 → 调用详情接口获取完整 config → 调用 `POST /reports` 创建副本 → 跳转编辑页
4. **异常**：网络错误 → `ElMessage.error`；数据集结构变更 → 复制成功但编辑页提示字段不可用
5. **权限**：源报表必须可查看（`report.list:V` + `_can_access`），且操作者必须拥有创建权限（`report.list:C`）

---

## A2. 功能范围

| 功能项 | 本期 | 说明 |
|---|---|---|
| 在线预览千分位 | ✅ | `ReportPreviewTable.vue::formatCell()` |
| CSV 导出千分位 | ✅ | 在 export endpoint 层对数字列值格式化为字符串 |
| XLSX 导出千分位 | ✅ | 写入原始数值 + `number_format`，非格式字符串 |
| 推送不受千分位影响 | ✅ | `_collect_export_rows()` 返回原始值，格式化仅在 export 层 |
| 列表页复制按钮 | ✅ | 先调详情 API 获取完整 config → 再 create |
| 千分位配置开关 | ❌ | 二期 |
| 推送目标格式化 | ❌ | 目标系统自行处理 |

---

## A3. 技术设计：千分位

### A3.1 数据模型

**不涉及。**

### A3.2 数字类型判定

需要覆盖系统中所有可能出现的数字类型枚举值。经代码确认，`columns_meta` 中 `data_type` 可能的值为：

| data_type | 是否千分位 | 说明 |
|---|---|---|
| `integer` | ✅ | 整数 |
| `number` | ✅ | 数值（浮点） |
| `decimal` | ✅ | 精确小数 |
| `float` | ✅ | 浮点 |
| `double` | ✅ | 双精度 |
| `numeric` | ✅ | 数值类型 |
| 其他（`string`/`date`/`boolean` 等） | ❌ | 不格式化 |

**判定代码**（前后端共用同一常量集合）：

```python
NUMERIC_TYPES = {"integer", "number", "decimal", "float", "double", "numeric"}
```

```typescript
const NUMERIC_TYPES = new Set(['integer', 'number', 'decimal', 'float', 'double', 'numeric'])
```

### A3.3 格式化规则

| 输入值 | 输出（CSV/预览） | XLSX cell.value | XLSX number_format |
|---|---|---|---|
| `null` / `""` | `"0"` | `0` | `#,##0` |
| `1234567` (整数) | `"1,234,567"` | `1234567` | `#,##0` |
| `1234.56` | `"1,234.56"` | `1234.56` | `#,##0.######` |
| `1000.0` | `"1,000"` | `1000` | `#,##0` |
| `0.123456789`（超 6 位） | `"0.123457"` | `0.123457` | `#,##0.######` |
| `"abc"` (非数字) | `"abc"` | `"abc"` | 不设置 |

**精度策略**：最大保留 6 位小数，采用 `Decimal` 的 `ROUND_HALF_UP`。不得将 `Decimal` 或数值字符串先转为 `float` 再舍入，以免大金额和边界小数出现精度损失；前端预览必须采用等价的十进制舍入实现。`NaN`、`Infinity`、非数值字符串保持原样，不伪装为 0。

**XLSX 有效位数降级规则（方案一）**：

> Excel 数字单元格固有限制：最多保留 **15 位有效数字**。超过此值的数值如果写入为数字单元格，Excel 打开后会截断/四舍五入，导致数据错误。

| 条件 | XLSX 写入方式 | 示例 |
|---|---|---|
| 有效位数 ≤ 15 | **真数字单元格** + `number_format` | `1234567` → 数字 + `#,##0` |
| 有效位数 > 15 | **降级为文本**（千分位字符串） | `9007199254740993...` → 文本 `"9,007,199,254,740,993.123457"` |

> **用户提示**：当导出包含被降级的文本列时，后端在响应头 `X-Export-Warnings` 中返回提示信息，前端检测到后弹出 `ElMessage.warning`。

### A3.4 CSV 导出（`GET /reports/{report_id}/export.csv`）

**改动位置**：`backend/app/reports/router.py:1116`

**核心原则**：`_collect_export_rows()` 需要小改——增加返回值用 `columns_meta` 携带列类型信息；格式化逻辑在 export endpoint 层。

> **背景**：现有代码中，`export_report_csv()` 和 `export_report_xlsx()` 只拿到 `labels, rows, _codes`，`columns_meta` 是 `_collect_export_rows()` 内部变量，导出函数拿不到。需要修改返回值，且同步适配 `collect_report_push_rows()`（推送）。

**方案**：修改 `_collect_export_rows` 返回元组增加 `columns_meta`：

```python
# 当前
return labels, rows, codes

# 改为（兼容解包，不破坏现有调用）
return labels, rows, codes, columns_meta
```

同步修改 `collect_report_push_rows()`（router.py:1028 附近），解包时增加 `_cols_meta` 忽略变量，确保 push 逻辑不格式化也不受影响：

```python
# collect_report_push_rows 中
labels, matrix, codes, _cols_meta = await _collect_export_rows(report, owner, db, runtime_filters)
```

**工具函数**（放在 router.py 模块顶层，供 CSV/XLSX 两端共用）：

```python
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

# 统一数字类型常量（所有数字判断统一使用）
NUMERIC_TYPES = {"integer", "number", "decimal", "float", "double", "numeric"}
MAX_DECIMAL_PLACES = Decimal("0.000001")

def _is_numeric_column(col_meta: dict) -> bool:
    """判断列是否为数字类型且非敏感。"""
    return (
        col_meta.get("data_type") in NUMERIC_TYPES
        and not col_meta.get("is_sensitive")
    )

def _format_number_for_csv(value: Any) -> str:
    """数字千分位格式化字符串（CSV 用）。"""
    if value is None or value == "":
        return "0"
    try:
        num = Decimal(str(value)).quantize(MAX_DECIMAL_PLACES, rounding=ROUND_HALF_UP)
        formatted = f"{num:,f}".rstrip("0").rstrip(".")
        return formatted or "0"
    except (InvalidOperation, ValueError, TypeError):
        return str(value)
```

CSV 写入循环改动：

```python
# 原代码
labels, rows, _codes = await _collect_export_rows(...)
writer.writerow(labels)
for row in rows:
    writer.writerow(row)

# 改为
labels, rows, codes, columns_meta = await _collect_export_rows(...)
numeric_codes = {col["code"] for col in columns_meta if _is_numeric_column(col)}

buf = io.StringIO()
buf.write("\ufeff")
writer = csv.writer(buf)
writer.writerow(labels)
for row in rows:
    formatted = []
    for j, code in enumerate(codes):
        v = row[j]
        formatted.append(_format_number_for_csv(v) if code in numeric_codes else v)
    writer.writerow(formatted)
```

**影响评估**：`collect_report_push_rows` 仅增加一个忽略变量，行为完全不变。推送路径不经过格式化函数。

**空值转 0 逻辑同步**：现有 `_collect_export_rows()` 中（router.py:984-989）数字空值转 0 的判断只覆盖 `("number", "integer")`，需扩展为使用统一 `NUMERIC_TYPES` 常量：

```python
# 当前（L984-989）
numeric_zero_codes = {
    column["code"]
    for column in columns_meta
    if not column.get("is_sensitive")
    and column.get("data_type") in ("number", "integer")   # ← 仅两种
}

# 改为
numeric_zero_codes = {
    column["code"]
    for column in columns_meta
    if _is_numeric_column(column)   # ← 统一常量：6 种数字类型
}
```

这确保 `decimal`/`float`/`double`/`numeric` 类型的空值也在导出时转为 `0`，与预览行为一致。

### A3.5 XLSX 导出（`GET /reports/{report_id}/export.xlsx`）

**改动位置**：`backend/app/reports/router.py:1155`

**关键修正**：XLSX 不能写字符串 `"1,234.56"`，必须写原始数值 `1234.56` + 设置 `number_format`。

```python
from openpyxl.styles import numbers

def _to_numeric_value(value: Any) -> Decimal | int | None:
    """将值转为 XLSX 可用的数字单元格值。'''
    返回 None 表示不是数字，应保持原字符串写入。
    """
    if value is None or value == "":
        return 0
    try:
        num = Decimal(str(value)).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
        return int(num) if num == int(num) else num
    except (InvalidOperation, ValueError, TypeError):
        return None  # 非数字，交给后续字符串处理


def _numeric_format(value: Any) -> str:
    """返回适合该值的 Excel number_format 字符串。"""
    try:
        num = Decimal(str(value))
        if num == int(num):
            return "#,##0"
        return "#,##0.######"
    except (InvalidOperation, ValueError, TypeError):
        return ""
```

XLSX 写入循环改动：

```python
# 原代码 (L1173-L1178)
workbook = Workbook()
worksheet = workbook.active
worksheet.title = report.name[:30] or "Report"
worksheet.append(labels)
for row in rows:
    worksheet.append([("" if value is None else value) for value in row])

# 改为
labels, rows, codes, columns_meta = await _collect_export_rows(...)
numeric_codes = {col["code"] for col in columns_meta if _is_numeric_column(col)}

worksheet.append(labels)
for row in rows:
    excel_row = []
    for j, code in enumerate(codes):
        v = row[j]
        if code in numeric_codes:
            num_val = _to_numeric_value(v)
            if num_val is None:
                # 数字列中混入非数字值 → 保留原字符串
                excel_row.append("" if v is None else v)
            else:
                excel_row.append(num_val)
        else:
            excel_row.append("" if v is None else v)
    worksheet.append(excel_row)

# 为数字列设置 number_format（逐单元格，每行独立判定格式）
for j, code in enumerate(codes):
    if code in numeric_codes:
        col_idx = j + 1
        for row_idx in range(2, len(rows) + 2):
            cell = worksheet.cell(row=row_idx, column=col_idx)
            fmt = _numeric_format(cell.value)
            if fmt:
                cell.number_format = fmt
```

### A3.6 前端预览千分位（ReportPreviewTable.vue）

**改动**：`formatCell()`（行 23-29）

```typescript
const NUMERIC_TYPES = new Set(['integer', 'number', 'decimal', 'float', 'double', 'numeric'])

function formatCell(row: Record<string, any>, col: RunResult['columns'][number]): string {
  const v = row[col.code]
  if (v === null || v === undefined || v === '') {
    return NUMERIC_TYPES.has(col.data_type) ? '0' : '—'
  }
  if (NUMERIC_TYPES.has(col.data_type)) {
    const num = Number(v)
    if (!isNaN(num)) {
      // 最大 6 位小数，整数不带小数点
      const rounded = Math.round(num * 1e6) / 1e6
      if (rounded === Math.floor(rounded)) return rounded.toLocaleString('en-US', { maximumFractionDigits: 0 })
      return rounded.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 6 })
    }
  }
  return String(v)
}
```

### A3.7 推送不受影响的边界说明

```
数据流：
  _collect_export_rows() → 当前行为：数字空值→0，其余原值（int/float/Decimal）
      │
      ├─ CSV export:   _format_number_for_csv()  → "1,234,567" 字符串
      ├─ XLSX export:  _to_numeric_value()       → 1234.56 + number_format
      ├─ 在线预览:      formatCell()               → "1,234,567"（仅前端）
      └─ Push:          collect_report_push_rows() → 保持现有 _collect_export_rows() 的数值输出行为
                           （空值转 0，但不应用千分位逗号格式化）
```

**关键说明**：推送拿到的不是"数据库原始值"，而是 `_collect_export_rows` 的输出——已经过空值转 0 处理。这是现有行为，本需求不改变。本需求保证的是：**推送不应用千分位格式化，不把数字转成带逗号字符串**。

---

## A4. 技术设计：复制

### A4.0 权限管控链路（三层门闸）

复制功能不需要新增权限点，复用已有的三层门闸确保安全：

```
用户点击「复制」
  │
  ├─ Gate 1：列表可见性（_can_access）
  │   源报表出现在用户列表中，意味着已通过 _can_access：
  │   - owner 本人 → 直接可见
  │   - Super Admin → 直接可见
  │   - scoped → 需拥有数据集权限 + 命中 report_acl
  │   - public → 需拥有数据集权限
  │   - private → 仅 owner 可见（其他人不可见，不会出现在列表中）
  │
  ├─ Gate 2：详情接口（_can_access 二次校验）
  │   调用 GET /reports/{id} 获取完整 config 时，后端再次执行
  │   _can_access 检查，不通过返回 403。
  │   即使前端绕过列表直接请求详情，也无法获取无权访问的报表配置。
  │
  ├─ Gate 3：创建接口（POST /reports + report.list:C）
  │   复制操作同时要求详情读取所需的 report.list:V 权限，以及 report.list:C 创建权限。
  │   创建的副本：visibility=private, acl=[]，仅创建者本人可见。
  │
  └─ 结果：用户只能复制自己有权限查看的报表，副本归属自己。
```

**关键边界**：

| 场景 | 结论 |
|---|---|
| 复制他人 private 报表 | ❌ 不会出现在列表中（_can_access 拒绝） |
| 复制他人 public 报表 | ✅ 可复制（有数据集权限即可），副本 visibility=private |
| 复制他人 scoped 报表 | ✅ 仅命中 report_acl 的用户可见，副本 visibility=private |
| 复制含 scope_strategy 的报表 | ✅ 复制后 owner 变为当前用户，scope 按当前用户权限执行 |
| 超级管理员复制任意报表 | ✅ 超管可查看所有报表，复制后归属超管本人 |
| 缺少 `report.list:V` 或 `report.list:C` | ❌ 无法完成复制；前端仅在可查看源报表且拥有 C 时显示按钮，详情/创建接口分别兜底 |

> **与现有隐式复制行为一致**：当用户打开无 `can_edit` 权限的报表时，ReportDesigner.vue 已自动进入副本模式（`copySourceId`）。本次改动只是将这一能力显式化到列表页入口，权限边界不变。

### A4.1 数据模型

**不涉及。** 复用已有 `POST /reports`。

### A4.2 复制流程

```
ReportList.vue 点击「复制」
  │
  ├─ 1. 确认弹窗
  │     "确认复制报表「{name}」？将生成一份完全相同的副本。"
  │
  ├─ 2. 调用 GET /reports/{id}   ← 详情接口，获取完整 config
  │     （不直接使用列表中的 row.config，列表可能不包含完整配置）
  │
  ├─ 3. 组装 payload → POST /reports
  │
  └─ 4. 跳转 /report/designer/{new_id}
```

**为什么必须调详情接口**：`ReportList.vue` 列表接口返回的 `ReportItem.config` 是否包含完整 `filters`/`sorts`/`column_settings`，取决于后端序列化逻辑。直接使用存在丢失配置风险。调详情接口是最安全的做法。

### A4.3 字段复制矩阵

| 字段 | 策略 | 说明 |
|---|---|---|
| `name` | `"{original.name} - 副本"` | 新名称 |
| `description` | 复制 | 从详情接口获取 |
| `dataset_id` | 复制 | 必须同数据集 |
| `config.columns` | 复制 | |
| `config.filters` | 复制 | |
| `config.filter_logic` | 复制 | |
| `config.sorts` | 复制 | |
| `config.aggregate` | 复制 | |
| `config.aggregations` | 复制 | |
| `config.column_settings` | 复制 | |
| `config.value_rules` | 复制 | |
| `config.default_split_rule` | 复制 | |
| `config.transpose` | 复制 | |
| `config.rounding_corrections` | 复制 | |
| `config.list_lookup` | 复制 | |
| `visibility` | **强制 `"private"`** | 仅创建者可见 |
| `scope_strategy` | 复制 | |
| `acl` | **空 `[]`** | 不复制原报表 ACL |
| `owner_id` | **当前用户** | 副本归属当前用户 |
| `is_published` | 不复制 | 副本为草稿 |
| `run_count` / `last_run_at` | 不复制 | 仅原报表属性 |
| `created_at` / `updated_at` | 不复制 | 系统赋值 |

### A4.4 前端实现（ReportList.vue）

```typescript
import { CopyDocument } from '@element-plus/icons-vue'

async function handleCopy(row: ReportItem) {
  try {
    await ElMessageBox.confirm(
      `确认复制报表「${row.name}」？将生成一份完全相同的副本。`,
      '复制报表',
      { type: 'info', confirmButtonText: '确认复制' }
    )
  } catch { return }

  copying.value = row.id
  try {
    // 关键：调详情接口获取完整 config，不用列表的 row.config
    const detail = await reportsApi.get(row.id)
    const r = await reportsApi.create({
      name: `${row.name} - 副本`,
      description: detail.description,
      dataset_id: detail.dataset_id,
      config: detail.config,
      visibility: 'private',
      scope_strategy: detail.scope_strategy,
      acl: [],
    } as any)
    ElMessage.success('报表已复制')
    router.push(`/report/designer/${r.id}`)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '复制失败')
  } finally {
    copying.value = null
  }
}
```

**按钮模板**：

```html
<PermissionButton menu="report.list" op="C" size="small" :loading="copying === row.id" @click="handleCopy(row)">
  <el-icon style="margin-right: 4px"><CopyDocument /></el-icon>复制
</PermissionButton>
```

操作列宽度从 `360` 调整为 `420`。

---

## A5. Track A 原子任务

### 千分位

- [ ] A0101 前端预览表格千分位格式化
  - 前置任务：无
  - 功能范围：`ReportPreviewTable.vue::formatCell()` 对 `NUMERIC_TYPES` 中的类型执行千分位
  - 代码交付物：`frontend/src/components/report/ReportPreviewTable.vue`
  - UI 要求：数字列预览显示千分位；整数无小数；小数 ≤6 位；敏感列显示 `******`；空数字显示 `0`
  - 测试要求：数字列/整数/小数/非数字/敏感列/空值 6 个场景；vue-tsc + vite build
  - 验收标准：在线预览数字列显示千分位格式

- [ ] A0102 后端 CSV 导出千分位
  - 前置任务：无
  - 功能范围：`export_report_csv()` 中根据 columns_meta 判定 `numeric_codes`，对数字列调用 `_format_number_for_csv()`
  - 代码交付物：`backend/app/reports/router.py`：`NUMERIC_TYPES` + `_format_number_for_csv()` + `_is_numeric_column()`
  - 测试要求：`_format_number_for_csv` 5 个单元场景；CSV 集成；py_compile
  - 验收标准：CSV 文件数字列为千分位字符串

- [ ] A0103 后端 XLSX 导出千分位
  - 前置任务：A0102（共享工具函数）
  - 功能范围：`export_report_xlsx()` 中写入原始数值 + 设置 `number_format`
  - 代码交付物：`backend/app/reports/router.py`：`_to_numeric_value()` + `_numeric_format()` + XLSX 写入循环改动
  - 测试要求：XLSX 集成测试；整数用 `#,##0`；小数用 `#,##0.######`；py_compile
  - 验收标准：XLSX 文件 Excel 打开后数字列显示千分位，且为数字单元格

### 复制

- [ ] A0201 报表列表页复制按钮
  - 前置任务：无
  - 功能范围：`ReportList.vue` 新增复制按钮 → 调详情接口 → POST create → 跳转
  - 代码交付物：`frontend/src/views/report/ReportList.vue`
  - UI 要求：操作列新增「复制」按钮（源报表可访问 + `report.list:C`）；确认弹窗；loading 态；成功提示+跳转；失败提示
  - 测试要求：确认弹窗/API 调用/跳转/失败提示/权限隐藏；vue-tsc + vite build
  - 验收标准：列表页复制按钮可点击，生成正确副本

### 验收

- [ ] A0301 Track A 端到端验收
  - 前置任务：A0101-A0103, A0201
  - 功能范围：全链路验证千分位 + 复制 + 推送不受影响
  - 测试要求：后端单测 + 前端构建 + 手工验收 + 推送回归
  - 验收标准：千分位预览/CSV/XLSX 正确；复制生成正确副本；推送原始值不变

---

## A6. Track A 测试计划

| # | 测试项 | 覆盖点 |
|---|---|---|
| 1 | `_format_number_for_csv` | 整数/小数/null/非数字/超6位精度/正负 0.5 临界值/大金额 Decimal |
| 2 | `_to_numeric_value` | 整数/小数/null/非数字/正负 0.5 临界值/大金额 Decimal |
| 3 | `_numeric_format` | 整数→#,##0，小数→#,##0.###### |
| 4 | CSV 导出集成 | 数字列为千分位字符串，非数字不受影响 |
| 5 | XLSX 导出集成 | 数字列为数值单元格+格式，非数字不受影响 |
| 6 | 推送不受影响 | `collect_report_push_rows` 返回原始值 |
| 7 | 前端预览 | 6 个数字格式化场景 |
| 8 | 复制 + 权限 | 确认弹窗/详情调用/create/跳转/失败；无 `C` 权限 → 按钮不可见；private 报表不出现在他人列表；详情接口 403 兜底 |
| 9 | 回归 | 已有报表 CRUD/导出/运行 |

---

## A7. Track A 验收标准

| # | 验收项 | 方法 |
|---|---|---|
| V1 | 在线预览数字千分位 | 运行含数字列的报表 |
| V2 | CSV 导出数字千分位 | 下载 CSV，Excel 打开 |
| V3 | XLSX 导出数字千分位（≤15位为真数字单元格；>15位降级为文本） | 下载 XLSX，Excel 打开，普通值选中确认是数字；超大值确认是文本且值精确 |
| V4 | 推送原始值不变 | 推送后检查推送目标收到原始数值（非字符串） |
| V5 | 列表页复制报表 | 点击复制 → 跳转编辑页 |
| V5.1 | 复制权限控制 | 缺少 `report.list:C` 的用户不可复制；无查看权限的源报表不可见且详情接口返回 403 |
| V5.2 | 复制数据隔离 | 用户列表中不出现他人 private 报表，无法复制；复制后副本归属自己且 private |
| V6 | 敏感字段不受影响 | 含敏感字段的报表，确认 `******` 不变 |
| V7 | 非数字字段不受影响 | 含字符串/日期列的报表，确认显示不变 |

---

## A8. Track A 风险

| 风险 | 等级 | 应对 |
|---|---|---|
| 小数精度超过 6 位 | 低 | 使用 `Decimal + ROUND_HALF_UP` 保留 6 位；前后端增加边界值一致性测试；如有超精度需求二期增加 |
| `numeric_types` 定死可能遗漏新类型 | 低 | 后端 PostgreSQL 固定类型集，新增数据类型需迁移 |
| CSV 千分位逗号被 Excel 误解析 | 低 | `csv.writer` 自动对含逗号的值加双引号包裹 |
| XLSX `#,##0.######` 在旧 Excel 不兼容 | 极低 | 该格式在 Excel 2007+ 均支持 |
| 复制绕过权限管控 | 低 | 已有三层门闸（列表 `_can_access` + 详情 `_can_access` 二次校验 + `POST /reports` 需要 `C` 权限）；副本 visibility=private 确保数据不外泄 |

---

# Track B：字段可重复选择

---

## B1. 背景

当前 `ReportFieldPicker.vue` 中 `selectedCodes: string[]` 按字段 `code` 唯一识别，已选字段从左侧消失。用户无法将同一字段加入多次做不同聚合（如 SUM + COUNT）。

**这不是简单的 UI 改动**——仅修改前端选择器的排除过滤，会导致同一 `code` 在 `columns`、`column_settings`、`aggregations`、`sorts`、SQL 投影、预览/导出列等所有环节都出现 key 冲突和覆盖问题。需要全链路引入「列实例」概念。

## B2. 用户场景

1. **入口**：报表设计器 → 字段选择器
2. **操作**：在左侧可选列表中，点击已选中的"员工数"字段 → 该字段再次加入右侧
3. **系统反馈**：
   - 右侧列表新增一行「员工数 (2)」，与第一个「员工数」独立排列
   - 可在工作台中分别配置：第一个 SUM，第二个 COUNT
4. **查询结果**：SELECT 产生两个独立列，列名分别为 `{code}` 和 `{code}_1`
5. **预览/导出**：表头显示「员工数」和「员工数 (2)」，数据为各自聚合结果
6. **异常**：移除一个不影响另一个
7. **旧报表兼容**：已有 `columns: ["a", "b"]` 格式仍正常工作

## B3. 功能范围

| 功能项 | 本期 | 说明 |
|---|---|---|
| 列实例模型 | ✅ | `ColumnInstance = {source_code, instance_id, label}` |
| 字段选择器允许重复选择 | ✅ | 按实例添加/移除/排序 |
| 配置结构兼容改造 | ✅ | `config.columns` 兼容 `string[]` 和 `ColumnInstance[]` |
| `column_settings` 按 instance_id | ✅ | key 从 `code` 改为 `instance_id` |
| `aggregations` 按 instance_id | ✅ | 同上 |
| `sorts` 按 instance_id | ✅ | 同上 |
| SQL 投影支持重复列 | ✅ | SELECT 加 `_1` / `_2` 后缀 |
| 预览/导出列按 instance 展示 | ✅ | 表头用 label |
| 旧报表配置自动兼容 | ✅ | `string[]` 自动升级为 `ColumnInstance[]` |

## B4. 技术设计：列实例模型

### B4.0 开发前置条件与边界

Track B **必须完成本节的配置引用映射、服务端校验和兼容测试后才能开始编码**。本 Track 改造的是报表“输出列实例”，并非只改字段选择器；所有依赖输出列 code 的能力都必须明确使用 `source_code` 还是 `instance_id`。

- 查询前定位原始字段的能力（如基础筛选、运行时筛选、名单回查）使用 `source_code`。
- 查询后作用于报表输出列的能力（如聚合、排序、值规则、列设置、转置、舍入修正）使用 `instance_id`。
- 对于本期无法安全迁移的组合配置，保存和运行时必须返回明确的 422/业务提示，禁止静默按第一个同源实例处理。

### B4.1 核心数据结构

```typescript
// 新增类型（reports.ts）
interface ColumnInstance {
  source_code: string   // 原始字段 code（不变）
  instance_id: string   // 唯一实例 ID：“emp.count” / “emp.count#2”
  label?: string        // 可选显示快照；最终展示名由字段元数据 + column_settings + 后缀规则派生
}
```

**instance_id 生成规则**：

| 出现次数 | instance_id | label |
|---|---|---|
| 第 1 次 | `"emp.count"` | `"员工数"` |
| 第 2 次 | `"emp.count#2"` | `"员工数 (2)"` |
| 第 3 次 | `"emp.count#3"` | `"员工数 (3)"` |

> **设计决策**：第 1 次不加后缀，保证向后兼容——旧报表的 `columns: ["emp.count"]` 转换为 `instance_id = "emp.count"`，不改变已有行为。

### B4.2 配置结构兼容方案

`config.columns` 当前是 `string[]`，需要兼容新格式：

```typescript
// reports.ts - ReportConfig
interface ReportConfig {
  columns: (string | ColumnInstance)[]  // 兼容旧 string[]
  // ... 其他字段不变
}
```

**兼容规则**：

```
保存时：
  前端发送 columns: ColumnInstance[]
  后端存储为 config.columns JSON

读取时：
  config.columns 中每项若是 string → 自动升级:
    { source_code: "x", instance_id: "x", label: "字段X" }
  若已是 object → 直接使用

去重时：
  禁止静默去重。若 instance_id 重复、格式非法或与 source_code 不匹配，后端返回 422；
  source_code 可以重复，但每个实例的 instance_id 必须唯一。
```

**column_settings / aggregations / sorts 的 key 改为 instance_id**：

```
当前：
  column_settings: { "emp.count": { display_name: "员工数" } }

改为：
  column_settings: { "emp.count": { display_name: "员工数" }, "emp.count#2": { display_name: "员工数 (2)" } }
```

### B4.2.1 后端 Pydantic 模型改造

`backend/app/reports/router.py` 中当前定义：

```python
class ReportConfig(BaseModel):
    columns: list[str] = Field(default_factory=list)
```

需要改为兼容 `ColumnInstance`：

```python
from pydantic import BaseModel, Field

class ColumnInstance(BaseModel):
    """列实例：允许同一 source_code 出现多次。"""
    model_config = {"extra": "forbid"}
    source_code: str        # 原始字段 code
    instance_id: str        # 唯一实例 ID
    label: str | None = None  # 可选显示快照，不作为字段真实性或权限判断依据


class ReportConfig(BaseModel):
    columns: list[str | ColumnInstance] = Field(default_factory=list)
    # ... 其他字段不变


def _normalize_columns(columns: list[str | dict]) -> list[ColumnInstance]:
    """将 columns 统一转为 ColumnInstance 列表并做完整性校验。"""
    result = []
    seen_instance_ids: set[str] = set()
    for item in columns:
        if isinstance(item, str):
            instance = ColumnInstance(
                source_code=item,
                instance_id=item,
                label=None,  # 后续从数据集字段元数据补全
            )
        else:
            instance = ColumnInstance(**item)
        # instance_id 仅允许 source_code 或 source_code#正整数；禁止重复。
        # source_code 是否存在、是否隐藏/无权限，由加载数据集元数据后继续校验。
        if instance.instance_id in seen_instance_ids:
            raise ValueError("columns 中存在重复 instance_id")
        seen_instance_ids.add(instance.instance_id)
        result.append(instance)
    return result
```

**影响**：Pydantic `str | ColumnInstance` 接受两种格式。旧报表 JSONB 中的 `string[]` 直接解析；新报表 `ColumnInstance[]` 也可解析。`_normalize_columns()` 在 `run_dataset_query` 入口处统一转换，后续逻辑全部使用 `ColumnInstance` 列表。归一化后还必须校验 `source_code` 存在、未被隐藏且用户有权访问；展示 label 以服务端字段元数据和 `column_settings.display_name` 为准，不信任请求中的 label。

### B4.3 配置变更对照

| 配置项 | 当前 key | 新 key | 说明 |
|---|---|---|---|
| `columns` | `string[]` | `(string \| ColumnInstance)[]` | 兼容旧格式 |
| `column_settings` | `code` | `instance_id` | |
| `aggregations` | `code` | `instance_id` | |
| `sorts.column` | `code` | `instance_id` | 排序目标是输出列实例 |
| `filters.column` | `code` | `source_code` | **不变**，筛选始终按原始字段 |
| `value_rules.target` / `factors[]` | `code` | `instance_id` | 值规则作用于输出列；旧报表的 code 自动视为首个实例 |
| `rounding_corrections.group_by` / `target_cols` | `code` | `instance_id` | 舍入修正作用于聚合输出列 |
| `transpose.rules.source_col` / `target_cols` | `code` | `instance_id` | 行列重塑作用于输出列；旧 code 自动视为首个实例 |
| `transpose.column_to_row.*` / `row_to_column.*` | `code` | `instance_id` | 相关 `source_cols`、`group_by`、`pivot_col`、`value_col` 均按输出列处理 |
| `list_lookup` 与运行时筛选 | `code` | `source_code` | 查询前过滤保持按原始字段；不允许引用后缀实例 |
| AI 配置解释 payload | `string[]` | `(string \| ColumnInstance)[]` | 同步更新前端类型和后端契约 |

**迁移策略**：旧配置中的 code 仅在该 source_code 存在首个实例时映射到同名 `instance_id`；无法定位、指向已删除字段或在本期不支持的组合配置时，加载后标记为待修复并阻止保存/运行，不得静默丢弃配置。

### B4.4 SQL 投影与聚合表达式

`sql_builder.run_dataset_query()` 的 SELECT 子句需要支持同一 source_code 的多个 instance。

**纯投影（无聚合）**：

```python
# 当前：columns = ["emp.count", "dept.name"]
# SELECT "emp"."count" AS "emp.count", "dept"."name" AS "dept.name"

# Track B：instances = [
#   {source_code: "emp.count", instance_id: "emp.count"},
#   {source_code: "emp.count", instance_id: "emp.count#2"},
# ]
# SELECT "emp"."count" AS "emp.count", "emp"."count" AS "emp.count#2"
```

**带聚合（核心场景 SUM + COUNT）**：

用户配置 `aggregations = {"emp.count": "sum", "emp.count#2": "count"}`，SQL 构造时：

```python
# 对每个 instance：
#   - 通过 instance_id 查 aggregations 获取聚合方式
#   - 通过 source_code 获取字段表达式
#   - alias = instance_id

# aggregations["emp.count"] = "sum"
#   → SUM("emp"."count") AS "emp.count"

# aggregations["emp.count#2"] = "count"
#   → COUNT("emp"."count") AS "emp.count#2"
```

**sql_builder 改动要点**：

1. `columns` 参数改为 `list[ColumnInstance]`
2. 构建 SELECT 子句时，每个 instance 独立生成表达式：
   - 从 `aggregations` 按 `instance_id` 取 agg_func
   - 从 `source_code` 解析字段引用（`table.column` → `Q(table).Q(column)`）
   - 有 agg_func → `{agg_func}({field_expr}) AS {Q(instance_id)}`
   - 无 agg_func → `{field_expr} AS {Q(instance_id)}`
3. GROUP BY：按 `source_code` SET 去重构建（`SELECT` 可重复，`GROUP BY` 不可重复）
4. 向后兼容：`columns` 仍是 `list[str]` 时，内部转为 `[{source_code: c, instance_id: c}]`，行为不变

### B4.5 排序（sorts）字段解析规则

`sorts` 的 `column` 改为 `instance_id`，后端排序时需要解析：

| 场景 | 排序字段 | SQL ORDER BY |
|---|---|---|
| 聚合查询（有 GROUP BY） | `instance_id` | `ORDER BY {Q(instance_id)}`（直接引用聚合结果别名） |
| 明细查询（无 GROUP BY） | 从 `instance_id` 反解 `source_code` | `ORDER BY {field_expr}`（引用原始字段表达式） |
| 旧报表兼容 | sorts.column 仍是 `code`（string） | 自动视为 `instance_id = code`，行为不变 |

**解析函数**：

```python
def _resolve_sort_field(instance_id: str, column_instances: list[ColumnInstance]) -> str:
    """排序字段解析：instance_id → 聚合别名 或 source_code 表达式。"""
    instance = next((ci for ci in column_instances if ci.instance_id == instance_id), None)
    if instance is None:
        return instance_id  # 兼容旧格式
    if aggregations.get(instance_id):
        return Q(instance_id)  # 聚合后排序，直接用别名
    else:
        return _resolve_column_expression(instance.source_code)  # 明细排序
```

### B4.6 筛选（filters）字段映射

`filters.column` **保持使用 `source_code`**，不变。但需要在 UI 层说明映射关系。

**交互规则**：

| 层面 | 展示/逻辑 | 说明 |
|---|---|---|
| 筛选配置 UI | 筛选字段下拉显示 **source_code 的原始字段名**（如"员工数"） | 不显示 instance 标签（不出现"员工数 (2)"） |
| 筛选生效范围 | 一个筛选条件对**同一 source_code 的所有实例**同时生效 | 筛选"员工数 > 100" → 第一个和第二个实例都受影响 |
| 运行时筛选 | `ReportRuntimeFilters` 字段列表也使用 source_code | 同上 |
| 后端 | filter_logic 中原样使用 `field` 值（source_code） | 不变 |

> **设计理由**：筛选是针对原始字段的业务逻辑判断，不针对某个具体实例。同一 source_code 的多个实例只是在展示/聚合维度上区分，数据来自同一字段，筛选应一致。

### B4.7 预览/导出列如何展示

`run_dataset_query` 返回的 `columns_meta` 中：
- `code` = `instance_id`（唯一）
- `label` = instance 的 `label`（含 `(2)` 后缀）
- `source_code` = 原始字段 code（新增字段，用于筛选配置等）

前端的 `RunResult.columns` 增加 `source_code?: string`：

```typescript
interface RunResult {
  columns: {
    code: string        // instance_id
    label: string       // 显示名
    source_code?: string // 原始字段 code（用于 filters 匹配）
    data_type: string
    is_sensitive: boolean
  }[]
  // ...
}
```

**预览**（ReportPreviewTable.vue）：按 `col.label` 显示表头，按 `col.code` 取值，千分位逻辑不变。

**导出**（CSV/XLSX）：表头用 `label`，数据列按 `code`（即 `instance_id`）取值。

### B4.8 字段选择器 UI 改造

**ReportFieldPicker.vue** 需要从 `selectedCodes: string[]` 迁移到 `selectedInstances: ColumnInstance[]`（或仍在组件内部用 `instance_id` 数组 + 外部 `allColumns` 推导 label）。

```typescript
// 方案：selectedCodes 语义改为 instance_id 数组

const props = defineProps<{
  selectedInstanceIds: string[]   // 改为 instance_id 数组
  allColumns: ColumnInfo[]
}>()

const emit = defineEmits<{
  'update:selectedInstanceIds': [v: string[]]
}>()

// 生成下一个 instance_id：使用已存在的最大后缀+1，避免删除后重新添加时冲突
function nextInstanceId(sourceCode: string): string {
  const suffixes: number[] = []
  for (const id of props.selectedInstanceIds) {
    if (id === sourceCode) {
      suffixes.push(1)
    } else if (id.startsWith(sourceCode + '#')) {
      const n = Number(id.split('#').pop())
      if (!isNaN(n)) suffixes.push(n)
    }
  }
  const next = Math.max(0, ...suffixes, 0) + 1   // 空数组 → 1
  return next === 1 ? sourceCode : `${sourceCode}#${next}`
}

// 点击添加
function toggleColumn(sourceCode: string) {
  const next = [...props.selectedInstanceIds]
  next.push(nextInstanceId(sourceCode))
  emit('update:selectedInstanceIds', next)
}

// 移除：按位置删除
function removeAt(index: number) {
  const next = [...props.selectedInstanceIds]
  next.splice(index, 1)
  emit('update:selectedInstanceIds', next)
}

// 排序：按位置移动
function moveAt(index: number, dir: -1 | 1) {
  const next = [...props.selectedInstanceIds]
  const j = index + dir
  if (j < 0 || j >= next.length) return
  ;[next[index], next[j]] = [next[j], next[index]]
  emit('update:selectedInstanceIds', next)
}
```

**Vue key**：右侧列表每条使用 `instance_id` 作为 `:key`（不会冲突）。

**显示名**：从 `instance_id` 推导 label：
```typescript
function instanceLabel(instanceId: string): string {
  const base = instanceId.replace(/#\d+$/, '')
  const col = props.allColumns.find(c => c.code === base)
  const baseLabel = col?.label ?? base
  if (instanceId === base) return baseLabel
  const n = instanceId.split('#').pop()
  return `${baseLabel} (${n})`
}
```

**兼容旧 `selectedCodes`**：ReportDesigner.vue 在加载报表时，如果 `config.columns` 是旧格式 `string[]`，自动转为 `instance_id` 数组（每个 code 的第一个实例不加后缀）。

### B4.9 工作台联动

`ReportFieldWorkbench.vue` 中：
- column_settings 的 key = `instance_id`
- aggregations 的 key = `instance_id`
- sorts 的 column = `instance_id`
- value_rules、转置和舍入修正中所有输出列引用 = `instance_id`

每个 instance 在列表中独立显示，可独立配置聚合方式和指标筛选。

## B5. Track B 原子任务

- [ ] B0101 列实例模型 + 配置结构改造（前后端）
  - 前置任务：无
  - 功能范围：
    - **后端**：`ReportConfig.columns` 类型兼容 `str | ColumnInstance`；新增 `ColumnInstance` Pydantic 模型；新增规范化函数将旧 `string[]` 转为 `ColumnInstance[]`；空值转 0 逻辑从 `("number","integer")` 扩展为 `NUMERIC_TYPES`
    - **前端**：`ReportConfig` 接口新增 `ColumnInstance` 类型；`ReportDesigner.vue` 读写兼容
  - 代码交付物：
    - `backend/app/reports/router.py`：`ColumnInstance(BaseModel)` + `_normalize_columns()` + `ReportConfig.columns` 类型兼容
    - `backend/app/reports/sql_builder.py`：`columns` 参数兼容 `list[str]` / `list[ColumnInstance]`
    - `frontend/src/api/reports.ts`：新增 `ColumnInstance` 接口
    - `frontend/src/views/report/ReportDesigner.vue`：`config.columns` 读写兼容
  - 测试要求：旧 `string[]` columns 自动升级；新旧格式互转正确；重复/非法 instance_id、字段不存在、隐藏字段均返回明确错误；Pydantic 校验接受合法 `ColumnInstance`
  - 验收标准：旧报表加载不受影响；新报表 config 正确存储实例

- [ ] B0102 SQL 投影支持重复列
  - 前置任务：B0101
  - 功能范围：`sql_builder.run_dataset_query()` 支持同一 `source_code` 多次投影，列别名用 `instance_id`
  - 代码交付物：`backend/app/reports/sql_builder.py`
  - 测试要求：SQL SELECT 子句正确多实例投影；GROUP BY 中 source_code 不重复
  - 验收标准：同一字段两次投影产生两列，列名不冲突

- [ ] B0103 预览/导出列按 instance 展示
  - 前置任务：B0102
  - 功能范围：`run_dataset_query` 返回的 `columns_meta` 中 `code=instance_id`，`label=instance_label`，新增 `source_code`
  - 代码交付物：`backend/app/reports/sql_builder.py` + `router.py` + `frontend/src/components/report/ReportPreviewTable.vue`
  - 测试要求：表头显示 instance label；数据列按 instance_id 取值
  - 验收标准：预览/导出中重复字段的列名区分正确

- [ ] B0104 字段选择器实例化改造
  - 前置任务：B0101
  - 功能范围：`ReportFieldPicker.vue` 从 `selectedCodes` 改为 `selectedInstanceIds`，支持重复添加、独立排序/移除、label 显示后缀
  - 代码交付物：`frontend/src/components/report/ReportFieldPicker.vue`
  - UI 要求：
    - 左侧可选列表始终显示全部字段
    - 点击已选字段 → 新增一个实例
    - 右侧列表按 `instance_id` 做 key，label 显示后缀
    - 上移/下移/移除按位置操作
    - 全选仅选中当前未出现在 `selectedInstanceIds` 中的 source_code
  - 测试要求：重复添加/独立排序/独立移除/全选避免重复；vue-tsc + vite build
  - 验收标准：同一字段可多次添加并在工作台独立配置聚合

- [ ] B0105 工作台聚合/排序按 instance_id
  - 前置任务：B0101
  - 功能范围：`ReportFieldWorkbench.vue` 的 column_settings / aggregations 按 instance_id 存储
  - 代码交付物：`frontend/src/components/report/ReportFieldWorkbench.vue`
  - 测试要求：重复实例各自独立配置聚合方式
  - 验收标准：同一字段两个实例可分别设为 SUM 和 COUNT

- [ ] B0106 Track B 端到端验收 + 旧报表兼容
  - 前置任务：B0101-B0105
  - 功能范围：全链路验证 + 旧报表兼容 + 输出列引用迁移 + 构建
  - 测试要求：重复字段全链路；value_rules/转置/舍入修正/list_lookup 映射或阻断；非法实例 422；旧报表无回归；vue-tsc + vite build
  - 验收标准：重复字段 end-to-end 正确；配置引用不串列、不静默丢失；旧报表不受影响

## B6. Track B 测试计划

| # | 测试项 | 覆盖点 |
|---|---|---|
| 1 | 旧 config 加载 | `columns: string[]` → 自动升级为 instance 列表 |
| 2 | 新 config 保存/加载 | `ColumnInstance[]` 保存后再加载一致 |
| 3 | SQL 投影 | 同一字段 2 个 instance → 2 列，`instance_id` 不同 |
| 4 | 预览 | 表头显示 instance label（含后缀） |
| 5 | 导出 CSV/XLSX | 表头区分，数据列正确 |
| 6 | column_settings | 按 instance_id 独立存储/读取 |
| 7 | aggregations | 按 instance_id 独立配置 |
| 8 | sorts | 按 instance_id 排序 |
| 9 | filters | 按 source_code 筛选（不变） |
| 10 | 推送 | instance 列正确推送 |
| 11 | 回归 | 已有单实例报表行为不变 |
| 12 | 引用迁移 | value_rules / 转置 / 舍入修正 / list_lookup 按映射表正确运行或明确阻断 |
| 13 | 参数校验 | 重复 ID、非法后缀、字段不存在和无权限字段返回 422，且不静默丢配置 |

## B7. Track B 验收标准

| # | 验收项 | 方法 |
|---|---|---|
| V1 | 同一字段加入 2 次 | 字段选择器操作 |
| V2 | 两个实例独立配置聚合 | 一个 SUM，一个 COUNT，运行后数据不同 |
| V3 | 预览表头区分 | 「员工数」+「员工数 (2)」 |
| V4 | 导出文件表头区分 | CSV/XLSX 中表头正确 |
| V5 | 排序/移除独立 | 移除一个不影响另一个 |
| V6 | 旧报表无回归 | 已有单实例报表打开/运行/导出正常 |

## B8. Track B 风险

| 风险 | 等级 | 应对 |
|---|---|---|
| 改动范围大，影响所有报表 | 高 | Track B 独立分支开发，充分测试后合并 |
| 旧 `columns: string[]` 兼容遗漏 | 中 | Pydantic `str \| ColumnInstance` 接受两种格式；`_normalize_columns()` 统一转换 |
| 输出列引用迁移遗漏 | 高 | 以 B4.3 映射表逐项改造 value_rules、转置、舍入修正、名单回查与 AI payload；不支持组合显式阻断 |
| SQL `GROUP BY` 中 source_code 重复 | 低 | GROUP BY 构建时按 `source_code` SET 去重 |
| 聚合查询排序使用 instance_id 别名失败 | 中 | `_resolve_sort_field` 区分聚合/明细两路径；旧 code 格式自动兼容 |
| column_settings 迁移导致配置丢失 | 低 | 旧 key（code）到新 key（instance_id）的自动迁移逻辑 |
| instance_id 删除后重复 | 低 | `nextInstanceId` 使用最大后缀+1 算法 |
| 客户端伪造/重复 instance_id | 中 | 后端校验格式、唯一性、字段存在性和权限；label 由服务端元数据派生 |

---

## 9. Track A 与 Track B 关系

```
Track A (千分位 + 复制)     Track B (字段重复选择)
       │                           │
       ├─ 不依赖 Track B           ├─ 不依赖 Track A
       ├─ 改动 4 个文件             ├─ 改动 6+ 个文件
       ├─ 可先开发上线              ├─ 需独立测试后再上线
       │                           │
       └────────── 互不阻塞，可并行 ──────────┘
```

---

## 10. 交付说明模板

```
Track A 任务完成报告：
- 已完成任务：A0101, A0102, A0103, A0201
- 修改文件：ReportPreviewTable.vue / ReportList.vue / reports/router.py
- 测试：pytest X passed / vue-tsc 0 / vite build OK
- UI 验证：预览千分位 / CSV/XLSX 导出 / 复制按钮 / 推送不变
- 风险：XLSX 小数精度与预览对齐

Track B 任务完成报告：
- 已完成任务：B0101-B0105
- 修改文件：ReportFieldPicker.vue / ReportFieldWorkbench.vue / ReportDesigner.vue / sql_builder.py / router.py / reports.ts
- 测试：pytest X passed / vue-tsc 0 / vite build OK
- UI 验证：重复选择 / 独立聚合 / 预览区分 / 导出区分
- 风险：旧报表兼容回归测试
```

---

## 附录：UI 交互示意图

### 千分位预览

```
┌────────────────────────────────────────────────┐
│  部门          │  在职人数    │  人均成本       │
├────────────────────────────────────────────────┤
│  技术研发部    │  12,345     │  15,200.50      │
│  市场营销部    │  3,210      │  12,800         │
│  人力资源部    │  567        │  9,450.33       │
│  (敏感字段)    │  ******     │  ******         │
└────────────────────────────────────────────────┘
```

### 复制按钮

```
┌──────────────────────────────────────────────────────────┐
│ 报表管理（共 5 个）                  [+ 新建报表]         │
├──────────────────────────────────────────────────────────┤
│ 报表名              数据来源    ...   操作               │
│ 月度人力汇总        数据集       ...   [查看] [编辑]     │
│                                       [复制] [推送] [删除] │
└──────────────────────────────────────────────────────────┘
```

### 字段重复选择器

```
┌── 可选字段（6）──────────┐  ┌── 已选字段（4）──────────┐
│ ☐ 员工数  PK             │  │ 1. 员工数               │
│ ☐ 在职人数               │  │ 2. 部门名称             │
│ ☐ 部门名称  ←点击        │  │ 3. 员工数 (2) ✓        │
│ ☐ 成本金额               │  │ 4. 成本金额             │
│ ☐ 离职人数               │  │      [上移] [下移] [移除]│
│ ☐ 入职日期               │  │                         │
│ [全选可见]               │  │ [清空]                  │
└──────────────────────────┘  └──────────────────────────┘
```
