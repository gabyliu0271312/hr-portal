<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Top, Bottom, InfoFilled, EditPen } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import {
  tableColumnsApi,
  type TableColumn,
  type TableMeta,
} from '@/api/table_columns'
import { adminTablesApi } from '@/api/admin_tables'
import SmartCodeInput from '@/components/common/SmartCodeInput.vue'
import { SCOPE_STRATEGY_OPTIONS, type ScopeStrategy } from '@/constants/scopeStrategy'

const route = useRoute()
const router = useRouter()

const tables = ref<TableMeta[]>([])
const registeredTables = ref<Awaited<ReturnType<typeof adminTablesApi.list>>>([])
const currentTable = ref<string>('')
const columns = ref<TableColumn[]>([])
const originalDataTypeById = ref<Record<number, string>>({})
const loading = ref(false)
const saving = ref(false)
const existingColumnCodes = computed(() => columns.value.map((c) => c.column_code))
const currentRegisteredTable = computed(() =>
  registeredTables.value.find((item) => item.table_name === currentTable.value) || null
)
const currentScopeStrategy = ref<ScopeStrategy>('cross_filter')

const DATA_TYPES = [
  { label: '字符串', value: 'string' },
  { label: '数字', value: 'number' },
  { label: '日期', value: 'date' },
  { label: '日期时间', value: 'datetime' },
  { label: '布尔', value: 'bool' },
  { label: '值列表', value: 'enum' },
]

const SCOPE_ROLES = [
  { label: '— 未设置 —', value: '' },
  { label: '成本中心编码 (cc_code)', value: 'cc_code' },
  { label: '组织节点编码 (org_node_code)', value: 'org_node_code' },
  { label: '用工类型 (employment_type)', value: 'employment_type' },
  { label: '用工主体 (employment_entity)', value: 'employment_entity' },
  { label: '人员 (person)', value: 'person' },
]

const AGG_ROLES = [
  { label: '维度', value: 'dimension' },
  { label: '度量', value: 'measure' },
]

// 展示用 label 映射
const typeLabel = (v: string) => DATA_TYPES.find((t) => t.value === v)?.label || v
const aggLabel = (v: string) => AGG_ROLES.find((t) => t.value === v)?.label || v
const scopeRoleLabel = (v: string | null) =>
  (v && SCOPE_ROLES.find((t) => t.value === v)?.label) || ''

async function loadTables() {
  try {
    tables.value = await tableColumnsApi.tables()
    registeredTables.value = await adminTablesApi.list()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载表清单失败')
  }
}

async function loadColumns() {
  if (!currentTable.value) return
  loading.value = true
  try {
    currentScopeStrategy.value = currentRegisteredTable.value?.scope_strategy || 'cross_filter'
    columns.value = await tableColumnsApi.list(currentTable.value)
    originalDataTypeById.value = Object.fromEntries(
      columns.value.map((c) => [c.id, c.data_type])
    )
    for (const c of columns.value) {
      if (!Array.isArray(c.enum_options)) c.enum_options = []
      if (!c.agg_role) c.agg_role = 'dimension'
      if (c.is_computed == null) c.is_computed = false
      if (c.formula_expr == null) c.formula_expr = ''
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载字段失败')
  } finally {
    loading.value = false
  }
}

async function saveTableScopeStrategy() {
  const table = currentRegisteredTable.value
  if (!table) return
  saving.value = true
  try {
    const updated = await adminTablesApi.update(table.table_name, {
      scope_strategy: currentScopeStrategy.value,
    })
    const idx = registeredTables.value.findIndex((item) => item.table_name === updated.table_name)
    if (idx >= 0) registeredTables.value[idx] = updated
    ElMessage.success('已保存数据范围策略')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存策略失败')
  } finally {
    saving.value = false
  }
}

const recomputing = ref(false)
async function recomputeComputed() {
  if (!currentTable.value) return
  recomputing.value = true
  try {
    const res = await tableColumnsApi.recompute(currentTable.value)
    ElMessage.success(`已重算自动字段，更新 ${res.updated_rows} 行`)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '重算失败')
  } finally {
    recomputing.value = false
  }
}

// 构造单条更新/创建的 payload
function buildPayload(c: typeof form.value) {
  return {
    column_code: c.column_code,
    column_label: c.column_label,
    data_type: c.data_type,
    is_pk_part: c.is_pk_part,
    is_sensitive: c.is_sensitive,
    is_visible: c.is_visible,
    display_order: c.display_order,
    description: c.description,
    scope_role: c.scope_role || null,
    copy_from_last_month: c.copy_from_last_month,
    enum_options: c.data_type === 'enum' ? (c.enum_options ?? []) : null,
    agg_role: c.agg_role || 'dimension',
    is_computed: c.is_computed,
    formula_expr: c.is_computed ? (c.formula_expr || '') : null,
  }
}

