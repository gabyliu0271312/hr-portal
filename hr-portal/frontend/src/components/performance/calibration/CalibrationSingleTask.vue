<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { PerformanceCalibrationCompletion, PerformanceReviewMemberContext, PerformanceReviewNode } from '@/api/performance'
import { calibrationReviewNode, performanceCalibrationApi, type PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
import PerformanceReviewContent from '../PerformanceReviewContent.vue'
import PerformanceConfirmDialog from '../PerformanceConfirmDialog.vue'
import UiButton from '@/components/ui/UiButton.vue'
const props = defineProps<{ scope: PerformanceCalibrationTaskScope; cycleId: number }>()
const emit = defineEmits<{
  completed: []
  'open-member': [payload: { node: PerformanceReviewNode; member: PerformanceReviewMemberContext }]
  'remind-evaluate': [payload: { node: PerformanceReviewNode; member: PerformanceReviewMemberContext; pendingCount: number }]
}>()
const node = computed(() => calibrationReviewNode(props.scope))
const preview = ref<PerformanceCalibrationCompletion | null>(null), visible = ref(false), busy = ref(false), error = ref('')
let sequence = 0
const description = computed(() => `${preview.value?.missing_result_count ? `当前有 ${preview.value.missing_result_count} 名被评估人尚无绩效结果，仍可确定完成校准。` : ''}${preview.value?.has_original_tasks === false ? '本次仅完成你的授权任务，原校准人仍需完成父任务。' : '完成后，终评结果将无法修改，'}校准内容仍可在允许的期限内继续编辑。`)
async function inspect(open = false) {
  const request = ++sequence
  if (open) busy.value = true
  error.value = ''
  try {
    const result = await performanceCalibrationApi.preview(props.scope)
    if (request !== sequence) return
    preview.value = result
    if (open) {
      if (result.blocked_reason === 'CALIBRATION_DISTRIBUTION_VIOLATED') ElMessage.error('当前任务尚未满足强制分布规则，请调整后重新确认')
      visible.value = !result.completed && result.can_complete
    }
  } catch { if (request === sequence) error.value = '校准完成状态加载失败，请重试' }
  finally { if (request === sequence) busy.value = false }
}
async function confirm() {
  if (busy.value || !preview.value) return
  const request = ++sequence
  busy.value = true
  try {
    const result = await performanceCalibrationApi.confirm(props.scope, preview.value.scope_version)
    if (request !== sequence) return
    preview.value = result
    visible.value = false
    emit('completed')
    ElMessage.success('已完成校准')
  } catch (cause: any) {
    if (request !== sequence) return
    error.value = cause?.response?.data?.detail === 'CALIBRATION_DISTRIBUTION_VIOLATED' ? '当前任务尚未满足强制分布规则，请调整后重新确认' : cause?.response?.status === 409 ? '校准范围或规则已变化，请取消并重新确认' : '完成校准失败，请重试'
  } finally { if (request === sequence) busy.value = false }
}
watch(() => props.scope, () => { ++sequence; visible.value = false; preview.value = null; busy.value = false; void inspect() }, { immediate: true })
onBeforeUnmount(() => { ++sequence })
</script>
<template>
  <PerformanceReviewContent :loading="false" error="" template-name="" :node="node" :project-id="scope.project_id" :member-preference-scope="{ cycle_ref: cycleId, scene: 'evaluation', project_id: scope.project_id, node_id: scope.node_id }" @open-member="emit('open-member', $event)" @remind-evaluate="emit('remind-evaluate', $event)">
    <template #heading-actions>
      <UiButton variant="primary" :loading="busy" :disabled="scope.read_only || scope.status === 'completed' || preview?.completed || busy || (preview?.can_complete === false && preview?.blocked_reason !== 'CALIBRATION_DISTRIBUTION_VIOLATED')" @click="inspect(true)">{{ scope.status === 'completed' || preview?.completed ? '已完成校准' : '完成校准' }}</UiButton>
      <span v-if="error && !visible" role="alert">{{ error }} <UiButton variant="text" @click="inspect()">重试</UiButton></span>
    </template>
  </PerformanceReviewContent>
  <PerformanceConfirmDialog v-model="visible" appearance="calibration-completion" message="确定要完成校准吗？" :description="description" cancel-text="取消" confirm-text="确定" confirm-variant="primary" :loading="busy" :error-message="error" @confirm="confirm" />
</template>
