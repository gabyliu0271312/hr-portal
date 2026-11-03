<template>
  <PerformanceTaskWorkspace split-mode>
    <template #header>
      <PerformanceSelfSummaryHeader :person="task.person" @back="router.back()">
        <template #actions><PerformanceWriteModeSwitch :model-value="displayMode" :disabled="loading || Boolean(loadError)" :split-available="splitAvailable" @update:model-value="changeMode" /></template>
      </PerformanceSelfSummaryHeader>
    </template>
    <template #split>
      <PerformanceSplitWorkspace :enabled="mode === 'basicWriteMode' && !loading && !loadError" @available="splitAvailable = $event">
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
            <div v-if="task.reconsideration_reason" class="task-notices"><PerformancePromptNotice type="info" multiline>复议理由：{{ task.reconsideration_reason }}</PerformancePromptNotice></div>
            <div v-if="task.calibration_notice" class="task-notices"><PerformancePromptNotice type="info" multiline>{{ task.calibration_notice }}</PerformancePromptNotice></div>
            <section v-if="!task.form_schema.length" class="state">暂无填写内容</section>
            <div v-else ref="draftAnchor" class="task-form-shell"><PerformanceReviewCompletionNotice v-if="viewing" :editable="task.editable && task.submit_allowed" :task-id="task.task_id" :task-kind="task.task_kind || props.taskKind" :employee-no="task.person.employee_no" :message="saveMessage === '提交成功' ? '提交成功，可在允许的期限内继续编辑' : '已提交，可在允许的期限内继续编辑'" @edit="choice => load(choice || 'edit')" /><PerformanceDraftChoice :visible="draftOpen" :anchor="draftAnchor" :task="task" :employee-no="task.person.employee_no" @close="draftOpen = false; viewing = true; draftPending = false" @choose="choice => load(choice)" /><PerformanceTemplateRenderer ref="formRef" class="task-template-renderer" :mode="viewing || draftPending ? 'readonly' : 'edit'" :title="task.content_page_name || task.node_name" :sections="task.form_schema" :answers="answers" :errors="errors" :editable="task.editable && task.submit_allowed" @update-answer="updateAnswer" @queue-save="queueSave" @submit="submit()" /></div>
          </div>
          <PerformanceReferenceContent v-if="!isSplit && activeReference" class="task-reference-content" show-title :reference="activeReference" @remind="openReminder" />
        </template>
        <template #footer><PerformanceSelfSummaryFooter v-if="!viewing && !draftPending" v-show="isSplit || activeTab === 'current'" :submitting="submitting" :submit-allowed="task.submit_allowed && !loading" :editable="canEdit" :message="saveMessage" @submit="submit()" @cancel="router.back()" /></template>
      </PerformanceSplitWorkspace>
    </template>
  </PerformanceTaskWorkspace>
  <PerformanceConfirmDialog v-model="overdueConfirmOpen" appearance="submit" confirm-variant="primary" message="确定提交吗？" description="当前环节已过截止时间，提交后将无法修改内容。" cancel-text="取消" confirm-text="确定" :loading="submitting" :error-message="overdueConfirmError" @confirm="submit(true)" />
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getActivePinia } from 'pinia'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'
import PerformanceConfirmDialog from '@/components/performance/PerformanceConfirmDialog.vue'
import PerformanceDraftChoice from '@/components/performance/PerformanceDraftChoice.vue'
import PerformanceReviewCompletionNotice from '@/components/performance/PerformanceReviewCompletionNotice.vue'
import { performanceReviewApi, type PerformanceReferenceTab, type SelfSummaryTask } from '@/api/performance'
import PerformanceTaskWorkspace from '@/components/performance/PerformanceTaskWorkspace.vue'
import PerformanceWriteModeSwitch from '@/components/performance/PerformanceWriteModeSwitch.vue'
import PerformanceSplitWorkspace from '@/components/performance/PerformanceSplitWorkspace.vue'
import { usePerformanceWriteMode, type PerformanceWriteMode } from '@/composables/usePerformanceWriteMode'
import PerformanceReferenceContent from '@/components/performance/PerformanceReferenceContent.vue'
import PerformanceSelfSummaryFooter from '@/components/performance/PerformanceSelfSummaryFooter.vue'
import PerformanceSelfSummaryHeader from '@/components/performance/PerformanceSelfSummaryHeader.vue'
import PerformanceTemplateRenderer from '@/components/performance/PerformanceTemplateRenderer.vue'
import PerformancePromptNotice, { promptDefinitions } from '@/components/performance/PerformancePromptNotice.vue'
import { performanceTemplateFieldErrorKey, performanceTemplateFieldValue, performanceTemplateInstanceCount, performanceTemplateInitialAnswers, performanceTemplateInstanceUnknown, performanceTemplateWritableAnswers } from '@/components/performance/performanceTemplateAnswers'

