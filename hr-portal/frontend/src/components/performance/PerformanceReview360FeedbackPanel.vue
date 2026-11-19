<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  performanceReview360FeedbackApi,
  performanceWorkbenchApi,
  type PerformanceReview360FeedbackItem,
  type PerformanceReview360VoluntaryCandidate,
  type PerformanceReview360Source,
  type PerformanceWorkbenchTaskPerson,
} from '@/api/performance'
import PerformanceListToolbar from './PerformanceListToolbar.vue'
import UiButton from '../ui/UiButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import PerformanceTableSummary from './PerformanceTableSummary.vue'
import PerformanceMemberIdentity from './PerformanceMemberIdentity.vue'
import PerformanceTaskStatus from './PerformanceTaskStatus.vue'
import PerformanceEvaluateRatioPopover from './PerformanceEvaluateRatioPopover.vue'
import PerformanceRatingTag from './PerformanceRatingTag.vue'
import { normalizePerformanceTaskStatus, performanceTaskStatusLabel } from './performanceTaskStatus'
import MetricTemplateEmptyIllustration from './MetricTemplateEmptyIllustration.vue'
import ProjectMemberColumnDrawer, { type MemberColumnOption } from './ProjectMemberColumnDrawer.vue'
import { type PerformanceTableColumn } from './performanceTableColumns'
import { sortPerformanceRows, type PerformanceSortOrder } from './performanceTableSort'
import { communicationColumns, reviewer360ConfirmColumns } from './performanceReviewDisplay'
import { formatDisplayDateTime } from '@/utils/datetime'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'

const props = withDefaults(defineProps<{
  projectId: number | string
  nodeId: string
  mode?: 'feedback' | 'communication' | 'taskPeople'
  sources?: PerformanceReview360Source[]
}>(), { mode: 'feedback' })
const emit = defineEmits<{
  'remind-evaluate': [{ member: FeedbackRow; pendingCount: number }]
  'open-task': [{ task_id: number; employee_no: string; display_name: string; status: string; project_id?: number; node_id?: string }]
}>()
const aggregateMode = computed(() => !taskPeopleMode.value && (props.sources?.length || 0) > 1)
const voluntarySources = ref<PerformanceReview360Source[]>([])

const projectContext = usePerformanceProjectContextStore()
const loading = ref(false)
const error = ref('')
const keyword = ref('')
type FeedbackRow = Omit<PerformanceReview360FeedbackItem, 'status'> & Partial<Omit<PerformanceWorkbenchTaskPerson, 'employee_no' | 'task_id'>> & { status: string; project_id?: number; node_id?: string }
const items = ref<FeedbackRow[]>([])
const total = ref(0)
const allowVoluntary = ref(false)
const voluntaryEnabled = ref(false)
const voluntaryDisabledReason = ref('')
const taskPeopleMode = computed(() => props.mode !== 'feedback')
const taskPeopleColumns = computed(() => props.mode === 'taskPeople' ? reviewer360ConfirmColumns : communicationColumns)
const tableTitle = computed(() => props.mode === 'taskPeople' ? '360°邀请确认' : '结果沟通')
const emptyText = computed(() => taskPeopleMode.value ? (props.mode === 'taskPeople' ? '暂无待确认人员' : '暂无可沟通人员') : '暂无 360° 评估邀请，可以自愿评估其他同事')
const ratingColumns = ref<MemberColumnOption[]>([])
function updateRatingColumns(next: MemberColumnOption[]) {
  const previousKeys = new Set(activeColumns.value.map(column => column.key))
  const selected = new Set(selectedColumnKeys.value)
  ratingColumns.value = next
  selectedColumnKeys.value = activeColumns.value.filter(column => selected.has(column.key) || !previousKeys.has(column.key)).map(column => column.key)
}

