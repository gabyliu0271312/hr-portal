<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, Download, Setting, Plus, Share } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import BulkActionBar from '@/components/BulkActionBar.vue'
import { dataApi, type ColumnInfo } from '@/api/data'
import { datasourcesApi, type DataSourceListItem } from '@/api/datasources'
import { adminTablesApi } from '@/api/admin_tables'
import { tableColumnsApi } from '@/api/table_columns'
import { useDataExport } from '@/composables/useDataExport'
import { pushTargetsApi } from '@/api/push_targets'

const route = useRoute()
const { exporting, exportCsv } = useDataExport()

// 立即推送：对该表所有启用的推送目标批量触发
const pushing = ref(false)
async function triggerPush() {
  if (!meta.value) return
  pushing.value = true
  try {
    const targets = await pushTargetsApi.list(meta.value.code)
    const active = targets.filter((t) => t.is_active)
    if (!active.length) {
      ElMessage.warning('该表暂无启用的推送目标，请先到接口配置页配置')
      return
    }
    let successCount = 0
    for (const t of active) {
      try {
        await pushTargetsApi.run(t.id)
        successCount++
      } catch {
        ElMessage.error(`推送目标「${t.name}」失败`)
      }
    }
    if (successCount > 0) ElMessage.success(`已触发 ${successCount} 个推送目标`)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '推送失败')
  } finally {
    pushing.value = false
  }
}

// 从路由参数直接读 table_name（路由 /data/:table 里 table 就是 table_name）
const tableName = computed(() => route.params.table as string)
const tableLabel = ref('')

// 启动时从 registered_tables 查中文名
async function loadTableLabel() {
  try {
    const all = await adminTablesApi.list()
    const found = all.find((t) => t.table_name === tableName.value)
    tableLabel.value = found?.table_label ?? tableName.value
  } catch {
    tableLabel.value = tableName.value
  }
}

// 兼容旧 meta 用法
const meta = computed(() =>
  tableName.value ? { code: tableName.value, label: tableLabel.value } : null
)

const columns = ref<ColumnInfo[]>([])
const list = ref<Record<string, any>[]>([])
const total = ref(0)
const loading = ref(false)
const ds = ref<DataSourceListItem | null>(null)

const query = reactive({
  page: 1,
  page_size: 20,
  keyword: '',
})

// 值列表(enum)字段的筛选条件：{列编码: 选中值}
const filters = reactive<Record<string, string>>({})
const enumFilterColumns = computed(() =>
  columns.value.filter((c) => c.data_type === 'enum' && c.is_visible)
)

// ===== 行勾选 + 批量启用/停用 =====
const tableRef = ref()
const selectedRows = ref<Record<string, any>[]>([])
const statusCol = computed(() =>
  columns.value.find((c) => c.code === '启用状态' && c.data_type === 'enum')
)
function onSelectionChange(rows: Record<string, any>[]) {
  selectedRows.value = rows
}
async function bulkSetStatus(val: string) {
  if (!meta.value || !statusCol.value || !selectedRows.value.length) return
  const ids = selectedRows.value.map((r) => r._id)
  try {
    const res = await dataApi.bulkUpdate(meta.value.code, ids, {
      [statusCol.value.code]: val,
    })
    ElMessage.success(`已将 ${res.updated} 行设为「${val}」`)
    tableRef.value?.clearSelection?.()
    selectedRows.value = []
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '批量操作失败')
  }
}

async function bulkDelete() {
  if (!meta.value || !selectedRows.value.length) return
  const ids = selectedRows.value.map((r) => r._id)
  try {
    const res = await dataApi.bulkDelete(meta.value.code, ids)
    ElMessage.success(`已删除 ${res.deleted} 行`)
    tableRef.value?.clearSelection?.()
    selectedRows.value = []
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  }
}

async function loadColumns() {
  if (!meta.value) return
  try {
    const [dataColumns, managedColumns] = await Promise.all([
      dataApi.columns(meta.value.code),
      tableColumnsApi.list(meta.value.code).catch(() => []),
    ])
    const labelByCode = new Map(
      managedColumns.map((col) => [col.column_code, col.column_label])
    )
    columns.value = dataColumns.map((col) => ({
      ...col,
      label: labelByCode.get(col.code) || col.label || col.code,
    }))
  } catch {
    columns.value = []
  }
}