const props = withDefaults(defineProps<{ taskKind?: 'work_summary' | 'evaluation' }>(), { taskKind: 'work_summary' })
const route = useRoute()
const router = useRouter()
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const submitting = ref(false)
const overdueConfirmOpen = ref(false)
const overdueConfirmError = ref('')
const viewing = ref(route.query.view === '1')
const draftOpen = ref(false)
const draftPending = ref(false)
const draftAnchor = ref<HTMLElement | null>(null)
const saveMessage = ref('草稿将实时保存到云端')
const task = ref<SelfSummaryTask>({ task_id: String(route.query.task_id || ''), task_kind: props.taskKind, entry_mode: 'template_task', node_name: '', person: { employee_no: '', display_name: '当前用户' }, editable: false, submit_allowed: false, form_schema: [], answers: {} })
const answers = reactive<Record<string, unknown>>({})
const errors = reactive<Record<string, string>>({})
const formRef = ref<{ focusField: (id: string) => void } | null>(null)
const activeTab = ref('current')
const tabs = computed(() => [{ key: 'current', label: task.value.node_name || '加载中…' }, ...(task.value.reference_tabs || []).map(reference => ({ key: reference.key, label: reference.node_name }))])
const activeReference = computed<PerformanceReferenceTab | null>(() => task.value.reference_tabs?.find(reference => reference.key === activeTab.value) || null)
const { mode } = usePerformanceWriteMode()
const splitAvailable = ref(false)
const referenceKey = ref('')
const selectedReference = computed(() => task.value.reference_tabs?.find(reference => reference.key === referenceKey.value) || task.value.reference_tabs?.[0] || null)
const displayMode = computed<PerformanceWriteMode>(() => mode.value === 'basicWriteMode' && splitAvailable.value ? 'basicWriteMode' : 'fullScreenMode')
const isSplit = computed(() => displayMode.value === 'basicWriteMode')
function changeMode(value: PerformanceWriteMode) { mode.value = value; activeTab.value = 'current' }
watch(() => task.value.reference_tabs, references => { if (!references?.some(reference => reference.key === referenceKey.value)) referenceKey.value = references?.[0]?.key || '' }, { immediate: true })
const canEdit = computed(() => !viewing.value && !draftPending.value && !loading.value && !loadError.value && task.value.form_schema.some(section => section.fields.length > 0) && task.value.editable && task.value.submit_allowed)
let saveTimer: number | undefined
let saveChain: Promise<void> = Promise.resolve()
let pendingSave = false
let disposed = false
let savedAnswers = ''

