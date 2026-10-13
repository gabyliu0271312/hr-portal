<template>
  <div class="project-time-settings" aria-label="起止时间">
    <div v-if="loading" class="time-state" role="status">正在加载流程节点...</div>
    <div v-else-if="error" class="time-state time-state--error" role="alert">{{ error }}</div>
    <div v-else-if="!nodes.length" class="time-state">当前绩效模板暂无流程环节</div>
    <article v-for="node in nodes" v-else :key="nodeKey(node)" class="time-node-card">
      <header class="time-node-header">
        <span class="time-node-icon" aria-hidden="true"><PerformanceWorkflowStageIcon :type="node.node_type" /></span>
        <h2>{{ node.name }}</h2>
      </header>
      <div v-if="node.node_type === 'result_view'" class="time-fields time-fields--result-view">
        <label><span>开始时间 <i>*</i></span><PerformanceDateTimeField :model-value="timeFor(node).start_at" :input-id="`${nodeKey(node)}-start`" required @update:model-value="timeFor(node).start_at = $event" /></label>
        <p class="time-help">由管理员人员开通后，被评估人立即收到绩效结果</p>
        <label><span>发起复议截止时间 <i>*</i></span><PerformanceDateTimeField :model-value="timeFor(node).appeal_deadline || ''" :input-id="`${nodeKey(node)}-appeal-deadline`" required @update:model-value="timeFor(node).appeal_deadline = $event" /></label>
      </div>
      <div v-else-if="node.node_type === 'result_reconsideration'" class="time-fields time-fields--single">
        <label><span>处理复议截止时间 <i>*</i></span><PerformanceDateTimeField :model-value="timeFor(node).end_at" :input-id="`${nodeKey(node)}-end`" required @update:model-value="timeFor(node).end_at = $event" /></label>
      </div>
      <div v-else class="time-fields">
        <label><span>开始时间 <i>*</i></span><PerformanceDateTimeField :model-value="timeFor(node).start_at" :input-id="`${nodeKey(node)}-start`" required @update:model-value="timeFor(node).start_at = $event" /></label>
        <label><span>截止时间 <i>*</i></span><PerformanceDateTimeField :model-value="timeFor(node).end_at" :input-id="`${nodeKey(node)}-end`" required @update:model-value="timeFor(node).end_at = $event" /></label>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { PerformanceProjectNodeTime, PerformanceWorkflowNode } from '@/api/performance'
import PerformanceDateTimeField from './PerformanceDateTimeField.vue'
import PerformanceWorkflowStageIcon from '@/views/performance/PerformanceWorkflowStageIcon.vue'

const props = withDefaults(defineProps<{
  nodes: PerformanceWorkflowNode[]
  modelValue?: Record<string, PerformanceProjectNodeTime>
  loading?: boolean
  error?: string
}>(), { modelValue: () => ({}), loading: false, error: '' })
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, PerformanceProjectNodeTime>] }>()
const draft = ref<Record<string, PerformanceProjectNodeTime>>(cloneTimes(props.modelValue))
const lastEmitted = ref(JSON.stringify(draft.value))

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
function ensureAllNodes() { props.nodes.forEach(ensureNode) }
function timeFor(node: PerformanceWorkflowNode) { ensureNode(node); return draft.value[nodeKey(node)] }
watch(() => props.nodes, ensureAllNodes, { deep: true, immediate: true })
watch(() => props.modelValue, value => { const next = JSON.stringify(value || {}); if (next !== lastEmitted.value) { draft.value = cloneTimes(value); ensureAllNodes(); lastEmitted.value = JSON.stringify(draft.value) } }, { deep: true })
watch(draft, value => { const next = JSON.stringify(value); if (next === lastEmitted.value) return; lastEmitted.value = next; emit('update:modelValue', cloneTimes(value)) }, { deep: true })
</script>

<style scoped>
.project-time-settings{display:grid;width:100%;gap:16px}.time-state{padding:32px;color:#646a73;text-align:center}.time-state--error{color:#f04438}.time-node-card{width:100%;box-sizing:border-box;padding:24px 32px;border-radius:8px;background:#fff;box-shadow:0 1px 4px rgba(31,35,41,.05)}.time-node-header{display:flex;align-items:center;gap:12px}.time-node-icon{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:8px;background:#f5f6f7;color:#3370ff}.time-node-icon :deep(.stage-icon){width:24px;height:24px}.time-node-header h2{margin:0;color:#1f2329;font-size:16px;line-height:24px}.time-fields{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0 0 52px}.time-fields label{display:grid;gap:8px;min-width:0;color:#1f2329;font-size:14px;line-height:22px}.time-fields label span{font-weight:600}.time-fields label i{color:#f04438;font-style:normal}.time-fields--result-view{grid-template-columns:minmax(0,1fr);gap:0}.time-fields--result-view .time-help{margin:4px 0 20px;color:#646a73;font-size:14px;line-height:22px}.time-fields--single{grid-template-columns:minmax(0,1fr)}
@media (max-width:800px){.time-node-card{padding:20px}.time-fields{grid-template-columns:1fr;margin-left:0}}
</style>
