<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import SearchInput from '@/components/common/SearchInput.vue'
import PageTitle from '@/components/common/PageTitle.vue'
import UiSurface from '@/components/ui/UiSurface.vue'
import UiTable, { type UiTableColumn } from '@/components/ui/UiTable.vue'
import UiPagination from '@/components/ui/UiPagination.vue'
import PerformanceColumnVisibilityDrawer, { type PerformanceColumnOption } from '@/components/performance/PerformanceColumnVisibilityDrawer.vue'
import PerformanceTableSummary from '@/components/performance/PerformanceTableSummary.vue'
import MetricTemplateEmptyIllustration from '@/components/performance/MetricTemplateEmptyIllustration.vue'
import UiDialogShell from '@/components/ui/UiDialogShell.vue'
import { allocationResultApi, type AllocationField, type AllocationRow } from '@/api/allocationResult'
import { useUserStore } from '@/stores/user'
import { formatDisplayDateTime } from '@/utils/datetime'

const store = useUserStore()
const canView = computed(() => store.menus.some(m => m.code === 'people.salary.allocation_result'))

const fields = ref<AllocationField[]>([])
const keyword = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const rows = ref<AllocationRow[]>([])
const loading = ref(false)
const error = ref('')
const drawerOpen = ref(false)

// 列映射：分摊结果页列的取值逻辑
const ALLOCATION_VALUE_KEY: Record<string, keyof AllocationRow> = {
  cost_period: 'cost_period',
  employee_no: 'employee_no',
  full_name: 'employee_name', // 姓名：花名册当前值
  employee_name: 'employee_name',
  cost_center_code: 'code', // 成本中心编码：分摊表 code
  code: 'code',
  cost_center_name: 'cc_name', // 成本中心名称：成本中心树权威
  cc_name: 'cc_name',
  allocation_percentage: 'allocation_percentage',
  headcount: 'headcount',
  synced_at: '_synced_at', // 更新时间：分摊表 synced_at
  updated_at: '_synced_at',
}

/** 字段 → 取值键映射（标准字段 field_code → 行数据键）。 */
function valueKey(field: AllocationField): keyof AllocationRow | undefined {
  return ALLOCATION_VALUE_KEY[field.field_code] ?? ALLOCATION_VALUE_KEY[field.field_name]
}

/** 隐藏列偏好：按用户持久化。 */
const LS_KEY = 'people.allocation-result.columns'
const selectedColumnKeys = ref<string[]>([])
const columnsInitialized = ref(false)
const allColumnKeys = computed(() => fields.value.map(field => String(field.id)))

function loadPreference() {
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string[]>
      selectedColumnKeys.value = parsed[String(store.user?.id)] ?? []
    }
  } catch {
    selectedColumnKeys.value = []
  }
}
function savePreference() {
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    const current = raw ? JSON.parse(raw) as Record<string, string[]> : {}
    current[String(store.user?.id)] = selectedColumnKeys.value
    window.localStorage.setItem(LS_KEY, JSON.stringify(current))
  } catch {
    // localStorage 不可用时静默忽略
  }
}
function applyColumns(keys: string[]) {
  selectedColumnKeys.value = keys
  savePreference()
}

const columnOptions = computed<PerformanceColumnOption[]>(() => fields.value.map(field => ({
  key: String(field.id), label: field.field_name,
})))
const visibleColumns = computed(() => selectedColumnKeys.value.map(key => columnOptions.value.find(column => column.key === key)).filter((column): column is PerformanceColumnOption => Boolean(column)))
const hiddenColumnCount = computed(() => Math.max(0, fields.value.length - visibleColumns.value.length))

/** 可见字段（按隐藏列偏好过滤后的字段定义）。 */
const visibleFieldList = computed(() => fields.value.filter(field => selectedColumnKeys.value.includes(String(field.id))))

/** 当前页是否存在可见字段值；字段全空时视为无数据，进入空态。 */
const hasVisibleData = computed(() => rows.value.some(row => visibleFieldList.value.some(field => cellValue(row, field) !== undefined)))

/** 表格只渲染有可见字段值的行；全空行不显示为"空行"。 */
const displayedRows = computed(() => rows.value.filter(row => visibleFieldList.value.some(field => cellValue(row, field) !== undefined)))

function cellValue(row: AllocationRow, field: AllocationField): unknown {
  const key = valueKey(field)
  if (!key) return undefined
  const raw = row[key]
  if (raw === null || raw === undefined || raw === '') return undefined
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw)) return formatDisplayDateTime(raw)
  return raw
}

