<template>
  <PerformanceDrawerShell v-model="open" :title="title" aria-label="绩效评估详情" width="720px" variant="evaluation" body-class="performance-drawer__body--flush" :resizable="true" :min-width="560" :max-width="1084" @close="emit('close')">
    <template #header>
      <PerformanceReviewPersonHeader :person="displayPerson" @translate="emit('translate')" @translate-menu="emit('translate-menu')" @copy-link="emit('copy-link')" />
    </template>
    <div class="performance-review-evaluation-drawer__scroll">
      <PerformanceLineTabs v-model="activeTab" :tabs="tabs" sticky flush>
        <section v-if="activeTab === 'evaluation'" class="performance-review-evaluation-drawer__tab-content">
          <div v-if="loading" class="performance-review-evaluation-drawer__state">正在加载评估内容…</div>
          <div v-else-if="error" class="performance-review-evaluation-drawer__state performance-review-evaluation-drawer__state--error">
            <p>{{ error }}</p>
            <button type="button" @click="load">重新加载</button>
          </div>
          <div v-else class="performance-review-evaluation-drawer__card">
            <div class="performance-review-evaluation-drawer__card-title">{{ title }}</div>
            <PerformanceReviewCompletionNotice variant="evaluation-drawer" :editable="Boolean(task?.editable)" :message="completionMessage" @edit="edit" />
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
  </PerformanceDrawerShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { performanceReviewApi, type PerformanceReferenceTab, type PerformanceReviewMemberContext, type PerformanceTemplateTask, type SelfSummaryPerson } from '@/api/performance'
import PerformanceDrawerShell from './PerformanceDrawerShell.vue'
import PerformanceLineTabs, { type PerformanceLineTab } from './PerformanceLineTabs.vue'
import PerformanceReviewCompletionNotice from './PerformanceReviewCompletionNotice.vue'
import PerformanceReviewPersonHeader from './PerformanceReviewPersonHeader.vue'
import PerformanceReferenceContent from './PerformanceReferenceContent.vue'
import PerformanceTemplateRenderer from './PerformanceTemplateRenderer.vue'

type DrawerPerson = SelfSummaryPerson & PerformanceReviewMemberContext
const props = withDefaults(defineProps<{
  modelValue: boolean
  taskId?: number | string | null
  employeeNo?: string
  nodeName?: string
  person?: Partial<DrawerPerson>
}>(), { taskId: null, employeeNo: '', nodeName: '', person: () => ({}) })
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  close: []
  edit: [payload: { task_id: string | number; employee_no: string }]
  translate: []
  'translate-menu': []
  'copy-link': []
  remind: [reference: PerformanceReferenceTab]
}>()
const task = ref<PerformanceTemplateTask | null>(null)
const loading = ref(false)
const error = ref('')
const activeTab = ref('evaluation')
let loadSequence = 0
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const title = computed(() => task.value?.node_name || props.nodeName || '上级评估')
const referenceTabs = computed(() => task.value?.reference_tabs || [])
const activeReference = computed<PerformanceReferenceTab | null>(() => referenceTabs.value.find(reference => reference.key === activeTab.value) || null)
const tabs = computed<PerformanceLineTab[]>(() => [
  { key: 'evaluation', label: title.value },
  ...referenceTabs.value.map(reference => ({ key: reference.key, label: reference.node_name })),
])
const displayPerson = computed<DrawerPerson>(() => ({
  employee_no: '',
  display_name: '',
  department: null,
  direct_supervisor_name: null,
  ...props.person,
  ...(task.value?.person || {}),
}))
const completionMessage = computed(() => {
  const submittedBy = displayPerson.value.direct_supervisor_name || '评估人'
  const submittedAt = formatDate(task.value?.submitted_at)
  const deadline = formatDate(task.value?.deadline_at)
  if (submittedAt && deadline && task.value?.editable) return `以下内容由 ${submittedBy} 在 ${submittedAt} 提交，你可在 ${deadline} 前继续编辑`
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
  if (!props.modelValue || taskId === null || taskId === undefined || taskId === '') return
  const sequence = ++loadSequence
  loading.value = true
  error.value = ''
  try {
    task.value = props.employeeNo ? await performanceReviewApi.templateTask(taskId, props.employeeNo) : await performanceReviewApi.templateTask(taskId)
  } catch {
    if (sequence === loadSequence) error.value = '评估内容加载失败，请稍后重试'
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}
function edit() {
  if (!task.value) return
  emit('edit', { task_id: task.value.task_id, employee_no: displayPerson.value.employee_no })
}
watch(() => [props.modelValue, props.taskId, props.employeeNo], () => {
  if (props.modelValue) {
    activeTab.value = 'evaluation'
    void load()
  }
}, { immediate: true })
</script>

<style scoped>
.performance-review-evaluation-drawer__scroll{display:flex;min-width:0;min-height:0;flex:1;flex-direction:column;overflow:auto;background:#f2f3f5}.performance-review-evaluation-drawer__scroll :deep(.line-tabs){min-height:100%}.performance-review-evaluation-drawer__scroll :deep(.line-tabs-holder){position:sticky;top:0;z-index:20;padding:0 24px 0 32px!important;background:#fff}.performance-review-evaluation-drawer__scroll :deep(.line-tabs-overflow){margin-bottom:0}.performance-review-evaluation-drawer__scroll :deep(.line-tab){padding-bottom:12px}.performance-review-evaluation-drawer__scroll :deep(.line-tabs-ink){top:33px}.performance-review-evaluation-drawer__tab-content{min-height:100%;padding:16px 24px 20px 32px;box-sizing:border-box;background:#f2f3f5}.performance-review-evaluation-drawer__card{padding:12px 20px 20px;box-sizing:border-box;border-radius:8px;background:#fff;box-shadow:rgba(31,35,41,.03) 0 4px 16px 4px,rgba(31,35,41,.02) 0 4px 8px,rgba(31,35,41,.02) 0 2px 4px -4px}.performance-review-evaluation-drawer__card-title{margin-bottom:16px;color:#1f2329;font-size:16px;font-weight:600;line-height:24px}.performance-review-evaluation-drawer__state{display:flex;min-height:320px;flex-direction:column;align-items:center;justify-content:center;color:#646a73;font-size:14px}.performance-review-evaluation-drawer__state p{margin:0 0 12px}.performance-review-evaluation-drawer__state button{height:32px;padding:4px 16px;border:0;border-radius:6px;background:#3370ff;color:#fff;cursor:pointer;font:400 14px/22px var(--font-sans)}.performance-review-evaluation-drawer__state--error{color:#d14343}.performance-review-evaluation-drawer__tab-placeholder{display:grid;min-height:360px;place-items:center;color:#8f959e;font-size:14px}
</style>
