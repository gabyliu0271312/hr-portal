<template>
  <PerformanceTaskWorkspace split-mode :class="{ 'task-workspace--embedded': embedded }">
    <template v-if="!embedded" #header>
      <PerformanceSelfSummaryHeader :person="task.person" @back="closeTask">
        <template #actions><PerformanceWriteModeSwitch :model-value="displayMode" :disabled="loading || Boolean(loadError)" :split-available="splitAvailable" @update:model-value="changeMode" /></template>
      </PerformanceSelfSummaryHeader>
    </template>
    <template #split>
      <PerformanceSplitWorkspace :enabled="!embedded && mode === 'basicWriteMode' && !loading && !loadError" @available="splitAvailable = $event">
        <template #tabs>
          <nav class="summary-tabs" aria-label="绩效填写页签">
            <button v-for="tab in tabs" :key="tab.key" :class="{ active: activeTab === tab.key }" type="button" @click="activeTab = tab.key">{{ tab.label }}</button>
          </nav>
          <p v-if="mode === 'basicWriteMode' && !splitAvailable && !loading && !loadError" class="narrow-mode-notice" role="status">窗口较窄，暂用全屏填写；扩大窗口后恢复双屏。</p>
        </template>
        <template #left>
          <nav class="summary-tabs reference-tabs" aria-label="参考内容页签">
            <button v-for="reference in task.reference_tabs || []" :key="reference.key" :class="{ active: selectedReference?.key === reference.key }" type="button" @click="referenceKey = reference.key">{{ reference.node_name }}</button>
            <span v-if="!task.reference_tabs?.length">参考内容</span>
          </nav>
          <div class="reference-scroll">
            <PerformanceReferenceContent v-if="isSplit && selectedReference" class="task-reference-content" show-title :reference="selectedReference" @remind="openReminder" />
            <section v-else class="state">暂无参考内容</section>
          </div>
        </template>
        <section v-if="loading" class="state">正在加载…</section>
        <section v-else-if="loadError" class="state error"><p>{{ loadError }}</p><button type="button" @click="load()">重新加载</button></section>
        <template v-else>
          <div v-show="isSplit || activeTab === 'current'" class="task-content">
            <section v-if="!isReconsiderationTask && !task.form_schema.length && !hasReviewer360Element" class="state">暂无填写内容</section>
            <div v-else ref="draftAnchor" class="task-form-shell">
              <div v-if="task.calibration_notice" class="task-notices task-notices--calibration"><PerformancePromptNotice type="info" multiline>{{ task.calibration_notice }}</PerformancePromptNotice></div>
              <div class="task-notices task-notices--submission">
                <PerformanceReviewCompletionNotice v-if="task.final_result_locked" :editable="false" :message="FINAL_RESULT_LOCKED_MESSAGE" />
                <PerformanceReviewCompletionNotice v-if="!isReconsiderationTask && (viewing || latestSubmission)" :editable="viewing && task.editable && task.submit_allowed && !task.final_result_locked" :task-id="task.task_id" :task-kind="task.task_kind || props.taskKind" :employee-no="task.person.employee_no" :message="submissionMessage" @edit="choice => load(choice || 'edit')" />
              </div>
              <PerformanceDraftChoice :visible="draftOpen" :anchor="draftAnchor" :task="task" :employee-no="task.person.employee_no" @close="draftOpen = false; viewing = true; draftPending = false" @choose="choice => load(choice)" />
              <section v-if="isReconsiderationTask && task.reconsideration?.handlers.length" class="task-reconsideration-handlers">
                <h2>处理人</h2>
                <p v-for="handler in task.reconsideration.handlers" :key="`${handler.task_id}-${handler.role_key}`">{{ handler.role_label }} {{ handler.display_name }}</p>
              </section>
              <PerformancePromptNotice v-if="reviewer360Conflict" type="warning" multiline>{{ saveMessage }} <button type="button" @click="reloadReviewer360">重新读取名单</button></PerformancePromptNotice>
              <PerformanceReconsiderationContent v-if="isReconsiderationTask" class="task-reconsideration" :title="task.content_page_name || task.node_name" :reason="task.reconsideration_reason" :model-value="keepResultChoice" :show-result-and-modify="showResultAndModify" :interactive="canEdit && !submitting" @update:model-value="changeKeepResult">
                <PerformanceTemplateRenderer ref="formRef" class="task-template-renderer" :mode="viewing || draftPending || reconsiderationClosed ? 'readonly' : 'edit'" :sections="task.form_schema" :answers="answers" :errors="errors" :editable="canEdit" @update-answer="updateAnswer" @queue-save="queueSave" @reviewer-360-change="updateReviewer360" @reviewer-360-busy="reviewer360Busy = $event" @submit="submit()" />
              </PerformanceReconsiderationContent>
              <PerformanceTemplateRenderer v-else ref="formRef" class="task-template-renderer" :mode="viewing || draftPending ? 'readonly' : 'edit'" :title="task.content_page_name || task.node_name" :sections="task.form_schema" :answers="answers" :errors="errors" :editable="task.editable && task.submit_allowed && !task.final_result_locked && !submitting" @update-answer="updateAnswer" @queue-save="queueSave" @reviewer-360-change="updateReviewer360" @reviewer-360-busy="reviewer360Busy = $event" @submit="submit()">
                <template #after-title><PerformanceComparisonNotice :comparison="viewing || draftPending ? task.comparison : comparison" :task-id="task.task_id" :references="task.reference_tabs" :readonly="viewing || draftPending" /></template>
              </PerformanceTemplateRenderer>
            </div>
          </div>
          <PerformanceReferenceContent v-if="!isSplit && activeReference" class="task-reference-content" show-title :reference="activeReference" @remind="openReminder" />
        </template>
        <template #footer><PerformanceSelfSummaryFooter v-if="!loading && !loadError && !viewing && !draftPending && !reconsiderationClosed && !task.final_result_locked" v-show="isSplit || activeTab === 'current'" :submitting="submitting" :submit-allowed="task.submit_allowed && !task.final_result_locked && !loading && !reviewer360Busy && !reviewer360Conflict" :editable="canEdit" :can-giveup="canGiveup && !submitting" :message="saveMessage" @submit="submit()" @cancel="closeTask" @giveup="giveupConfirmOpen = true" /></template>
      </PerformanceSplitWorkspace>
    </template>
  </PerformanceTaskWorkspace>
  <PerformanceComparisonReasonDialog v-model="comparisonDialogOpen" :reason="comparisonReason" :reasons="comparisonReasons" @update:reason="updateComparisonReason" @update:reasons="updateComparisonReasons" :comparison="comparison" :task-id="task.task_id" :references="task.reference_tabs" :loading="submitting" :error="comparisonDialogError" @confirm="submit(comparisonOverdueConfirmed, comparisonDialogContext)" />
  <PerformanceMemberReminderDialog v-model="reminderOpen" :context="reminderContext" />
  <PerformanceConfirmDialog v-model="overdueConfirmOpen" appearance="submit" confirm-variant="primary" message="确定提交吗？" description="当前环节已过截止时间，提交后将无法修改内容。" cancel-text="取消" confirm-text="确定" :loading="submitting" :error-message="overdueConfirmError" @confirm="submit(true)" />
  <PerformanceConfirmDialog v-model="giveupConfirmOpen" appearance="submit" confirm-variant="primary" message="确定放弃评估？" description="放弃后将从你的 360° 评估列表中移除，重新评估需再次发起自愿评估。" cancel-text="取消" confirm-text="确定" :loading="givingUp" :error-message="giveupError" @confirm="giveup()" />
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getActivePinia } from 'pinia'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'
import PerformanceComparisonNotice from '@/components/performance/PerformanceComparisonNotice.vue'
import PerformanceComparisonReasonDialog from '@/components/performance/PerformanceComparisonReasonDialog.vue'
import { usePerformanceComparison, performanceComparisonContext, performanceComparisonGroups, performanceComparisonReasonGroups } from '@/composables/usePerformanceComparison'
import PerformanceConfirmDialog from '@/components/performance/PerformanceConfirmDialog.vue'
import PerformanceDraftChoice from '@/components/performance/PerformanceDraftChoice.vue'
import PerformanceReviewCompletionNotice from '@/components/performance/PerformanceReviewCompletionNotice.vue'
import { performanceReview360FeedbackApi, performanceReviewApi, FINAL_RESULT_LOCKED_MESSAGE, type PerformanceReview360InviteList, type PerformanceComparisonReason, type PerformanceComparisonSubmission, type PerformanceReferenceTab, type SelfSummaryTask } from '@/api/performance'
import PerformanceMemberReminderDialog from '@/components/performance/PerformanceMemberReminderDialog.vue'
import { usePerformanceMemberReminder } from '@/composables/usePerformanceMemberReminder'
import PerformanceTaskWorkspace from '@/components/performance/PerformanceTaskWorkspace.vue'
import PerformanceWriteModeSwitch from '@/components/performance/PerformanceWriteModeSwitch.vue'
import PerformanceSplitWorkspace from '@/components/performance/PerformanceSplitWorkspace.vue'
import { usePerformanceWriteMode, type PerformanceWriteMode } from '@/composables/usePerformanceWriteMode'
import PerformanceReferenceContent from '@/components/performance/PerformanceReferenceContent.vue'
import PerformanceSelfSummaryFooter from '@/components/performance/PerformanceSelfSummaryFooter.vue'
import PerformanceSelfSummaryHeader from '@/components/performance/PerformanceSelfSummaryHeader.vue'
import PerformanceTemplateRenderer from '@/components/performance/PerformanceTemplateRenderer.vue'
import PerformanceReconsiderationContent from '@/components/performance/PerformanceReconsiderationContent.vue'
import PerformancePromptNotice, { promptDefinitions } from '@/components/performance/PerformancePromptNotice.vue'
import { supportsReminderSourceTask } from '@/components/performance/performanceReminder'
import { performanceTemplateFieldErrorKey, performanceTemplateFieldValue, performanceTemplateInstanceCount, performanceTemplateInitialAnswers, performanceTemplateInstanceUnknown, performanceTemplateWritableAnswers } from '@/components/performance/performanceTemplateAnswers'

