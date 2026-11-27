<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { PerformanceCalibrationCompletion, PerformanceDistributionTips } from '@/api/performance'
import { performanceCalibrationApi, type PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
import { employeeSwitchEpoch } from '@/stores/identitySwitch'
import UiButton from '@/components/ui/UiButton.vue'
import UiDialogShell from '@/components/ui/UiDialogShell.vue'
import PerformanceDistributionTipsPanel from '../PerformanceDistributionTips.vue'
import PerformanceConfirmDialog from '../PerformanceConfirmDialog.vue'
const props = defineProps<{ scope: PerformanceCalibrationTaskScope }>()
const emit = defineEmits<{ completed: []; busy: [value: boolean] }>()
const visible = ref(false), loading = ref(false), error = ref(''), stale = ref(false)
const preview = ref<PerformanceCalibrationCompletion | null>(null)
const tips = ref<PerformanceDistributionTips | null>(null)
let sequence = 0
const entryDisabled = computed(() => props.scope.read_only || props.scope.status === 'completed' || loading.value)
const blocked = computed(() => preview.value?.blocked_reason === 'CALIBRATION_DISTRIBUTION_VIOLATED' || Boolean(tips.value?.rules.some(rule => rule.conditions.some(condition => condition.control_mode === 'HARD' && condition.violated))))
const allowed = computed(() => Boolean(preview.value?.can_complete) && !blocked.value && !stale.value)
const hasSoftViolation = computed(() => Boolean(tips.value?.rules.some(rule => rule.conditions.some(condition => condition.control_mode === 'SOFT' && condition.violated))))
const needsInspect = computed(() => stale.value || !preview.value)
async function inspect() {
  const request = ++sequence, scope = props.scope
  loading.value = true; error.value = ''; stale.value = false; preview.value = null; tips.value = null
  try {
    const [result, distribution] = await Promise.all([performanceCalibrationApi.preview(scope), performanceCalibrationApi.distribution(scope)])
    if (request !== sequence) return
    preview.value = result; tips.value = distribution
    if (!result.can_complete && !blocked.value) error.value = result.completed ? '当前任务已完成，请返回刷新。' : '当前校准任务尚未开始。'
  } catch (cause: any) {
    if (request === sequence) error.value = cause?.response?.status === 403 ? '你没有完成此任务的权限。' : '校准预检失败，请重试。'
  } finally { if (request === sequence) loading.value = false }
}
function open() { visible.value = true; inspect() }
async function confirm() {
  if (loading.value || !allowed.value || !preview.value) return
  const request = ++sequence, scope = props.scope
  loading.value = true; error.value = ''
  try {
    const result = await performanceCalibrationApi.confirm(scope, preview.value.scope_version)
    if (request !== sequence) return
    if (!result.completed) { error.value = '任务尚未完成，请重新预检。'; stale.value = true; return }
    visible.value = false; emit('completed')
  } catch (cause: any) {
    if (request !== sequence) return
    stale.value = cause?.response?.status === 409
    error.value = stale.value ? '校准范围或结果已变化，请重新预检后确认。' : cause?.response?.status === 403 ? '你没有完成此任务的权限。' : '完成校准失败，请重试。'
  } finally { if (request === sequence) loading.value = false }
}
watch(loading, value => emit('busy', value), { flush: 'sync' })
watch([() => props.scope, employeeSwitchEpoch], () => { ++sequence; visible.value = false; loading.value = false; preview.value = null; tips.value = null }, { flush: 'sync' })
onBeforeUnmount(() => { ++sequence; emit('busy', false) })
</script>
<template>
  <UiButton variant="primary" :disabled="entryDisabled" @click="open">{{ scope.status === 'completed' ? '已完成校准' : '完成校准' }}</UiButton>
  <PerformanceConfirmDialog v-if="!blocked" v-model="visible" appearance="calibration-completion" message="确定要完成校准嘛" confirm-variant="primary" cancel-text="取消" :confirm-text="needsInspect ? '重新预检' : '确定'" :loading="loading" :confirm-disabled="!needsInspect && !allowed" :error-message="error" @confirm="needsInspect ? inspect() : confirm()">
    <template #check>
      <p v-if="loading" role="status">正在校验当前任务…</p>
      <p v-if="preview?.missing_result_count">有{{ preview.missing_result_count }}名员工没有绩效结果</p>
      <PerformanceDistributionTipsPanel v-if="preview && hasSoftViolation" :tips="tips" />
    </template>
  </PerformanceConfirmDialog>
  <UiDialogShell v-else v-model="visible" title="不符合强制分布规则，请调整后重新提交" :loading="loading" width="var(--performance-calibration-blocked-dialog-width)">
    <PerformanceDistributionTipsPanel :tips="tips" />
    <template #footer><div class="calibration-completion__actions">
      <UiButton variant="primary" :disabled="loading" @click="visible = false">继续校准</UiButton>
    </div></template>
  </UiDialogShell>
</template>
<style scoped>
.calibration-completion__actions { display: flex; justify-content: flex-end; gap: var(--spacing-3); }
</style>
