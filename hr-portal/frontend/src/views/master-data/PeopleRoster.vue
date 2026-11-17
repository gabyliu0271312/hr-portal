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
import { standardFieldsApi, type PeopleField } from '@/api/standardFields'
import { dataApi, type DataPage } from '@/api/data'
import { useUserStore } from '@/stores/user'
import { formatDisplayDateTime } from '@/utils/datetime'

const store = useUserStore()
const canView = computed(() => store.menus.some(m => m.code === 'people.app'))
const fields = ref<PeopleField[]>([])
const keyword = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const rows = ref<any[]>([])
const loading = ref(false)
const error = ref('')
const drawerOpen = ref(false)
const sortKey = ref('')
const sortOrder = ref<'asc' | 'desc' | ''>('')
const sortedRows = computed(() => {
  if (!sortKey.value || !sortOrder.value) return rows.value
  const field = fieldByKey.value.get(sortKey.value)
  if (!field) return rows.value
  const dir = sortOrder.value === 'asc' ? 1 : -1
  return [...rows.value].sort((a, b) => {
    const left = cellValue(a, field)
    const right = cellValue(b, field)
    if (left === undefined && right === undefined) return 0
    if (left === undefined) return 1
    if (right === undefined) return -1
    return String(left).localeCompare(String(right), 'zh-CN') * dir
  })
})

/** 可见字段（按隐藏列偏好过滤后的字段定义）。 */
const visibleFieldList = computed(() => fields.value.filter(field => selectedColumnKeys.value.includes(String(field.id))))

/** 当前页是否存在可见字段值；字段全空时视为无数据，进入空态。 */
const hasVisibleData = computed(() => sortedRows.value.some(row => visibleFieldList.value.some(field => cellValue(row, field) !== undefined)))

/** 表格只渲染有可见字段值的行；全空行不显示为"空行"。 */
const displayedRows = computed(() => sortedRows.value.filter(row => visibleFieldList.value.some(field => cellValue(row, field) !== undefined)))
let request = 0

function message(cause: any) {
  const value = cause?.response?.data?.detail
  return (typeof value === 'string' ? value : value?.message) || '读取失败，请核对当前权限后重试。'
}

/** 人员信息页隐藏列偏好：按用户维度持久化到 localStorage。 */
const LS_KEY = 'people.roster.columns'
const allColumnKeys = computed(() => fields.value.map(field => String(field.id)))
const selectedColumnKeys = ref<string[]>([])
const columnsInitialized = ref(false)

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
    // localStorage 不可用时静默忽略，不影响页面
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

async function loadFields() {
  const current = ++request
  fields.value = []
  rows.value = []
  total.value = 0
  if (!canView.value) return
  try {
    const response = await standardFieldsApi.peopleFields()
    if (current !== request) return
    fields.value = response.items.filter(field => field.is_active)
    if (!columnsInitialized.value) {
      loadPreference()
      const retained = selectedColumnKeys.value.filter(key => fields.value.some(field => String(field.id) === key))
      selectedColumnKeys.value = retained.length ? retained : fields.value.map(field => String(field.id))
      columnsInitialized.value = true
    }
  } catch (cause) { if (current === request) error.value = message(cause) }
}

async function loadRows() {
  const current = request
  if (!canView.value) return
  loading.value = true
  error.value = ''
  try {
    const response = await dataApi.query('emp_realtime_roster', {
      page: page.value,
      page_size: pageSize.value,
      keyword: keyword.value.trim() || undefined,
    })
    if (current === request) { rows.value = response.items; total.value = response.total }
  } catch (cause) { if (current === request) error.value = message(cause) }
  finally { if (current === request) loading.value = false }
}

function load() {
  const current = ++request
  fields.value = []
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

/** 单元格取值：字段目录 field_code → 花名册行物理列 column_code。 */
function cellValue(row: any, field: PeopleField) {
  const raw = row[field.field_code]
  if (raw === null || raw === undefined || raw === '') return undefined
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw)) return formatDisplayDateTime(raw)
  return raw
}

