<template>
  <div class="project-time-settings" aria-label="起止时间">
    <div v-if="loading" class="time-state" role="status">正在加载流程节点...</div>
    <div v-else-if="error" class="time-state time-state--error" role="alert">{{ error }}</div>
    <div v-else-if="!nodes.length" class="time-state">当前绩效模板暂无流程环节</div>
    <article v-for="node in nodes" v-else :key="nodeKey(node)" class="time-node-card">
      <header class="time-node-header">
        <span class="time-node-icon" aria-hidden="true"><PerformanceWorkflowStageIcon :type="node.node_type" /></span>
        <h2>{{ node.name }}</h2>
        <span v-if="hasPassed(node.node_type === 'result_view' ? timeFor(node).appeal_deadline : timeFor(node).end_at)" class="time-node-deadline">已截止</span>
      </header>
      <div v-if="node.node_type === 'result_view'" class="time-fields time-fields--result-view">
        <PerformanceFormItem label="开始时间" required :invalid="Boolean(startError(timeFor(node).start_at))" :error-message="startError(timeFor(node).start_at)" :error-id="`${nodeKey(node)}-start-error`">
          <PerformanceDateTimeField :model-value="timeFor(node).start_at" :input-id="`${nodeKey(node)}-start`" time-role="start" required :disabled="isStartLocked(timeFor(node).start_at)" :invalid="Boolean(startError(timeFor(node).start_at))" :described-by="startError(timeFor(node).start_at) ? `${nodeKey(node)}-start-error` : ''" @update:model-value="timeFor(node).start_at = $event" />
        </PerformanceFormItem>
        <p class="time-help">由管理员人员开通后，被评估人立即收到绩效结果</p>
        <PerformanceFormItem label="发起复议截止时间" required :invalid="Boolean(deadlineError(node))" :error-message="deadlineError(node)" :error-id="`${nodeKey(node)}-deadline-error`">
          <PerformanceDateTimeField :model-value="timeFor(node).appeal_deadline || ''" :input-id="`${nodeKey(node)}-appeal-deadline`" time-role="end" required :invalid="Boolean(deadlineError(node))" :described-by="deadlineError(node) ? `${nodeKey(node)}-deadline-error` : ''" @update:model-value="timeFor(node).appeal_deadline = $event" />
        </PerformanceFormItem>
      </div>
      <div v-else-if="node.node_type === 'result_reconsideration'" class="time-fields time-fields--single">
        <PerformanceFormItem label="处理复议截止时间" required :invalid="Boolean(deadlineError(node))" :error-message="deadlineError(node)" :error-id="`${nodeKey(node)}-deadline-error`">
          <PerformanceDateTimeField :model-value="timeFor(node).end_at" :input-id="`${nodeKey(node)}-end`" time-role="end" required :invalid="Boolean(deadlineError(node))" :described-by="deadlineError(node) ? `${nodeKey(node)}-deadline-error` : ''" @update:model-value="timeFor(node).end_at = $event" />
        </PerformanceFormItem>
      </div>
      <div v-else-if="node.node_type === 'calibration' && phasesFor(node).length" class="calibration-time-phases">
        <section v-for="(phase, index) in phasesFor(node)" :key="calibrationPhaseKey(phase, index)" class="calibration-time-phase" :aria-label="`${node.name}第 ${index + 1} 阶段`">
          <h3>第 {{ index + 1 }} 阶段</h3>
          <div class="time-fields">
            <PerformanceFormItem label="开始时间" required :invalid="Boolean(startError(phaseTimeFor(node, phase, index).start_at))" :error-message="startError(phaseTimeFor(node, phase, index).start_at)" :error-id="`${nodeKey(node)}-${calibrationPhaseKey(phase, index)}-start-error`">
              <PerformanceDateTimeField :model-value="phaseTimeFor(node, phase, index).start_at" :input-id="`${nodeKey(node)}-${calibrationPhaseKey(phase, index)}-start`" :aria-label="`${node.name}第 ${index + 1} 阶段开始时间`" time-role="start" required :disabled="isStartLocked(phaseTimeFor(node, phase, index).start_at)" :invalid="Boolean(startError(phaseTimeFor(node, phase, index).start_at))" :described-by="startError(phaseTimeFor(node, phase, index).start_at) ? `${nodeKey(node)}-${calibrationPhaseKey(phase, index)}-start-error` : ''" @update:model-value="phaseTimeFor(node, phase, index).start_at = $event" />
            </PerformanceFormItem>
            <PerformanceFormItem label="截止时间" required :invalid="Boolean(phaseDeadlineError(node, phase, index))" :error-message="phaseDeadlineError(node, phase, index)" :error-id="`${nodeKey(node)}-${calibrationPhaseKey(phase, index)}-error`">
              <PerformanceDateTimeField :model-value="phaseTimeFor(node, phase, index).end_at" :input-id="`${nodeKey(node)}-${calibrationPhaseKey(phase, index)}-end`" :aria-label="`${node.name}第 ${index + 1} 阶段截止时间`" time-role="end" required :invalid="Boolean(phaseDeadlineError(node, phase, index))" :described-by="phaseDeadlineError(node, phase, index) ? `${nodeKey(node)}-${calibrationPhaseKey(phase, index)}-error` : ''" @update:model-value="phaseTimeFor(node, phase, index).end_at = $event" />
            </PerformanceFormItem>
          </div>
        </section>
      </div>
      <div v-else class="time-fields">
        <PerformanceFormItem label="开始时间" required :invalid="Boolean(startError(timeFor(node).start_at))" :error-message="startError(timeFor(node).start_at)" :error-id="`${nodeKey(node)}-start-error`">
          <PerformanceDateTimeField :model-value="timeFor(node).start_at" :input-id="`${nodeKey(node)}-start`" time-role="start" required :disabled="isStartLocked(timeFor(node).start_at)" :invalid="Boolean(startError(timeFor(node).start_at))" :described-by="startError(timeFor(node).start_at) ? `${nodeKey(node)}-start-error` : ''" @update:model-value="timeFor(node).start_at = $event" />
        </PerformanceFormItem>
        <PerformanceFormItem label="截止时间" required :invalid="Boolean(deadlineError(node))" :error-message="deadlineError(node)" :error-id="`${nodeKey(node)}-deadline-error`">
          <PerformanceDateTimeField :model-value="timeFor(node).end_at" :input-id="`${nodeKey(node)}-end`" time-role="end" required :invalid="Boolean(deadlineError(node))" :described-by="deadlineError(node) ? `${nodeKey(node)}-deadline-error` : ''" @update:model-value="timeFor(node).end_at = $event" />
        </PerformanceFormItem>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { shanghaiLocalToUtcIso } from '@/utils/datetime'
