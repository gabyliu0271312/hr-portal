<template>
  <div class="self-summary-page">
    <PerformanceSelfSummaryHeader :person="task.person" @back="router.back()" />
    <nav class="summary-tabs" aria-label="绩效填写页签"><button class="active" type="button">{{ task.node_name || '加载中…' }}</button><button type="button" disabled>OKR</button></nav>
    <main class="summary-scroll">
      <section v-if="loading" class="state">正在加载…</section>
      <section v-else-if="loadError" class="state error"><p>{{ loadError }}</p><button type="button" @click="load">重新加载</button></section>
      <PerformanceTemplateRenderer v-else ref="formRef" mode="edit" :title="task.node_name" :sections="task.form_schema" :answers="answers" :errors="errors" :editable="canEdit" @update-answer="updateAnswer" @queue-save="queueSave" @submit="submit" />
    </main>
    <PerformanceSelfSummaryFooter :submitting="submitting" :submit-allowed="task.submit_allowed && !loading" :editable="canEdit" :message="saveMessage" @submit="submit" @cancel="router.back()" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { performanceReviewApi, type SelfSummaryTask } from '@/api/performance'
import PerformanceSelfSummaryFooter from '@/components/performance/PerformanceSelfSummaryFooter.vue'
import PerformanceTemplateRenderer from '@/components/performance/PerformanceTemplateRenderer.vue'
import PerformanceSelfSummaryHeader from '@/components/performance/PerformanceSelfSummaryHeader.vue'
import { performanceTemplateFieldErrorKey, performanceTemplateFieldValue, performanceTemplateInstanceCount } from '@/components/performance/performanceTemplateAnswers'

const props = withDefaults(defineProps<{ taskKind?: 'work_summary' | 'evaluation' }>(), { taskKind: 'work_summary' })
const route = useRoute()
const router = useRouter()
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const submitting = ref(false)
const saveMessage = ref('草稿将实时保存到云端')
const task = ref<SelfSummaryTask>({ task_id: String(route.query.task_id || ''), task_kind: props.taskKind, entry_mode: 'template_task', node_name: '', person: { employee_no: '', display_name: '当前用户' }, editable: false, submit_allowed: false, form_schema: [], answers: {} })
const answers = reactive<Record<string, unknown>>({})
const errors = reactive<Record<string, string>>({})
const formRef = ref<{ focusField: (id: string) => void } | null>(null)
const canEdit = computed(() => task.value.editable && task.value.submit_allowed)
let saveTimer: number | undefined
let saveChain: Promise<void> = Promise.resolve()

