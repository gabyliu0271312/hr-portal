<template>
  <UiDrawerShell v-model="open" :title="title" aria-label="绩效评估详情" width="720px" :initial-width="1000" variant="evaluation" body-class="performance-drawer__body--flush" :resizable="true" :min-width="720" :mask="false" cache-key="perf-drawer" :keyboard="false" @close="emit('close')" @closed="emit('closed')">
    <template #header>
      <div class="performance-review-evaluation-drawer__person"><PerformanceReviewPersonHeader :person="displayPerson" @translate="notifyTranslationUnavailable" @translate-menu="notifyTranslationUnavailable" @copy-link="emit('copy-link')" /><p v-if="task?.opened_at" class="performance-review-evaluation-drawer__opening">本次绩效结果已于 {{ formatDate(task.opened_at) }} 开通。</p></div>
    </template>
    <div class="performance-review-evaluation-drawer__scroll">
      <PerformanceLineTabs v-model="selectedTab" :tabs="tabs" sticky flush>
        <section v-if="task?.management_tabs && !loading && !error && managementTab" class="performance-review-evaluation-drawer__tab-content">
          <div class="performance-review-evaluation-drawer__card">
            <div class="performance-review-evaluation-drawer__card-title">{{ managementTab.node_name }}</div>
            <PerformanceReviewCompletionNotice v-if="managementTab.submitted_at" :editable="false" variant="evaluation-drawer" :message="managementCompletionMessage" />
            <PerformanceReferenceContent :reference="managementTab" />
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
            <PerformanceReviewCompletionNotice :task-id="task?.task_id ?? undefined" :task-kind="task?.task_kind" :employee-no="props.employeeNo" variant="evaluation-drawer" :editable="!props.readonly && Boolean(task?.editable)" :message="completionMessage" @edit="edit" />
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
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { performanceReviewApi, type PerformanceManagementDetail, type PerformanceReferenceTab, type PerformanceReviewMemberContext, type SelfSummaryPerson } from '@/api/performance'
import UiDrawerShell from '../ui/UiDrawerShell.vue'
import PerformanceLineTabs, { type PerformanceLineTab } from './PerformanceLineTabs.vue'
import PerformanceReviewCompletionNotice from './PerformanceReviewCompletionNotice.vue'
import PerformanceReviewPersonHeader from './PerformanceReviewPersonHeader.vue'
import PerformanceReferenceContent from './PerformanceReferenceContent.vue'
import PerformanceTemplateRenderer from './PerformanceTemplateRenderer.vue'

