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
import PerformanceDrawerShell from './PerformanceDrawerShell.vue'
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import PerformanceTableSummary from './PerformanceTableSummary.vue'
import MetricTemplateEmptyIllustration from './MetricTemplateEmptyIllustration.vue'
import ProjectMemberColumnDrawer, { type MemberColumnOption } from './ProjectMemberColumnDrawer.vue'

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
const candidateKeyword = ref('')
const candidates = ref<PerformanceReview360VoluntaryCandidate[]>([])
const candidateLoading = ref(false)
const selectedTarget = ref<string>('')
const submitting = ref(false)

async function loadCandidates() {
  candidateLoading.value = true
  try {
    const result = await performanceReview360FeedbackApi.candidates(props.projectId, candidateKeyword.value.trim() || undefined)
    candidates.value = result.items
    const available = new Set(result.items.map(item => item.employee_no))
    if (!available.has(selectedTarget.value)) selectedTarget.value = ''
  } catch {
    candidates.value = []
  } finally {
    candidateLoading.value = false
  }
}
function openVoluntaryDialog() {
  candidateKeyword.value = ''
  selectedTarget.value = ''
  dialogOpen.value = true
  void loadCandidates()
}
function searchCandidates() {
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
function columnMinWidth(key: string) {
  switch (key) {
    case 'name': return 160
    case 'relationship': return 130
    case 'due_at': return 160
    case 'status': return 120
    case 'source_label': return 110
    case 'department': return 160
    default: return 100
  }
}
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

watch(() => props.projectId, () => { void load() })
onMounted(() => void load())
</script>

<template>
  <section class="feedback-panel" aria-label="360° 反馈">
    <PerformanceListToolbar
      v-model:keyword="keyword"
      search-placeholder="搜索成员"
      search-aria-label="搜索成员"
      search-fill
      search-width="100%"
      @search="load()"
      @clear="load()"
      @filter="ElMessage.info('筛选功能暂未开放')"
    >
      <template #actions>
        <PerformanceButton v-if="allowVoluntary" variant="primary" aria-label="自愿评估" @click="openVoluntaryDialog">自愿评估</PerformanceButton>
      </template>
    </PerformanceListToolbar>
    <PerformanceTableSummary :total="total" :hidden-column-count="hiddenColumnCount" @columns="columnDrawerOpen = true" />
    <PerformanceManagementTable
      :rows="items"
      :loading="loading"
      loading-text="正在加载 360° 评估…"
      :empty-text="error || '暂无 360° 评估邀请，可以自愿评估其他同事'"
      table-aria-label="360° 评估列表"
      pagination-aria-label="360° 评估列表分页"
      :show-pagination="false"
      row-key="task_id"
      clickable-rows
      @row-click="openItem"
    >
      <el-table-column v-for="column in visibleColumns" :key="column.key" :prop="column.key" :label="column.label" :min-width="columnMinWidth(column.key)">
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

    <PerformanceDrawerShell v-model="dialogOpen" width="560px" variant="captured" title="自愿评估" aria-label="自愿评估">
      <div class="voluntary-dialog">
        <p class="voluntary-dialog__description">你可以自愿评估其他同事，为 Ta 本次绩效提供更加全面的 360° 评估信息</p>
        <PerformanceListToolbar
          v-model:keyword="candidateKeyword"
          search-placeholder="搜索要评估的同事"
          search-aria-label="搜索要评估的同事"
          :show-filter="false"
          @search="searchCandidates"
          @clear="searchCandidates"
        />
        <div v-if="candidateLoading" class="voluntary-dialog__state">正在加载成员…</div>
        <div v-else-if="!candidates.length" class="voluntary-dialog__state">暂无可评估的同事</div>
        <ul v-else class="voluntary-dialog__list">
          <li v-for="candidate in candidates" :key="candidate.employee_no">
            <label class="voluntary-candidate" :class="{ 'is-selected': selectedTarget === candidate.employee_no }">
              <input type="radio" name="voluntary-target" :value="candidate.employee_no" :checked="selectedTarget === candidate.employee_no" :aria-label="`评估${candidate.display_name}`" @change="selectedTarget = candidate.employee_no">
              <span class="voluntary-candidate__avatar">{{ candidate.display_name.slice(-1) }}</span>
              <span class="voluntary-candidate__copy">
                <span class="voluntary-candidate__name">{{ candidate.display_name }}</span>
                <span class="voluntary-candidate__meta">{{ candidate.job_sequence || '--' }}<template v-if="candidate.department"> · {{ candidate.department }}</template></span>
              </span>
            </label>
          </li>
        </ul>
        <div class="voluntary-dialog__footer">
          <PerformanceButton variant="secondary" @click="dialogOpen = false">取消</PerformanceButton>
          <PerformanceButton variant="primary" :disabled="!selectedTarget" :loading="submitting" @click="confirmVoluntary">前往评估</PerformanceButton>
        </div>
      </div>
    </PerformanceDrawerShell>
  </section>
</template>

<style scoped>
.feedback-panel { min-width: 0; padding: 20px; box-sizing: border-box; border-radius: 8px; background: #fff; color: #1f2329; box-shadow: rgba(31,35,41,.03) 0 4px 16px 4px, rgba(31,35,41,.02) 0 4px 8px, rgba(31,35,41,.02) 0 2px 4px -4px; }
.feedback-panel__identity { font-weight: 500; }
.feedback-panel__status { display: inline-flex; align-items: center; min-width: 56px; height: 22px; padding: 0 8px; border-radius: 9999px; font-size: 12px; line-height: 22px; }
.feedback-panel__status.is-pending { background: #fff0df; color: #d46b08; }
.feedback-panel__status.is-completed { background: #d5f6f2; color: #024b41; }
.feedback-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 60px 0; color: #646a73; font-size: 14px; line-height: 22px; text-align: center; }
.feedback-empty--text { min-height: 300px; display: grid; place-items: center; padding: 0; color: var(--color-text-secondary); }
.feedback-empty__text { margin: 0; }
.voluntary-dialog { display: flex; min-height: 0; flex-direction: column; }
.voluntary-dialog__description { margin: 0 0 12px; color: #646a73; font-size: 13px; line-height: 20px; }
.voluntary-dialog__state { display: grid; min-height: 200px; place-items: center; color: #8f959e; font-size: 14px; }
.voluntary-dialog__list { flex: 1; min-height: 0; margin: 0; padding: 0; list-style: none; overflow-y: auto; }
.voluntary-candidate { display: flex; align-items: center; gap: 12px; padding: 10px 8px; border-radius: 6px; border-bottom: 1px solid rgba(31,35,41,.08); cursor: pointer; }
.voluntary-candidate.is-selected { background: #f0f4ff; }
.voluntary-candidate input { flex: 0 0 16px; width: 16px; height: 16px; margin: 0; accent-color: #3370ff; }
.voluntary-candidate__avatar { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 32px; width: 32px; height: 32px; border-radius: 50%; background: #e5eaf5; color: #3b5b92; font-size: 13px; }
.voluntary-candidate__copy { display: flex; min-width: 0; flex-direction: column; }
.voluntary-candidate__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #1f2329; font-size: 14px; line-height: 22px; }
.voluntary-candidate__meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #646a73; font-size: 12px; line-height: 20px; }
.voluntary-dialog__footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding-top: 12px; border-top: 1px solid rgba(31,35,41,.08); }
</style>