function errorMessage(error: unknown, fallback: string) {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') return detail.message
  return fallback
}
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const taskId = String(route.query.task_id || '')
    const employeeNo = typeof route.query.employee_no === 'string' ? route.query.employee_no : undefined
    const loaded = props.taskKind === 'work_summary'
      ? employeeNo ? await performanceReviewApi.selfSummary(taskId, employeeNo) : await performanceReviewApi.selfSummary(taskId)
      : employeeNo ? await performanceReviewApi.templateTask(taskId, employeeNo) : await performanceReviewApi.templateTask(taskId)
    task.value = loaded
    Object.keys(answers).forEach(key => delete answers[key])
    Object.assign(answers, loaded.answers || {})
  } catch (error) {
    loadError.value = errorMessage(error, '自我总结加载失败，请稍后重试')
  } finally {
    loading.value = false
  }
}
function updateAnswer(id: string, value: unknown) { if (canEdit.value) answers[id] = value }
function queueSave() {
  if (!canEdit.value) return
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => { void saveDraft() }, 350)
}
function saveDraft() {
  const snapshot = JSON.parse(JSON.stringify(answers)) as Record<string, unknown>
  saveChain = saveChain.catch(() => undefined).then(async () => {
    if (!canEdit.value) return
    saving.value = true
    saveMessage.value = '正在保存…'
    try {
      const employeeNo = typeof route.query.employee_no === 'string' ? route.query.employee_no : undefined
      const result = props.taskKind === 'work_summary'
        ? employeeNo ? await performanceReviewApi.saveSelfSummaryDraft(task.value.task_id, snapshot, task.value.version, employeeNo) : await performanceReviewApi.saveSelfSummaryDraft(task.value.task_id, snapshot, task.value.version)
        : employeeNo ? await performanceReviewApi.saveTemplateTaskDraft(task.value.task_id, snapshot, task.value.version, employeeNo) : await performanceReviewApi.saveTemplateTaskDraft(task.value.task_id, snapshot, task.value.version)
      task.value.version = result.version ?? task.value.version
      saveMessage.value = '已自动保存'
    } catch (error) {
      saveMessage.value = errorMessage(error, '自动保存失败，内容已保留')
      throw error
    } finally {
      saving.value = false
    }
  })
  return saveChain
}
function selectedTags(value: unknown) { return Array.isArray(value) ? value as string[] : (value as { tags?: string[] } | undefined)?.tags || [] }
function tagNotes(value: unknown) { return (value as { notes?: Record<string, string> } | undefined)?.notes || {} }
function legacyTagNote(value: unknown) { return (value as { note?: string } | undefined)?.note || '' }
function hasContent(value: unknown) { const element = document.createElement('div'); element.innerHTML = String(value || ''); return Boolean(element.textContent?.replace(/​/g, '').trim()) }
function validate() {
  Object.keys(errors).forEach(key => delete errors[key])
  for (const section of task.value.form_schema) {
    for (let index = 0; index < performanceTemplateInstanceCount(section, answers); index += 1) {
      for (const field of section.fields) {
        const value = performanceTemplateFieldValue(section, field, index, answers)
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
async function submit() {
  if (!validate() || !canEdit.value) return
  window.clearTimeout(saveTimer)
  submitting.value = true
  try {
    await saveChain.catch(() => undefined)
    const payload = JSON.parse(JSON.stringify(answers))
    const employeeNo = typeof route.query.employee_no === 'string' ? route.query.employee_no : undefined
    const result = props.taskKind === 'work_summary'
      ? employeeNo ? await performanceReviewApi.submitSelfSummary(task.value.task_id, payload, task.value.version, employeeNo) : await performanceReviewApi.submitSelfSummary(task.value.task_id, payload, task.value.version)
      : employeeNo ? await performanceReviewApi.submitTemplateTask(task.value.task_id, payload, task.value.version, employeeNo) : await performanceReviewApi.submitTemplateTask(task.value.task_id, payload, task.value.version)
    task.value.submitted_at = result.submitted_at
    task.value.editable = result.editable ?? task.value.editable
    task.value.submit_allowed = result.submit_allowed ?? task.value.submit_allowed
    task.value.version = result.version ?? task.value.version
    saveMessage.value = '提交成功'
  } catch (error) {
    saveMessage.value = errorMessage(error, '提交失败，内容已保留，请稍后重试')
  } finally {
    submitting.value = false
  }
}
onMounted(load)
onBeforeUnmount(() => window.clearTimeout(saveTimer))
</script>

<style scoped>
:global(html:has(.self-summary-page)){scrollbar-gutter:auto}
.self-summary-page{display:flex;height:100vh;min-width:0;flex-direction:column;overflow:hidden;background:#f4f5f6;color:#1f2329;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif}.summary-tabs{display:flex;width:calc(100% - 24px);height:48px;min-height:48px;align-items:center;gap:28px;margin:12px 12px 0;padding:0 20px;box-sizing:border-box;border-radius:8px;background:#fff}.summary-tabs button{position:relative;height:48px;padding:0 0;border:0;background:transparent;color:#1f2329;font-size:16px;line-height:24px;cursor:pointer}.summary-tabs button.active{color:#3370ff;font-weight:600}.summary-tabs button.active::after{position:absolute;right:0;bottom:0;left:0;height:3px;border-radius:3px 3px 0 0;background:#3370ff;content:''}.summary-tabs button:disabled{cursor:not-allowed;opacity:.55}.summary-scroll{min-height:0;flex:1;overflow-x:hidden;overflow-y:auto;padding:12px 12px 75px}.state{display:flex;min-height:320px;align-items:center;justify-content:center;border-radius:8px;background:#fff;color:#646a73}.state.error{flex-direction:column;gap:12px}.state.error p{margin:0}.state.error button{height:32px;padding:0 16px;border:0;border-radius:6px;background:#3370ff;color:#fff;cursor:pointer}
</style>
