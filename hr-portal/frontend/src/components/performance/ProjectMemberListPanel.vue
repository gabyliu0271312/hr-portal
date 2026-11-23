<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { projectManagementApi, performanceWorkbenchApi, fetchPerformanceColumnPreference, savePerformanceColumnPreference, type PerformanceMemberColumnSchema, type PerformanceColumnPreferenceScope, type ProjectMember, type PerformanceWorkbenchTaskPerson } from '@/api/performance'
import { employeeSwitchEpoch } from '@/stores/identitySwitch'
import PerformanceListToolbar from './PerformanceListToolbar.vue'
import UiButton from '../ui/UiButton.vue'
import PerformanceTableSummary from './PerformanceTableSummary.vue'
import PerformanceMemberIdentity from './PerformanceMemberIdentity.vue'
import PerformanceTaskStatus from './PerformanceTaskStatus.vue'
import PerformanceRatingTag from './PerformanceRatingTag.vue'
import { normalizePerformanceTaskStatus, performanceTaskStatusLabel } from './performanceTaskStatus'
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import PerformanceEvaluateRatioPopover from './PerformanceEvaluateRatioPopover.vue'
import PerformanceExportButton from './PerformanceExportButton.vue'
import ProjectMemberColumnDrawer, { type MemberColumnOption } from './ProjectMemberColumnDrawer.vue'
import { type PerformanceTableColumn } from './performanceTableColumns'
import { sortPerformanceRows, type PerformanceSortOrder } from './performanceTableSort'

type MemberRow = ProjectMember & {
  task_id?: number | null
  aggregate_task_id?: number | null
  status?: string
  due_at?: string | null
  ratings?: PerformanceWorkbenchTaskPerson['ratings']
}

const props = withDefaults(defineProps<{
  variant?: 'default' | 'calibration' | 'embedded' | 'review'
  projectId: number | string
  cycleId?: number
  reviewContext?: { nodeId: string; state: 'pending' | 'completed' | 'all'; phaseId?: string | null }
  showExport?: boolean
  readonly?: boolean
  columnSchema?: Partial<PerformanceMemberColumnSchema>
  preferenceScope?: PerformanceColumnPreferenceScope
  provider?: (query: { keyword?: string; page: number; pageSize: number; sortBy?: string; sortOrder?: 'asc' | 'desc' }) => Promise<Partial<PerformanceMemberColumnSchema> & { items: ProjectMember[]; total: number; rating_columns?: Array<{ key: string; label: string }> }>
}>(), {
  reviewContext: undefined,
  showExport: true,
  readonly: false,
  provider: undefined,
})
const emit = defineEmits<{
  filter: []
  'columns-change': [keys: string[]]
  'select-member': [member: MemberRow]
  'authorize-selected': [members: MemberRow[]]
  'transfer-selected': [members: MemberRow[]]
  'remind-evaluate': [payload: { member: MemberRow; pendingCount: number }]
}>()
const selectedKeys = ref<string[]>([])
const memberSelectionKey = (member: MemberRow) => props.cycleId ? String(member.root_review_id || `${member.project_id}:${member.employee_no}`) : member.employee_no
const selectedRows = ref<Record<string, MemberRow>>({})
const selectedMembers = computed(() => selectedKeys.value.map(key => selectedRows.value[key]).filter((member): member is MemberRow => Boolean(member)))
watch(selectedKeys, keys => {
  const next: Record<string, MemberRow> = {}
  for (const key of keys) {
    const member = members.value.find(row => memberSelectionKey(row) === key) || selectedRows.value[key]
    if (member) next[key] = member
  }
  selectedRows.value = next
})
const keyword = ref('')
const members = ref<MemberRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)
const loading = ref(false)
const error = ref('')
const exportNotice = ref('')
const sortBy = ref('')
const sortOrder = ref<PerformanceSortOrder>('')

