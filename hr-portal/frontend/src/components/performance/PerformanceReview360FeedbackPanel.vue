<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  performanceReview360FeedbackApi,
  type PerformanceReview360FeedbackItem,
  type PerformanceReview360VoluntaryCandidate,
} from '@/api/performance'
import PerformanceListToolbar from './PerformanceListToolbar.vue'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import PerformanceTableSummary from './PerformanceTableSummary.vue'
import MetricTemplateEmptyIllustration from './MetricTemplateEmptyIllustration.vue'
import PerformanceSortHeader from './PerformanceSortHeader.vue'
import ProjectMemberColumnDrawer, { type MemberColumnOption } from './ProjectMemberColumnDrawer.vue'
import { performanceColumnWidth } from './performanceTableColumns'
import { nextPerformanceSort, sortPerformanceRows, type PerformanceSortOrder } from './performanceTableSort'

const props = defineProps<{
  projectId: number | string
  nodeId: string
}>()
const emit = defineEmits<{
  'open-task': [{ task_id: number; employee_no: string; display_name: string; status: string }]
}>()

const loading = ref(false)
const error = ref('')
const keyword = ref('')
const items = ref<PerformanceReview360FeedbackItem[]>([])
const total = ref(0)
const allowVoluntary = ref(false)

const columns: MemberColumnOption[] = [
  { key: 'name', label: '姓名', locked: true },
  { key: 'status', label: '360° 评估状态' },
  { key: 'source_label', label: '评估类型' },
  { key: 'relationship', label: '360° 评估关系' },
  { key: 'due_at', label: '360° 评估截止时间' },
  { key: 'job_sequence', label: '序列' },
  { key: 'department', label: '所属部门' },
]
const selectedColumnKeys = ref<string[]>(['name', 'status', 'source_label', 'relationship', 'due_at', 'job_sequence'])
const columnDrawerOpen = ref(false)
const hiddenColumnCount = computed(() => Math.max(0, columns.length - selectedColumnKeys.value.length))
const visibleColumns = computed(() => selectedColumnKeys.value.map(key => columns.find(column => column.key === key)).filter((column): column is MemberColumnOption => Boolean(column)))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const result = await performanceReview360FeedbackApi.list(props.projectId, keyword.value.trim() || undefined)
    items.value = result.items
    total.value = result.total
    allowVoluntary.value = result.allow_voluntary_evaluation
  } catch {
    error.value = '360° 评估列表加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

const dialogOpen = ref(false)
const candidates = ref<PerformanceReview360VoluntaryCandidate[]>([])
const candidateLoading = ref(false)
const selectedTarget = ref<string | null>(null)
const submitting = ref(false)
const candidateOptions = computed(() => candidates.value.map(candidate => ({
  value: candidate.employee_no,
  label: `${candidate.display_name} · ${candidate.employee_no}${candidate.department ? ' · ' + candidate.department : ''}`,
})))
async function loadCandidates() {
  candidateLoading.value = true
  try {
    const result = await performanceReview360FeedbackApi.candidates(props.projectId)
    candidates.value = result.items
  } catch {
    candidates.value = []
  } finally {
    candidateLoading.value = false
  }
}
function openVoluntaryDialog() {
  selectedTarget.value = null
  dialogOpen.value = true
  void loadCandidates()
}
async function confirmVoluntary() {
  if (submitting.value || !selectedTarget.value) return
  submitting.value = true
  try {
    const target = candidates.value.find(candidate => candidate.employee_no === selectedTarget.value)
    const result = await performanceReview360FeedbackApi.start(props.projectId, selectedTarget.value)
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

function openItem(item: PerformanceReview360FeedbackItem) {
  emit('open-task', {
    task_id: item.task_id,
    employee_no: item.employee_no,
    display_name: item.display_name,
    status: item.status,
  })
}

const statusLabel: Record<string, string> = { pending: '待评估', completed: '已提交' }
function cellValue(item: PerformanceReview360FeedbackItem, key: string) {
  switch (key) {
    case 'name': return item.display_name
    case 'status': return statusLabel[item.status] || item.status
    case 'source_label': return item.source_label
    case 'relationship': return item.relationship
    case 'due_at': return item.due_at ? new Date(item.due_at).toLocaleString('zh-CN', { hour12: false }) : '--'
    case 'job_sequence': return item.job_sequence || '--'
    case 'department': return item.department || '--'
    default: return ''
  }
}
function applyColumns(keys: string[]) { selectedColumnKeys.value = keys }

const sortKey = ref('')
const sortOrder = ref<PerformanceSortOrder>('')
const page = ref(1)
const pageSize = ref(50)
function changeSort(key: string) {
  const next = nextPerformanceSort(sortKey.value, sortOrder.value, key)
  sortKey.value = next.key
  sortOrder.value = next.order
  page.value = 1
}
function sortValue(item: PerformanceReview360FeedbackItem, key: string) {
  switch (key) {
    case 'name': return item.display_name
    case 'status': return item.status === 'completed' ? 1 : 0
    case 'source_label': return item.source_label
    case 'relationship': return item.relationship
    case 'due_at': return item.due_at ? new Date(item.due_at).getTime() : null
    case 'job_sequence': return item.job_sequence || ''
    case 'department': return item.department || ''
    default: return ''
  }
}
const sortedItems = computed(() => sortPerformanceRows(items.value, sortKey.value, sortOrder.value, sortValue))
const pagedItems = computed(() => sortedItems.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

watch(() => props.projectId, () => { page.value = 1; void load() })
onMounted(() => void load())

defineExpose({ allowVoluntary, openVoluntaryDialog })
</script>

<template>
  <section class="feedback-panel" aria-label="360° 反馈">
    <PerformanceListToolbar
      v-model:keyword="keyword"
      search-placeholder="搜索成员"
      search-aria-label="搜索成员"
      search-fill
      search-width="100%"
      @search="page = 1; load()"
      @clear="page = 1; load()"
      @filter="ElMessage.info('筛选功能暂未开放')"
    />
    <PerformanceTableSummary :total="total" :hidden-column-count="hiddenColumnCount" @columns="columnDrawerOpen = true" />
    <PerformanceManagementTable
      :rows="pagedItems"
      :loading="loading"
      loading-text="正在加载 360° 评估…"
      :empty-text="error || '暂无 360° 评估邀请，可以自愿评估其他同事'"
      table-aria-label="360° 评估列表"
      pagination-aria-label="360° 评估列表分页"
      :page="page"
      :page-size="pageSize"
      :total="total"
      scroll-mode="page"
      :fit="false"
      row-key="task_id"
      clickable-rows
      @page-change="page = $event"
      @page-size-change="pageSize = $event; page = 1"
      @row-click="openItem"
    >
      <el-table-column v-for="column in visibleColumns" :key="column.key" :prop="column.key" :width="performanceColumnWidth(column.key)">
        <template #header>
          <PerformanceSortHeader
            :label="column.label"
            :order="sortKey === column.key ? (sortOrder === 'asc' ? 'ascending' : sortOrder === 'desc' ? 'descending' : null) : null"
            align="left"
            @click="changeSort(column.key)"
          />
        </template>
        <template #default="{ row }">
          <span v-if="column.key === 'name'" class="feedback-panel__identity">{{ row.display_name }}</span>
          <span v-else-if="column.key === 'status'">
            <span class="feedback-panel__status" :class="`is-${row.status}`">{{ cellValue(row, column.key) }}</span>
          </span>
          <span v-else>{{ cellValue(row, column.key) }}</span>
        </template>
      </el-table-column>
      <template #empty="{ loading: emptyLoading, text }">
        <div v-if="emptyLoading" class="feedback-empty feedback-empty--text" role="status">{{ text }}</div>
        <div v-else-if="error" class="feedback-empty feedback-empty--text" role="alert">{{ error }}</div>
        <div v-else class="feedback-empty" role="status">
          <MetricTemplateEmptyIllustration />
          <p class="feedback-empty__text">暂无 360° 评估邀请，可以自愿评估其他同事</p>
        </div>
      </template>
    </PerformanceManagementTable>
    <ProjectMemberColumnDrawer v-model="columnDrawerOpen" :columns="columns" :selected-keys="selectedColumnKeys" @confirm="applyColumns" />

    <PerformanceDialogShell v-model="dialogOpen" title="自愿评估" width="600px" :loading="submitting">
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
          <PerformanceButton variant="secondary" @click="dialogOpen = false">取消</PerformanceButton>
          <PerformanceButton variant="primary" :disabled="!selectedTarget" :loading="submitting" @click="confirmVoluntary">前往评估</PerformanceButton>
        </div>
      </template>
    </PerformanceDialogShell>
  </section>
</template>

<style scoped>
.feedback-panel { min-width: 0; padding: var(--spacing-5); box-sizing: border-box; border-radius: var(--radius-lg); background: var(--color-bg-card); color: var(--color-text-primary); box-shadow: var(--shadow-dialog); }
.feedback-panel__identity { font-weight: 500; }
.feedback-panel__status { display: inline-flex; align-items: center; min-width: 56px; height: 22px; padding: 0 var(--spacing-2); border-radius: 9999px; font-size: var(--font-size-xs); line-height: 22px; }
.feedback-panel__status.is-pending { background: var(--color-warning-light); color: var(--color-warning); }
.feedback-panel__status.is-completed { background: var(--color-success-light); color: var(--color-success); }
.feedback-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--spacing-2); padding: 60px 0; color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: 22px; text-align: center; }
.feedback-empty--text { min-height: 300px; display: grid; place-items: center; padding: 0; color: var(--color-text-secondary); }
.feedback-empty__text { margin: 0; }
.voluntary-dialog__footer { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-gap); }
</style>