const tableColumns = computed<UiTableColumn[]>(() => [
  ...visibleColumns.value.map(column => ({
    key: column.key,
    label: column.label,
    minWidth: 140,
  })),
  {
    key: '_action',
    label: '操作',
    width: 100,
    fixed: 'right' as const,
  },
])
const fieldByKey = computed(() => new Map(fields.value.map(field => [String(field.id), field])))

let request = 0
function message(cause: any) {
  const value = cause?.response?.data?.detail
  return (typeof value === 'string' ? value : value?.message) || '读取失败，请核对当前权限后重试。'
}

async function loadFields() {
  const current = ++request
  fields.value = []
  if (!canView.value) return
  try {
    const response = await allocationResultApi.fields()
    if (current !== request) return
    fields.value = response.items.filter(field => field.is_active)
    if (!columnsInitialized.value) {
      loadPreference()
      const retained = selectedColumnKeys.value.filter(key => fields.value.some(field => String(field.id) === key))
      selectedColumnKeys.value = retained.length ? retained : fields.value.map(field => String(field.id))
      columnsInitialized.value = true
    }
  } catch (cause) {
    if (current === request) error.value = message(cause)
  }
}

async function loadRows() {
  const current = request
  if (!canView.value) return
  loading.value = true
  error.value = ''
  try {
    const response = await allocationResultApi.rows({
      page: page.value,
      page_size: pageSize.value,
      keyword: keyword.value.trim() || undefined,
    })
    if (current === request) {
      rows.value = response.items
      total.value = response.total
    }
  } catch (cause) {
    if (current === request) error.value = message(cause)
  } finally {
    if (current === request) loading.value = false
  }
}

function load() {
  const current = ++request
  rows.value = []
  total.value = 0
  error.value = ''
  if (!canView.value) return
  loading.value = true
  Promise.all([loadFields(), loadRows()])
    .catch(() => {})
    .finally(() => { if (current === request) loading.value = false })
}

function search() {
  page.value = 1
  void loadRows()
}

// 编辑占位弹窗：只读展示行信息，编辑功能暂未开发
const editTarget = ref<AllocationRow | null>(null)
const editDialogOpen = ref(false)
const editSaving = ref(false)
const editSaved = ref(false)

function openEdit(row: AllocationRow) {
  editTarget.value = row
  editSaved.value = false
  editDialogOpen.value = true
}

function closeEdit() {
  editDialogOpen.value = false
  editTarget.value = null
}

watch(() => [canView.value, store.user?.id, JSON.stringify(store.menus)], load, { immediate: true, flush: 'sync' })
watch([page, pageSize], () => { void loadRows() })
onBeforeUnmount(() => { ++request })
</script>

