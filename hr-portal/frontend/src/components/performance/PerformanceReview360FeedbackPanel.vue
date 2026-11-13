<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  performanceReview360FeedbackApi,
  performanceWorkbenchApi,
  type PerformanceReview360FeedbackItem,
  type PerformanceReview360VoluntaryCandidate,
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
import { communicationColumns } from './performanceReviewDisplay'
import { formatDisplayDateTime } from '@/utils/datetime'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'

const props = withDefaults(defineProps<{
  projectId: number | string
  nodeId: string
  mode?: 'feedback' | 'communication'
}>(), { mode: 'feedback' })
const emit = defineEmits<{
  'remind-evaluate': [{ member: FeedbackRow; pendingCount: number }]
  'open-task': [{ task_id: number; employee_no: string; display_name: string; status: string }]
}>()

const projectContext = usePerformanceProjectContextStore()
const loading = ref(false)
const error = ref('')
const keyword = ref('')
type FeedbackRow = Omit<PerformanceReview360FeedbackItem, 'status'> & Partial<Omit<PerformanceWorkbenchTaskPerson, 'employee_no' | 'task_id'>> & { status: string }
const items = ref<FeedbackRow[]>([])
const total = ref(0)
const allowVoluntary = ref(false)
const voluntaryEnabled = ref(false)
const voluntaryDisabledReason = ref('')
const communicationMode = computed(() => props.mode === 'communication')
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
  selectedColumnKeys.value = communicationMode.value ? communicationColumns.map(column => column.key) : ['name', 'status', 'source_label', 'relationship', 'due_at', 'job_sequence']
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
  if (!communicationMode.value) return columns
  const configuredRows = items.value.filter(item => Array.isArray(item.visible_profile_fields))
  if (!configuredRows.length) return communicationColumns.flatMap(column => column.key === 'rating' && ratingColumns.value.length ? ratingColumns.value : [column])
  const allowed = new Set(configuredRows.flatMap(item => item.visible_profile_fields || []))
  return communicationColumns.filter(column => !profileFields[column.key] || allowed.has(profileFields[column.key])).flatMap(column => column.key === 'rating' && ratingColumns.value.length ? ratingColumns.value : [column])
})
watch(activeColumns, (available, previous) => {
  const previousKeys = new Set(previous.map(column => column.key))
  const selected = new Set(selectedColumnKeys.value)
  selectedColumnKeys.value = available.filter(column => selected.has(column.key) || !previousKeys.has(column.key)).map(column => column.key)
})
function canViewProfile(item: FeedbackRow, key: string) {
  return !communicationMode.value || !profileFields[key] || !Array.isArray(item.visible_profile_fields) || item.visible_profile_fields.includes(profileFields[key])
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
    if (communicationMode.value) {
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
    error.value = communicationMode.value ? '结果沟通列表加载失败，请稍后重试' : '360° 评估列表加载失败，请稍后重试'
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

const dialogOpen = ref(false)
const candidates = ref<PerformanceReview360VoluntaryCandidate[]>([])
const candidateLoading = ref(false)
const selectedTarget = ref<string | null>(null)
const submitting = ref(false)
const candidateOptions = computed(() => candidates.value.map(candidate => ({
  value: candidate.employee_no,
  label: candidate.display_name,
  subLabel: candidate.department || undefined,
})))
async function loadCandidates() {
  candidateLoading.value = true
  try {
    const result = await performanceReview360FeedbackApi.candidates(props.projectId, undefined, props.nodeId)
    candidates.value = result.items
  } catch {
    candidates.value = []
  } finally {
    candidateLoading.value = false
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
  try {
    const target = candidates.value.find(candidate => candidate.employee_no === selectedTarget.value)
    const result = await performanceReview360FeedbackApi.start(props.projectId, selectedTarget.value, props.nodeId)
    projectContext.invalidate()
    dialogOpen.value = false
    void load()
    emit('open-task', {
      task_id: result.task_id,
      employee_no: result.target_employee_no,
      display_name: target?.display_name || result.target_employee_no,
      status: 'pending',
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
  })
}

function cellValue(item: FeedbackRow, key: string) {
  if (key.startsWith('rating:')) return item.ratings?.[key]?.label || '--'
  if (!canViewProfile(item, key)) return '--'
  switch (key) {
    case 'name': return item.display_name
    case 'status': return performanceTaskStatusLabel(normalizePerformanceTaskStatus(item.status, item.due_at, !communicationMode.value))
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
    case 'status': return { pending: 0, completed: 1, overdue: 2, rejected: 3 }[normalizePerformanceTaskStatus(item.status, item.due_at, !communicationMode.value)]
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

watch(() => [props.projectId, props.nodeId, props.mode], () => { page.value = 1; void load() })
onMounted(() => void load())

defineExpose({ allowVoluntary, voluntaryEnabled, voluntaryDisabledReason, openVoluntaryDialog })
</script>

<template>
  <section class="feedback-panel" :aria-label="communicationMode ? '绩效结果沟通' : '360° 反馈'">
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
      :loading-text="communicationMode ? '正在加载结果沟通…' : '正在加载 360° 评估…'"
      :empty-text="error || (communicationMode ? '暂无可沟通人员' : '暂无 360° 评估邀请，可以自愿评估其他同事')"
      :table-aria-label="communicationMode ? '结果沟通列表' : '360° 评估列表'"
      :pagination-aria-label="communicationMode ? '结果沟通列表分页' : '360° 评估列表分页'"
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
        <PerformanceMemberIdentity v-if="column.key === 'name'" :display-name="row.display_name" />
        <PerformanceTaskStatus v-else-if="column.key === 'status'" :status="row.status" :due-at="row.due_at" :allow-rejected="!communicationMode" />
        <PerformanceRatingTag v-else-if="column.key.startsWith('rating:') && row.ratings?.[column.key]" :label="row.ratings[column.key].label" :color="row.ratings[column.key].color || undefined" :foreground="row.ratings[column.key].foreground || undefined" />
        <span v-else-if="column.key === 'completion'" class="feedback-panel__completion">
          <PerformanceEvaluateRatioPopover v-if="communicationMode && row.evaluate_ratio" :completion="cellValue(row, column.key)" :ratio="row.evaluate_ratio" :can-remind="row.can_remind === true" @remind="emit('remind-evaluate', { member: row, pendingCount: $event })" />
          <template v-else>{{ cellValue(row, column.key) }}</template>
        </span>
        <span v-else>{{ cellValue(row, column.key) }}</span>
      </template>
      <template #empty="{ loading: emptyLoading, text }">
        <div v-if="emptyLoading" class="feedback-empty feedback-empty--text" role="status">{{ text }}</div>
        <div v-else-if="error" class="feedback-empty feedback-empty--text" role="alert">{{ error }}<UiButton variant="secondary" @click="load">重新加载</UiButton></div>
        <div v-else class="feedback-empty" role="status">
          <MetricTemplateEmptyIllustration />
          <p class="feedback-empty__text">{{ communicationMode ? '暂无可沟通人员' : '暂无 360° 评估邀请，可以自愿评估其他同事' }}</p>
        </div>
      </template>
    </PerformanceManagementTable>
    <ProjectMemberColumnDrawer v-model="columnDrawerOpen" :columns="activeColumns" :selected-keys="selectedColumnKeys" @confirm="applyColumns" />

    <PerformanceDialogShell v-if="!communicationMode" v-model="dialogOpen" title="自愿评估" width="600px" :loading="submitting">
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
.feedback-panel__completion { color: var(--color-primary); }
.feedback-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--spacing-2); padding: 60px 0; color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: 22px; text-align: center; }
.feedback-empty--text { min-height: 300px; display: grid; place-items: center; padding: 0; color: var(--color-text-secondary); }
.feedback-empty__text { margin: 0; }
.voluntary-dialog__footer { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-gap); }
</style>
