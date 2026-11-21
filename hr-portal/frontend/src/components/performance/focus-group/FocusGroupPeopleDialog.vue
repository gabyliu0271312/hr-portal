<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PerformanceFocusGroupChangePerson, PerformancePeopleGroup } from '@/api/performance'
import PerformancePeopleGrouping from '../PerformancePeopleGrouping.vue'
import PerformanceMemberIdentity from '../PerformanceMemberIdentity.vue'
import UiFullScreenModal from '@/components/ui/UiFullScreenModal.vue'
import PerformanceManagementTable from '../PerformanceManagementTable.vue'
import UiSurface from '@/components/ui/UiSurface.vue'
import PerformanceListToolbar from '../PerformanceListToolbar.vue'
import MetricTemplateEmptyIllustration from '../MetricTemplateEmptyIllustration.vue'
import type { PerformanceTableColumn } from '../performanceTableColumns'

/**
 * 人员列表全屏弹窗（REA 对齐飞书人员列表页）。
 * - 页壳：UiFullScreenModal，title「人员列表」+ subtitle 组名，返回键关闭
 * - 工具栏：「搜索成员」搜索框 + 「筛选」按钮；数据源组件注入 loadFn 拉取
 * - 表格：姓名固定左列 / 直属上级 / 一级部门 / 末级部门 / 序列；一级部门读 department 物理列
 *   （花名册一级部门），末级部门从 organization_ref 拆路径（leafDepartment，与
 *   PerformancePeopleListPanel 同源复用），序列读后端 format_job_sequence（职位族-职位类，
 *   与绩效评估「上级评估」成员列表同逻辑）
 * - 分页：共 N 条 + 页码 + 条/页（走 PerformanceManagementTable 内置 UiPagination）
 */