function errorMessage(error: unknown, fallback: string) {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') return detail.message
  return fallback
}
async function load(choice?: 'use' | 'discard' | 'edit') {
  loading.value = true
  loadError.value = ''
  try {
    const taskId = String(route.query.task_id || '')
    const employeeNo = typeof route.query.employee_no === 'string' ? route.query.employee_no : undefined
    const loaded = props.taskKind === 'work_summary'
      ? employeeNo ? await performanceReviewApi.selfSummary(taskId, employeeNo) : await performanceReviewApi.selfSummary(taskId)
      : employeeNo ? await performanceReviewApi.templateTask(taskId, employeeNo) : await performanceReviewApi.templateTask(taskId)
    task.value = loaded
    activeTab.value = 'current'
    Object.keys(answers).forEach(key => delete answers[key])
    if (choice) {
      viewing.value = false
      if (route.query.view === '1') {
        const { view: _view, draft_choice: _choice, ...query } = route.query
        await router.replace({ query })
      }
    }
    const decision = choice || route.query.draft_choice
    draftPending.value = !viewing.value && Boolean(loaded.submitted_at && loaded.has_draft && decision !== 'use')
    draftOpen.value = draftPending.value
    const useDraft = !viewing.value && !draftPending.value && loaded.has_draft
    const values = useDraft ? { ...loaded.answers, ...loaded.draft_answers } : loaded.answers || {}
    Object.assign(answers, loaded.editable && loaded.submit_allowed && !viewing.value && !draftPending.value ? performanceTemplateInitialAnswers(loaded.form_schema, values) : values)
    savedAnswers = JSON.stringify(performanceTemplateWritableAnswers(loaded.form_schema, answers))
  } catch (error) {
    loadError.value = errorMessage(error, '自我总结加载失败，请稍后重试')
  } finally {
    loading.value = false
  }
}
function updateAnswer(id: string, value: unknown) { if (canEdit.value) answers[id] = value }
function queueSave() {
  if (!canEdit.value || disposed || submitting.value) return
  window.clearTimeout(saveTimer)
  if (saving.value) { pendingSave = true; return }
  saveTimer = window.setTimeout(() => { void saveDraft().catch(() => undefined) }, 350)
}
function saveDraft() {
  if (disposed || !canEdit.value) return saveChain
  pendingSave = true
  if (saving.value) return saveChain
  saving.value = true
  saveChain = (async () => {
    try {
      while (pendingSave && !disposed && !submitting.value && canEdit.value) {
        pendingSave = false
        const serialized = JSON.stringify(performanceTemplateWritableAnswers(task.value.form_schema, answers))
        if (serialized === savedAnswers) continue
        const snapshot = JSON.parse(serialized) as Record<string, unknown>
        saveMessage.value = '正在保存…'
        const employeeNo = typeof route.query.employee_no === 'string' ? route.query.employee_no : undefined
        const result = props.taskKind === 'work_summary'
          ? employeeNo ? await performanceReviewApi.saveSelfSummaryDraft(task.value.task_id, snapshot, task.value.version, employeeNo) : await performanceReviewApi.saveSelfSummaryDraft(task.value.task_id, snapshot, task.value.version)
          : employeeNo ? await performanceReviewApi.saveTemplateTaskDraft(task.value.task_id, snapshot, task.value.version, employeeNo) : await performanceReviewApi.saveTemplateTaskDraft(task.value.task_id, snapshot, task.value.version)
        task.value.version = result.version ?? task.value.version
        savedAnswers = serialized
        saveMessage.value = '已自动保存'
      }
    } catch (error) {
      pendingSave = false
      saveMessage.value = errorMessage(error, '自动保存失败，内容已保留')
      throw error
    } finally {
      saving.value = false
    }
  })()
  return saveChain
}