type DrawerPerson = SelfSummaryPerson & PerformanceReviewMemberContext
const props = withDefaults(defineProps<{
  modelValue: boolean
  readonly?: boolean
  taskId?: number | string | null
  employeeNo?: string
  nodeName?: string
  activeTab?: string
  person?: Partial<DrawerPerson>
  detailLoader?: () => Promise<PerformanceManagementDetail>
}>(), { readonly: false, taskId: null, employeeNo: '', nodeName: '', person: () => ({}) })
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:activeTab': [value: string]
  close: []
  closed: []
  edit: [payload: { task_id: string | number; employee_no: string; draft_choice?: 'use' | 'discard' }]
  'copy-link': []
  remind: [reference: PerformanceReferenceTab]
}>()
function notifyTranslationUnavailable() { ElMessage.info('当前尚未接入翻译服务，评估内容保留原文') }
const task = ref<PerformanceManagementDetail | null>(null)
const loading = ref(false)
const error = ref('')
const activeTab = ref(props.activeTab || 'evaluation')
const selectedTab = computed({ get: () => activeReference.value?.key || activeTab.value, set: value => { activeTab.value = value; emit('update:activeTab', value) } })
let loadSequence = 0
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const title = computed(() => task.value?.node_name || props.nodeName || '上级评估')
const referenceTabs = computed(() => task.value?.reference_tabs || [])
const activeReference = computed<PerformanceReferenceTab | null>(() => referenceTabs.value.find(reference => reference.key === activeTab.value) || referenceTabs.value.find(reference => Boolean(reference.node_id) && reference.node_id === activeTab.value) || null)
const managementTab = computed(() => task.value?.management_tabs?.find(tab => tab.key === activeTab.value || tab.node_id === activeTab.value))
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
const completionMessage = computed(() => {
  const submittedBy = '评估人'
  const submittedAt = formatDate(task.value?.submitted_at)
  const deadline = formatDate(task.value?.deadline_at)
  if (submittedAt && deadline && task.value?.editable && !props.readonly) return `以下内容由 ${submittedBy} 在 ${submittedAt} 提交，你可在 ${deadline} 前继续编辑`
  if (submittedAt && deadline && Date.parse(task.value?.deadline_at || '') < Date.now()) return `以下内容由 ${submittedBy} 在 ${submittedAt} 提交，该环节已在 ${deadline} 截止`
  if (submittedAt) return `以下内容由 ${submittedBy} 在 ${submittedAt} 提交`
  return '该评估内容已提交'
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
  } catch {
    if (sequence === loadSequence) error.value = '评估内容加载失败，请稍后重试'
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}
function edit(choice?: 'use' | 'discard') {
  if (!task.value || task.value.task_id == null || props.readonly || !task.value.editable) return
  emit('edit', { task_id: task.value.task_id, employee_no: displayPerson.value.employee_no, draft_choice: choice })
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
.performance-review-evaluation-drawer__person{width:100%;min-width:0}.performance-review-evaluation-drawer__opening{margin:0;padding:0 0 12px;color:var(--color-text-secondary);font-size:14px;line-height:22px}
.performance-review-evaluation-drawer__scroll{display:flex;min-width:0;min-height:0;flex:1;flex-direction:column;overflow:auto;background:#f2f3f5}.performance-review-evaluation-drawer__scroll :deep(.line-tabs){min-height:100%;flex:1 0 auto}.performance-review-evaluation-drawer__scroll :deep(.line-tabs-holder){position:sticky;top:0;z-index:20;flex:none;padding:12px 20px 0!important;background:#fff}.performance-review-evaluation-drawer__scroll :deep(.line-tabs.sticky .line-tabs-holder){top:0}.performance-review-evaluation-drawer__scroll :deep(.line-tabs-overflow){flex-wrap:nowrap;width:max-content;min-width:100%;margin-bottom:0}.performance-review-evaluation-drawer__scroll :deep(.line-tabs-wrap){overflow-x:auto;scrollbar-width:none}.performance-review-evaluation-drawer__scroll :deep(.line-tabs-wrap::-webkit-scrollbar){display:none}.performance-review-evaluation-drawer__scroll :deep(.line-tab){padding-bottom:12px}.performance-review-evaluation-drawer__scroll :deep(.template-section-header--readonly .performance-assessment-preview-header){margin-bottom:16px;padding-left:0}.performance-review-evaluation-drawer__scroll :deep(.template-section-header--readonly .performance-assessment-preview-header::before){display:none}.performance-review-evaluation-drawer__scroll :deep(.line-tabs-ink){top:33px}.performance-review-evaluation-drawer__scroll :deep(.line-tabs-content),.performance-review-evaluation-drawer__scroll :deep(.line-tabs-pane){display:flex;min-height:0;flex:1 0 auto;flex-direction:column}.performance-review-evaluation-drawer__tab-content{display:flex;min-height:0;flex:1 0 auto;flex-direction:column;padding:12px 4px 12px 12px;box-sizing:border-box;background:#f2f3f5}.performance-review-evaluation-drawer__card{flex:1 0 auto;padding:12px 20px;box-sizing:border-box;border-radius:8px;background:#fff;box-shadow:rgba(31,35,41,.03) 0 4px 16px 4px,rgba(31,35,41,.02) 0 4px 8px,rgba(31,35,41,.02) 0 2px 4px -4px}.performance-review-evaluation-drawer__card :deep(.performance-reference-content){min-height:0}.performance-review-evaluation-drawer__card-title{margin-bottom:16px;color:#1f2329;font-size:16px;font-weight:600;line-height:24px}.performance-review-evaluation-drawer__state{display:flex;min-height:320px;flex-direction:column;align-items:center;justify-content:center;color:#646a73;font-size:14px}.performance-review-evaluation-drawer__state p{margin:0 0 12px}.performance-review-evaluation-drawer__state button{height:32px;padding:4px 16px;border:0;border-radius:6px;background:#3370ff;color:#fff;cursor:pointer;font:400 14px/22px var(--font-sans)}.performance-review-evaluation-drawer__state--error{color:#d14343}.performance-review-evaluation-drawer__tab-placeholder{display:grid;min-height:360px;place-items:center;color:#8f959e;font-size:14px}
</style>
