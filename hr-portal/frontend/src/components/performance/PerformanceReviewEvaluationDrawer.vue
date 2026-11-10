<template>
  <UiDrawerShell v-model="open" :title="title" aria-label="绩效评估详情" width="720px" :initial-width="1000" variant="evaluation" body-class="performance-drawer__body--flush" :resizable="true" :min-width="720" :mask="false" cache-key="perf-drawer" :keyboard="false" @close="emit('close')" @closed="emit('closed')">
    <template #header>
      <div class="performance-review-evaluation-drawer__person"><PerformanceReviewPersonHeader :person="displayPerson" @translate="notifyTranslationUnavailable" @translate-menu="notifyTranslationUnavailable" @copy-link="emit('copy-link')"><template #actions-end><PerformanceMemberMoreMenu v-if="props.member" :member="props.member" @authorize="onMoreAuthorize" @transfer="onMoreTransfer" @delete="deleteOpen = true" /></template></PerformanceReviewPersonHeader><p v-if="task?.opened_at" class="performance-review-evaluation-drawer__opening">本次绩效结果已于 {{ formatDate(task.opened_at) }} 开通。</p></div>
    </template>
    <div class="performance-review-evaluation-drawer__scroll">
      <PerformanceLineTabs v-model="selectedTab" :tabs="tabs" sticky flush>
        <section v-if="task?.management_tabs && !loading && !error && managementTab" class="performance-review-evaluation-drawer__tab-content">
          <div class="performance-review-evaluation-drawer__card">
            <div class="performance-review-evaluation-drawer__card-title">{{ managementTab.node_name }}</div>
            <PerformanceReviewCompletionNotice v-if="managementTab.submitted_at" :task-id="managementTab.task_id ?? undefined" :task-kind="managementTab.task_kind" :employee-no="props.employeeNo" :editable="managementTabEditable" variant="evaluation-drawer" :message="managementCompletionMessage" @edit="edit" />
            <PerformanceReferenceContent v-if="managementTab.form_schema.length || managementTab.status === 'completed'" :reference="managementTab" />
            <div v-else-if="stageView" class="performance-stage-empty">
              <img src="/performance-no-submit.svg" alt="" width="120" height="120">
              <p>暂未提交</p>
              <div class="performance-stage-empty__actions">
                <button v-if="stageView.can_fill" type="button" class="performance-stage-empty__fill" @click="fillStage">填写评估</button>
                <PerformanceReminderButton v-else-if="stageView.reminder_target" @click="openRemind" />
              </div>
            </div>
          </div>
        </section>
        <section v-else-if="loading || error || activeTab === 'evaluation'" class="performance-review-evaluation-drawer__tab-content">
          <div v-if="loading" class="performance-review-evaluation-drawer__state">正在加载评估内容…</div>
          <div v-else-if="error" class="performance-review-evaluation-drawer__state performance-review-evaluation-drawer__state--error">
            <p>{{ error }}</p>
            <button type="button" @click="load">重新加载</button>
          </div>
          <div v-else class="performance-review-evaluation-drawer__card">
            <div class="performance-review-evaluation-drawer__card-title">{{ title }}</div>
            <PerformanceReviewCompletionNotice v-for="(message, index) in completionMessages" :key="index" :task-id="task?.task_id ?? undefined" :task-kind="task?.task_kind" :employee-no="displayPerson.employee_no" variant="evaluation-drawer" :editable="taskEditable && index === completionMessages.length - 1" :message="message" @edit="edit" />
            <PerformanceTemplateRenderer mode="readonly" :sections="task?.form_schema || []" :answers="task?.answers || {}" />
          </div>
        </section>
        <section v-else-if="activeReference" class="performance-review-evaluation-drawer__tab-content">
          <div class="performance-review-evaluation-drawer__card">
            <div class="performance-review-evaluation-drawer__card-title">{{ activeReference.node_name }}</div>
            <PerformanceReferenceContent :reference="activeReference" @remind="emit('remind', $event)" />
          </div>
        </section>
        <section v-else class="performance-review-evaluation-drawer__tab-content performance-review-evaluation-drawer__tab-placeholder">该页签内容将在后续迭代中开发</section>
      </PerformanceLineTabs>
    </div>
  </UiDrawerShell>
  <PerformanceConfirmDialog
    v-model="remindOpen"
    appearance="submit"
    :message="stageRemindMessage"
    description=""
    cancel-text="取消"
    confirm-text="确定"
    @confirm="confirmRemind"
  >
    <template #icon><InfoFilledIcon /></template>
    <template #footer-left>
      <a class="performance-remind-preview-link" role="button" tabindex="0" @mouseenter="loadPreview" @mouseleave="closePreview">预览通知</a>
    </template>
  </PerformanceConfirmDialog>
  <PerformanceConfirmDialog v-model="deleteOpen" :message="'确定删除该人员吗？'" description="删除后，系统将清除本周期被评估人数据，且无法恢复。" cancel-text="保留" confirm-text="删除" @confirm="confirmDelete" />
  <PerformancePopover :visible="previewOpen" :anchor="previewAnchor" role="dialog" :width="380" name="performance-reminder-preview-popover" @close="closePreview" @mouseenter="cancelClose" @mouseleave="closePreview">
    <PerformanceReminderPreviewCard v-if="previewData" :preview="previewData" />
  </PerformancePopover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { performanceReviewApi, projectManagementApi, type PerformanceManagementDetail, type PerformanceReferenceTab, type PerformanceReviewMemberContext, type PerformanceReminderPreview, type SelfSummaryPerson } from '@/api/performance'