async function loadDatasource() {
  if (!meta.value) return
  try {
    const all = await datasourcesApi.list()
    ds.value = all.find((d) => d.table_name === meta.value!.code) ?? null
  } catch {
    ds.value = null
  }
}

async function load() {
  if (!meta.value) return
  loading.value = true
  try {
    const params: Record<string, any> = { page: query.page, page_size: query.page_size }
    if (query.keyword) params.keyword = query.keyword
    const activeFilters: Record<string, string> = {}
    for (const [k, v] of Object.entries(filters)) {
      if (v) activeFilters[k] = v
    }
    if (Object.keys(activeFilters).length) params.filters = activeFilters
    const resp = await dataApi.query(meta.value.code, params)
    list.value = resp.items
    total.value = resp.total
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载失败')
  } finally {
    loading.value = false
  }
}

async function triggerSync() {
  if (!ds.value) {
    ElMessage.warning('该表暂未配置数据源，请先到接口配置页配置')
    return
  }
  try {
    ElMessage.info('正在拉取...')
    const res = await datasourcesApi.sync(ds.value.id)
    if (res.ok) {
      ElMessage.success(`同步成功：${res.message}`)
      await loadDatasource()
      await loadColumns()
      await load()
    } else {
      ElMessage.error(`同步失败：${res.message}`)
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '触发失败')
  }
}

function formatCell(row: Record<string, any>, col: ColumnInfo): string {
  const v = row[col.code]
  if (v === null || v === undefined || v === '') return '—'
  if (col.data_type === 'datetime' || col.data_type === 'date') {
    if (typeof v === 'string') {
      try { return new Date(v).toLocaleString('zh-CN') } catch { return v }
    }
  }
  return String(v)
}

// ===== 手工字段内联编辑（auto_discovered=false 且非敏感）=====
const editingCell = ref<{ id: number; code: string } | null>(null)
const editValue = ref<string>('')

function isEditable(col: ColumnInfo): boolean {
  return !col.is_sensitive && !col.auto_discovered
}
function isEditing(row: Record<string, any>, col: ColumnInfo): boolean {
  return editingCell.value?.id === row._id && editingCell.value?.code === col.code
}
function startEdit(row: Record<string, any>, col: ColumnInfo) {
  if (!isEditable(col)) return
  const v = row[col.code]
  editValue.value = v === null || v === undefined ? '' : String(v)
  editingCell.value = { id: row._id, code: col.code }
}
async function saveCell(row: Record<string, any>, col: ColumnInfo, val: any) {
  if (!meta.value) return
  if (String(row[col.code] ?? '') === String(val ?? '')) return
  try {
    await dataApi.updateRow(meta.value.code, row._id, { [col.code]: val })
    row[col.code] = val
    ElMessage.success('已保存')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  }
}
async function saveEdit(row: Record<string, any>, col: ColumnInfo) {
  if (!editingCell.value) return
  const newVal = editValue.value
  editingCell.value = null
  await saveCell(row, col, newVal)
}

// ===== 新增行（手工维护表：无接口的表才显示）=====
const isManualTable = computed(() => ds.value === null)
// 可录入的列：手工字段（auto_discovered=false）且非计算字段
const editableColumns = computed(() =>
  columns.value.filter((c) => !c.auto_discovered && !c.is_computed)
)
const createOpen = ref(false)
const createForm = reactive<Record<string, any>>({})
const creating = ref(false)
function openCreate() {
  for (const k of Object.keys(createForm)) delete createForm[k]
  for (const c of editableColumns.value) {
    createForm[c.code] = c.data_type === 'enum' ? (c.enum_options?.[0] ?? '') : ''
  }
  createOpen.value = true
}
async function submitCreate() {
  if (!meta.value) return
  creating.value = true
  try {
    const values: Record<string, any> = {}
    for (const c of editableColumns.value) {
      const v = createForm[c.code]
      if (v !== '' && v !== null && v !== undefined) values[c.code] = v
    }
    await dataApi.createRow(meta.value.code, values)
    ElMessage.success('已新增一行')
    createOpen.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '新增失败')
  } finally {
    creating.value = false
  }
}