import type { PerformanceProjectFlowSettings, PerformanceProjectNodeTime, PerformanceWorkflowNode } from '@/api/performance'
import { calibrationPhaseKey, projectDeadlineError, requiresFutureDeadline, syncCalibrationPhaseTimes } from './performanceProjectCalibration'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceDateTimeField from './PerformanceDateTimeField.vue'
import PerformanceWorkflowStageIcon from '@/views/performance/PerformanceWorkflowStageIcon.vue'

const props = withDefaults(defineProps<{
  nodes: PerformanceWorkflowNode[]
  nodeSettings?: PerformanceProjectFlowSettings['node_settings']
  modelValue?: Record<string, PerformanceProjectNodeTime>
  projectStatus?: string
  baselineFlowSettings?: PerformanceProjectFlowSettings
  showValidation?: boolean
  loading?: boolean
  error?: string
}>(), { modelValue: () => ({}), nodeSettings: () => ({}), projectStatus: 'DRAFT', showValidation: false, loading: false, error: '' })
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, PerformanceProjectNodeTime>] }>()
const draft = ref<Record<string, PerformanceProjectNodeTime>>(cloneTimes(props.modelValue))
props.nodes.forEach(ensureNode)
syncCalibrationPhaseTimes(props.nodeSettings, draft.value)
const lastEmitted = ref(JSON.stringify(draft.value))
const clock = ref(Date.now())
const clockTimer = setInterval(() => { clock.value = Date.now() }, 1000)
onBeforeUnmount(() => clearInterval(clockTimer))

function hasPassed(value?: string) {
  if (!value) return false
  const timestamp = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : shanghaiLocalToUtcIso(value.replace(' ', 'T')) || '')
  return timestamp <= clock.value
}

function isStartLocked(value?: string) { return props.projectStatus === 'STARTED' && hasPassed(value) }