// 往公式末尾插入 [字段编码]
function insertRef(code: string) {
  if (!code) return
  form.value.formula_expr = (form.value.formula_expr || '') + `[${code}]`
}
// 当前表可被引用的字段（排除自身）
const refOptions = computed(() =>
  columns.value.filter((c) => c.column_code !== form.value.column_code)
)

// 上下移动 —— 即时落库
async function move(row: TableColumn, direction: -1 | 1) {
  const i = columns.value.findIndex((c) => c.id === row.id)
  if (i < 0) return
  const j = i + direction
  if (j < 0 || j >= columns.value.length) return
  const a = columns.value[i]
  const b = columns.value[j]
  const ao = a.display_order
  const bo = b.display_order
  a.display_order = bo
  b.display_order = ao
  columns.value.sort((x, y) => x.display_order - y.display_order)
  try {
    await Promise.all([
      tableColumnsApi.update(currentTable.value, a.id, buildPayload(a as any)),
      tableColumnsApi.update(currentTable.value, b.id, buildPayload(b as any)),
    ])
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存排序失败')
    loadColumns()
  }
}

async function removeColumn(row: TableColumn) {
  try {
    await ElMessageBox.confirm(
      `删除字段「${row.column_label}」？系统会检查依赖，检查通过后将删除数据库物理列和字段元数据。`,
      '提示',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  try {
    await tableColumnsApi.remove(currentTable.value, row.id)
    ElMessage.success('已删除')
    loadColumns()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  }
}

// ===== 新增 / 编辑字段（共用一个弹窗）=====
const dialogOpen = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingId = ref<number | null>(null)
const submitting = ref(false)

function blankForm() {
  return {
    column_code: '',
    column_label: '',
    data_type: 'string',
    is_pk_part: false,
    is_sensitive: false,
    is_visible: true,
    display_order: (columns.value[columns.value.length - 1]?.display_order ?? 0) + 10,
    description: '' as string | null,
    scope_role: '' as string,
    copy_from_last_month: false,
    enum_options: [] as string[],
    agg_role: 'dimension',
    is_computed: false,
    formula_expr: '',
    auto_discovered: false,
  }
}
const form = ref(blankForm())

function openCreate() {
  dialogMode.value = 'create'
  editingId.value = null
  form.value = blankForm()
  dialogOpen.value = true
}

function openEdit(row: TableColumn) {
  dialogMode.value = 'edit'
  editingId.value = row.id
  form.value = {
    column_code: row.column_code,
    column_label: row.column_label,
    data_type: row.data_type,
    is_pk_part: row.is_pk_part,
    is_sensitive: row.is_sensitive,
    is_visible: row.is_visible,
    display_order: row.display_order,
    description: row.description ?? '',
    scope_role: row.scope_role ?? '',
    copy_from_last_month: row.copy_from_last_month,
    enum_options: Array.isArray(row.enum_options) ? [...row.enum_options] : [],
    agg_role: row.agg_role || 'dimension',
    is_computed: !!row.is_computed,
    formula_expr: row.formula_expr ?? '',
    auto_discovered: row.auto_discovered,
  }
  dialogOpen.value = true
}

async function submitForm() {
  if (!form.value.column_label.trim()) {
    ElMessage.warning('字段名称必填')
    return
  }
  if (dialogMode.value === 'create' && !form.value.column_code.trim()) {
    ElMessage.warning('字段编码必填')
    return
  }
  if (form.value.is_computed && !form.value.formula_expr.trim()) {
    ElMessage.warning('计算字段必须填写公式')
    return
  }

  // 编辑时若改了数据类型，需确认（已有数据会尝试按新类型转换）
  let confirmTypeChange = false
  if (
    dialogMode.value === 'edit' &&
    editingId.value != null &&
    originalDataTypeById.value[editingId.value] &&
    originalDataTypeById.value[editingId.value] !== form.value.data_type
  ) {
    try {
      await ElMessageBox.confirm(
        '已修改该字段的数据类型。若列中已有数据，系统会尝试按新类型转换；转换失败会拒绝保存。是否继续？',
        '确认修改字段类型',
        { type: 'warning', confirmButtonText: '确认修改', cancelButtonText: '取消' }
      )
      confirmTypeChange = true
    } catch {
      return
    }
  }

  submitting.value = true
  try {
    if (dialogMode.value === 'create') {
      await tableColumnsApi.create(currentTable.value, buildPayload(form.value) as any)
      ElMessage.success('已新增字段')
    } else {
      await tableColumnsApi.update(currentTable.value, editingId.value!, {
        ...(buildPayload(form.value) as any),
        confirm_type_change: confirmTypeChange,
      })
      ElMessage.success('已保存修改')
    }
    dialogOpen.value = false
    loadColumns()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    submitting.value = false
  }
}

watch(currentTable, () => {
  loadColumns()
  router.replace({ query: { table: currentTable.value } })
})

onMounted(async () => {
  await loadTables()
  const queryTable = route.query.table as string | undefined
  currentTable.value = queryTable || tables.value[0]?.table_name || ''
})
</script>

<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px">
          <div style="display: flex; align-items: center; gap: 6px">
            <span style="font-size: 16px; font-weight: 600">字段管理</span>
            <!-- ④ 动态字段源数据说明：收进感叹号，hover 才显示 -->
            <el-tooltip placement="bottom-start" :show-after="100">
              <template #content>
                <div style="max-width: 360px; line-height: 1.7">
                  每张表的字段由系统从源端数据<strong>自动发现</strong>（拉取时如发现新字段会自动注册）。<br />
                  管理员可在此修改字段名称、数据类型、是否参与业务主键、是否敏感、列表是否可见、显示顺序等。<br />
                  <strong>修改业务主键会影响下次同步的去重逻辑，请谨慎操作。</strong>
                </div>
              </template>
              <el-icon style="color: var(--color-text-secondary); cursor: help; font-size: 16px">
                <InfoFilled />
              </el-icon>
            </el-tooltip>
          </div>
          <!-- 表选择器 + 数据范围策略 + 操作按钮，统一一行 -->
          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap">
            <el-select v-model="currentTable" style="width: 200px" :disabled="loading" placeholder="选择业务表">
              <el-option
                v-for="t in tables"
                :key="t.table_name"
                :label="t.label"
                :value="t.table_name"
              />
            </el-select>
            <div style="display: flex; align-items: center; gap: 4px">
              <span style="font-size: 14px; color: var(--color-text-secondary); white-space: nowrap">数据范围策略</span>
              <el-tooltip placement="top">
                <template #content>
                  <div style="max-width: 260px; line-height: 1.6">
                    控制该表多个权限标签之间的取数关系。选择后立即生效，无需手动保存。
                  </div>
                </template>
                <el-icon style="color: var(--color-text-secondary); cursor: help"><InfoFilled /></el-icon>
              </el-tooltip>
              <el-select
                v-model="currentScopeStrategy"
                style="width: 160px"
                :loading="saving"
                :disabled="!currentRegisteredTable || loading"
                @change="saveTableScopeStrategy"
              >
                <el-option
                  v-for="item in SCOPE_STRATEGY_OPTIONS"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </div>
            <PermissionButton menu="system.field_columns" op="C" type="primary" @click="openCreate">
              <el-icon style="margin-right: 4px"><Plus /></el-icon>新增
            </PermissionButton>
            <PermissionButton menu="system.field_columns" op="U" type="default" :loading="recomputing" @click="recomputeComputed">
              重算
            </PermissionButton>
          </div>
        </div>
      </template>

      <!-- ① 瘦身后的字段列表：只读展示关键列，编辑走弹窗 -->
      <el-table v-loading="loading" :data="columns" stripe style="width: 100%" max-height="650">
        <el-table-column label="序号" width="60" type="index" align="center" />

        <el-table-column label="字段" min-width="240">
          <template #default="{ row }">
            <div style="display: flex; flex-direction: column; line-height: 1.4">
              <div style="display: flex; align-items: center; gap: 6px">
                <span style="font-weight: 500">{{ row.column_label }}</span>
                <el-tag v-if="row.auto_discovered" size="small" effect="plain">自动</el-tag>
                <el-tag v-else size="small" type="warning" effect="plain">手动</el-tag>
              </div>
              <span style="font-family: monospace; font-size: 12px; color: var(--color-text-secondary)">
                {{ row.column_code }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="类型" width="90" align="center">
          <template #default="{ row }">{{ typeLabel(row.data_type) }}</template>
        </el-table-column>

        <el-table-column width="100" align="center">
          <template #header>
            <span>维度/度量</span>
            <el-tooltip placement="top">
              <template #content>
                <div style="max-width: 280px; line-height: 1.6">
                  报表聚合时的角色：<br />
                  • 维度：分组依据（GROUP BY），如月份、成本中心<br />
                  • 度量：被汇总的数值，如金额、人数
                </div>
              </template>
              <el-icon style="margin-left: 4px; vertical-align: middle; cursor: help">
                <InfoFilled />
              </el-icon>
            </el-tooltip>
          </template>
          <template #default="{ row }">
            <el-tag size="small" :type="row.agg_role === 'measure' ? 'success' : 'info'" effect="plain">
              {{ aggLabel(row.agg_role) }}
            </el-tag>
          </template>
        </el-table-column>

        <!-- 属性标记：开关状态 / 公式 / 可选项 / 权限角色，全部只读用 tag 展示 -->
        <el-table-column label="属性" min-width="260">
          <template #default="{ row }">
            <div style="display: flex; flex-wrap: wrap; gap: 4px">
              <el-tag v-if="row.is_pk_part" size="small" type="danger" effect="plain">主键</el-tag>
              <el-tag v-if="row.is_sensitive" size="small" type="warning" effect="plain">敏感</el-tag>
              <el-tag v-if="!row.is_visible" size="small" type="info" effect="plain">列表隐藏</el-tag>
              <el-tag v-if="row.copy_from_last_month" size="small" effect="plain">复制上月</el-tag>

              <!-- ② 计算公式：tag + hover 看表达式 -->
              <el-tooltip v-if="row.is_computed" placement="top">
                <template #content>
                  <div style="max-width: 320px; word-break: break-all">{{ row.formula_expr || '（未填公式）' }}</div>
                </template>
                <el-tag size="small" type="success">公式</el-tag>
              </el-tooltip>

              <!-- ③ 可选项：tag·N + hover 看全部 -->
              <el-tooltip v-if="row.data_type === 'enum'" placement="top">
                <template #content>
                  <div style="max-width: 320px; line-height: 1.6">
                    <template v-if="row.enum_options?.length">
                      <span v-for="(opt, i) in row.enum_options" :key="opt">
                        {{ opt }}<el-tag v-if="i === 0" size="small" style="margin: 0 4px">默认</el-tag>
                        <br />
                      </span>
                    </template>
                    <span v-else>（暂无可选项）</span>
                  </div>
                </template>
                <el-tag size="small">值列表 · {{ row.enum_options?.length || 0 }}</el-tag>
              </el-tooltip>

              <el-tag v-if="row.scope_role" size="small" type="primary" effect="plain">
                权限：{{ scopeRoleLabel(row.scope_role) }}
              </el-tag>

              <span
                v-if="!row.is_pk_part && !row.is_sensitive && row.is_visible && !row.copy_from_last_month && !row.is_computed && row.data_type !== 'enum' && !row.scope_role"
                style="color: var(--color-text-placeholder); font-size: 12px"
              >—</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="排序" width="120" align="center">
          <template #default="{ row, $index }">
            <span style="margin-right: 6px">{{ row.display_order }}</span>
            <el-button link size="small" :disabled="$index === 0" @click="move(row, -1)">
              <el-icon><Top /></el-icon>
            </el-button>
            <el-button link size="small" :disabled="$index === columns.length - 1" @click="move(row, 1)">
              <el-icon><Bottom /></el-icon>
            </el-button>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="120" fixed="right" align="center">
          <template #default="{ row }">
            <PermissionButton menu="system.field_columns" op="U" link size="small" type="primary" @click="openEdit(row)">
              <el-icon style="margin-right: 2px"><EditPen /></el-icon>编辑
            </PermissionButton>
            <PermissionButton menu="system.field_columns" op="D" link size="small" type="danger" @click="removeColumn(row)">
              删除
            </PermissionButton>
          </template>
        </el-table-column>

        <template #empty>
          <div style="padding: 32px 0; color: var(--color-text-placeholder); font-size: 13px">
            <template v-if="currentTable">
              该表尚未发现任何字段 · 先到接口配置页配置数据源并执行「立即拉取」，字段会自动注册
            </template>
            <template v-else>
              请先选择业务表
            </template>
          </div>
        </template>
      </el-table>
    </el-card>

    <!-- 新增 / 编辑字段对话框 -->
    <el-dialog
      v-model="dialogOpen"
      :title="dialogMode === 'create' ? '新增字段' : '编辑字段'"
      width="560px"
      top="6vh"
    >
      <el-form label-position="top">
        <el-form-item label="字段名称" required>
          <el-input v-model="form.column_label" placeholder="展示给用户看的中文名" />
        </el-form-item>

        <el-form-item label="字段编码（源端）" required>
          <SmartCodeInput
            v-if="dialogMode === 'create'"
            v-model="form.column_code"
            :label="form.column_label"
            scope="table_column"
            :existing-codes="existingColumnCodes"
            :editable="true"
          />
          <template v-else>
            <el-input v-model="form.column_code" disabled />
            <div style="font-size: 12px; color: var(--color-text-placeholder); margin-top: 4px">
              字段编码与源端 key 绑定，创建后不可修改
            </div>
          </template>
          <div v-if="dialogMode === 'create'" style="font-size: 12px; color: var(--color-text-placeholder); margin-top: 4px">
            按名称自动生成规范编码，可手动调整。手动新增字段后，源端数据中如果存在同名 key 也会被同步进来
          </div>
        </el-form-item>

        <el-form-item label="数据类型">
          <el-select v-model="form.data_type" style="width: 100%">
            <el-option v-for="t in DATA_TYPES" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>

        <!-- ③ 可选项优化：放进编辑弹窗 + 已选项预览（标默认值） -->
        <el-form-item v-if="form.data_type === 'enum'" label="可选项">
          <el-select
            v-model="form.enum_options"
            multiple
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            placeholder="输入一个选项后回车，如：启用 / 停用"
            style="width: 100%"
          />
          <div
            v-if="form.enum_options.length"
            style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center"
          >
            <span style="font-size: 12px; color: var(--color-text-placeholder)">预览：</span>
            <el-tag
              v-for="(opt, i) in form.enum_options"
              :key="opt"
              size="small"
              :type="i === 0 ? 'primary' : 'info'"
              :effect="i === 0 ? 'dark' : 'plain'"
            >
              {{ opt }}<template v-if="i === 0"> · 默认</template>
            </el-tag>
          </div>
          <div style="font-size: 12px; color: var(--color-text-placeholder); margin-top: 4px">
            第一项为默认值；拖动顺序请重新输入。回车确认每一项
          </div>
        </el-form-item>

        <el-form-item label="维度/度量">
          <el-radio-group v-model="form.agg_role">
            <el-radio-button v-for="r in AGG_ROLES" :key="r.value" :value="r.value">{{ r.label }}</el-radio-button>
          </el-radio-group>
          <div style="font-size: 12px; color: var(--color-text-placeholder); margin-top: 4px">
            维度=报表分组依据；度量=被汇总的数值列
          </div>
        </el-form-item>

        <!-- ② 计算公式：从表格搬进字段编辑 -->
        <el-form-item label="计算字段">
          <el-switch
            v-model="form.is_computed"
            :disabled="form.auto_discovered"
            active-text="用本表已有字段做四则运算"
          />
          <div v-if="form.auto_discovered" style="font-size: 12px; color: var(--color-text-placeholder); margin-top: 4px">
            接口自动发现的字段由源端供值，不支持设为计算字段
          </div>
        </el-form-item>
        <el-form-item v-if="form.is_computed" label="公式">
          <el-input
            v-model="form.formula_expr"
            type="textarea"
            :rows="2"
            placeholder="如：[应发工资] + [社保] - 5000"
          />
          <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center">
            <span style="font-size: 12px; color: var(--color-text-placeholder)">插入字段：</span>
            <el-tag
              v-for="c in refOptions"
              :key="c.column_code"
              size="small"
              effect="plain"
              style="cursor: pointer"
              @click="insertRef(c.column_code)"
            >{{ c.column_label }}</el-tag>
          </div>
          <div style="font-size: 12px; color: var(--color-text-placeholder); margin-top: 4px">
            字段用 [字段编码] 引用，支持 + - * / ( ) 与数字常数，遵循四则优先级。保存后到上方点「重算自动字段」立即回填
          </div>
        </el-form-item>

        <el-form-item label="字段属性">
          <el-checkbox v-model="form.is_pk_part">参与业务主键</el-checkbox>
          <el-checkbox v-model="form.is_sensitive">敏感字段</el-checkbox>
          <el-checkbox v-model="form.is_visible">列表展示</el-checkbox>
          <el-checkbox v-model="form.copy_from_last_month" :disabled="form.auto_discovered">复制上月</el-checkbox>
        </el-form-item>

        <el-form-item label="权限角色">
          <el-select v-model="form.scope_role" clearable style="width: 100%" placeholder="不参与权限过滤">
            <el-option
              v-for="r in SCOPE_ROLES.filter((x) => x.value)"
              :key="r.value"
              :label="r.label"
              :value="r.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="显示顺序">
          <el-input-number v-model="form.display_order" :min="0" :max="9999" controls-position="right" />
        </el-form-item>

        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">
          {{ dialogMode === 'create' ? '创建' : '保存' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>