const props = defineProps<{
  modelValue: boolean
  title: string
  subtitle?: string
  variant?: 'default' | 'calibration'
  columns?: PerformanceTableColumn[]
  groups?: PerformancePeopleGroup[]
  rows: PerformanceFocusGroupChangePerson[]
  total?: number
  loading: boolean
  error: string
  /** 数据源注入：当前页数据拉取（含 keyword）；不传则组件本地过滤分页 */
  loadFn?: (keyword: string, page: number, pageSize: number) => Promise<{ total: number; items: PerformanceFocusGroupChangePerson[] }> | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const keyword = ref('')
const page = ref(1)
const pageSize = ref(10)
const grouped = ref(false)
const collapsed = ref(new Set<string>())
const filteredRows = computed(() => {
  const query = keyword.value.trim()
  return props.loadFn || !query ? props.rows : props.rows.filter(row => searchableText(row).includes(query))
})
const groupedRows = computed(() => {
  const people = new Map(filteredRows.value.map(person => [person.employee_no, person]))
  const groups = props.groups || []
  const ids = new Set(groups.map(group => group.id))
  const children = new Map<string | null, PerformancePeopleGroup[]>()
  for (const group of groups) {
    const parent = group.parent_id !== group.id && ids.has(group.parent_id!) ? group.parent_id : null
    children.set(parent, [...(children.get(parent) || []), group])
  }
  const visited = new Set<string>()
  const result: Array<{ key: string; person?: PerformanceFocusGroupChangePerson; group?: PerformancePeopleGroup; depth: number }> = []
  const visit = (group: PerformancePeopleGroup, depth: number, hidden = false) => {
    if (visited.has(group.id)) return
    visited.add(group.id)
    const start = result.length
    if (!hidden) result.push({ key: `group:${group.id}`, group, depth })
    const closed = hidden || collapsed.value.has(group.id)
    const members = group.employee_nos.filter(id => people.has(id))
    if (!closed) for (const id of members) result.push({ key: `person:${id}`, person: people.get(id), depth: depth + 1 })
    let matches = members.length > 0
    for (const child of children.get(group.id) || []) matches = visit(child, depth + 1, closed) || matches
    if (!matches) result.splice(start)
    return matches
  }
  for (const group of children.get(null) || []) visit(group, 0)
  for (const group of groups) if (!visited.has(group.id)) visit(group, 0)
  return result
})
function toggleGroup(id: string) {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}
watch(grouped, () => { page.value = 1; collapsed.value = new Set() })
watch(keyword, () => { page.value = 1; collapsed.value = new Set() })

const defaultColumns: PerformanceTableColumn[] = [
  { key: 'display_name', label: '姓名', width: 312, fixed: 'left' },
  { key: 'direct_supervisor_name', label: '直属上级', width: 312 },
  { key: 'department', label: '一级部门', width: 312 },
  { key: 'leaf_department', label: '末级部门', width: 312 },
  { key: 'job_sequence', label: '序列', width: 312 },
]

const calibrationColumns: PerformanceTableColumn[] = [
  { key: 'display_name', label: '姓名', width: 312, fixed: 'left' },
  { key: 'direct_supervisor_name', label: '直属上级', width: 312 },
  { key: 'dotted_supervisor_name', label: '虚线上级', width: 312 },
  { key: 'department', label: '一级部门', width: 312 },
  { key: 'leaf_department', label: '末级部门', width: 312 },
  { key: 'job_sequence', label: '序列', width: 312 },
  { key: 'job_sub_sequence', label: '子序列', width: 312 },
  { key: 'position_name', label: '职务', width: 312 },
]
const columns = computed(() => props.columns ?? (props.variant === 'calibration' ? calibrationColumns : defaultColumns))

function leafDepartment(row: PerformanceFocusGroupChangePerson): string {
  if (row.leaf_department) return row.leaf_department
  const parts = (row.organization_ref ?? '').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

const resultCount = computed(() => {
  if (props.loadFn) return props.total ?? 0
  const query = keyword.value.trim()
  if (!query) return props.rows.length
  return props.rows.filter(row => searchableText(row).includes(query)).length
})
const displayedRows = computed(() => {
  if (grouped.value) return groupedRows.value.map(entry => ({ ...entry.person, __key: entry.key, __group: entry.group, __depth: entry.depth }))
  if (props.loadFn) return props.rows
  const start = (page.value - 1) * pageSize.value
  return filteredRows.value.slice(start, start + pageSize.value)
})

function searchableText(row: PerformanceFocusGroupChangePerson) {
  return [row.display_name, row.employee_no, row.direct_supervisor_name, row.dotted_supervisor_name, row.department, leafDepartment(row), row.department_2, row.job_sequence, row.job_sub_sequence, row.position_name, row.job_family, row.job_category, row.standard_position]
    .filter(Boolean)
    .join(' ')
}

function onSearch() {
  page.value = 1
  if (props.loadFn) void props.loadFn?.(keyword.value.trim(), 1, pageSize.value)
}

function onClear() {
  keyword.value = ''
  page.value = 1
  if (props.loadFn) void props.loadFn?.('', 1, pageSize.value)
}

function changePage(value: number) {
  page.value = value
  if (props.loadFn) void props.loadFn?.(keyword.value.trim(), value, pageSize.value)
}
function changePageSize(value: number) {
  pageSize.value = value
  page.value = 1
  if (props.loadFn) void props.loadFn?.(keyword.value.trim(), 1, value)
}

function onFilter() {
  onSearch()
}

watch(() => props.modelValue, open => {
  if (open) {
    keyword.value = ''
    page.value = 1
    grouped.value = false
    collapsed.value = new Set()
  }
})

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <Teleport to="body">
  <UiFullScreenModal v-if="props.modelValue" class="focus-group-people-dialog" :class="{ 'focus-group-people-dialog--calibration': props.variant === 'calibration' }" :title="props.title" :show-footer="false" content-scroll="page" @back="close">
    <template #subtitle>{{ props.subtitle }}</template>
    <div class="focus-group-people-page">
      <UiSurface class="focus-group-people-surface" radius="all" min-width="0" padding="var(--ui-surface-padding-spacious)">
      <p v-if="props.error" class="focus-group-people-error" role="alert">{{ props.error }}</p>
      <PerformanceListToolbar v-model:keyword="keyword" search-placeholder="搜索成员" search-aria-label="搜索成员" search-fill :filter-disabled="props.loading" @search="onSearch" @clear="onClear" @filter="onFilter"><template v-if="$slots.actions" #actions><slot name="actions" /></template></PerformanceListToolbar>
      <div class="focus-group-people-result" aria-live="polite"><span>{{ resultCount }}个结果</span><PerformancePeopleGrouping v-if="props.groups" v-model="grouped" :disabled="props.loading || Boolean(props.error)" /></div>
      <PerformanceManagementTable
        :rows="displayedRows"
        :columns="columns"
        :loading="props.loading"
        loading-text="正在加载人员…"
        :empty-text="props.error || '暂无人员'"
        table-aria-label="人员列表"
        pagination-aria-label="人员列表分页"
        scroll-mode="page"
        :row-key="grouped ? '__key' : 'employee_no'"
        :row-visible="row => !row.__group"
        :show-pagination="!grouped"
        :page="page"
        :page-size="pageSize"
        :total="resultCount"
        @page-change="changePage"
        @page-size-change="changePageSize"
        class="focus-group-people-table"
        :class="{ 'focus-group-people-table--groupable': props.groups }"
      >
        <template #before-row="{ row }">
          <tr v-if="row.__group" class="people-group-row"><td :colspan="columns.length"><button type="button" :style="{ paddingLeft: `calc(var(--ui-table-cell-padding-inline) + ${row.__depth} * var(--performance-people-group-indent))` }" :aria-expanded="!collapsed.has(row.__group.id)" :aria-label="`${collapsed.has(row.__group.id) ? '展开' : '收起'}${row.__group.label}的分组`" @click="toggleGroup(row.__group.id)"><svg :class="{ 'is-collapsed': collapsed.has(row.__group.id) }" viewBox="0 0 24 24" aria-hidden="true"><path d="M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z" fill="currentColor" /></svg><span>{{ row.__group.label }}</span></button></td></tr>
        </template>
        <template #pagination-prefix>
          <span class="focus-group-people-total">共 {{ resultCount }} 条</span>
        </template>
        <template #cell="{ row, column }">
          <PerformanceMemberIdentity v-if="props.groups && (column.key === 'display_name' || column.key === 'direct_supervisor_name') && row[column.key]" :display-name="row[column.key]" size="sm" :style="column.key === 'display_name' && grouped ? { paddingLeft: `calc(${row.__depth} * var(--performance-people-group-indent))` } : undefined" />
          <span v-else-if="column.key === 'leaf_department'">{{ leafDepartment(row as PerformanceFocusGroupChangePerson) || '--' }}</span>
          <span v-else>{{ (row as PerformanceFocusGroupChangePerson)[column.key as keyof PerformanceFocusGroupChangePerson] || '--' }}</span>
        </template>
        <template #empty="{ loading: isLoading, text }">
          <div v-if="!isLoading" class="focus-group-people-empty">
            <MetricTemplateEmptyIllustration />
            <span class="focus-group-people-empty__text">{{ text }}</span>
          </div>
        </template>
      </PerformanceManagementTable>
      </UiSurface>
    </div>
  </UiFullScreenModal>
  </Teleport>
</template>

<style scoped>
.focus-group-people-dialog {
  z-index: var(--performance-people-dialog-z-index);
  --ui-fullscreen-background: var(--performance-page-surface);
  --performance-fullscreen-content-bottom-space: 0px;
}
.focus-group-people-dialog--calibration { --performance-header-title-desc-gap: var(--spacing-3); }
.focus-group-people-dialog--calibration :deep(.full-screen-modal-header-subtitle) { color: var(--performance-text-secondary); font: 400 var(--font-size-md)/var(--performance-input-line-height) var(--font-sans); }
.focus-group-people-page {
  width: 100%;
  min-width: 0;
  min-height: 100%;
  flex: 1 0 auto;
  padding: var(--spacing-5) var(--ui-page-content-inset) var(--ui-page-content-inset);
  box-sizing: border-box;
}
.focus-group-people-surface { width: 100%; }
.focus-group-people-error { margin: 0 0 var(--spacing-3); color: var(--performance-field-error-color); font-size: var(--font-size-md); line-height: var(--ui-table-line-height); }
.focus-group-people-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: var(--performance-button-height);
  margin-bottom: var(--spacing-2);
  color: var(--ui-table-text-color);
  font-size: var(--ui-table-font-size);
  line-height: var(--ui-table-line-height);
}
.focus-group-people-table--groupable { --ui-table-row-height: var(--performance-people-group-height); }
.people-group-row td { padding: 0; border-bottom: var(--performance-popover-border-width) solid var(--ui-table-border-color); background: var(--performance-people-group-background); }
.people-group-row button { display: flex; align-items: center; gap: var(--spacing-2); width: 100%; height: var(--performance-people-group-height); padding-block: 0; padding-right: var(--ui-table-cell-padding-inline); border: 0; background: transparent; color: var(--color-text-primary); font: var(--performance-people-group-font-weight) var(--font-size-md)/var(--ui-table-line-height) var(--font-sans); text-align: left; cursor: pointer; }
.people-group-row svg { flex: none; width: var(--performance-people-group-icon-size); height: var(--performance-people-group-icon-size); }
.people-group-row svg.is-collapsed { transform: rotate(-90deg); }
.focus-group-people-total { color: var(--ui-pagination-color); font-size: var(--font-size-md); line-height: var(--ui-table-line-height); }
.focus-group-people-empty { display: flex; flex-direction: column; align-items: center; gap: var(--spacing-2); padding: var(--spacing-5) 0; }
.focus-group-people-empty__text { color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: var(--ui-table-line-height); }
</style>