import UiDrawerShell from '../ui/UiDrawerShell.vue'
import PerformanceLineTabs, { type PerformanceLineTab } from './PerformanceLineTabs.vue'
import PerformanceReviewCompletionNotice from './PerformanceReviewCompletionNotice.vue'
import PerformanceReviewPersonHeader from './PerformanceReviewPersonHeader.vue'
import PerformanceReferenceContent from './PerformanceReferenceContent.vue'
import PerformanceTemplateRenderer from './PerformanceTemplateRenderer.vue'
import PerformanceConfirmDialog from './PerformanceConfirmDialog.vue'
import PerformancePopover from './PerformancePopover.vue'
import PerformanceReminderPreviewCard from './PerformanceReminderPreviewCard.vue'
import PerformanceMemberMoreMenu, { type PerformanceMemberContext } from './PerformanceMemberMoreMenu.vue'
import PerformanceReminderButton from './PerformanceReminderButton.vue'
import InfoFilledIcon from './InfoFilledIcon.vue'

type DrawerPerson = SelfSummaryPerson & PerformanceReviewMemberContext
const props = withDefaults(defineProps<{
  modelValue: boolean
  readonly?: boolean
  taskId?: number | string | null
  employeeNo?: string
  projectId?: number | string
  nodeName?: string
  activeTab?: string
  person?: Partial<DrawerPerson>
  detailLoader?: () => Promise<PerformanceManagementDetail>
  member?: PerformanceMemberContext | null
}>(), { readonly: false, taskId: null, employeeNo: '', projectId: undefined, nodeName: '', person: () => ({}), member: null })
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:activeTab': [value: string]
  close: []
  closed: []
  edit: [payload: { task_id: string | number; employee_no: string; node_id?: string; draft_choice?: 'use' | 'discard' }]
  'copy-link': []
  remind: [reference: PerformanceReferenceTab]
  authorize: [payload: PerformanceMemberContext]
  transfer: [payload: PerformanceMemberContext]
  delete: [payload: PerformanceMemberContext]
}>()
function notifyTranslationUnavailable() { ElMessage.info('当前尚未接入翻译服务，评估内容保留原文') }
const task = ref<PerformanceManagementDetail | null>(null)
const loading = ref(false)
const error = ref('')
const activeTab = ref(props.activeTab || 'evaluation')
const remindOpen = ref(false)
const deleteOpen = ref(false)
const previewOpen = ref(false)
const previewAnchor = ref<HTMLElement | null>(null)
const previewHoverAnchor = ref<HTMLElement | null>(null)
const previewData = ref<PerformanceReminderPreview | null>(null)
const selectedTab = computed({ get: () => activeReference.value?.key || activeTab.value, set: value => { activeTab.value = value; emit('update:activeTab', value) } })
let loadSequence = 0
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const title = computed(() => task.value?.node_name || props.nodeName || '上级评估')
const resolveProjectId = computed(() => props.projectId ?? task.value?.project_id ?? '')
const referenceTabs = computed(() => task.value?.reference_tabs || [])
const activeReference = computed<PerformanceReferenceTab | null>(() => referenceTabs.value.find(reference => reference.key === activeTab.value) || referenceTabs.value.find(reference => Boolean(reference.node_id) && reference.node_id === activeTab.value) || null)
const managementTab = computed(() => task.value?.management_tabs?.find(tab => tab.key === activeTab.value || tab.node_id === activeTab.value))
const managementTabEditable = computed(() => Boolean(
  !props.readonly
  && task.value?.editable
  && managementTab.value?.task_id === task.value.task_id,
))
const stageView = computed(() => {
  const tab = managementTab.value
  if (!tab || tab.status === 'completed') return null
  return task.value?.stage_views?.find(view => view.node_id === tab.node_id) || null
})
const stageRemindMessage = computed(() => {
  const stage = stageView.value
  const name = stage?.reminder_target || ''
  return `确定催办后，会立即向${name}发送飞书通知`
})
const tabs = computed<PerformanceLineTab[]>(() => task.value?.management_tabs
  ? task.value.management_tabs.map(tab => ({ key: tab.key, label: tab.node_name }))
  : [
    { key: 'evaluation', label: title.value },
    ...referenceTabs.value.map(reference => ({ key: reference.key, label: reference.node_name })),
  ])