const props = withDefaults(defineProps<{ taskKind?: 'work_summary' | 'evaluation' | 'reviewer_360_invite' | 'reviewer_360_confirm'; embedded?: boolean; taskId?: string | number; employeeNo?: string; projectId?: number; cycleId?: number; draftChoice?: 'use' | 'discard' }>(), { taskKind: 'work_summary', embedded: false })
const emit = defineEmits<{ close: []; submitted: [] }>()
const route = useRoute()
const router = useRouter()
const contextTaskId = computed(() => String(props.taskId ?? (props.embedded ? '' : route.query.task_id) ?? ''))
const contextEmployeeNo = computed(() => props.employeeNo ?? (!props.embedded && typeof route.query.employee_no === 'string' ? route.query.employee_no : undefined))
const contextProjectId = computed(() => props.projectId ?? (props.embedded ? undefined : Number(route.query.project_id)))
const contextCycleId = computed(() => props.cycleId ?? (props.embedded ? undefined : Number(route.query.cycle_id)))
function closeTask() { if (props.embedded) { resetTaskContext(); emit('close') } else router.back() }
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const submitting = ref(false)
const givingUp = ref(false)
const overdueConfirmOpen = ref(false)
const overdueConfirmError = ref('')
const giveupConfirmOpen = ref(false)
const giveupError = ref('')
const viewing = ref(!props.embedded && route.query.view === '1')
const draftOpen = ref(false)
const draftPending = ref(false)
const draftAnchor = ref<HTMLElement | null>(null)
const saveMessage = ref('草稿将实时保存到云端')
const task = ref<SelfSummaryTask>({ task_id: contextTaskId.value, task_kind: props.taskKind, entry_mode: 'template_task', node_name: '', person: { employee_no: '', display_name: '当前用户' }, editable: false, submit_allowed: false, form_schema: [], answers: {} })
const latestSubmission = computed(() => task.value.answer_submissions?.at(-1))
const submissionMessage = computed(() => {
  const latest = latestSubmission.value
  if (!latest) return task.value.final_result_locked ? '以下为当前绩效结果' : saveMessage.value === '提交成功' ? '提交成功，可在允许的期限内继续编辑' : '已提交，可在允许的期限内继续编辑'
  if (task.value.stage_views?.some(stage => stage.node_id === task.value.node_id && stage.anonymous)) return '该评估内容已提交'
  const submitted = new Date(latest.submitted_at).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  return `以下内容由 ${latest.display_name} 在 ${submitted}（GMT+8） 提交`
})
const { reminderOpen, reminderContext, openMemberReminder } = usePerformanceMemberReminder()
const baseResultVersion = ref<number | null | undefined>()
const sharedResultConflict = ref(false)
const answers = reactive<Record<string, unknown>>({})
const errors = reactive<Record<string, string>>({})
const { comparison, reason: comparisonReason, reasons: comparisonReasons, dialogOpen: comparisonDialogOpen, dialogError: comparisonDialogError, reset: resetComparison, refresh: refreshComparison, schedule: scheduleComparison, invalidate: invalidateComparison } = usePerformanceComparison(() => performanceReviewApi.previewComparison(task.value.task_id, writableAnswers(), task.value.version, contextEmployeeNo.value, baseResultVersion.value))
const comparisonOverdueConfirmed = ref(false)
const comparisonDialogContext = ref<string>()
const comparisonReasonContext = ref('')
let savedComparisonDraft = ''
function comparisonDraft(): PerformanceComparisonSubmission {
  return comparison.value?.groups !== undefined
    ? { comparison_reasons: comparisonReasons.value.filter(item => performanceComparisonGroups(comparison.value).some(group => group.rule_id === item.rule_id && group.active !== false)) }
    : { diff_reason: comparisonReason.value, comparison_context: comparisonReasonContext.value }
}
function updateComparisonReasons(value: PerformanceComparisonReason[]) {
  comparisonReasons.value = value
  queueSave(250)
}
function updateComparisonReason(value: string) {
  comparisonReason.value = value
  comparisonReasonContext.value = comparison.value?.context || ''
  queueSave(250)
}
const hasComparison = computed(() => task.value.task_kind === 'evaluation' && performanceComparisonGroups(task.value.comparison).some(group => group.active !== false))
const ratingAnswersKey = computed(() => JSON.stringify(task.value.form_schema.flatMap(section => section.fields.filter(field => field.type === 'rating').map(field => [field.id, answers[field.id]]))))
watch(ratingAnswersKey, () => { if (hasComparison.value && canEdit.value && !submitting.value && !comparisonDialogOpen.value) scheduleComparison() })
const formRef = ref<{ focusField: (id: string) => void } | null>(null)
const activeTab = ref('current')
const tabs = computed(() => [{ key: 'current', label: task.value.node_name || (loadError.value ? '加载失败' : '加载中…') }, ...(task.value.reference_tabs || []).map(reference => ({ key: reference.key, label: reference.node_name }))])
const activeReference = computed<PerformanceReferenceTab | null>(() => task.value.reference_tabs?.find(reference => reference.key === activeTab.value) || null)
const { mode } = usePerformanceWriteMode()
const splitAvailable = ref(false)
const referenceKey = ref('')
const selectedReference = computed(() => task.value.reference_tabs?.find(reference => reference.key === referenceKey.value) || task.value.reference_tabs?.[0] || null)
const displayMode = computed<PerformanceWriteMode>(() => mode.value === 'basicWriteMode' && splitAvailable.value ? 'basicWriteMode' : 'fullScreenMode')
const isSplit = computed(() => !props.embedded && displayMode.value === 'basicWriteMode')
function changeMode(value: PerformanceWriteMode) { mode.value = value; activeTab.value = 'current' }
const isReconsiderationTask = computed(() => task.value.task_kind === 'result_reconsideration')
const isReviewer360Task = computed(() => ['reviewer_360_invite', 'reviewer_360_confirm'].includes(task.value.task_kind))
const reviewer360Element = computed(() => task.value.form_schema.flatMap(section => section.elements || []).find(element => element.kind === 'reviewer_360'))
const hasReviewer360Element = computed(() => Boolean(reviewer360Element.value))
const reviewer360Busy = ref(false)
const reviewer360Conflict = ref(false)
const reviewer360Version = computed(() => task.value.reviewer_360?.version ?? task.value.reviewer_360_version ?? (reviewer360Element.value?.kind === 'reviewer_360' ? reviewer360Element.value.data.version : undefined) ?? undefined)
let savedReviewer360Version: string | undefined
function applyReviewer360(data: PerformanceReview360InviteList) {
  task.value.reviewer_360 = data
  task.value.reviewer_360_version = data.version ?? undefined
  for (const section of task.value.form_schema) for (const element of section.elements || []) if (element.kind === 'reviewer_360') element.data = data
}
function updateReviewer360(data: PerformanceReview360InviteList) { applyReviewer360(data); queueSave() }
async function reloadReviewer360() {
  const epoch = taskEpoch
  const request = loadRequest
  const element = reviewer360Element.value
  const projectId = task.value.project_id || (element?.kind === 'reviewer_360' ? element.data.project_id : undefined)
  if (!projectId || reviewer360Busy.value) return
  reviewer360Busy.value = true
  try {
    const refreshed = await performanceReviewApi.templateTask(task.value.task_id, contextEmployeeNo.value, { view: 'edit' })
    if (disposed || epoch !== taskEpoch || request !== loadRequest) return
    task.value.version = refreshed.version
    task.value.editable = refreshed.editable
    task.value.submit_allowed = refreshed.submit_allowed
    task.value.form_schema = refreshed.form_schema
    const data = refreshed.reviewer_360 || refreshed.form_schema.flatMap(section => section.elements || []).find(element => element.kind === 'reviewer_360')?.data
    if (!data) throw new Error('missing roster')
    applyReviewer360(data)
    reviewer360Conflict.value = false
    saveMessage.value = '名单已重新读取，请核对后提交'
  } catch (error) {
    if (!disposed && epoch === taskEpoch && request === loadRequest) saveMessage.value = errorMessage(error, '名单重新读取失败，请重试')
  } finally { if (!disposed && epoch === taskEpoch && request === loadRequest) reviewer360Busy.value = false }
}
function reviewer360ConflictMessage(error: unknown) {
  if (!isReviewer360Task.value || (error as { response?: { status?: number } })?.response?.status !== 409) return false
  const code = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (!['REVIEWER_360_VERSION_CONFLICT', 'VERSION_CONFLICT', 'VERSION_REQUIRED', 'SUBMISSION_NOT_ALLOWED'].includes(String(code))) return false
  reviewer360Conflict.value = true
  saveMessage.value = code === 'REVIEWER_360_VERSION_CONFLICT' ? '360°评估人名单已变化，当前内容已保留，请重新读取名单并核对后提交' : code === 'SUBMISSION_NOT_ALLOWED' ? '当前任务不允许提交，当前内容已保留，请重新读取任务状态' : '任务已被更新，当前内容已保留，请重新读取最新任务版本后提交'
  return true
}
const showResultAndModify = computed(() => task.value.show_result_and_modify !== false)
const clock = ref(Date.now())
const reconsiderationClosed = computed(() => {
  if (!isReconsiderationTask.value) return false
  const detail = task.value.reconsideration
  const deadline = detail?.deadline_at || task.value.deadline_at
  const due = deadline ? Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(deadline) ? deadline : `${deadline}Z`) : NaN
  return task.value.reconsideration_closed === true || detail?.status === 'deadline_locked' || Number.isFinite(due) && clock.value > due
})
const keepResultChoice = ref<'keep' | 'change'>('change')
const effectiveKeepResult = computed(() => showResultAndModify.value ? keepResultChoice.value : 'keep')
function changeKeepResult(value: 'keep' | 'change') {
  if (!canEdit.value || submitting.value) return
  keepResultChoice.value = value
  Object.keys(errors).forEach(key => delete errors[key])
  queueSave()
}
function writableAnswers(includeHiddenResults = false) {
  if (isReviewer360Task.value) return {}
  const writable: Record<string, unknown> = isReconsiderationTask.value && (!showResultAndModify.value || effectiveKeepResult.value === 'keep' && !includeHiddenResults) ? {} : performanceTemplateWritableAnswers(task.value.form_schema, answers)
  if (isReconsiderationTask.value) writable.keep_result = effectiveKeepResult.value
  return writable
}
watch(() => task.value.reference_tabs, references => { if (!references?.some(reference => reference.key === referenceKey.value)) referenceKey.value = references?.[0]?.key || '' }, { immediate: true })
const canEdit = computed(() => !task.value.final_result_locked && !viewing.value && !draftPending.value && !reconsiderationClosed.value && !loading.value && !loadError.value && (isReconsiderationTask.value || hasReviewer360Element.value || task.value.form_schema.some(section => section.fields.length > 0)) && task.value.editable && task.value.submit_allowed && (!isReconsiderationTask.value || task.value.reconsideration?.can_edit !== false))
const canGiveup = computed(() => !viewing.value && !draftPending.value && !loading.value && !loadError.value && Boolean(task.value.can_giveup) && !task.value.submitted_at)
let saveTimer: number | undefined
let saveChain: Promise<void> = Promise.resolve()
let pendingSave = false
let disposed = false
let taskEpoch = 0
let loadRequest = 0
let savedAnswers = ''
const clockTimer = window.setInterval(() => { clock.value = Date.now() }, 1000)
function resetTaskContext() {
  ++taskEpoch
  ++loadRequest
  resetComparison()
  comparisonOverdueConfirmed.value = false
  window.clearTimeout(saveTimer)
  pendingSave = false
  saveChain = Promise.resolve()
  saving.value = false
  reviewer360Busy.value = false
  reviewer360Conflict.value = false
  submitting.value = false
  viewing.value = !props.embedded && route.query.view === '1'
  draftOpen.value = false
  draftPending.value = false
  overdueConfirmOpen.value = false
  giveupConfirmOpen.value = false
  reminderOpen.value = false
  saveMessage.value = '草稿将实时保存到云端'
  Object.keys(errors).forEach(key => delete errors[key])
}