const columns: MemberColumnOption[] = [
  { key: 'name', label: '姓名', locked: true },
  { key: 'status', label: '360° 评估状态' },
  { key: 'source_label', label: '评估类型' },
  { key: 'relationship', label: '360° 评估关系' },
  { key: 'due_at', label: '360° 评估截止时间' },
  { key: 'job_sequence', label: '序列' },
  { key: 'department', label: '所属部门' },
]
const selectedColumnKeys = ref<string[]>([])
watch(() => props.mode, () => {
  selectedColumnKeys.value = taskPeopleMode.value ? taskPeopleColumns.value.map(column => column.key) : ['name', 'status', 'source_label', 'relationship', 'due_at', 'job_sequence']
}, { immediate: true })
const columnDrawerOpen = ref(false)
const profileFields: Record<string, string> = {
  job_sequence: 'job_sequence',
  position_level: 'position_level',
  hire_date: 'hire_date',
  department: 'department',
  employee_type: 'employee_type',
  previous_position_level: 'position_level',
}
const activeColumns = computed(() => {
  if (!taskPeopleMode.value) return columns
  const configuredRows = items.value.filter(item => Array.isArray(item.visible_profile_fields))
  if (!configuredRows.length && props.mode !== 'taskPeople') return taskPeopleColumns.value.flatMap(column => column.key === 'rating' && ratingColumns.value.length ? ratingColumns.value : [column])
  const allowed = new Set(configuredRows.flatMap(item => item.visible_profile_fields || []))
  return taskPeopleColumns.value.filter(column => !profileFields[column.key] || allowed.has(profileFields[column.key])).flatMap(column => column.key === 'rating' && ratingColumns.value.length ? ratingColumns.value : [column])
})
watch(activeColumns, (available, previous) => {
  const previousKeys = new Set(previous.map(column => column.key))
  const selected = new Set(selectedColumnKeys.value)
  selectedColumnKeys.value = available.filter(column => selected.has(column.key) || !previousKeys.has(column.key)).map(column => column.key)
})
function canViewProfile(item: FeedbackRow, key: string) {
  if (props.mode === 'taskPeople' && profileFields[key]) return item.visible_profile_fields?.includes(profileFields[key]) === true
  return !taskPeopleMode.value || !profileFields[key] || !Array.isArray(item.visible_profile_fields) || item.visible_profile_fields.includes(profileFields[key])
}
const hiddenColumnCount = computed(() => Math.max(0, activeColumns.value.length - selectedColumnKeys.value.length))
const visibleColumns = computed(() => selectedColumnKeys.value.map(key => activeColumns.value.find(column => column.key === key)).filter((column): column is MemberColumnOption => Boolean(column)))