const projectColumns: MemberColumnOption[] = [
  { key: 'name', label: '姓名', locked: true },
  { key: 'rating', label: '绩效评级' },
  { key: 'completion', label: '360° 评估率' },
  { key: 'direct_supervisor', label: '直属上级' },
  { key: 'job_sequence', label: '序列' },
  { key: 'position_level', label: '职级' },
  { key: 'hire_date', label: '入职日期' },
  { key: 'department', label: '所属部门' },
]
const reviewColumns: MemberColumnOption[] = [
  { key: 'name', label: '姓名', locked: true },
  { key: 'status', label: '状态' },
  { key: 'due_at', label: '截止时间' },
  { key: 'rating', label: '绩效评级' },
  { key: 'completion', label: '360° 评估率' },
  { key: 'direct_supervisor', label: '直属上级' },
  { key: 'job_sequence', label: '序列' },
  { key: 'position_level', label: '职级' },
  { key: 'hire_date', label: '入职日期' },
  { key: 'department', label: '所属部门' },
]
const ratingColumns = ref<MemberColumnOption[] | null>(null)
const responseSchema = ref<Partial<PerformanceMemberColumnSchema> | null>(null)
const preferenceSchema = ref<Partial<PerformanceMemberColumnSchema> | null>(null)
const schema = computed(() => props.columnSchema?.columns ? props.columnSchema : responseSchema.value || preferenceSchema.value)
const baseColumns = computed(() => props.reviewContext ? reviewColumns : projectColumns)
const columns = computed(() => baseColumns.value.flatMap(column => column.key === 'rating' && ratingColumns.value !== null ? ratingColumns.value : [column]))
function updateRatingColumns(next: MemberColumnOption[] | null) { ratingColumns.value = next }
function updateSchema(value: Partial<PerformanceMemberColumnSchema>) { if (Array.isArray(value.columns)) responseSchema.value = value }
const profileColumnKeys: Record<string, string> = {
  department: 'department',
  direct_supervisor: 'direct_supervisor',
  position_level: 'position_level',
  job_sequence: 'job_sequence',
  hire_date: 'hire_date',
  employee_type: 'employee_type',
}
const fallbackProfileKeys = ref<Set<string> | null>(null)
watch(members, rows => {
  const configuredRows = rows.filter(member => Array.isArray(member.visible_profile_fields))
  if (configuredRows.length) fallbackProfileKeys.value = new Set(configuredRows.flatMap(member => (member.visible_profile_fields || []).map(field => profileColumnKeys[field])).filter(Boolean))
})
const availableColumns = computed<MemberColumnOption[]>(() => {
  const source = schema.value
  const allowed = source?.allowed_column_keys ? new Set(source.allowed_column_keys) : null
  const locked = new Set(source?.locked_column_keys || [])
  const seen = new Set<string>()
  return (source?.columns || columns.value).filter(column => {
    if (seen.has(column.key) || (allowed && !allowed.has(column.key))) return false
    if (!source && fallbackProfileKeys.value && Object.values(profileColumnKeys).includes(column.key) && !fallbackProfileKeys.value.has(column.key)) return false
    seen.add(column.key)
    return true
  }).map(column => ({ ...column, locked: column.locked || locked.has(column.key) }))
})
const columnDrawerOpen = ref(false)
const selectedColumnKeys = ref<string[]>([])
const defaultColumnKeys = computed(() => schema.value?.default_column_keys || availableColumns.value.filter(column => column.visible_by_default !== false).map(column => column.key))
let usesDefaultColumns = true
function normalizeColumnKeys(keys: string[]) {
  const allowed = new Set(availableColumns.value.map(column => column.key))
  return [...new Set([...availableColumns.value.filter(column => column.locked).map(column => column.key), ...keys.filter(key => allowed.has(key) && !availableColumns.value.find(column => column.key === key)?.locked)])]
}
watch([availableColumns, defaultColumnKeys], () => {
  selectedColumnKeys.value = normalizeColumnKeys(usesDefaultColumns ? defaultColumnKeys.value : selectedColumnKeys.value)
  if (sortBy.value && !sortableColumnKeys.value.has(sortBy.value)) { sortBy.value = ''; sortOrder.value = '' }
}, { immediate: true })
const sortableColumnKeys = computed(() => new Set(schema.value?.sort_keys || availableColumns.value.filter(column => schema.value ? column.sortable === true : column.sortable !== false).map(column => column.key)))
const visibleColumns = computed(() => selectedColumnKeys.value.map(key => availableColumns.value.find(column => column.key === key)).filter((column): column is MemberColumnOption => Boolean(column)))
const hiddenColumnCount = computed(() => Math.max(0, availableColumns.value.length - visibleColumns.value.length))
const columnSaving = ref(false)
const preferenceLoading = ref(false)
const preferenceError = ref('')
const columnSaveError = ref('')
const preferenceScopeKey = computed(() => JSON.stringify([employeeSwitchEpoch.value, props.preferenceScope?.cycle_ref, props.preferenceScope?.scene, props.preferenceScope?.project_id, props.preferenceScope?.node_id, props.preferenceScope?.role_key]))
let preferenceRequest = 0
let saveRequest = 0
async function loadPreference() {
  const sequence = ++preferenceRequest
  const scopeKey = preferenceScopeKey.value
  const scope = props.preferenceScope && { ...props.preferenceScope }
  preferenceError.value = ''
  preferenceLoading.value = Boolean(scope)
  if (!scope) return
  try {
    const result = await fetchPerformanceColumnPreference(scope)
    if (sequence !== preferenceRequest || scopeKey !== preferenceScopeKey.value) return
    if (Array.isArray(result.columns)) preferenceSchema.value = result
    usesDefaultColumns = result.column_keys === null
    selectedColumnKeys.value = normalizeColumnKeys(result.column_keys ?? defaultColumnKeys.value)
  } catch {
    if (sequence === preferenceRequest && scopeKey === preferenceScopeKey.value) preferenceError.value = '列设置加载失败，请重试'
  } finally {
    if (sequence === preferenceRequest && scopeKey === preferenceScopeKey.value) preferenceLoading.value = false
  }
}