const tableColumns = computed<UiTableColumn[]>(() => visibleColumns.value.map(column => ({
  key: column.key,
  label: column.label,
  minWidth: 140,
})))
const fieldByKey = computed(() => new Map(visibleFieldList.value.map(field => [String(field.id), field])))

function onSort(payload: { key: string; order: 'asc' | 'desc' | '' }) {
  sortKey.value = payload.key
  sortOrder.value = payload.order
}

watch(() => [canView.value, store.user?.id, JSON.stringify(store.menus)], load, { immediate: true, flush: 'sync' })
watch([page, pageSize], () => { void loadRows() })
onBeforeUnmount(() => { ++request })
</script>

<template>
  <div class="people-roster">
    <PageTitle title="人员信息" description="员工花名册数据，字段由后台字段设置维护；不常用字段可隐藏。" />
    <UiSurface class="people-roster__card">
      <el-alert v-if="!canView" title="需要人员查看权限。" type="info" :closable="false" />
      <template v-else>
        <el-alert v-if="error" :title="error" type="error" :closable="false" />
        <div v-else>
          <div class="people-roster__toolbar">
            <SearchInput v-model="keyword" placeholder="搜索姓名、工号等" @keyup.enter="search" />
            <button type="button" class="people-roster__search" @click="search">查询</button>
          </div>
          <PerformanceTableSummary :total="hasVisibleData ? total : 0" :hidden-column-count="hiddenColumnCount" @columns="drawerOpen = true" />
          <div v-loading="loading" class="people-roster__table">
            <UiTable
              :columns="tableColumns"
              :rows="displayedRows"
              :row-key="row => String(row.id ?? row._id)"
              :loading="loading"
              :empty-text="fields.length ? '暂无人员数据。' : '暂无字段，可在后台字段设置中添加。'"
              :min-width="tableColumns.length * 140"
              sticky-header-top="0px"
              :sort-key="sortKey"
              :sort-order="sortOrder"
              aria-label="人员信息"
              @sort-change="onSort"
            >
              <template #cell="{ row, column }">
                <span>{{ cellValue(row, fieldByKey.get(column.key)!) ?? '--' }}</span>
              </template>
              <template #empty="{ loading: isLoading }">
                <span v-if="isLoading">加载中</span>
                <div v-else-if="fields.length" class="people-roster__empty">
                  <MetricTemplateEmptyIllustration />
                  <span class="people-roster__empty-text">暂无人员数据。</span>
                </div>
                <span v-else>暂无字段，可在后台字段设置中添加。</span>
              </template>
            </UiTable>
          </div>
          <UiPagination v-if="hasVisibleData" class="people-roster__pagination" :page="page" :page-size="pageSize" :total="total" @page-change="page = $event" @page-size-change="pageSize = $event; page = 1" />
        </div>
      </template>
    </UiSurface>
    <PerformanceColumnVisibilityDrawer v-model="drawerOpen" :columns="columnOptions" :selected-keys="selectedColumnKeys" @confirm="applyColumns" />
  </div>
</template>

<style scoped>
.people-roster {
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
.people-roster__card { display: flex; flex-direction: column; flex: 0 0 auto; min-width: 0; }
.people-roster__card > .el-alert { margin-top: var(--spacing-4); }
.people-roster__toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--page-gap-toolbar-items); margin-bottom: var(--page-gap-toolbar-table); }
.people-roster__search {
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: var(--color-primary);
  color: #fff;
  cursor: pointer;
  font: 400 14px/32px var(--font-sans);
}
.people-roster__table { display: flex; flex-direction: column; min-width: 0; }
.people-roster__empty { display: flex; flex-direction: column; align-items: center; gap: var(--spacing-2); padding: var(--spacing-5) 0; }
.people-roster__empty-text { color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: var(--ui-table-line-height); }
.people-roster__pagination { margin-top: var(--page-gap-toolbar-table); }
</style>