const remotePaging = ref(true)
let requestSequence = 0
async function load() {
  const sequence = ++requestSequence
  loading.value = true
  error.value = ''
  allowVoluntary.value = false
  voluntaryEnabled.value = false
  voluntaryDisabledReason.value = ''
  try {
    if (taskPeopleMode.value) {
      const result = await performanceWorkbenchApi.taskPeople(Number(props.projectId), props.nodeId, 'all', keyword.value.trim() || undefined, undefined, page.value, pageSize.value, sortKey.value || undefined, sortOrder.value || undefined)
      if (sequence !== requestSequence) return
      remotePaging.value = !Array.isArray(result)
      const rows = Array.isArray(result) ? result : result.items
      if (!Array.isArray(result) && result.rating_columns) updateRatingColumns(result.rating_columns)
      else if (rows.some(item => Array.isArray(item.rating_columns))) {
        updateRatingColumns(Array.from(new Map(rows.flatMap(item => item.rating_columns || []).map(column => [column.key, column])).values()))
      }
      items.value = rows.map(item => ({ ...item, source_label: '', relationship: '' }))
      total.value = Array.isArray(result) ? items.value.length : result.total
      allowVoluntary.value = false
    } else if (aggregateMode.value) {
      const sources = props.sources || []
      const results = await Promise.all(sources.map(source => performanceReview360FeedbackApi.list(source.project_id, keyword.value.trim() || undefined, source.node_id)))
      if (sequence !== requestSequence) return
      remotePaging.value = false
      items.value = results.flatMap((result, index) => result.items.map(item => ({ ...item, project_id: sources[index].project_id, node_id: sources[index].node_id })))
      total.value = items.value.length
      voluntarySources.value = sources.filter((_source, index) => results[index].allow_voluntary_evaluation)
      allowVoluntary.value = voluntarySources.value.length > 0
      voluntaryEnabled.value = results.some(result => result.voluntary_evaluation_enabled ?? result.allow_voluntary_evaluation)
      voluntaryDisabledReason.value = results.find(result => result.voluntary_evaluation_disabled_reason)?.voluntary_evaluation_disabled_reason || ''
    } else {
      const result = await performanceReview360FeedbackApi.list(props.projectId, keyword.value.trim() || undefined, props.nodeId, page.value, pageSize.value, sortKey.value || undefined, sortOrder.value || undefined)
      if (sequence !== requestSequence) return
      remotePaging.value = true
      items.value = result.items
      total.value = result.total
      allowVoluntary.value = result.allow_voluntary_evaluation
      voluntaryEnabled.value = result.voluntary_evaluation_enabled ?? result.allow_voluntary_evaluation
      voluntaryDisabledReason.value = result.voluntary_evaluation_disabled_reason || ''
    }
  } catch {
    if (sequence !== requestSequence) return
    items.value = []
    total.value = 0
    allowVoluntary.value = false
    voluntaryEnabled.value = false
    voluntarySources.value = []
    error.value = taskPeopleMode.value ? `${tableTitle.value}列表加载失败，请稍后重试` : '360° 评估列表加载失败，请稍后重试'
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

const dialogOpen = ref(false)
const candidates = ref<Array<PerformanceReview360VoluntaryCandidate & { source?: PerformanceReview360Source }>>([])
const candidateLoading = ref(false)
const selectedTarget = ref<string | null>(null)
const submitting = ref(false)
const candidateKey = (candidate: typeof candidates.value[number]) => candidate.source ? JSON.stringify([candidate.source.project_id, candidate.source.node_id, candidate.employee_no]) : candidate.employee_no
const candidateOptions = computed(() => candidates.value.map(candidate => ({
  value: candidateKey(candidate),
  label: candidate.display_name,
  subLabel: candidate.source ? `${candidate.source.project_name} · ${candidate.source.node_name}${candidate.department ? ` · ${candidate.department}` : ''}` : candidate.department || undefined,
})))
let candidateSequence = 0
async function loadCandidates() {
  const sequence = ++candidateSequence
  candidateLoading.value = true
  candidates.value = []
  try {
    const sources = aggregateMode.value ? voluntarySources.value : [{ project_id: Number(props.projectId), node_id: props.nodeId, project_name: '', node_name: '' }]
    const results = await Promise.all(sources.map(source => performanceReview360FeedbackApi.candidates(source.project_id, undefined, source.node_id)))
    if (sequence !== candidateSequence) return
    candidates.value = results.flatMap((result, index) => result.items.map(candidate => ({ ...candidate, ...(aggregateMode.value ? { source: sources[index] } : {}) })))
  } catch {
    if (sequence === candidateSequence) candidates.value = []
  } finally {
    if (sequence === candidateSequence) candidateLoading.value = false
  }
}
function openVoluntaryDialog() {
  if (!allowVoluntary.value) return
  selectedTarget.value = null
  dialogOpen.value = true
  void loadCandidates()
}
async function confirmVoluntary() {
  if (submitting.value || !selectedTarget.value) return
  submitting.value = true
  const sequence = candidateSequence
  const cacheVersion = projectContext.cacheVersion
  try {
    const target = candidates.value.find(candidate => candidateKey(candidate) === selectedTarget.value)
    if (!target) return
    const source = target.source
    const result = await performanceReview360FeedbackApi.start(source?.project_id || props.projectId, target.employee_no, source?.node_id || props.nodeId)
    if (sequence !== candidateSequence || cacheVersion !== projectContext.cacheVersion) return
    projectContext.invalidate()
    dialogOpen.value = false
    void load()
    emit('open-task', {
      task_id: result.task_id,
      employee_no: result.target_employee_no,
      display_name: target.display_name || result.target_employee_no,
      status: 'pending',
      ...(source ? { project_id: source.project_id, node_id: source.node_id } : {}),
    })
  } catch (err: unknown) {
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    const messages: Record<string, string> = {
      VOLUNTARY_NOT_ALLOWED: '当前项目未开启自愿评估',
      VOLUNTARY_WINDOW_NOT_OPEN: '360°评估环节尚未开始',
      VOLUNTARY_WINDOW_CLOSED: '360°评估环节已截止',
      CANNOT_EVALUATE_SELF: '不能评估自己',
      TARGET_NOT_EVALUATED: '该同事不是本项目的被评估人',
    }
    ElMessage.error(messages[detail || ''] || '自愿评估发起失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

function openItem(item: FeedbackRow) {
  emit('open-task', {
    task_id: item.task_id,
    employee_no: item.employee_no,
    display_name: item.display_name,
    status: item.status,
    ...(item.project_id ? { project_id: item.project_id, node_id: item.node_id } : {}),
  })
}

function cellValue(item: FeedbackRow, key: string) {
  if (key.startsWith('rating:')) return item.ratings?.[key]?.label || '--'
  if (!canViewProfile(item, key)) return '--'
  switch (key) {
    case 'name': return item.display_name
    case 'status': return performanceTaskStatusLabel(normalizePerformanceTaskStatus(item.status, item.due_at, !taskPeopleMode.value))
    case 'source_label': return item.source_label
    case 'relationship': return item.relationship
    case 'due_at': return formatDisplayDateTime(item.due_at, '--')
    case 'job_sequence': return item.job_sequence || '--'
    case 'department': return item.department || '--'
    case 'completion': return item.completion || '0/0'
    case 'rating': return item.rating || '--'
    case 'position_level': return item.position_level || '--'
    case 'hire_date': return item.hire_date || '--'
    case 'employee_type': return item.employee_type || '--'
    case 'previous_position_level': return item.previous_position_level || '--'
    default: return ''
  }
}
function applyColumns(keys: string[]) { selectedColumnKeys.value = keys.filter(key => activeColumns.value.some(column => column.key === key)) }

const sortKey = ref('')
const sortOrder = ref<PerformanceSortOrder>('')
const page = ref(1)
const pageSize = ref(50)
const tableColumns = computed<PerformanceTableColumn[]>(() => visibleColumns.value.map(column => ({
  key: column.key,
  label: column.label,
  sortable: true,
  fixed: column.key === 'name',
})))
function onSortChange({ key, order }: { key: string; order: PerformanceSortOrder }) {
  sortKey.value = order ? key : ''
  sortOrder.value = order
  page.value = 1
  void load()
}
function changePage(nextPage: number) {
  page.value = nextPage
  void load()
}
function changePageSize(size: number) {
  pageSize.value = size
  page.value = 1
  void load()
}
function sortValue(item: FeedbackRow, key: string) {
  if (key.startsWith('rating:')) return item.ratings?.[key]?.label || ''
  if (!canViewProfile(item, key)) return null
  switch (key) {
    case 'name': return item.display_name
    case 'status': return { pending: 0, completed: 1, overdue: 2, rejected: 3 }[normalizePerformanceTaskStatus(item.status, item.due_at, !taskPeopleMode.value)]
    case 'source_label': return item.source_label
    case 'relationship': return item.relationship
    case 'due_at': return item.due_at ? new Date(item.due_at).getTime() : null
    case 'job_sequence': return item.job_sequence || ''
    case 'department': return item.department || ''
    case 'completion': {
      const [completed, total] = (item.completion || '').split('/').map(Number)
      return total ? completed / total : 0
    }
    case 'rating': return item.rating || ''
    case 'position_level': return item.position_level || ''
    case 'hire_date': return item.hire_date || ''
    case 'employee_type': return item.employee_type || ''
    case 'previous_position_level': return item.previous_position_level || ''
    default: return ''
  }
}
const sortedItems = computed(() => remotePaging.value ? items.value : sortPerformanceRows(items.value, sortKey.value, sortOrder.value, sortValue))
const pagedItems = computed(() => remotePaging.value ? items.value : sortedItems.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

watch(() => JSON.stringify([props.projectId, props.nodeId, props.mode, props.sources]), () => {
  page.value = 1
  dialogOpen.value = false
  candidates.value = []
  ++candidateSequence
  void load()
})
onBeforeUnmount(() => { ++requestSequence; ++candidateSequence })
onMounted(() => void load())

defineExpose({ allowVoluntary, voluntaryEnabled, voluntaryDisabledReason, openVoluntaryDialog })
</script>

<template>
  <section class="feedback-panel" :aria-label="taskPeopleMode ? tableTitle : '360° 反馈'">
    <div class="card-sticky-mask" aria-hidden="true"></div>
    <PerformanceListToolbar
      v-model:keyword="keyword"
      search-placeholder="搜索成员"
      search-aria-label="搜索成员"
      search-fill
      @search="page = 1; load()"
      @clear="page = 1; load()"
      @filter="ElMessage.info('筛选功能暂未开放')"
    />
    <PerformanceTableSummary :total="total" :hidden-column-count="hiddenColumnCount" @columns="columnDrawerOpen = true" />
    <PerformanceManagementTable
      :rows="pagedItems"
      :loading="loading"
      :loading-text="taskPeopleMode ? `正在加载${tableTitle}…` : '正在加载 360° 评估…'"
      :empty-text="error || emptyText"
      :table-aria-label="taskPeopleMode ? `${tableTitle}列表` : '360° 评估列表'"
      :pagination-aria-label="taskPeopleMode ? `${tableTitle}列表分页` : '360° 评估列表分页'"
      :page="page"
      :page-size="pageSize"
      :total="total"
      scroll-mode="page"
      :columns="tableColumns"
      row-key="task_id"
      clickable-rows
      :sort-key="sortKey"
      :sort-order="sortOrder"
      sort-mode="remote"
      sticky-header-top="var(--performance-table-sticky-top, 0px)"
      @sort-change="onSortChange"
      @page-change="changePage"
      @page-size-change="changePageSize"
      @row-click="openItem"
    >
      <template #cell="{ row, column }">
        <div v-if="column.key === 'name'" class="feedback-member">
          <PerformanceMemberIdentity :display-name="row.display_name" :identity-status="row.identity_status" />
          <small v-if="aggregateMode">{{ sources?.find(source => source.project_id === row.project_id && source.node_id === row.node_id)?.project_name }} · {{ sources?.find(source => source.project_id === row.project_id && source.node_id === row.node_id)?.node_name }}</small>
        </div>
        <PerformanceTaskStatus v-else-if="column.key === 'status'" :status="row.status" :due-at="row.due_at" :allow-rejected="!taskPeopleMode" />
        <PerformanceRatingTag v-else-if="column.key.startsWith('rating:') && row.ratings?.[column.key]" :label="row.ratings[column.key].label" :color="row.ratings[column.key].color || undefined" :foreground="row.ratings[column.key].foreground || undefined" />
        <span v-else-if="column.key === 'completion'" class="feedback-panel__completion">
          <PerformanceEvaluateRatioPopover v-if="taskPeopleMode && row.evaluate_ratio" :completion="cellValue(row, column.key)" :ratio="row.evaluate_ratio" :can-remind="row.can_remind === true" @remind="emit('remind-evaluate', { member: row, pendingCount: $event })" />
          <template v-else>{{ cellValue(row, column.key) }}</template>
        </span>
        <span v-else>{{ cellValue(row, column.key) }}</span>
      </template>
      <template #empty="{ loading: emptyLoading, text }">
        <div v-if="emptyLoading" class="feedback-empty feedback-empty--text" role="status">{{ text }}</div>
        <div v-else-if="error" class="feedback-empty feedback-empty--text" role="alert">{{ error }}<UiButton variant="secondary" @click="load">重新加载</UiButton></div>
        <div v-else class="feedback-empty" role="status">
          <MetricTemplateEmptyIllustration />
          <p class="feedback-empty__text">{{ emptyText }}</p>
        </div>
      </template>
    </PerformanceManagementTable>
    <ProjectMemberColumnDrawer v-model="columnDrawerOpen" :columns="activeColumns" :selected-keys="selectedColumnKeys" @confirm="applyColumns" />

    <PerformanceDialogShell v-if="!taskPeopleMode" v-model="dialogOpen" title="自愿评估" width="600px" :loading="submitting">
      <template #description>你可以自愿评估其他同事，为 Ta 本次绩效提供更加全面的 360° 评估信息</template>
      <PerformancePersonSelect
        v-model="selectedTarget"
        :options="candidateOptions"
        :empty-text="candidateLoading ? '正在加载成员…' : '暂无可评估的同事'"
        hide-arrow
        placeholder="搜索要评估的同事"
        aria-label="搜索要评估的同事"
      />
      <template #footer>
        <div class="voluntary-dialog__footer">
          <UiButton variant="secondary" @click="dialogOpen = false">取消</UiButton>
          <UiButton variant="primary" :disabled="!selectedTarget" :loading="submitting" @click="confirmVoluntary">前往评估</UiButton>
        </div>
      </template>
    </PerformanceDialogShell>
  </section>
</template>

<style scoped>
.feedback-panel { min-width: 0; padding: 0 var(--spacing-5) var(--spacing-5); box-sizing: border-box; border-radius: var(--radius-lg); background: var(--color-bg-card); color: var(--color-text-primary); box-shadow: var(--shadow-dialog); --performance-table-container-padding: var(--performance-review-surface-inset); }
.card-sticky-mask { position: sticky; top: calc(-1 * var(--performance-table-container-padding, 0px)); z-index: 19; flex: none; height: 20px; margin: 0 calc(-1 * var(--spacing-5)); border-radius: var(--radius-lg) var(--radius-lg) 0 0; background: var(--color-bg-card, #fff); }
.feedback-member { min-width: 0; }
.feedback-member small { display: block; margin-top: 4px; overflow: hidden; color: var(--color-text-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.feedback-panel__completion { color: var(--color-primary); }
.feedback-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--spacing-2); padding: 60px 0; color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: 22px; text-align: center; }
.feedback-empty--text { min-height: 300px; display: grid; place-items: center; padding: 0; color: var(--color-text-secondary); }
.feedback-empty__text { margin: 0; }
.voluntary-dialog__footer { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-gap); }
</style>