const managementCompletionMessage = computed(() => {
  const tab = managementTab.value
  const deadline = formatDate(tab?.deadline_at)
  return `以下内容由 ${tab?.submitted_by || '评估人'} 在 ${formatDate(tab?.submitted_at)} 提交${deadline && Date.parse(tab?.deadline_at || '') < Date.now() ? `，该环节已在 ${deadline} 截止` : ''}`
})
const displayPerson = computed<DrawerPerson>(() => task.value ? task.value.person : { employee_no: props.employeeNo, display_name: '' })
const taskEditable = computed(() => Boolean(!props.readonly && task.value?.editable && task.value?.submit_allowed && (task.value.task_kind !== 'calibration' || !task.value.deadline_at || Date.parse(task.value.deadline_at) >= Date.now())))
const completionMessages = computed(() => {
  const current = task.value
  if (current?.task_kind !== 'calibration') {
    const submittedAt = formatDate(current?.submitted_at)
    const deadline = formatDate(current?.deadline_at)
    if (submittedAt && deadline && current?.editable && !props.readonly) return [`以下内容由 评估人 在 ${submittedAt} 提交，你可在 ${deadline} 前继续编辑`]
    if (submittedAt && deadline && Date.parse(current?.deadline_at || '') < Date.now()) return [`以下内容由 评估人 在 ${submittedAt} 提交，该环节已在 ${deadline} 截止`]
    return [submittedAt ? `以下内容由 评估人 在 ${submittedAt} 提交` : '该评估内容已提交']
  }
  const deadline = formatDate(current.deadline_at)
  const suffix = deadline && Date.parse(current.deadline_at || '') < Date.now()
    ? `，该环节已在 ${deadline} 截止`
    : deadline && taskEditable.value ? `，你可以在 ${deadline} 前继续编辑` : ''
  const submissions = current.answer_submissions || []
  return submissions.length
    ? submissions.map(item => `以下内容由 ${item.display_name}在 ${formatDate(item.submitted_at)} 提交${suffix}`)
    : [`以下为当前绩效结果${suffix}`]
})
function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const part = (type: string) => parts.find(item => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}（GMT+8）`
}
async function load() {
  const taskId = props.taskId
  if (!props.modelValue || (!props.detailLoader && (taskId === null || taskId === undefined || taskId === ''))) return
  const sequence = ++loadSequence
  loading.value = true
  error.value = ''
  try {
    const loaded = props.detailLoader
      ? await props.detailLoader()
      : props.employeeNo ? await performanceReviewApi.templateTask(taskId!, props.employeeNo) : await performanceReviewApi.templateTask(taskId!)
    if (sequence !== loadSequence) return
    task.value = loaded
    if (loaded.management_tabs) {
      const selected = loaded.management_tabs.find(tab => tab.key === activeTab.value || tab.node_id === activeTab.value)
      selectedTab.value = selected?.key || loaded.default_active_tab || loaded.management_tabs[0]?.key || 'evaluation'
    } else if (activeTab.value !== 'evaluation') {
      const selected = loaded.reference_tabs?.find(reference => reference.key === activeTab.value)
        || loaded.reference_tabs?.find(reference => Boolean(reference.node_id) && reference.node_id === activeTab.value)
      selectedTab.value = selected?.key || 'evaluation'
    }
  } catch (errorResponse) {
    const detail = (errorResponse as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    if (sequence === loadSequence) error.value = detail === 'CALIBRATION_SOURCE_NOT_READY'
      ? '终评或前一校准阶段尚未全部提交，请完成后重试'
      : detail === 'CALIBRATION_SOURCE_CONFLICT' ? '终评或前一校准阶段存在不一致的结果，请先核对后重试' : '评估内容加载失败，请稍后重试'
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}
function edit(choice?: 'use' | 'discard') {
  if (!task.value || task.value.task_id == null || !taskEditable.value) return
  emit('edit', { task_id: task.value.task_id, employee_no: displayPerson.value.employee_no, draft_choice: choice })
}
function fillStage() {
  const stage = stageView.value
  if (!stage || !task.value || !stage.can_fill || stage.task_id == null) return
  emit('edit', { task_id: stage.task_id, employee_no: displayPerson.value.employee_no, node_id: stage.node_id })
}
function openRemind() {
  if (!stageView.value?.reminder_target) return
  remindOpen.value = true
}
function onMoreAuthorize(payload: PerformanceMemberContext) {
  emit('authorize', payload)
}
function onMoreTransfer(payload: PerformanceMemberContext) {
  emit('transfer', payload)
}
function confirmDelete() {
  if (!props.member) return
  deleteOpen.value = false
  emit('delete', { ...props.member })
}
let previewCloseTimer: ReturnType<typeof setTimeout> | undefined
function cancelClose() {
  if (previewCloseTimer) { clearTimeout(previewCloseTimer); previewCloseTimer = undefined }
}
function closePreview() {
  previewHoverAnchor.value = null
  if (previewCloseTimer) return
  previewCloseTimer = setTimeout(() => {
    previewCloseTimer = undefined
    previewOpen.value = false
    previewData.value = null
    previewAnchor.value = null
  }, 150)
}
function loadPreview(event: MouseEvent) {
  const stage = stageView.value
  if (!stage || !event.currentTarget || stage.task_id == null) return
  cancelClose()
  const anchor = event.currentTarget as HTMLElement
  previewHoverAnchor.value = anchor
  void projectManagementApi.memberReminderPreview(resolveProjectId.value, props.employeeNo, stage.node_id, stage.task_id)
    .then(data => {
      if (previewHoverAnchor.value !== anchor) return
      previewOpen.value = true
      previewAnchor.value = anchor
      previewData.value = data
    })
    .catch(() => {
      if (previewHoverAnchor.value === anchor) closePreview()
    })
}
async function confirmRemind() {
  const stage = stageView.value
  if (!stage || stage.task_id == null || remindOpen.value === false) return
  remindOpen.value = false
  try {
    const result = await projectManagementApi.memberRemind(resolveProjectId.value, props.employeeNo, stage.node_id, stage.task_id)
    if (result.delivery_status === 'success') {
      ElMessage.success('催办已发送')
    } else if (result.delivery_status === 'preview_only') {
      ElMessage.info('通知仅生成预览，未实际发送')
    } else {
      ElMessage.error(result.errors?.map(item => item.error).join('；') || '催办发送失败，请稍后重试')
    }
  } catch {
    ElMessage.error('催办请求提交失败，请稍后重试')
  }
}
watch(() => [props.modelValue, props.taskId, props.employeeNo, props.detailLoader], () => {
  if (props.modelValue) {
    task.value = null
    activeTab.value = props.activeTab || 'evaluation'
    void load()
  }
  else { loadSequence++ }
}, { immediate: true })
watch(() => props.activeTab, value => { activeTab.value = value || 'evaluation' })
</script>

<style scoped>
.performance-review-evaluation-drawer__person{width:100%;min-width:0;flex:1}.performance-review-evaluation-drawer__opening{margin:0;padding:0 0 12px;color:var(--color-text-secondary);font-size:14px;line-height:22px}
.performance-review-evaluation-drawer__scroll{display:flex;min-width:0;min-height:0;flex:1;flex-direction:column;overflow:auto;background:#f2f3f5}.performance-review-evaluation-drawer__scroll :deep(.line-tabs){min-height:100%;flex:1 0 auto}.performance-review-evaluation-drawer__scroll :deep(.line-tabs-holder){position:sticky;top:0;z-index:20;flex:none;padding:12px 20px 0!important;background:#fff}.performance-review-evaluation-drawer__scroll :deep(.line-tabs.sticky .line-tabs-holder){top:0}.performance-review-evaluation-drawer__scroll :deep(.line-tabs-overflow){flex-wrap:nowrap;width:max-content;min-width:100%;margin-bottom:0}.performance-review-evaluation-drawer__scroll :deep(.line-tabs-wrap){overflow-x:auto;scrollbar-width:none}.performance-review-evaluation-drawer__scroll :deep(.line-tabs-wrap::-webkit-scrollbar){display:none}.performance-review-evaluation-drawer__scroll :deep(.line-tab){padding-bottom:12px}.performance-review-evaluation-drawer__scroll :deep(.template-section-header--readonly .performance-assessment-preview-header){margin-bottom:16px;padding-left:0}.performance-review-evaluation-drawer__scroll :deep(.template-section-header--readonly .performance-assessment-preview-header::before){display:none}.performance-review-evaluation-drawer__scroll :deep(.line-tabs-ink){top:33px}.performance-review-evaluation-drawer__scroll :deep(.line-tabs-content),.performance-review-evaluation-drawer__scroll :deep(.line-tabs-pane){display:flex;min-height:0;flex:1 0 auto;flex-direction:column}.performance-review-evaluation-drawer__tab-content{display:flex;min-height:0;flex:1 0 auto;flex-direction:column;padding:12px 4px 12px 12px;box-sizing:border-box;background:#f2f3f5}.performance-review-evaluation-drawer__card{flex:1 0 auto;padding:12px 20px;box-sizing:border-box;border-radius:8px;background:#fff;box-shadow:rgba(31,35,41,.03) 0 4px 16px 4px,rgba(31,35,41,.02) 0 4px 8px,rgba(31,35,41,.02) 0 2px 4px -4px}.performance-review-evaluation-drawer__card :deep(.performance-reference-content){min-height:0}.performance-review-evaluation-drawer__card-title{margin-bottom:16px;color:#1f2329;font-size:16px;font-weight:600;line-height:24px}.performance-review-evaluation-drawer__state{display:flex;min-height:320px;flex-direction:column;align-items:center;justify-content:center;color:#646a73;font-size:14px}.performance-review-evaluation-drawer__state p{margin:0 0 12px}.performance-review-evaluation-drawer__state button{height:32px;padding:4px 16px;border:0;border-radius:6px;background:#3370ff;color:#fff;cursor:pointer;font:400 14px/22px var(--font-sans)}.performance-review-evaluation-drawer__state--error{color:#d14343}.performance-review-evaluation-drawer__tab-placeholder{display:grid;min-height:360px;place-items:center;color:#8f959e;font-size:14px}
.performance-stage-empty{display:flex;min-height:320px;flex-direction:column;align-items:center;justify-content:center;color:#646a73;font-size:16px;line-height:24px}.performance-stage-empty p{margin:16px 0 24px}.performance-stage-empty__actions{display:flex;align-items:center;gap:12px}.performance-stage-empty__fill{display:inline-flex;align-items:center;justify-content:center;min-width:80px;height:32px;padding:4px 11px;box-sizing:border-box;border:1px solid #3370ff;border-radius:6px;background:#3370ff;color:#fff;cursor:pointer;font:400 14px/22px var(--font-sans)}.performance-stage-empty__fill:hover{background:#2a5fd8}.performance-stage-empty__remind{display:inline-flex;align-items:center;justify-content:center;min-width:80px;height:32px;padding:4px 11px;box-sizing:border-box;border:1px solid #3370ff;border-radius:6px;background:#fff;color:#3370ff;cursor:pointer;font:400 14px/22px var(--font-sans)}.performance-stage-empty__remind:hover{background:#f2f3f5}.performance-stage-empty__remind svg{display:inline-block;width:14px;height:14px;margin-right:4px}.performance-remind-preview-link{color:#3370ff;cursor:pointer;font:400 14px/22px var(--font-sans);text-decoration:none}.performance-remind-preview-link:hover{color:#2a5fd8}
</style>