function openReminder(reference: PerformanceReferenceTab) {
  void router.push({ name: 'PerformanceReminderPlaceholder', query: { project_id: String(route.query.project_id || ''), node_id: reference.node_id, task_id: String(reference.task_id || ''), employee_no: reference.employee_no } })
}
function selectedTags(value: unknown) { return Array.isArray(value) ? value as string[] : (value as { tags?: string[] } | undefined)?.tags || [] }
function tagNotes(value: unknown) { return (value as { notes?: Record<string, string> } | undefined)?.notes || {} }
function legacyTagNote(value: unknown) { return (value as { note?: string } | undefined)?.note || '' }
function hasContent(value: unknown) { const element = document.createElement('div'); element.innerHTML = String(value || ''); return Boolean(element.textContent?.replace(/​/g, '').trim()) }
function validate() {
  Object.keys(errors).forEach(key => delete errors[key])
  for (const section of task.value.form_schema) {
    for (let index = 0; index < performanceTemplateInstanceCount(section, answers); index += 1) {
      if (performanceTemplateInstanceUnknown(section, index, answers)) continue
      for (const field of section.fields) {
        const value = performanceTemplateFieldValue(section, field, index, answers)
        if (field.readonly) continue
        if (field.type === 'tag_with_followup') {
          const tags = selectedTags(value)
          if (field.required && !tags.length) errors[performanceTemplateFieldErrorKey(section, field, index)] = '请选择至少一个标签'
          const notes = tagNotes(value)
          const legacyNote = legacyTagNote(value)
          const missingRequiredTag = (field.options || []).find(option => tags.includes(option.id) && option.required && !hasContent(legacyNote || notes[option.id]))
          if (missingRequiredTag) errors[performanceTemplateFieldErrorKey(section, field, index)] = `请填写${missingRequiredTag.label}的补充说明`
          continue
        }
        if (field.required && !hasContent(value)) errors[performanceTemplateFieldErrorKey(section, field, index)] = `${field.label}${section.allow_multiple ? index + 1 : ''}为必填`
      }
    }
  }
  const first = Object.keys(errors)[0]
  if (first) formRef.value?.focusField(first)
  return !first
}
async function submit(overdueConfirmed = false) {
  if (submitting.value || !canEdit.value || !validate()) return
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
  submitting.value = true
  pendingSave = false
  try {
    await saveChain.catch(() => undefined)
    const payload = JSON.parse(JSON.stringify(performanceTemplateWritableAnswers(task.value.form_schema, answers)))
    const employeeNo = typeof route.query.employee_no === 'string' ? route.query.employee_no : undefined
    const result = props.taskKind === 'work_summary'
      ? employeeNo ? await performanceReviewApi.submitSelfSummary(task.value.task_id, payload, task.value.version, employeeNo) : await performanceReviewApi.submitSelfSummary(task.value.task_id, payload, task.value.version)
      : employeeNo ? await performanceReviewApi.submitTemplateTask(task.value.task_id, payload, task.value.version, employeeNo) : await performanceReviewApi.submitTemplateTask(task.value.task_id, payload, task.value.version)
    task.value.submitted_at = result.submitted_at
    task.value.editable = result.editable ?? task.value.editable
    task.value.submit_allowed = result.submit_allowed ?? task.value.submit_allowed
    task.value.version = result.version ?? task.value.version
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
    Object.assign(answers, { ...task.value.answers, ...payload })
    const projectId = String(task.value.project_id || route.query.project_id || '')
    if (getActivePinia()) usePerformanceProjectContextStore().invalidateReviewOverview(Number(projectId))
    const nodeId = task.value.node_id || String(route.query.node || '')
    const query: Record<string, string> = { project_id: projectId, node: nodeId, task_id: String(task.value.task_id) }
    if (route.query.cycle_id) query.cycle_id = String(route.query.cycle_id)
    if (task.value.return_view === 'drawer') {
      query.rootReviewId = String(task.value.task_id)
      query.activeTab = nodeId
    }
    if (employeeNo) query.employee_no = employeeNo
    try {
      if (task.value.return_view === 'page' || !nodeId) await router.push({ path: route.path || (props.taskKind === 'work_summary' ? '/performance/review/self-summary' : '/performance/review/template-task'), query: { ...query, view: '1' } })
      else await router.push({ path: '/performance/review', query })
    } catch { saveMessage.value = '提交成功，查看页跳转失败，请返回查看' }
  } catch (error) {
    saveMessage.value = errorMessage(error, '提交失败，内容已保留，请稍后重试')
    if (overdueConfirmOpen.value) overdueConfirmError.value = saveMessage.value
  } finally {
    submitting.value = false
  }
}
onMounted(() => load())
onBeforeUnmount(() => { disposed = true; pendingSave = false; window.clearTimeout(saveTimer) })
</script>

<style scoped>
.task-content{display:flex;flex-direction:column;min-width:0;gap:12px}
.performance-split-workspace.is-split .task-template-renderer{padding:16px 20px 12px;background:transparent}
.task-form-shell{display:flex;flex:1 0 auto;min-width:0;flex-direction:column}
.task-template-renderer,.task-content > .state{flex:1 0 auto;min-height:0}
.task-template-renderer{padding:12px 30px;border-radius:8px;background:var(--color-bg-card)}
.task-reference-content{display:flex;flex-direction:column;min-height:0;padding:20px;border-radius:8px;background:var(--color-bg-card)}
.task-reference-content :deep(.performance-reference-empty){flex:1 0 auto;min-height:0}
.task-notices{display:flex;flex:none;flex-direction:column;gap:8px}
.task-notices :deep(.performance-prompt-display),.task-notices :deep(.prompt-notice){width:100%}
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
@media(max-width:640px){.summary-tabs{margin-inline:16px;padding-inline:16px;gap:20px}.task-template-renderer{padding-inline:16px}}
</style>