<template>
  <div class="allocation-result">
    <PageTitle title="分摊结果" description="员工月度成本分摊结果，字段由后台字段设置维护；编码/名称以成本中心为准，姓名以人员信息页为准。" />
    <UiSurface class="allocation-result__card">
      <el-alert v-if="!canView" title="需要分摊结果查看权限。" type="info" :closable="false" />
      <template v-else>
        <el-alert v-if="error" :title="error" type="error" :closable="false" />
        <div v-else>
          <div class="allocation-result__toolbar">
            <SearchInput v-model="keyword" placeholder="搜索月份、工号、编码等" @keyup.enter="search" />
            <button type="button" class="allocation-result__search" @click="search">查询</button>
          </div>
          <PerformanceTableSummary :total="hasVisibleData ? total : 0" :hidden-column-count="hiddenColumnCount" @columns="drawerOpen = true" />
          <div v-loading="loading" class="allocation-result__table">
            <UiTable
              :columns="tableColumns"
              :rows="displayedRows"
              :row-key="row => String(row._id)"
              :loading="loading"
              :empty-text="fields.length ? '暂无分摊结果数据。' : '暂无字段，可在后台字段设置中添加。'"
              :min-width="tableColumns.length * 140"
              sticky-header-top="0px"
              aria-label="分摊结果"
            >
              <template #cell="{ row, column }">
                <template v-if="column.key === '_action'">
                  <span class="org-table__actions">
                    <button type="button" class="org-table__action" :aria-label="`编辑${(row as AllocationRow)?.employee_no ?? ''}`" @click.stop="openEdit(row as AllocationRow)">编辑</button>
                  </span>
                </template>
                <span v-else :class="{ 'is-cc-invalid': column.key === 'code' && row._cc_valid === false }">{{ cellValue(row, fieldByKey.get(column.key)!) ?? '--' }}</span>
              </template>
              <template #empty="{ loading: isLoading }">
                <span v-if="isLoading">加载中</span>
                <div v-else-if="fields.length" class="allocation-result__empty">
                  <MetricTemplateEmptyIllustration />
                  <span class="allocation-result__empty-text">暂无分摊结果数据。</span>
                </div>
                <span v-else>暂无字段，可在后台字段设置中添加。</span>
              </template>
            </UiTable>
          </div>
          <UiPagination v-if="hasVisibleData" class="allocation-result__pagination" :page="page" :page-size="pageSize" :total="total" @page-change="page = $event" @page-size-change="pageSize = $event; page = 1" />
        </div>
      </template>
    </UiSurface>

    <!-- 编辑占位弹窗：正常开合，编辑功能暂未开发 -->
    <UiDialogShell
      v-model="editDialogOpen"
      :title="`编辑分摊结果`"
      width="560px"
    >
      <template v-if="editTarget">
        <div class="allocation-result__edit-body">
          <p class="allocation-result__edit-hint">编辑功能暂未开发，当前为只读展示。</p>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="月份">{{ editTarget.cost_period ?? '--' }}</el-descriptions-item>
            <el-descriptions-item label="工号">{{ editTarget.employee_no ?? '--' }}</el-descriptions-item>
            <el-descriptions-item label="姓名">{{ editTarget.employee_name ?? '--' }}</el-descriptions-item>
            <el-descriptions-item label="成本中心编码">{{ editTarget.code ?? '--' }}</el-descriptions-item>
            <el-descriptions-item label="成本中心名称">{{ editTarget.cc_name ?? '--' }}</el-descriptions-item>
            <el-descriptions-item label="分摊比例">{{ editTarget.allocation_percentage ?? editTarget.headcount ?? '--' }}</el-descriptions-item>
            <el-descriptions-item label="更新时间" :span="2">{{ editTarget._synced_at ? formatDisplayDateTime(editTarget._synced_at) : '--' }}</el-descriptions-item>
          </el-descriptions>
        </div>
      </template>
      <template #footer>
        <button type="button" class="allocation-result__dialog-close" @click="closeEdit">关闭</button>
      </template>
    </UiDialogShell>

    <PerformanceColumnVisibilityDrawer v-model="drawerOpen" :columns="columnOptions" :selected-keys="selectedColumnKeys" @confirm="applyColumns" />
  </div>
</template>

<style scoped>
.allocation-result {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-height: 100%;
  width: 100%;
  flex: 1 0 auto;
  min-width: 0;
  padding: var(--ui-page-padding);
  background: var(--ui-page-background);
}
.allocation-result__card { display: flex; flex-direction: column; flex: 0 0 auto; min-width: 0; }
.allocation-result__card > .el-alert { margin-top: var(--spacing-4); }
.allocation-result__toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--page-gap-toolbar-items); margin-bottom: var(--page-gap-toolbar-table); }
.allocation-result__search {
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: var(--color-primary);
  color: var(--color-bg-card);
  cursor: pointer;
  font: 400 14px/32px var(--font-sans);
}
/* 操作列「编辑」按钮：设计稿 17:1042 主要文字按钮·无图标·六态组件库
   高度26 / 行高22 / 上下内边距2 左右4 / 圆角6 / 描边0 / 文字14 Medium
   六态：默认文字#1456F0透明底；悬停底rgba(20,86,240,.1)；按下底rgba(20,86,240,.2) */
.org-table__actions { display: inline-flex; align-items: center; gap: 4px; }
.org-table__action {
  height: 26px;
  padding: 2px 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-primary-hover);
  cursor: pointer;
  font: 500 14px/22px var(--font-sans);
  white-space: nowrap;
}
.org-table__action:hover { background: rgba(20, 86, 240, 0.1); }
.org-table__action:active { background: rgba(20, 86, 240, 0.2); }
.org-table__action:focus-visible { outline: 2px solid var(--performance-button-focus-ring); outline-offset: 2px; }
.allocation-result__table { display: flex; flex-direction: column; min-width: 0; }
.allocation-result__empty { display: flex; flex-direction: column; align-items: center; gap: var(--spacing-2); padding: var(--spacing-5) 0; }
.allocation-result__empty-text { color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: var(--ui-table-line-height); }
.allocation-result__pagination { margin-top: var(--page-gap-toolbar-table); }
.is-cc-invalid { color: var(--color-danger); }
.allocation-result__edit-body { padding: var(--spacing-4) 0; }
.allocation-result__edit-hint { margin: 0 0 var(--spacing-3); color: var(--color-text-secondary); font-size: var(--font-size-sm); }
.allocation-result__dialog-close {
  height: 32px;
  padding: 0 16px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-regular);
  cursor: pointer;
  font: 400 14px/32px var(--font-sans);
}
</style>
