<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { projectManagementApi, type ProjectMatrixPerson, type ProjectMember, type PerformancePeopleProvider, type ProjectMemberPage } from '@/api/performance'
import type { PerformanceTableColumn } from './performanceTableColumns'
import UiFullScreenModal from '@/components/ui/UiFullScreenModal.vue'
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import UiSurface from '@/components/ui/UiSurface.vue'
import PerformanceListToolbar from './PerformanceListToolbar.vue'
import PerformanceMemberIdentity from './PerformanceMemberIdentity.vue'
import PerformanceRatingTag from './PerformanceRatingTag.vue'
import PerformanceEvaluateRatioPopover from './PerformanceEvaluateRatioPopover.vue'
import MetricTemplateEmptyIllustration from './MetricTemplateEmptyIllustration.vue'

const props = defineProps<{
  modelValue: boolean
  projectId: number
  cycleName: string
  level?: string
  ratingKey?: string
  ratingLabel?: string
  description?: string
  provider?: PerformancePeopleProvider
  people?: ProjectMatrixPerson[]
  bu?: string | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; 'select-member': [member: ProjectMember] }>()

const rows = ref<ProjectMember[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const page = ref(1)
const pageSize = ref(50)
const sortKey = ref('name')
const sortOrder = ref<'asc' | 'desc' | ''>('asc')

const columnSchema = ref<ProjectMemberPage | null>(null)
const columns = computed<PerformanceTableColumn[]>(() => baseColumns.filter(column => !columnSchema.value?.allowed_column_keys || columnSchema.value.allowed_column_keys.includes(column.key)).map(column => ({ ...column, sortable: column.sortable && (!columnSchema.value?.sort_keys || columnSchema.value.sort_keys.includes(column.key)) })))
const baseColumns: PerformanceTableColumn[] = [
  { key: 'name', label: '姓名', width: 422, fixed: 'left', sortable: true },
  { key: 'department_path', label: '部门全路径', width: 422 },
  { key: 'rating', label: '绩效评级', width: 271, sortable: true },
  { key: 'completion', label: '360° 评估率', width: 271, sortable: true },
  { key: 'job_sequence', label: '序列', width: 196, sortable: true },
  { key: 'position_level', label: '职级', width: 234, sortable: true },
]

const subtitle = computed(() => props.description || `符合「${props.cycleName}-终评状态：已完成，${props.cycleName}-职级：${props.level}，${props.cycleName}-绩效评级（终评）：${props.ratingLabel}」的员工`)

function departmentPath(row: ProjectMember) {
  return row.department_path || '--'
}

function matrixPersonRow(person: ProjectMatrixPerson, index: number): ProjectMember {
  return {
    ...person,
    id: person.root_review_id ?? index,
    employee_no: person.employee_no,
    display_name: person.display_name,
    employment_status: person.employment_status,
    avatar_url: null,
    rating: props.ratingLabel,
    rating_tone: null,
    completion: null,
    department_path: null,
  } as ProjectMember
}

function localRows() {
  const normalized = (props.people || []).map(matrixPersonRow)
  const term = keyword.value.trim().toLocaleLowerCase()
  const filtered = term
    ? normalized.filter(row => row.display_name.toLocaleLowerCase().includes(term) || row.employee_no.toLocaleLowerCase().includes(term))
    : normalized
  const direction = sortOrder.value === 'desc' ? -1 : 1
  const sorted = sortOrder.value ? [...filtered].sort((left, right) => {
    const key = sortKey.value === 'position_level' ? 'position_level' : sortKey.value === 'rating' ? 'rating' : sortKey.value === 'completion' ? 'completion' : 'display_name'
    const leftValue = (left as unknown as Record<string, unknown>)[key]
    const rightValue = (right as unknown as Record<string, unknown>)[key]
    return String(leftValue || '').localeCompare(String(rightValue || ''), 'zh-CN', { numeric: true }) * direction
  }) : filtered
  total.value = sorted.length
  rows.value = sorted.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
}

let requestId = 0
async function load() {
  const request = ++requestId
  if (!props.modelValue) return
  loading.value = true
  error.value = ''
  if (props.people) {
    localRows()
    loading.value = false
    return
  }
  if (!props.projectId && !props.provider) {
    loading.value = false
    return
  }
  try {
    const result = await (props.provider ? props.provider({ keyword: keyword.value.trim() || undefined, page: page.value, pageSize: pageSize.value, sortBy: sortKey.value || undefined, sortOrder: sortOrder.value || undefined }) : projectManagementApi.members(
      props.projectId,
      keyword.value.trim() || undefined,
      page.value,
      pageSize.value,
      sortKey.value || undefined,
      sortOrder.value || undefined,
      props.level,
      props.ratingKey,
      ...(props.bu != null ? [props.bu] : []),
      ))
    if (request !== requestId) return
    rows.value = result.items
    columnSchema.value = result
    total.value = result.total
  } catch {
    if (request !== requestId) return
    rows.value = []
    total.value = 0
    error.value = '人员列表加载失败，请稍后重试'
  } finally {
    if (request === requestId) loading.value = false
  }
}

function search() { page.value = 1; void load() }
function clearSearch() { keyword.value = ''; page.value = 1; void load() }
function changePage(value: number) { page.value = value; void load() }
function changePageSize(value: number) { pageSize.value = value; page.value = 1; void load() }
function changeSort(payload: { key: string; order: 'asc' | 'desc' | '' }) {
  sortKey.value = payload.key
  sortOrder.value = payload.order
  page.value = 1
  void load()
}
function close() { emit('update:modelValue', false) }
function onRowClick(row: ProjectMember) {
  if (row.can_view_detail) emit('select-member', row)
}

watch(() => [props.modelValue, props.provider], () => {
  requestId++
  if (!props.modelValue) return
  rows.value = []
  total.value = 0
  columnSchema.value = null
  keyword.value = ''
  page.value = 1
  sortKey.value = 'name'
  sortOrder.value = 'asc'
  void load()
}, { immediate: true })
onBeforeUnmount(() => { requestId++ })
</script>

<template>
  <UiFullScreenModal v-if="modelValue" class="matrix-people-dialog" title="人员列表" :show-footer="false" content-scroll="inner" @back="close">
    <template #subtitle><span class="matrix-people-subtitle">{{ subtitle }}</span></template>
    <div class="matrix-people-page">
      <UiSurface class="matrix-people-surface" radius="all" min-width="0" shadow>
      <p v-if="error" class="matrix-people-error" role="alert">{{ error }} <button type="button" @click="load">重新加载</button></p>
      <PerformanceListToolbar v-model:keyword="keyword" search-placeholder="搜索成员" search-aria-label="搜索成员" search-fill :filter-disabled="loading" @search="search" @clear="clearSearch" @filter="search" />
      <div class="matrix-people-result" aria-live="polite">{{ total }}个结果</div>
      <PerformanceManagementTable
        class="matrix-people-table"
        :rows="rows"
        :columns="columns"
        :loading="loading"
        loading-text="正在加载人员…"
        :empty-text="error || '暂无人员'"
        table-aria-label="人员列表"
        pagination-aria-label="人员列表分页"
        scroll-mode="inner"
        max-height="max-content"
        row-key="employee_no"
        :page="page"
        :page-size="pageSize"
        :total="total"
        :sort-key="sortKey"
        :sort-order="sortOrder"
        sort-mode="remote"
        :clickable-rows="rows.some(row => row.can_view_detail)"
        @row-click="onRowClick"
        @page-change="changePage"
        @page-size-change="changePageSize"
        @sort-change="changeSort"
      >
        <template #cell="{ row, column }">
          <PerformanceMemberIdentity v-if="column.key === 'name'" :display-name="(row as ProjectMember).display_name" :identity-status="(row as ProjectMember).identity_status" :class="{ 'is-detail-link': (row as ProjectMember).can_view_detail }" />
          <span v-else-if="column.key === 'department_path'">{{ departmentPath(row as ProjectMember) }}</span>
          <PerformanceRatingTag v-else-if="column.key === 'rating' && (row as ProjectMember).rating" :label="(row as ProjectMember).rating!" :color="(row as ProjectMember).rating_tone || undefined" />
          <PerformanceEvaluateRatioPopover v-else-if="column.key === 'completion' && (row as ProjectMember).evaluate_ratio" :completion="(row as ProjectMember).completion || '0/0'" :ratio="(row as ProjectMember).evaluate_ratio" />
          <span v-else>{{ (row as ProjectMember)[column.key as keyof ProjectMember] || '--' }}</span>
        </template>
        <template #empty="{ loading: isLoading, text }">
          <div v-if="!isLoading" class="matrix-people-empty">
            <MetricTemplateEmptyIllustration />
            <span>{{ text }}</span>
          </div>
        </template>
      </PerformanceManagementTable>
      </UiSurface>
    </div>
  </UiFullScreenModal>
</template>

<style scoped>
.matrix-people-dialog { --ui-fullscreen-background: var(--ui-page-background); }
.matrix-people-subtitle { color: var(--color-text-secondary); font-size: var(--font-size-md); font-weight: 400; line-height: var(--performance-header-title-line-height); white-space: nowrap; }
.matrix-people-page { width: 100%; min-width: 0; min-height: 0; display: flex; flex: 1 1 0; padding: var(--ui-surface-padding); box-sizing: border-box; }
.matrix-people-surface { width: 100%; min-height: 0; overflow: auto; }
.matrix-people-error { margin: 0 0 var(--spacing-3); color: var(--performance-field-error-color); font-size: var(--font-size-md); line-height: var(--ui-table-line-height); }
.matrix-people-result { margin-bottom: var(--spacing-2); color: var(--ui-table-text-color); font-size: var(--ui-table-font-size); line-height: var(--ui-table-line-height); }
.matrix-people-table :deep(.is-detail-link) { cursor: pointer; }
.matrix-people-table :deep(.is-detail-link .member-name) { color: var(--color-primary); text-decoration: none; }
.matrix-people-table :deep(.is-detail-link:hover .member-name) { color: var(--color-primary-hover); }
.matrix-people-empty { display: flex; flex-direction: column; align-items: center; gap: var(--spacing-2); padding: var(--spacing-5) 0; color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: var(--ui-table-line-height); }
</style>