function cloneTimes(value?: Record<string, PerformanceProjectNodeTime>) { return JSON.parse(JSON.stringify(value || {})) as Record<string, PerformanceProjectNodeTime> }
function nodeKey(node: PerformanceWorkflowNode) { return node.node_id || `${node.node_type}-${node.order}` }
function defaultTime(node: PerformanceWorkflowNode): PerformanceProjectNodeTime {
  return { start_at: '', end_at: '', appeal_deadline: node.node_type === 'result_view' ? '' : undefined }
}
function ensureNode(node: PerformanceWorkflowNode) {
  const key = nodeKey(node)
  if (!draft.value[key]) draft.value[key] = defaultTime(node)
  const value = draft.value[key]
  value.start_at ??= ''
  value.end_at ??= ''
  if (node.node_type === 'result_view') value.appeal_deadline ??= ''
}
function phasesFor(node: PerformanceWorkflowNode) { return props.nodeSettings[nodeKey(node)]?.calibration?.phases || [] }
function phaseTimeFor(node: PerformanceWorkflowNode, phase: ReturnType<typeof phasesFor>[number], index: number) {
  return timeFor(node).phase_times![calibrationPhaseKey(phase, index)]
}
function startError(value?: string) {
  if (!props.showValidation) return ''
  if (!value) return '开始时间不能为空'
  return Number.isFinite(Date.parse(value)) ? '' : '开始时间格式不正确'
}
function endError(start: string | undefined, end: string | undefined, label = '截止时间', requireFuture = true) {
  if (props.showValidation && !end) return `${label}不能为空`
  return projectDeadlineError(start, end, clock.value, label, requireFuture)
}
function phaseDeadlineError(node: PerformanceWorkflowNode, phase: ReturnType<typeof phasesFor>[number], index: number) {
  const time = phaseTimeFor(node, phase, index)
  return endError(time.start_at, time.end_at, '截止时间', requiresFutureDeadline(props.projectStatus, props.baselineFlowSettings, nodeKey(node), calibrationPhaseKey(phase, index)))
}
function deadlineError(node: PerformanceWorkflowNode) {
  const time = timeFor(node)
  const label = node.node_type === 'result_view' ? '发起复议截止时间' : node.node_type === 'result_reconsideration' ? '处理复议截止时间' : '截止时间'
  return endError(node.node_type === 'result_reconsideration' ? undefined : time.start_at, node.node_type === 'result_view' ? time.appeal_deadline : time.end_at, label, requiresFutureDeadline(props.projectStatus))
}
function ensureAllNodes() { props.nodes.forEach(ensureNode); syncCalibrationPhaseTimes(props.nodeSettings, draft.value) }
function timeFor(node: PerformanceWorkflowNode) { ensureNode(node); return draft.value[nodeKey(node)] }
watch(() => [props.nodes, props.nodeSettings], ensureAllNodes, { deep: true, immediate: true })
watch(() => props.modelValue, value => { const next = JSON.stringify(value || {}); if (next !== lastEmitted.value) { draft.value = cloneTimes(value); ensureAllNodes(); lastEmitted.value = JSON.stringify(draft.value) } }, { deep: true })
watch(draft, value => { syncCalibrationPhaseTimes(props.nodeSettings, value); const next = JSON.stringify(value); if (next === lastEmitted.value) return; lastEmitted.value = next; emit('update:modelValue', cloneTimes(value)) }, { deep: true })
</script>

<style scoped>
.project-time-settings{display:grid;width:100%;gap:16px}.time-state{padding:32px;color:#646a73;text-align:center}.time-state--error{color:#f04438}.time-node-card{width:100%;box-sizing:border-box;padding:24px 32px;border-radius:8px;background:#fff;box-shadow:0 1px 4px rgba(31,35,41,.05)}.time-node-header{display:flex;align-items:center;gap:12px}.time-node-icon{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:8px;background:#f5f6f7;color:#3370ff}.time-node-icon :deep(.stage-icon){width:24px;height:24px}.time-node-header h2{margin:0;color:#1f2329;font-size:16px;line-height:24px}.time-fields{display:grid;align-items:start;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0 0 52px}.time-fields label{display:grid;gap:8px;min-width:0;color:#1f2329;font-size:14px;line-height:22px}.time-fields label span{font-weight:600}.time-fields label i{color:#f04438;font-style:normal}.time-fields--result-view{grid-template-columns:minmax(0,1fr);gap:0}.time-fields--result-view .time-help{margin:4px 0 20px;color:#646a73;font-size:14px;line-height:22px}.time-fields--single{grid-template-columns:minmax(0,1fr)}
.calibration-time-phases{margin:16px 0 0 52px}.calibration-time-phase+.calibration-time-phase{margin-top:12px}.calibration-time-phase h3{margin:0 0 8px;color:var(--color-text-primary);font-size:14px;font-weight:600;line-height:22px}.calibration-time-phase .time-fields{margin:0}
.time-fields :deep(.performance-form-item){margin-bottom:0}
.time-node-deadline{margin-left:auto;padding:0 var(--spacing-1);border-radius:var(--radius-sm);background:var(--color-surface-disabled);color:var(--performance-count-badge-text);font-size:var(--font-size-xs);font-weight:500;line-height:19.2px;white-space:nowrap}
.project-time-settings :deep(.performance-date-time-field__input:disabled){background:var(--color-surface-disabled)}
.project-time-settings :deep(.performance-date-time-field__trigger:disabled){background:transparent;color:var(--performance-button-link-disabled-color);opacity:1}
@media (max-width:800px){.time-node-card{padding:20px}.time-fields{grid-template-columns:1fr;margin-left:0}.calibration-time-phases{margin-left:0}}
</style>
