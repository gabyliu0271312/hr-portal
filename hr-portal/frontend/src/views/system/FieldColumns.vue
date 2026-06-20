<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Top, Bottom, InfoFilled } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import {
  tableColumnsApi,
  type TableColumn,
  type TableMeta,
} from '@/api/table_columns'
import { adminTablesApi } from '@/api/admin_tables'
import { globalFieldsApi, type GlobalField } from '@/api/global_fields'
import SmartCodeInput from '@/components/common/SmartCodeInput.vue'

const route = useRoute()
const router = useRouter()

const tables = ref<TableMeta[]>([])
const currentTable = ref<string>('')
const columns = ref<TableColumn[]>([])
const originalDataTypeById = ref<Record<number, string>>({})
const loading = ref(false)
const saving = ref(false)
const globalFields = ref<GlobalField[]>([])
const existingColumnCodes = computed(() => columns.value.map((c) => c.column_code))

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

async function loadTables() {
  try {
    tables.value = await tableColumnsApi.tables()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载表清单失败')
  }
}

async function loadColumns() {
  if (!currentTable.value) return
  loading.value = true
  try {
    columns.value = await tableColumnsApi.list(currentTable.value)
    originalDataTypeById.value = Object.fromEntries(
      columns.value.map((c) => [c.id, c.data_type])
    )
    // enum_options 规范化为数组，便于 v-model 绑定
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

function claimedHint(gfId: number): string {
  const g = globalFields.value.find((x) => x.id === gfId)
  if (!g) return ''
  const parts: string[] = []
  if (g.scope_role) {
    const SR: Record<string, string> = {
      cc_code: '成本中心',
      org_node_code: '组织',
      employment_type: '用工类型',
      employment_entity: '用工主体',
      person: '人员',
    }
    parts.push('权限=' + (SR[g.scope_role] ?? g.scope_role))
  }
  if (g.category_name) parts.push('分类=' + g.category_name)
  return parts.length ? parts.join('，') : '名称'
}

async function saveAll() {
  if (!currentTable.value) return
  const typeChanged = columns.value.filter(
    (c) => originalDataTypeById.value[c.id] && originalDataTypeById.value[c.id] !== c.data_type
  )
  let confirmTypeChange = false
  if (typeChanged.length) {
    try {
      await ElMessageBox.confirm(
        `将修改 ${typeChanged.length} 个字段的数据类型。若列中已有数据，系统会尝试按新类型转换；转换失败会拒绝保存。是否继续？`,
        '确认修改字段类型',
        { type: 'warning', confirmButtonText: '确认修改', cancelButtonText: '取消' }
      )
      confirmTypeChange = true
    } catch {
      return
    }
  }
  saving.value = true
  try {
    const payload = columns.value.map((c) => ({
      id: c.id,
      column_label: c.column_label,
      data_type: c.data_type,
      is_pk_part: c.is_pk_part,
      is_sensitive: c.is_sensitive,
      is_visible: c.is_visible,
      display_order: c.display_order,
      description: c.description,
      scope_role: c.scope_role,
      copy_from_last_month: c.copy_from_last_month,
      enum_options: c.data_type === 'enum' ? (c.enum_options ?? []) : null,
      agg_role: c.agg_role || 'dimension',
      is_computed: c.is_computed,
      formula_expr: c.is_computed ? (c.formula_expr || '') : null,
      global_field_id: c.global_field_id ?? null,
      confirm_type_change:
        confirmTypeChange && originalDataTypeById.value[c.id] !== c.data_type,
    }))
    const res = await tableColumnsApi.bulkUpdate(currentTable.value, payload)
    ElMessage.success(`已保存 ${res.updated} 个字段`)
    loadColumns()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
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

// 往某行公式末尾插入 [字段编码]
function insertRef(row: TableColumn, code: string) {
  if (!code) return
  row.formula_expr = (row.formula_expr || '') + `[${code}]`
}
// 当前表可被引用的字段（排除自身）
function refOptions(row: TableColumn) {
  return columns.value.filter((c) => c.column_code !== row.column_code)
}

function move(row: TableColumn, direction: -1 | 1) {
  const i = columns.value.findIndex((c) => c.id === row.id)
  if (i < 0) return
  const j = i + direction
  if (j < 0 || j >= columns.value.length) return
  // 交换两个相邻行的 display_order
  const a = columns.value[i].display_order
  const b = columns.value[j].display_order
  columns.value[i].display_order = b
  columns.value[j].display_order = a
  // 重新按 order 排序
  columns.value.sort((x, y) => x.display_order - y.display_order)
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

// ===== 新建字段 =====
const dialogOpen = ref(false)
const newCol = ref({
  column_code: '',
  column_label: '',
  data_type: 'string',
  is_pk_part: false,
  is_sensitive: false,
  is_visible: true,
  display_order: 999,
  description: '',
  scope_role: '' as string,
  copy_from_last_month: false,
  enum_options: [] as string[],
  agg_role: 'dimension',
  is_computed: false,
  formula_expr: '',
})
function openCreate() {
  newCol.value = {
    column_code: '',
    column_label: '',
    data_type: 'string',
    is_pk_part: false,
    is_sensitive: false,
    is_visible: true,
    display_order: (columns.value[columns.value.length - 1]?.display_order ?? 0) + 10,
    description: '',
    scope_role: '',
    copy_from_last_month: false,
    enum_options: [],
    agg_role: 'dimension',
    is_computed: false,
    formula_expr: '',
  }
  dialogOpen.value = true
}
async function createColumn() {
  if (!newCol.value.column_code.trim() || !newCol.value.column_label.trim()) {
    ElMessage.warning('字段编码与字段名称必填')
    return
  }
  if (newCol.value.is_computed && !newCol.value.formula_expr.trim()) {
    ElMessage.warning('计算字段必须填写公式')
    return
  }
  try {
    await tableColumnsApi.create(currentTable.value, {
      ...newCol.value,
      scope_role: newCol.value.scope_role || null,
      enum_options: newCol.value.data_type === 'enum' ? newCol.value.enum_options : null,
      formula_expr: newCol.value.is_computed ? newCol.value.formula_expr : null,
    })
    ElMessage.success('已新增字段')
    dialogOpen.value = false
    loadColumns()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '新增失败')
  }
}

watch(currentTable, () => {
  loadColumns()
  router.replace({ query: { table: currentTable.value } })
})

onMounted(async () => {
  await loadTables()
  try {
    globalFields.value = await globalFieldsApi.list()
  } catch {
    globalFields.value = []
  }
  const queryTable = route.query.table as string | undefined
  currentTable.value = queryTable || tables.value[0]?.table_name || ''
})
</script>

<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-size: 16px; font-weight: 600">字段管理</span>
          <div>
            <PermissionButton menu="system.field_columns" op="C" type="default" @click="openCreate">
              <el-icon style="margin-right: 4px"><Plus /></el-icon>新增字段
            </PermissionButton>
            <PermissionButton menu="system.field_columns" op="U" type="default" :loading="recomputing" @click="recomputeComputed">
              重算自动字段
            </PermissionButton>
            <PermissionButton menu="system.field_columns" op="U" type="primary" :loading="saving" @click="saveAll">
              保存所有修改
            </PermissionButton>
          </div>
        </div>
      </template>

      <el-alert
        title="动态字段元数据"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
      >
        <p style="margin: 0; line-height: 1.6">
          每张表的字段由系统从源端数据自动发现（拉取时如发现新字段会自动注册）。
          管理员可以在此修改字段名称、数据类型、是否参与业务主键、是否敏感、列表是否可见、显示顺序等。
          <strong>修改业务主键会影响下次同步的去重逻辑，请谨慎操作。</strong>
        </p>
      </el-alert>

      <!-- 表选择器 -->
      <el-form inline style="margin-bottom: 16px">
        <el-form-item label="选择业务表">
          <el-select v-model="currentTable" style="width: 240px" :disabled="loading">
            <el-option
              v-for="t in tables"
              :key="t.table_name"
              :label="t.label"
              :value="t.table_name"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <!-- 字段列表 -->
      <div style="overflow-x: auto">
        <el-table v-loading="loading" :data="columns" stripe style="width: 100%" max-height="650">
          <el-table-column label="序号" width="70" type="index" />
          <el-table-column label="字段编码（源端）" min-width="200">
            <template #default="{ row }">
              <span style="font-family: monospace; font-size: 12px; color: var(--color-text-secondary)">
                {{ row.column_code }}
              </span>
              <el-tag v-if="row.auto_discovered" size="small" effect="plain" style="margin-left: 6px">自动</el-tag>
              <el-tag v-else size="small" type="warning" effect="plain" style="margin-left: 6px">手动</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="字段名称" min-width="180">
            <template #default="{ row }">
              <el-input v-model="row.column_label" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="类型" width="140">
            <template #default="{ row }">
              <el-select v-model="row.data_type" size="small">
                <el-option v-for="t in DATA_TYPES" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column width="120">
            <template #header>
              <span>维度/度量</span>
              <el-tooltip placement="top">
                <template #content>
                  <div style="max-width: 280px; line-height: 1.6">
                    报表聚合时的角色：<br />
                    • 维度：分组依据（GROUP BY），如月份、成本中心<br />
                    • 度量：被汇总的数值，如金额、人数<br />
                    系统按类型自动预标（数字→度量，其余→维度），可手动调整。
                  </div>
                </template>
                <el-icon style="margin-left: 4px; vertical-align: middle; cursor: help">
                  <InfoFilled />
                </el-icon>
              </el-tooltip>
            </template>
            <template #default="{ row }">
              <el-select v-model="row.agg_role" size="small" style="width: 100%">
                <el-option v-for="r in AGG_ROLES" :key="r.value" :label="r.label" :value="r.value" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column min-width="280">
            <template #header>
              <span>计算公式</span>
              <el-tooltip placement="top">
                <template #content>
                  <div style="max-width: 280px; line-height: 1.6">
                    用本表已有字段做四则运算生成新列。字段用 [字段编码] 引用，<br />
                    支持 + - * / ( ) 和数字常数，遵循四则优先级。<br />
                    例：[应发工资] + [社保] - 5000<br />
                    仅手工字段可设；改完点上方「重算计算字段」立即回填。
                  </div>
                </template>
                <el-icon style="margin-left: 4px; vertical-align: middle; cursor: help">
                  <InfoFilled />
                </el-icon>
              </el-tooltip>
            </template>
            <template #default="{ row }">
              <div style="display: flex; align-items: center; gap: 6px">
                <el-switch
                  v-model="row.is_computed"
                  size="small"
                  :disabled="row.auto_discovered"
                  inline-prompt
                  active-text="算"
                  inactive-text="否"
                />
                <template v-if="row.is_computed">
                  <el-input
                    v-model="row.formula_expr"
                    size="small"
                    placeholder="[字段编码] + ..."
                    style="flex: 1"
                  />
                  <el-select
                    :model-value="''"
                    size="small"
                    placeholder="插入字段"
                    style="width: 110px"
                    @change="(code: string) => insertRef(row, code)"
                  >
                    <el-option
                      v-for="c in refOptions(row)"
                      :key="c.column_code"
                      :label="c.column_label"
                      :value="c.column_code"
                    />
                  </el-select>
                </template>
                <span v-else style="color: var(--color-text-placeholder); font-size: 12px">—</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="可选项（值列表）" min-width="200">
            <template #default="{ row }">
              <el-select
                v-if="row.data_type === 'enum'"
                v-model="row.enum_options"
                size="small"
                multiple
                filterable
                allow-create
                default-first-option
                :reserve-keyword="false"
                placeholder="输入选项后回车，第一项为默认值"
                style="width: 100%"
              />
              <span v-else style="color: var(--color-text-placeholder); font-size: 12px">—</span>
            </template>
          </el-table-column>
          <el-table-column label="业务主键" width="80" align="center">
            <template #default="{ row }">
              <el-switch v-model="row.is_pk_part" />
            </template>
          </el-table-column>
          <el-table-column label="敏感" width="70" align="center">
            <template #default="{ row }">
              <el-switch v-model="row.is_sensitive" />
            </template>
          </el-table-column>
          <el-table-column label="显示" width="70" align="center">
            <template #default="{ row }">
              <el-switch v-model="row.is_visible" />
            </template>
          </el-table-column>
          <el-table-column width="110" align="center">
            <template #header>
              <span>复制上月</span>
              <el-tooltip placement="top">
                <template #content>
                  <div style="max-width: 260px; line-height: 1.6">
                    新月份同步时，从上月同业务键的行带入该字段值（只填空、不覆盖）。<br />
                    仅手工字段可用；接口字段每次同步由源端覆盖，不支持复制。
                  </div>
                </template>
                <el-icon style="margin-left: 4px; vertical-align: middle; cursor: help">
                  <InfoFilled />
                </el-icon>
              </el-tooltip>
            </template>
            <template #default="{ row }">
              <el-switch v-model="row.copy_from_last_month" :disabled="row.auto_discovered" />
            </template>
          </el-table-column>
          <el-table-column label="认领全局字段" width="220">
            <template #header>
              <span>认领全局字段</span>
              <el-tooltip placement="top">
                <template #content>
                  <div style="max-width: 300px; line-height: 1.6">
                    把本物理列认领到「全局字段字典」里的统一字段。<br />
                    认领后：名称、字段分类、权限角色都<strong>继承自全局字段</strong>，<br />
                    组织树/成本中心树只需在全局字段上绑定一次。<br />
                    未认领 → 用本列自身的名称与权限角色（回退）。
                  </div>
                </template>
                <el-icon style="margin-left: 4px; vertical-align: middle; cursor: help">
                  <InfoFilled />
                </el-icon>
              </el-tooltip>
            </template>
            <template #default="{ row }">
              <el-select
                v-model="row.global_field_id"
                size="small"
                clearable
                filterable
                placeholder="未认领"
                style="width: 100%"
              >
                <el-option
                  v-for="g in globalFields"
                  :key="g.id"
                  :label="`${g.label} (${g.code})`"
                  :value="g.id"
                />
              </el-select>
              <div
                v-if="row.global_field_id"
                style="font-size: 11px; color: var(--color-text-placeholder); margin-top: 2px"
              >
                继承：{{ claimedHint(row.global_field_id) }}
              </div>
            </template>
          </el-table-column>
          <el-table-column label="权限角色" width="180">
            <template #header>
              <span>权限角色</span>
              <el-tooltip placement="top">
                <template #content>
                  <div style="max-width: 280px; line-height: 1.6">
                    标记该字段在数据范围权限中扮演的角色，例如：<br />
                    • cc_code：成本中心编码列<br />
                    • org_node_code：组织节点编码列<br />
                    • employment_type / entity / person：人员筛选用<br />
                    未设置 → 该列不参与权限过滤<br />
                    <strong>已认领全局字段时，以全局字段的权限角色为准。</strong>
                  </div>
                </template>
                <el-icon style="margin-left: 4px; vertical-align: middle; cursor: help">
                  <InfoFilled />
                </el-icon>
              </el-tooltip>
            </template>
            <template #default="{ row }">
              <el-select
                v-model="row.scope_role"
                size="small"
                clearable
                placeholder="未设置"
                style="width: 100%"
                :disabled="!!row.global_field_id"
              >
                <el-option
                  v-for="r in SCOPE_ROLES.filter((x) => x.value)"
                  :key="r.value"
                  :label="r.label"
                  :value="r.value"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="排序" width="80">
            <template #default="{ row }">
              <el-input-number v-model="row.display_order" :min="0" :max="9999" size="small" controls-position="right" style="width: 80px" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row, $index }">
              <el-button link size="small" :disabled="$index === 0" @click="move(row, -1)">
                <el-icon><Top /></el-icon>
              </el-button>
              <el-button link size="small" :disabled="$index === columns.length - 1" @click="move(row, 1)">
                <el-icon><Bottom /></el-icon>
              </el-button>
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
      </div>
    </el-card>

    <!-- 新增字段对话框 -->
    <el-dialog v-model="dialogOpen" title="新增字段" width="520px">
      <el-form label-position="top">
        <el-form-item label="字段名称" required>
          <el-input v-model="newCol.column_label" placeholder="展示给用户看的中文名" />
        </el-form-item>
        <el-form-item label="字段编码（源端）" required>
          <SmartCodeInput
            v-model="newCol.column_code"
            :label="newCol.column_label"
            scope="table_column"
            :existing-codes="existingColumnCodes"
            :editable="true"
          />
          <div style="font-size: 12px; color: var(--color-text-placeholder); margin-top: 4px">
            按名称自动生成规范编码，可手动调整。手动新增字段后，源端数据中如果存在同名 key 也会被同步进来
          </div>
        </el-form-item>
        <el-form-item label="数据类型">
          <el-select v-model="newCol.data_type" style="width: 100%">
            <el-option v-for="t in DATA_TYPES" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="newCol.data_type === 'enum'" label="可选项（第一项为默认值）">
          <el-select
            v-model="newCol.enum_options"
            multiple
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            placeholder="输入一个选项后回车，如：启用 / 停用"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="维度/度量">
          <el-select v-model="newCol.agg_role" style="width: 100%">
            <el-option v-for="r in AGG_ROLES" :key="r.value" :label="r.label" :value="r.value" />
          </el-select>
          <div style="font-size: 12px; color: var(--color-text-placeholder); margin-top: 4px">
            维度=报表分组依据；度量=被汇总的数值列
          </div>
        </el-form-item>
        <el-form-item label="计算字段">
          <el-switch v-model="newCol.is_computed" active-text="用已有字段做四则运算" />
        </el-form-item>
        <el-form-item v-if="newCol.is_computed" label="公式">
          <el-input
            v-model="newCol.formula_expr"
            type="textarea"
            :rows="2"
            placeholder="如：[应发工资] + [社保] - 5000"
          />
          <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center">
            <span style="font-size: 12px; color: var(--color-text-placeholder)">插入字段：</span>
            <el-tag
              v-for="c in columns"
              :key="c.column_code"
              size="small"
              effect="plain"
              style="cursor: pointer"
              @click="newCol.formula_expr += `[${c.column_code}]`"
            >{{ c.column_label }}</el-tag>
          </div>
          <div style="font-size: 12px; color: var(--color-text-placeholder); margin-top: 4px">
            字段用 [字段编码] 引用，支持 + - * / ( ) 与数字常数，遵循四则优先级
          </div>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="newCol.is_pk_part">参与业务主键</el-checkbox>
          <el-checkbox v-model="newCol.is_sensitive">敏感字段</el-checkbox>
          <el-checkbox v-model="newCol.is_visible">列表展示</el-checkbox>
          <el-checkbox v-model="newCol.copy_from_last_month">复制上月</el-checkbox>
        </el-form-item>
        <el-form-item label="权限角色">
          <el-select v-model="newCol.scope_role" clearable style="width: 100%" placeholder="不参与权限过滤">
            <el-option
              v-for="r in SCOPE_ROLES.filter((x) => x.value)"
              :key="r.value"
              :label="r.label"
              :value="r.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="newCol.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" @click="createColumn">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>