function errorMessage(error: unknown, fallback: string) {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') {
    const calibrationErrors: Record<string, string> = {
      COMPARISON_SOURCE_CHANGED: '对比来源或规则已更新，请核对后重新确认，已填写的理由已保留',
      DIFF_REASON_REQUIRED: '请填写差异理由',
      SHARED_RESULT_VERSION_CONFLICT: '绩效结果已被其他人更新，当前输入已保留，请刷新核对后再提交',
      FINAL_RESULT_CALIBRATED: FINAL_RESULT_LOCKED_MESSAGE,
      RECONSIDERATION_CLOSED: '复议已处理完成，无法继续编辑或提交，请刷新查看最新结果',
      RECONSIDERATION_BASELINE_UNAVAILABLE: '复议前绩效结果暂不可用，请联系管理员核对后重试',
      RECONSIDERATION_SOURCE_CONFLICT: '复议结果来源不一致，请联系管理员核对后重试',
      CALIBRATION_SOURCE_NOT_READY: '终评或前一校准阶段尚未全部提交，请完成后重试',
      CALIBRATION_SOURCE_CONFLICT: '终评或前一校准阶段存在不一致的结果，请先核对后重试',
    }
    return calibrationErrors[detail] || detail
  }
  if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') return detail.message
  return fallback
}
function closeReconsiderationOnConflict(error: unknown) {
  if (!isReconsiderationTask.value || (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail !== 'RECONSIDERATION_CLOSED') return
  task.value.reconsideration_closed = true
  task.value.editable = false
  task.value.submit_allowed = false
  loadError.value = errorMessage(error, '')
}
async function lockFinalResultOnConflict(error: unknown) {
  if ((error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail !== 'FINAL_RESULT_CALIBRATED') return
  task.value.final_result_locked = true
  task.value.editable = false
  task.value.submit_allowed = false
  pendingSave = false
  window.clearTimeout(saveTimer)
  draftOpen.value = false
  draftPending.value = false
  overdueConfirmOpen.value = false
  saveMessage.value = FINAL_RESULT_LOCKED_MESSAGE
  await load()
}
async function load(choice?: 'use' | 'discard' | 'edit') {
  const request = ++loadRequest
  invalidateComparison()
  const epoch = taskEpoch
  const current = () => !disposed && epoch === taskEpoch && request === loadRequest
  window.clearTimeout(saveTimer)
  pendingSave = false
  loading.value = true
  loadError.value = ''
  try {
    const taskId = contextTaskId.value
    const employeeNo = contextEmployeeNo.value
    let loaded = !props.embedded && props.taskKind === 'work_summary'
      ? employeeNo ? await performanceReviewApi.selfSummary(taskId, employeeNo) : await performanceReviewApi.selfSummary(taskId)
      : employeeNo ? await performanceReviewApi.templateTask(taskId, employeeNo) : await performanceReviewApi.templateTask(taskId)
    if (!current()) return
    const decision = choice || props.draftChoice || (!props.embedded ? route.query.draft_choice : undefined)
    if (['reviewer_360_invite', 'reviewer_360_confirm'].includes(loaded.task_kind) && (!viewing.value || decision === 'use' || decision === 'discard' || decision === 'edit')) {
      loaded = await performanceReviewApi.templateTask(taskId, employeeNo, { view: 'edit' })
      if (!current()) return
    }
    if (loaded.task_kind === 'result_reconsideration' && loaded.reconsideration) {
      loaded.form_schema = loaded.reconsideration.form_schema
      loaded.answers = loaded.reconsideration.answers
      loaded.reconsideration_reason = loaded.reconsideration.reason
      loaded.submitted_at = loaded.reconsideration.submitted_at
      loaded.deadline_at = loaded.reconsideration.deadline_at
    }
    task.value = loaded
    if (loaded.reviewer_360) applyReviewer360(loaded.reviewer_360)
    reviewer360Conflict.value = false
    savedReviewer360Version = reviewer360Version.value
    activeTab.value = 'current'
    Object.keys(answers).forEach(key => delete answers[key])
    if (loaded.final_result_locked) {
      loaded.editable = false
      loaded.submit_allowed = false
      viewing.value = Boolean(loaded.submitted_at)
      draftOpen.value = false
      draftPending.value = false
      saveMessage.value = FINAL_RESULT_LOCKED_MESSAGE
    } else if (reconsiderationClosed.value) {
      viewing.value = true
      draftOpen.value = false
      draftPending.value = false
    } else if (choice) {
      viewing.value = false
      if (!props.embedded && route.query.view === '1') {
        const { view: _view, draft_choice: _choice, ...query } = route.query
        await router.replace({ query })
      }
    }
    if (!current()) return
    draftPending.value = !loaded.final_result_locked && !reconsiderationClosed.value && !viewing.value && Boolean(loaded.submitted_at && loaded.has_draft && decision !== 'use' && decision !== 'discard')
    draftOpen.value = draftPending.value
    const useDraft = !loaded.final_result_locked && !viewing.value && !draftPending.value && loaded.has_draft && decision !== 'discard'
    baseResultVersion.value = useDraft ? loaded.draft_base_result_version : loaded.result_version
    sharedResultConflict.value = false
    loaded.answers = isReviewer360Task.value ? {} : loaded.answers
    const values = isReviewer360Task.value ? {} : useDraft ? { ...loaded.answers, ...loaded.draft_answers } : loaded.answers || {}
    const restoredChoice = useDraft ? loaded.keep_result ?? values.keep_result : loaded.answers?.keep_result ?? (loaded.has_draft ? undefined : loaded.keep_result)
    keepResultChoice.value = restoredChoice === 'keep' ? 'keep' : 'change'
    Object.assign(answers, loaded.editable && loaded.submit_allowed && !viewing.value && !draftPending.value ? performanceTemplateInitialAnswers(loaded.form_schema, values) : values)
    savedAnswers = JSON.stringify(writableAnswers(true))
    const restoreReasonDraft = decision !== 'discard' && !viewing.value && !draftPending.value && !loaded.final_result_locked && (useDraft || !loaded.has_draft)
    resetComparison(loaded.comparison || null, restoreReasonDraft ? loaded.draft_diff_reason : undefined, restoreReasonDraft ? loaded.draft_comparison_reasons : undefined)
    comparisonReasonContext.value = restoreReasonDraft ? loaded.draft_comparison_context || loaded.comparison?.context || '' : loaded.comparison?.context || ''
    savedComparisonDraft = JSON.stringify(comparisonDraft())
    if (hasComparison.value && !viewing.value && !draftPending.value) scheduleComparison()
  } catch (error) {
    if (current()) loadError.value = errorMessage(error, '自我总结加载失败，请稍后重试')
  } finally {
    if (current()) loading.value = false
  }
}
function updateAnswer(id: string, value: unknown) { if (canEdit.value && !submitting.value) answers[id] = value }
function queueSave(delay = 350) {
  if (!canEdit.value || sharedResultConflict.value || reviewer360Conflict.value || disposed || submitting.value) return
  window.clearTimeout(saveTimer)
  if (saving.value) { pendingSave = true; return }
  saveTimer = window.setTimeout(() => { void saveDraft().catch(() => undefined) }, delay)
}
function saveDraft() {
  clock.value = Date.now()
  if (disposed || !canEdit.value) return saveChain
  pendingSave = true
  if (saving.value) return saveChain
  const epoch = taskEpoch
  const current = () => !disposed && epoch === taskEpoch
  saving.value = true
  saveChain = (async () => {
    try {
      while (pendingSave && current() && !submitting.value && canEdit.value) {
        pendingSave = false
        const writable = writableAnswers(true)
        const serialized = JSON.stringify(writable)
        const reasonDraft = comparisonDraft()
        const serializedReason = JSON.stringify(reasonDraft)
        const saveReason = hasComparison.value && serializedReason !== savedComparisonDraft
        const reviewerVersion = isReviewer360Task.value ? reviewer360Version.value : undefined
        if (serialized === savedAnswers && !saveReason && reviewerVersion === savedReviewer360Version) continue
        if (isReviewer360Task.value && !reviewerVersion?.trim()) { saveMessage.value = '360°评估人名单版本不可用，请重新读取名单'; reviewer360Conflict.value = true; return }
        const snapshot = JSON.parse(serialized) as Record<string, unknown>
        saveMessage.value = '正在保存…'
        const employeeNo = contextEmployeeNo.value
        const result = isReviewer360Task.value
          ? await performanceReviewApi.saveTemplateTaskDraft(task.value.task_id, snapshot, task.value.version, employeeNo, baseResultVersion.value, undefined, reviewerVersion)
          : !props.embedded && (task.value.task_kind || props.taskKind) === 'work_summary'
          ? employeeNo ? await performanceReviewApi.saveSelfSummaryDraft(task.value.task_id, snapshot, task.value.version, employeeNo) : await performanceReviewApi.saveSelfSummaryDraft(task.value.task_id, snapshot, task.value.version)
          : saveReason ? await performanceReviewApi.saveTemplateTaskDraft(task.value.task_id, snapshot, task.value.version, employeeNo, baseResultVersion.value, reasonDraft) : await performanceReviewApi.saveTemplateTaskDraft(task.value.task_id, snapshot, task.value.version, employeeNo, baseResultVersion.value)
        if (!current()) return
        task.value.version = result.version ?? task.value.version
        if (result.reviewer_360 && reviewerVersion === reviewer360Version.value) applyReviewer360(result.reviewer_360)
        savedReviewer360Version = reviewerVersion
        savedAnswers = serialized
        if (saveReason) savedComparisonDraft = serializedReason
        saveMessage.value = '已自动保存'
      }
    } catch (error) {
      if (!current()) return
      pendingSave = false
      if ((error as { response?: { data?: { detail?: string } } })?.response?.data?.detail === 'SHARED_RESULT_VERSION_CONFLICT') sharedResultConflict.value = true
      if (!reviewer360ConflictMessage(error)) saveMessage.value = errorMessage(error, '自动保存失败，内容已保留')
      closeReconsiderationOnConflict(error)
      await lockFinalResultOnConflict(error)
      throw error
    } finally {
      if (current()) saving.value = false
    }
  })()
  return saveChain
}

function openReminder(reference: PerformanceReferenceTab) {
  openMemberReminder({ projectId: Number(task.value.project_id || contextProjectId.value), cycleId: contextCycleId.value, employeeNo: reference.employee_no || task.value.person.employee_no, displayName: task.value.person.display_name, sourceTaskId: supportsReminderSourceTask(task.value.task_kind) ? Number(task.value.task_id) || undefined : undefined, nodeId: reference.node_id, targetKind: reference.kind === 'reviewer_360' ? 'reviewer_360' : undefined, taskId: reference.kind === 'reviewer_360' ? undefined : reference.task_id || undefined })
}
function selectedTags(value: unknown) { return Array.isArray(value) ? value as string[] : (value as { tags?: string[] } | undefined)?.tags || [] }
function tagNotes(value: unknown) { return (value as { notes?: Record<string, string> } | undefined)?.notes || {} }
function legacyTagNote(value: unknown) { return (value as { note?: string } | undefined)?.note || '' }
function hasContent(value: unknown) { const element = document.createElement('div'); element.innerHTML = String(value || ''); return Boolean(element.textContent?.replace(/​/g, '').trim()) }
function validate() {
  Object.keys(errors).forEach(key => delete errors[key])
  if (isReviewer360Task.value) return true
  if (isReconsiderationTask.value && effectiveKeepResult.value === 'keep') return true
  for (const section of task.value.form_schema) {
    for (let index = 0; index < performanceTemplateInstanceCount(section, answers); index += 1) {
      if (performanceTemplateInstanceUnknown(section, index, answers)) continue
      for (const field of section.fields) {
        const value = performanceTemplateFieldValue(section, field, index, answers)
        if (field.readonly) continue
        if (field.type === 'tag_with_followup') {
          const tags = selectedTags(value)
          if (field.required && !tags.length) errors[performanceTemplateFieldErrorKey(section, field, index)] = '请选择至少一个标签'
          if (isReconsiderationTask.value && tags.some(tag => !(field.options || []).some(option => option.id === tag))) errors[performanceTemplateFieldErrorKey(section, field, index)] = '请选择模板配置的有效标签'
          const notes = tagNotes(value)
          const legacyNote = legacyTagNote(value)
          const missingRequiredTag = (field.options || []).find(option => tags.includes(option.id) && option.required && !hasContent(legacyNote || notes[option.id]))
          if (missingRequiredTag) errors[performanceTemplateFieldErrorKey(section, field, index)] = `请填写${missingRequiredTag.label}的补充说明`
          continue
        }
        if (isReconsiderationTask.value && (field.type === 'rating' || field.type === 'single_select') && hasContent(value) && !(field.options || []).some(option => option.id === String(value)) && !(field.type === 'rating' && field.allow_unknown && value === '__unknown__')) errors[performanceTemplateFieldErrorKey(section, field, index)] = '请选择模板配置的有效选项'
        if (field.required && !hasContent(value)) errors[performanceTemplateFieldErrorKey(section, field, index)] = `${field.label}${section.allow_multiple ? index + 1 : ''}为必填`
      }
    }
  }
  const first = Object.keys(errors)[0]
  if (first) formRef.value?.focusField(first)
  return !first
}
async function giveup() {
  if (givingUp.value) return
  givingUp.value = true
  giveupError.value = ''
  try {
    const projectId = Number(task.value.project_id || contextProjectId.value || 0)
    const nodeId = task.value.node_id || String(route.query.node || '')
    if (!projectId || !nodeId) throw new Error('missing context')
    await performanceReview360FeedbackApi.giveup(projectId, task.value.task_id, nodeId)
    giveupConfirmOpen.value = false
    ElMessage.success('已放弃评估')
    if (getActivePinia()) usePerformanceProjectContextStore().invalidateReviewOverview(Number(projectId))
    const query: Record<string, string> = { project_id: String(projectId), node: nodeId }
    if (contextCycleId.value) query.cycle_id = String(contextCycleId.value)
    await router.push({ path: '/performance/review', query })
  } catch (error) {
    giveupError.value = errorMessage(error, '放弃评估失败，请稍后重试')
  } finally {
    givingUp.value = false
  }
}

async function submit(overdueConfirmed = false, confirmedContext?: string) {
  clock.value = Date.now()
  if (submitting.value || reviewer360Busy.value || reviewer360Conflict.value || !canEdit.value || !validate()) return
  if (isReviewer360Task.value && !reviewer360Version.value?.trim()) { saveMessage.value = '360°评估人名单版本不可用，请重新读取名单'; reviewer360Conflict.value = true; return }
  const epoch = taskEpoch
  const current = () => !disposed && epoch === taskEpoch
  const due = task.value.deadline_at ? new Date(task.value.deadline_at).getTime() : NaN
  if (Number.isFinite(due) && Date.now() > due) {
    if (task.value.submitted_at) { saveMessage.value = '当前环节已过截止时间，不允许提交内容'; return }
    if (!overdueConfirmed) {
      overdueConfirmError.value = ''
      overdueConfirmOpen.value = true
      return
    }
  }
  window.clearTimeout(saveTimer)
  if (hasComparison.value && JSON.stringify(comparisonDraft()) !== savedComparisonDraft) void saveDraft().catch(() => undefined)
  submitting.value = true
  pendingSave = false
  try {
    await saveChain.catch(() => undefined)
    if (!current() || reconsiderationClosed.value || !canEdit.value || sharedResultConflict.value || reviewer360Conflict.value || reviewer360Busy.value) return
    const payload = JSON.parse(JSON.stringify(writableAnswers()))
    const latestComparison = hasComparison.value ? await refreshComparison() : null
    if (!current() || latestComparison === undefined) return
    const reasonGroups = performanceComparisonReasonGroups(latestComparison)
    const needsReason = reasonGroups.length > 0
    const latestContext = performanceComparisonContext(latestComparison)
    const missingReason = reasonGroups.some(group => group.reason_required && !(latestComparison?.groups !== undefined ? comparisonReasons.value.find(item => item.rule_id === group.rule_id)?.diff_reason : comparisonReason.value)?.trim())
    if (needsReason && (confirmedContext !== latestContext || missingReason)) {
      comparisonOverdueConfirmed.value = overdueConfirmed
      comparisonDialogContext.value = latestContext
      comparisonDialogError.value = confirmedContext && confirmedContext !== latestContext ? '对比来源或规则已更新，请核对后重新确认，已填写的理由已保留' : ''
      overdueConfirmOpen.value = false
      comparisonDialogOpen.value = true
      return
    }
    const activeGroups = performanceComparisonGroups(latestComparison).filter(group => group.active !== false)
    const comparisonPayload: PerformanceComparisonSubmission | undefined = latestComparison?.groups !== undefined
      ? { comparison_reasons: activeGroups.map(group => ({ rule_id: group.rule_id, comparison_context: group.context, diff_reason: reasonGroups.includes(group) ? comparisonReasons.value.find(item => item.rule_id === group.rule_id)?.diff_reason ?? '' : null })) }
      : latestComparison && activeGroups.length ? { comparison_context: latestComparison.context, ...(needsReason ? { diff_reason: comparisonReason.value } : {}) } : undefined
    const employeeNo = contextEmployeeNo.value
    const result = isReviewer360Task.value
      ? await performanceReviewApi.submitTemplateTask(task.value.task_id, payload, task.value.version, employeeNo, baseResultVersion.value, undefined, reviewer360Version.value)
      : !props.embedded && (task.value.task_kind || props.taskKind) === 'work_summary'
      ? employeeNo ? await performanceReviewApi.submitSelfSummary(task.value.task_id, payload, task.value.version, employeeNo) : await performanceReviewApi.submitSelfSummary(task.value.task_id, payload, task.value.version)
      : comparisonPayload ? await performanceReviewApi.submitTemplateTask(task.value.task_id, payload, task.value.version, employeeNo, baseResultVersion.value, comparisonPayload) : await performanceReviewApi.submitTemplateTask(task.value.task_id, payload, task.value.version, employeeNo, baseResultVersion.value)
    if (!current()) return
    task.value.comparison = result.comparison ?? latestComparison
    comparisonDialogOpen.value = false
    comparisonDialogError.value = ''
    baseResultVersion.value = result.result_version
    task.value.answer_submissions = result.answer_submissions
    task.value.submitted_at = result.submitted_at
    task.value.editable = result.editable ?? task.value.editable
    task.value.submit_allowed = result.submit_allowed ?? task.value.submit_allowed
    task.value.version = result.version ?? task.value.version
    if (result.reviewer_360) applyReviewer360(result.reviewer_360)
    else if (result.reviewer_360_version) task.value.reviewer_360_version = result.reviewer_360_version
    task.value.answers = isReviewer360Task.value ? {} : task.value.task_kind === 'calibration' || isReconsiderationTask.value ? result.answers : { ...task.value.answers, ...result.answers, ...payload }
    if (isReconsiderationTask.value) {
      task.value.reconsideration_closed = result.reconsideration_closed ?? task.value.reconsideration_closed
      keepResultChoice.value = result.answers?.keep_result === 'keep' ? 'keep' : 'change'
    }
    overdueConfirmOpen.value = false
    overdueConfirmError.value = ''
    ElMessage.success({
      message: '已提交',
      customClass: 'performance-submit-toast',
      offset: 40,
      duration: 3000,
      showClose: false,
      icon: h('svg', { viewBox: '0 0 24 24', fill: 'none', 'data-icon': 'SucceedFilled', 'aria-hidden': 'true' }, [
        h('path', { d: promptDefinitions.success.iconPath, fill: 'currentColor' }),
        h('path', { d: promptDefinitions.success.iconInnerPath, fill: '#fff' }),
      ]),
    })
    saveMessage.value = '提交成功'
    viewing.value = true
    Object.keys(answers).forEach(key => delete answers[key])
    Object.assign(answers, task.value.answers)
    const projectId = String(task.value.project_id || contextProjectId.value || '')
    if (getActivePinia()) usePerformanceProjectContextStore().invalidateReviewOverview(Number(projectId))
    const nodeId = task.value.node_id || String(route.query.node || '')
    const query: Record<string, string> = { project_id: projectId, node: nodeId, task_id: String(task.value.task_id) }
    if (contextCycleId.value) query.cycle_id = String(contextCycleId.value)
    if (task.value.return_view === 'drawer') {
      query.rootReviewId = String(task.value.task_id)
      query.activeTab = nodeId
    }
    if (employeeNo) query.employee_no = employeeNo
    emit('submitted')
    if (props.embedded) { closeTask(); return }
    try {
      if (isReconsiderationTask.value && route.query.return_entry === 'management' && /^[1-9]\d*$/.test(String(route.query.return_root_review_id || ''))) {
        await router.push({ path: '/performance/project-management', query: {
          ...(contextCycleId.value ? { cycle_id: String(contextCycleId.value) } : {}),
          member_project_id: projectId, employee_no: employeeNo || task.value.person.employee_no,
          rootReviewId: String(route.query.return_root_review_id), activeTab: `management-${nodeId}`,
        } })
      } else if (isReconsiderationTask.value && ['team', 'focus'].includes(String(route.query.return_entry))) {
        await router.push({ path: '/performance/review', query: {
          ...(contextCycleId.value ? { cycle_id: String(contextCycleId.value) } : {}),
          node: route.query.return_entry === 'team' ? '__team-results__' : '__focus-results__',
          tab: ['members', 'matrix', 'reports'].includes(String(route.query.return_tab)) ? String(route.query.return_tab) : 'members',
          member_project_id: projectId, employee_no: employeeNo || task.value.person.employee_no,
          rootReviewId: String(route.query.return_root_review_id || ''), activeTab: `management-${nodeId}`,
        } })
      } else if (isReconsiderationTask.value) {
        await router.push({ path: '/performance/review', query: nodeId
          ? { ...query, rootReviewId: String(task.value.task_id), activeTab: nodeId }
          : { project_id: projectId, node: nodeId } })
      } else if (task.value.return_view === 'page' || !nodeId) await router.push({ path: route.path || (!props.embedded && props.taskKind === 'work_summary' ? '/performance/review/self-summary' : '/performance/review/template-task'), query: { ...query, view: '1' } })
      else await router.push({ path: '/performance/review', query })
    } catch { saveMessage.value = '提交成功，查看页跳转失败，请返回查看' }
  } catch (error) {
    if (!current()) return
    if ((error as { response?: { data?: { detail?: string } } })?.response?.data?.detail === 'SHARED_RESULT_VERSION_CONFLICT') sharedResultConflict.value = true
    if (!reviewer360ConflictMessage(error)) saveMessage.value = errorMessage(error, '提交失败，内容已保留，请稍后重试')
    if (comparisonDialogOpen.value) comparisonDialogError.value = saveMessage.value
    const comparisonCode = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    if (comparisonCode === 'COMPARISON_SOURCE_CHANGED' || comparisonCode === 'DIFF_REASON_REQUIRED') {
      try {
        const refreshed = await refreshComparison()
        if (!current()) return
        comparisonDialogContext.value = performanceComparisonContext(refreshed)
        comparisonDialogOpen.value = performanceComparisonReasonGroups(refreshed).length > 0
        comparisonDialogError.value = saveMessage.value
      } catch { if (current()) comparisonDialogError.value = saveMessage.value }
    }
    closeReconsiderationOnConflict(error)
    await lockFinalResultOnConflict(error)
    if (overdueConfirmOpen.value) overdueConfirmError.value = saveMessage.value
  } finally {
    if (current()) submitting.value = false
  }
}
watch([contextTaskId, contextEmployeeNo, contextProjectId, contextCycleId, () => props.taskKind], () => { resetTaskContext(); void load() })
onMounted(() => load())
onBeforeUnmount(() => { disposed = true; ++taskEpoch; ++loadRequest; pendingSave = false; window.clearTimeout(saveTimer); window.clearInterval(clockTimer) })
</script>

<style scoped>
.task-workspace--embedded{height:min(760px,calc(100dvh - 180px));min-height:0}
.task-workspace--embedded .narrow-mode-notice{display:none}
.task-reconsideration-handlers{padding:20px 30px 0}
.task-reconsideration-handlers h2{margin:0 0 8px;font-size:14px;font-weight:600;line-height:22px}
.task-reconsideration-handlers p{margin:0 0 4px;color:var(--color-text-secondary);font-size:14px;line-height:22px}
.task-content{display:flex;flex-direction:column;min-width:0;gap:12px}
.performance-split-workspace.is-split .task-template-renderer{padding:16px 20px 12px;background:transparent}
.task-form-shell{display:flex;flex:1 0 auto;min-width:0;flex-direction:column;border-radius:8px;background:var(--color-bg-card)}
.task-notices--calibration,.task-notices--submission{padding:12px 30px 0}
.task-notices--submission:empty{display:none}
.task-notices--submission > .performance-review-completion-notice{margin-bottom:0}
.performance-split-workspace.is-split .task-notices--calibration,.performance-split-workspace.is-split .task-notices--submission{padding:16px 20px 0}
.task-template-renderer,.task-content > .state{flex:1 0 auto;min-height:0}
.task-template-renderer{padding:12px 30px;border-radius:8px;background:var(--color-bg-card)}
.task-reference-content{display:flex;flex-direction:column;min-height:0;padding:20px;border-radius:8px;background:var(--color-bg-card)}
.task-reference-content :deep(.performance-reference-empty){flex:1 0 auto;min-height:0}
.task-notices{display:flex;flex:none;flex-direction:column;gap:8px}
.task-notices :deep(.performance-prompt-display),.task-notices :deep(.prompt-notice){width:100%}
.task-reconsideration{padding:12px 30px}
.task-reconsideration .task-template-renderer{min-height:0;padding:0}
.performance-split-workspace.is-split .task-reconsideration{padding:16px 20px}
.summary-tabs{display:flex;flex:none;min-width:0;min-height:48px;align-items:center;gap:28px;margin:12px 12px 0;padding:0 20px;box-sizing:border-box;border-radius:8px;background:var(--color-bg-card);overflow-x:auto}
.summary-tabs button{position:relative;flex:none;min-height:48px;padding:0;border:0;background:transparent;color:var(--color-text-primary);font-size:16px;line-height:24px;white-space:nowrap;cursor:pointer}
.summary-tabs button.active{color:var(--color-primary);font-weight:600}
.summary-tabs button.active::after{position:absolute;right:0;bottom:0;left:0;height:3px;border-radius:3px 3px 0 0;background:var(--color-primary);content:''}
.summary-tabs button:focus-visible{outline:2px solid var(--color-primary);outline-offset:-2px}
.state{display:flex;min-height:0;align-items:center;justify-content:center;border-radius:8px;background:var(--color-bg-card);color:var(--color-text-secondary)}
.state.error{flex-direction:column;gap:12px}
.state.error p{margin:0}
.state.error button{min-height:32px;padding:0 16px;border:0;border-radius:6px;background:var(--color-primary);color:var(--color-bg-card);cursor:pointer}
.reference-tabs{margin:0 0 12px;flex:none}
.reference-scroll{display:flex;flex:1;min-height:0;flex-direction:column;overflow:auto;background:var(--color-bg-card);border-radius:8px}
.reference-scroll > .state{padding:20px}
.reference-scroll > *{flex:1 0 auto;min-width:0}
.narrow-mode-notice{padding:8px 16px 0;color:var(--color-text-secondary);font-size:12px;margin:0}
@media(max-width:640px){.summary-tabs{margin-inline:16px;padding-inline:16px;gap:20px}.task-template-renderer,.task-notices--calibration,.task-notices--submission,.task-reconsideration{padding-inline:16px}}
</style>