// 默认筛选：成本中心「启用状态」默认只看「启用」（可手动清空看全部）
function applyDefaultFilters() {
  const statusCol = columns.value.find(
    (c) => c.code === '启用状态' && c.data_type === 'enum'
  )
  if (statusCol && filters['启用状态'] === undefined) {
    filters['启用状态'] = '启用'
  }
}

watch(meta, async () => {
  query.page = 1
  query.keyword = ''
  for (const k of Object.keys(filters)) delete filters[k]
  list.value = []
  await loadColumns()
  applyDefaultFilters()
  await loadDatasource()
  await load()
})

onMounted(async () => {
  await loadTableLabel()
  await loadColumns()
  applyDefaultFilters()
  await loadDatasource()
  await load()
})
</script>

<template>
  <div style="padding: 24px">
    <el-card v-if="meta">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div>
            <span style="font-size: 16px; font-weight: 600">{{ meta.label }}</span>
          </div>
          <div>
            <PermissionButton menu="system.field_columns" op="U" size="default" @click="$router.push(`/system/field-columns?table=${meta.code}`)">
              <el-icon style="margin-right: 4px"><Setting /></el-icon>字段管理
            </PermissionButton>
            <PermissionButton menu="system.users" op="C" size="default" :loading="pushing" @click="triggerPush">
              <el-icon style="margin-right: 4px"><Share /></el-icon>立即推送
            </PermissionButton>
            <PermissionButton v-if="isManualTable" menu="data.view" op="C" size="default" type="primary" @click="openCreate">
              <el-icon style="margin-right: 4px"><Plus /></el-icon>新增行
            </PermissionButton>
            <PermissionButton v-if="!isManualTable" menu="data.view" op="U" size="default" @click="triggerSync">
              <el-icon style="margin-right: 4px"><Refresh /></el-icon>立即拉取
            </PermissionButton>
            <PermissionButton
              menu="data.view" op="E" size="default" type="primary"
              :loading="exporting"
              @click="exportCsv(meta.code, meta.label, { keyword: query.keyword, filters: Object.fromEntries(Object.entries(filters).filter(([,v]) => v)) })"
            >
              <el-icon style="margin-right: 4px"><Download /></el-icon>导出
            </PermissionButton>
          </div>
        </div>
      </template>

      <el-form inline style="margin-bottom: 16px">
        <el-form-item>
          <el-input
            v-model="query.keyword"
            placeholder="跨字段模糊搜索"
            clearable
            style="width: 280px"
            @keyup.enter="() => { query.page = 1; load() }"
            @clear="() => { query.page = 1; load() }"
          />
        </el-form-item>
        <el-form-item v-for="fc in enumFilterColumns" :key="fc.code" :label="fc.label">
          <el-select
            v-model="filters[fc.code]"
            clearable
            placeholder="全部"
            style="width: 160px"
            @change="() => { query.page = 1; load() }"
            @clear="() => { query.page = 1; load() }"
          >
            <el-option v-for="opt in (fc.enum_options || [])" :key="opt" :label="opt" :value="opt" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button @click="() => { query.page = 1; load() }">查询</el-button>
        </el-form-item>
      </el-form>

      <!-- 勾选后浮出的批量操作条 -->
      <BulkActionBar
        :selected-rows="selectedRows"
        :status-col="statusCol"
        :table-code="meta.code"
        @bulk-status="bulkSetStatus"
        @bulk-delete="bulkDelete"
        @clear="tableRef?.clearSelection?.()"
      />

      <el-table
          ref="tableRef"
          v-loading="loading"
          :data="list"
          stripe
          border
          style="width: 100%"
          max-height="600"
          @selection-change="onSelectionChange"
        >
          <el-table-column type="selection" width="48" :selectable="() => true" />
          <el-table-column
            v-for="col in columns"
            :key="col.code"
            :label="col.label"
            :prop="col.code"
            min-width="140"
          >
            <template #header>
              {{ col.label }}
              <el-tag v-if="col.is_pk_part" size="small" type="primary" effect="plain" style="margin-left: 4px">PK</el-tag>
              <el-tag v-if="col.is_sensitive" size="small" type="danger" effect="plain" style="margin-left: 4px">敏感</el-tag>
              <el-tag v-if="isEditable(col)" size="small" type="warning" effect="plain" style="margin-left: 4px">可编辑</el-tag>
            </template>
            <template #default="{ row }">
              <span v-if="col.is_sensitive" style="color: var(--color-text-placeholder); font-family: monospace">
                ▘▘▘▘▘
              </span>
              <template v-else-if="isEditable(col)">
                <!-- 值列表：直接下拉选择，选中即保存 -->
                <el-select
                  v-if="col.data_type === 'enum'"
                  :model-value="row[col.code] ?? ''"
                  size="small"
                  placeholder="—"
                  style="width: 100%"
                  @change="(v: any) => saveCell(row, col, v)"
                >
                  <el-option v-for="opt in (col.enum_options || [])" :key="opt" :label="opt" :value="opt" />
                </el-select>
                <!-- 其它手工字段：点击进入文本编辑 -->
                <template v-else>
                  <el-input
                    v-if="isEditing(row, col)"
                    v-model="editValue"
                    size="small"
                    autofocus
                    @blur="saveEdit(row, col)"
                    @keyup.enter="saveEdit(row, col)"
                  />
                  <span v-else class="editable-cell" title="点击编辑" @click="startEdit(row, col)">
                    {{ formatCell(row, col) }}
                  </span>
                </template>
              </template>
              <span v-else>{{ formatCell(row, col) }}</span>
            </template>
          </el-table-column>
          <template #empty>
            <div style="padding: 32px 0; color: var(--color-text-placeholder); font-size: 13px">
              <template v-if="columns.length === 0">
                <template v-if="isManualTable">
                  该表暂无字段 · 先到「字段管理」添加列，再用右上角「新增行」录入数据
                </template>
                <template v-else>
                  字段尚未发现 · 点右上角「立即拉取」从源端同步，字段会自动注册
                </template>
              </template>
              <template v-else>
                <template v-if="isManualTable">
                  暂无数据 · 点右上角「新增行」手工录入
                </template>
                <template v-else>
                  暂无数据 · 点右上角「立即拉取」从北森同步
                </template>
              </template>
            </div>
          </template>
        </el-table>

      <el-pagination
        style="margin-top: 16px; justify-content: flex-end"
        v-model:current-page="query.page"
        v-model:page-size="query.page_size"
        :total="total"
        :page-sizes="[20, 50, 100, 200]"
        layout="total, sizes, prev, pager, next, jumper"
        @current-change="load"
        @size-change="load"
      />
    </el-card>

    <el-card v-else>
      <el-empty description="未知的数据表路径" />
    </el-card>

    <!-- 新增行对话框（手工维护表）-->    <el-dialog v-model="createOpen" :title="`新增行 · ${meta?.label ?? ''}`" width="560px">
      <el-form v-if="editableColumns.length" label-position="top">
        <el-form-item v-for="c in editableColumns" :key="c.code" :label="c.label">
          <el-select
            v-if="c.data_type === 'enum'"
            v-model="createForm[c.code]"
            clearable
            placeholder="请选择"
            style="width: 100%"
          >
            <el-option v-for="opt in (c.enum_options || [])" :key="opt" :label="opt" :value="opt" />
          </el-select>
          <el-input v-else v-model="createForm[c.code]" :placeholder="`输入${c.label}`" />
        </el-form-item>
      </el-form>
      <el-empty v-else description="该表还没有可录入的字段，请先到「字段管理」添加列" />
      <template #footer>
        <el-button @click="createOpen = false">取消</el-button>
        <el-button type="primary" :loading="creating" :disabled="!editableColumns.length" @click="submitCreate">
          保存
        </el-button>
      </template>
    </el-dialog>

  </div>
</template>

<style scoped>
.editable-cell {
  display: inline-block;
  min-width: 40px;
  cursor: text;
  border-bottom: 1px dashed var(--el-border-color, #dcdfe6);
}
.editable-cell:hover {
  background: var(--el-fill-color-light, #f5f7fa);
}
</style>