const memberSortValue = (member: MemberRow, key: string) => {
  if (key.startsWith('rating:')) return member.ratings?.[key]?.label ?? null
  switch (key) {
    case 'name': return member.display_name
    case 'status': return { pending: 0, completed: 1, overdue: 2, rejected: 3 }[normalizePerformanceTaskStatus(member.status, member.due_at)]
    case 'due_at': return member.due_at ? new Date(member.due_at).getTime() : null
    case 'completion': {
      const [completed, total] = (member.completion || '0/0').split('/').map(Number)
      return total ? completed / total : 0
    }
    default: return member.column_values?.[key] ?? (member[key as keyof MemberRow] ?? null)
  }
}
const remoteReviewPaging = ref(true)
const sortedMembers = computed(() => props.reviewContext && !remoteReviewPaging.value
  ? sortPerformanceRows(members.value, sortBy.value, sortOrder.value, memberSortValue)
  : members.value)
const displayRows = computed(() => props.reviewContext && !remoteReviewPaging.value
  ? sortedMembers.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
  : members.value)

let requestSequence = 0
const loadMembers = async () => {
  const sequence = ++requestSequence
  loading.value = true
  error.value = ''
  try {
    if (props.provider) {
      const result = await props.provider({ keyword: keyword.value.trim() || undefined, page: page.value, pageSize: pageSize.value, sortBy: sortBy.value || undefined, sortOrder: sortOrder.value || undefined })
      if (sequence !== requestSequence) return
      updateSchema(result)
      members.value = result.items
      total.value = result.total
      if (result.rating_columns) updateRatingColumns(result.rating_columns)
    } else if (props.reviewContext) {
      const result = await performanceWorkbenchApi.taskPeople(Number(props.projectId), props.reviewContext.nodeId, props.reviewContext.state, keyword.value.trim() || undefined, props.reviewContext.phaseId, page.value, pageSize.value, sortBy.value || undefined, sortOrder.value || undefined)
      if (sequence !== requestSequence) return
      remoteReviewPaging.value = !Array.isArray(result)
      if (!Array.isArray(result)) updateSchema(result)
      const rows = Array.isArray(result) ? result : result.items
      if (!Array.isArray(result) && result.rating_columns) updateRatingColumns(result.rating_columns)
      else if (rows.some(item => Array.isArray(item.rating_columns))) {
        updateRatingColumns(Array.from(new Map(rows.flatMap(item => item.rating_columns || []).map(column => [column.key, column])).values()))
      } else if (rows.length) updateRatingColumns(null)
      members.value = rows.map((item: PerformanceWorkbenchTaskPerson) => ({
        id: item.task_id,
        employee_no: item.employee_no,
        display_name: item.display_name,
        avatar_url: null,
        rating: item.rating ?? null,
        rating_tone: item.rating_tone ?? null,
        ratings: item.ratings,
        column_values: item.column_values,
        completion: item.completion || '0/0',
        can_remind: item.can_remind,
        evaluate_ratio: item.evaluate_ratio,
        direct_supervisor: item.direct_supervisor,
        job_family: item.job_family,
        job_category: item.job_category,
        standard_position: item.standard_position ?? null,
        job_sequence: item.job_sequence,
        position_level: item.position_level,
        hire_date: item.hire_date,
        department: item.department,
        employee_type: item.employee_type,
        employment_status: item.employment_status,
        identity_status: item.identity_status,
        visible_profile_fields: item.visible_profile_fields,
        task_id: item.task_id,
        aggregate_task_id: item.aggregate_task_id,
        status: item.status,
        due_at: item.due_at,
      }))
      total.value = Array.isArray(result) ? members.value.length : result.total
    } else {
      const result = props.cycleId
        ? await projectManagementApi.cycleMembers(props.cycleId, keyword.value.trim() || undefined, page.value, pageSize.value, sortBy.value || undefined, sortOrder.value || undefined)
        : await projectManagementApi.members(props.projectId, keyword.value.trim() || undefined, page.value, pageSize.value, sortBy.value || undefined, sortOrder.value || undefined)
      if (sequence !== requestSequence) return
      updateSchema(result)
      members.value = result.items
      total.value = result.total
      if (result.rating_columns) updateRatingColumns(result.rating_columns)
      else if (result.items.some(item => Array.isArray(item.rating_columns))) {
        updateRatingColumns(Array.from(new Map(result.items.flatMap(item => item.rating_columns || []).map(column => [column.key, column])).values()))
      } else if (result.items.length) updateRatingColumns(null)
    }
    const availableKeys = new Set(availableColumns.value.map(column => column.key))
    selectedColumnKeys.value = selectedColumnKeys.value.filter(key => availableKeys.has(key))
    for (const member of members.value) {
      const key = memberSelectionKey(member)
      if (selectedKeys.value.includes(key)) selectedRows.value[key] = member
    }
  } catch (cause: any) {
    if (sequence === requestSequence) error.value = cause?.response?.status === 403 ? '你没有当前成员范围的访问权限' : '成员列表加载失败，请稍后重试'
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

const displayValue = (value: string | null) => value || ''
const ratingClass = (member: MemberRow) => member.rating_tone ? `rating-badge--${member.rating_tone}` : ''
function stageStatus(member: MemberRow, key: string) {
  const value = member.column_values?.[key]
  const status = value && typeof value === 'object' ? (value as { status?: unknown }).status : value
  return status === 'pending' || status === 'completed' || status === 'overdue' || status === 'rejected' ? status : null
}
const cellValue = (member: MemberRow, key: string) => {
  if (key.startsWith('rating:')) return member.ratings?.[key]?.label || ''
  if (key === 'name') return member.display_name
  if (key === 'completion') return member.completion || '0/0'
  if (key === 'status') return performanceTaskStatusLabel(normalizePerformanceTaskStatus(member.status, member.due_at))
  if (key.startsWith('stage:')) {
    const status = stageStatus(member, key)
    return status ? performanceTaskStatusLabel(status) : '--'
  }
  if (key === 'due_at') return member.due_at ? new Date(member.due_at).toLocaleString('zh-CN', { hour12: false }) : '--'
  if (member.column_values && Object.prototype.hasOwnProperty.call(member.column_values, key)) {
    const value = member.column_values[key]
    return String(value && typeof value === 'object' ? (value as { label?: unknown; status?: unknown }).label ?? (value as { status?: unknown }).status ?? '' : value ?? '')
  }
  return displayValue(member[key as keyof MemberRow] as string | null)
}
async function applyColumns(keys: string[]) {
  if (columnSaving.value || preferenceLoading.value || preferenceError.value) return
  const normalized = normalizeColumnKeys(keys)
  const scope = props.preferenceScope && { ...props.preferenceScope }
  const scopeKey = preferenceScopeKey.value
  const sequence = ++saveRequest
  columnSaveError.value = ''
  columnSaving.value = true
  try {
    const result = scope ? await savePerformanceColumnPreference(scope, normalized) : { column_keys: normalized }
    if (sequence !== saveRequest || scopeKey !== preferenceScopeKey.value) return
    usesDefaultColumns = false
    selectedColumnKeys.value = normalizeColumnKeys(result.column_keys)
    emit('columns-change', [...selectedColumnKeys.value])
    columnDrawerOpen.value = false
  } catch {
    if (sequence === saveRequest && scopeKey === preferenceScopeKey.value) columnSaveError.value = '列设置保存失败，请重试'
  } finally {
    if (sequence === saveRequest && scopeKey === preferenceScopeKey.value) columnSaving.value = false
  }
}
function openColumnDrawer() { columnSaveError.value = ''; columnDrawerOpen.value = true }

const tableColumns = computed<PerformanceTableColumn[]>(() => visibleColumns.value.map(column => ({
  key: column.key,
  label: column.label,
  width: column.width != null && Number.isFinite(Number(column.width)) ? Number(column.width) : undefined,
  sortable: sortableColumnKeys.value.has(column.key),
  fixed: column.key === 'name',
})))

async function exportRows() {
  const context = props.reviewContext
  const result = props.provider
    ? await props.provider({ keyword: keyword.value.trim() || undefined, page: 1, pageSize: 100, sortBy: sortBy.value || undefined, sortOrder: sortOrder.value || undefined })
    : context
    ? await performanceWorkbenchApi.taskPeople(Number(props.projectId), context.nodeId, context.state, keyword.value.trim() || undefined, context.phaseId)
    : null
  const rows: MemberRow[] = props.provider
    ? (result as { items: MemberRow[] }).items
    : context
      ? sortPerformanceRows((Array.isArray(result) ? result : ((result as { items?: PerformanceWorkbenchTaskPerson[] } | null)?.items || [])) as MemberRow[], sortBy.value, sortOrder.value, memberSortValue)
      : (props.cycleId
        ? await projectManagementApi.cycleExportMembers(props.cycleId, keyword.value.trim() || undefined, sortBy.value || undefined, sortOrder.value || undefined)
        : await projectManagementApi.exportMembers(props.projectId, keyword.value.trim() || undefined, sortBy.value || undefined, sortOrder.value || undefined)).items
  return [
    visibleColumns.value.map(column => column.label),
    ...rows.map(member => visibleColumns.value.map(column => String(cellValue(member, column.key)))),
  ]
}

function onSortChange({ key, order }: { key: string; order: PerformanceSortOrder }) {
  if (order && !sortableColumnKeys.value.has(key)) return
  sortBy.value = order ? key : ''
  sortOrder.value = order
  page.value = 1
  void loadMembers()
}

function changePage(nextPage: number) {
  if (nextPage < 1 || nextPage === page.value) return
  page.value = nextPage
  void loadMembers()
}

function changePageSize(nextPageSize: number) {
  pageSize.value = nextPageSize
  page.value = 1
  void loadMembers()
}

function onRowClick(member: MemberRow) {
  if (props.reviewContext || member.can_view_detail) emit('select-member', member)
}

function onEvaluateRemind(member: MemberRow, pendingCount: number) {
  emit('remind-evaluate', { member, pendingCount })
}

watch([() => props.projectId, () => props.cycleId, () => props.reviewContext?.nodeId, () => Boolean(props.reviewContext), preferenceScopeKey], () => {
  ++preferenceRequest
  ++saveRequest
  columnDrawerOpen.value = false
  columnSaving.value = false
  columnSaveError.value = ''
  preferenceSchema.value = null
  responseSchema.value = null
  ratingColumns.value = null
  fallbackProfileKeys.value = null
  usesDefaultColumns = true
  selectedColumnKeys.value = normalizeColumnKeys(defaultColumnKeys.value)
  sortBy.value = ''
  sortOrder.value = ''
  void loadPreference()
}, { immediate: true })
watch([() => props.projectId, () => props.cycleId, () => props.reviewContext?.nodeId, () => props.reviewContext?.state, () => props.reviewContext?.phaseId, preferenceScopeKey], () => {
  page.value = 1
  selectedKeys.value = []
  selectedRows.value = {}
  members.value = []
  total.value = 0
  void loadMembers()
})

onMounted(() => void loadMembers())
onBeforeUnmount(() => { ++requestSequence; ++preferenceRequest; ++saveRequest })
</script>

<template>
  <section class="member-list-panel" :class="{ 'member-list-panel--calibration': variant === 'calibration', 'member-list-panel--embedded': variant === 'embedded', 'member-list-panel--review': variant === 'review' }" aria-label="成员列表">
    <div class="card-sticky-mask" aria-hidden="true"></div>
    <PerformanceListToolbar
      v-model:keyword="keyword"
      class="member-list-toolbar"
      search-placeholder="搜索成员"
      search-aria-label="搜索成员"
      search-fill
      @search="page = 1; loadMembers()"
      @clear="page = 1; loadMembers()"
      @filter="variant === 'calibration' || variant === 'embedded' ? (page = 1, loadMembers()) : emit('filter')"
    >
      <template v-if="showExport" #actions>
        <PerformanceExportButton :load-rows="exportRows" :filename="`成员列表_${props.cycleId || props.projectId}`" :disabled="loading || Boolean(error) || !total" @success="exportNotice = '导出成功'" @error="exportNotice = '导出失败，请稍后重试'" />
      </template>
    </PerformanceListToolbar>
    <PerformanceTableSummary :total="total" :hidden-column-count="hiddenColumnCount" @columns="openColumnDrawer" />
    <p v-if="preferenceError" role="alert">{{ preferenceError }} <UiButton variant="text" @click="loadPreference">重试</UiButton></p>
    <PerformanceManagementTable
      v-model:selected-keys="selectedKeys"
      :rows="displayRows"
      :loading="loading || preferenceLoading"
      loading-text="正在加载成员…"
      :empty-text="error || '暂无成员'"
      table-aria-label="成员列表"
      pagination-aria-label="成员列表分页"
      :page="page"
      :page-size="pageSize"
      :total="total"
      :sort-key="sortBy"
      :sort-order="sortOrder"
      sort-mode="remote"
      scroll-mode="page"
      :columns="tableColumns"
      sticky-header-top="var(--performance-table-sticky-top, 0px)"
      :selectable="!reviewContext && !readonly"
      :selection-key="cycleId ? 'root_review_id' : 'employee_no'"
      :show-selection-bar="!reviewContext && !readonly"
      :row-key="cycleId ? 'root_review_id' : 'employee_no'"
      :clickable-rows="Boolean(reviewContext) || members.some(member => member.can_view_detail)"
      @page-change="changePage"
      @page-size-change="changePageSize"
      @row-click="onRowClick"
      @sort-change="onSortChange"
    >
      <template #cell="{ row, column }">
        <PerformanceMemberIdentity v-if="column.key === 'name'" :display-name="row.display_name" :identity-status="row.identity_status" />
        <PerformanceTaskStatus v-else-if="column.key === 'status'" :status="row.status" :due-at="row.due_at" />
        <PerformanceTaskStatus v-else-if="column.key.startsWith('stage:') && stageStatus(row, column.key)" :status="stageStatus(row, column.key)" allow-rejected />
        <PerformanceRatingTag v-else-if="column.key.startsWith('rating:') && row.ratings?.[column.key]" :label="row.ratings[column.key].label" :color="row.ratings[column.key].color || undefined" :foreground="row.ratings[column.key].foreground || undefined" />
        <span v-else-if="column.key === 'rating' && row.rating" class="rating-badge" :class="ratingClass(row)">{{ row.rating }}</span>
        <span v-else-if="column.key === 'completion'" class="table-text completion-text">
          <PerformanceEvaluateRatioPopover v-if="row.evaluate_ratio" :completion="cellValue(row, column.key)" :ratio="row.evaluate_ratio" :can-remind="row.can_remind === true" @remind="onEvaluateRemind(row, $event)" />
          <template v-else>{{ cellValue(row, column.key) }}</template>
        </span>
        <span v-else class="table-text">{{ cellValue(row, column.key) }}</span>
      </template>
      <template #empty>
        <div v-if="loading || preferenceLoading" role="status">{{ preferenceLoading ? '正在加载列设置…' : '正在加载成员…' }}</div>
        <div v-else-if="error" class="member-state member-state--error" role="alert">{{ error }} <UiButton variant="text" @click="loadMembers">重试</UiButton></div>
        <slot v-else name="empty"><div class="member-state">暂无成员</div></slot>
      </template>
      <template #selection-actions>
        <UiButton variant="outline-primary" aria-label="授权他人处理" :disabled="!selectedMembers.some(member => member.can_authorize)" @click="emit('authorize-selected', selectedMembers)">授权他人处理</UiButton>
        <UiButton variant="outline-primary" aria-label="转交他人处理" :disabled="!selectedMembers.some(member => member.can_authorize)" @click="emit('transfer-selected', selectedMembers)">转交他人处理</UiButton>
      </template>
    </PerformanceManagementTable>
    <p v-if="exportNotice" role="status">{{ exportNotice }}</p>
    <ProjectMemberColumnDrawer v-model="columnDrawerOpen" :columns="availableColumns" :selected-keys="selectedColumnKeys" :saving="columnSaving" :confirm-disabled="preferenceLoading || Boolean(preferenceError)" :error-message="columnSaveError || preferenceError" @confirm="applyColumns" />
  </section>
</template>

<style scoped>
.member-list-panel.member-list-panel--embedded { padding: 0; margin: 0; border-radius: 0; background: transparent; box-shadow: none; --performance-table-container-padding: 0px; --performance-table-sticky-top: var(--performance-calibration-table-sticky-top); }
.member-list-panel--embedded .card-sticky-mask { display: block; top: var(--performance-calibration-tabs-height); height: var(--performance-calibration-content-inset); margin: 0 calc(-1 * var(--performance-calibration-content-inset)); border-radius: var(--radius-lg); background: var(--color-bg-card); }
.member-list-panel.member-list-panel--calibration { padding: var(--spacing-5); margin-top: var(--spacing-4); border-radius: var(--radius-lg); background: var(--color-bg-card); box-shadow: none; --performance-table-sticky-top: 0; }
.member-list-panel--calibration .card-sticky-mask { display: none; }
.member-list-panel { min-width:0; border-radius:8px; background:#fff; box-shadow:rgba(31,35,41,.03) 0 4px 16px 4px,rgba(31,35,41,.02) 0 4px 8px,rgba(31,35,41,.02) 0 2px 4px -4px; padding:0 20px 20px; color:#1f2329; --performance-table-container-padding: var(--performance-review-surface-inset); --performance-table-sticky-top: calc(var(--performance-tab-area-height) - 28px); }
.card-sticky-mask { position: sticky; top: calc(var(--performance-table-sticky-top, 0px) - 20px); z-index: 19; flex: none; height: 20px; margin: 0 -20px; border-radius: 8px 8px 0 0; background: var(--color-bg-card, #fff); }
.member-list-panel.member-list-panel--review { padding: 0; border-radius: 0; background: transparent; box-shadow: none; --performance-table-sticky-top: var(--performance-review-table-sticky-top, 0px); }
.member-list-panel--review .card-sticky-mask { top: calc(var(--performance-table-sticky-top) - var(--performance-review-surface-inset)); height: var(--performance-review-surface-inset); margin: calc(-1 * var(--performance-review-surface-inset)) calc(-1 * var(--performance-review-surface-inset)) 0; }
.member-list-toolbar{height:var(--control-height)}
.rating-badge{display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:24px;padding:0 10px;box-sizing:border-box;border-radius:9999px;font-size:14px;line-height:24px}.rating-badge--teal{background:#d5f6f2;color:#024b41}.rating-badge--blue{background:#e1eaff;color:#0c296e}.rating-badge--green{background:#d9f5d6;color:#124b0c}
.table-text{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.completion-text{color:var(--color-primary)}
.member-state{display:grid;min-height:220px;place-items:center;color:#646a73;font-size:14px}.member-state--error{color:#d14343}
</style>
