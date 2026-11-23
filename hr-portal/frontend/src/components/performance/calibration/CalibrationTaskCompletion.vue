<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { PerformanceCalibrationCompletion, PerformanceDistributionTips } from '@/api/performance'
import { performanceCalibrationApi, type PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
import { employeeSwitchEpoch } from '@/stores/identitySwitch'
import UiButton from '@/components/ui/UiButton.vue'
import UiDialogShell from '@/components/ui/UiDialogShell.vue'
import PerformanceDistributionTipsPanel from '../PerformanceDistributionTips.vue'
const props = defineProps<{ scope: PerformanceCalibrationTaskScope }>()
const emit = defineEmits<{ completed: []; busy: [value: boolean] }>()
const visible = ref(false), loading = ref(false), error = ref(''), stale = ref(false)
const preview = ref<PerformanceCalibrationCompletion | null>(null)
const tips = ref<PerformanceDistributionTips | null>(null)
let sequence = 0
const entryDisabled = computed(() => props.scope.read_only || props.scope.status === 'completed' || loading.value)
const blocked = computed(() => preview.value?.blocked_reason === 'CALIBRATION_DISTRIBUTION_VIOLATED' || Boolean(tips.value?.rules.some(rule => rule.conditions.some(condition => condition.control_mode === 'HARD' && condition.violated))))
const allowed = computed(() => Boolean(preview.value?.can_complete) && !blocked.value && !stale.value)
const title = computed(() => blocked.value ? '不符合强制分布规则，请调整后重新提交' : '确定要完成当前校准任务吗？')
async function inspect() {
  const request = ++sequence, scope = props.scope
  loading.value = true; error.value = ''; stale.value = false; preview.value = null; tips.value = null
  try {
    const [result, distribution] = await Promise.all([performanceCalibrationApi.preview(scope), performanceCalibrationApi.distribution(scope)])
    if (request !== sequence) return
    preview.value = result; tips.value = distribution
    if (!result.can_complete && !blocked.value) error.value = result.completed ? '当前任务已完成，请返回刷新。' : '当前任务不允许完成，请检查时间及任务权限。'
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
  <UiDialogShell v-model="visible" :title="title" :loading="loading" width="var(--performance-calibration-blocked-dialog-width)">
    <p v-if="loading" role="status">正在校验当前任务…</p>
    <p v-if="error" role="alert" class="calibration-completion__error">{{ error }}</p>
    <template v-if="preview && !blocked">
      <p>仅完成当前校准任务，其他项目、阶段和规则任务保持原状态。</p>
      <p v-if="preview.missing_result_count">当前范围有 {{ preview.missing_result_count }} 人尚无校准结果，仍可确认完成。</p>
      <p v-if="preview.has_original_tasks === false">本次仅完成你的授权任务，原校准人仍需完成父任务。</p>
      <p v-else>完成后将锁定该范围终评，校准窗口内仍可继续调整校准结果。</p>
    </template>
    <PerformanceDistributionTipsPanel v-if="blocked" :tips="tips" />
    <template #footer><div class="calibration-completion__actions">
      <UiButton v-if="!blocked" :disabled="loading" @click="visible = false">取消</UiButton>
      <UiButton v-if="blocked" variant="primary" :disabled="loading" @click="visible = false">继续校准</UiButton>
      <UiButton v-else-if="stale || !preview" variant="primary" :disabled="loading" @click="inspect">重新预检</UiButton>
      <UiButton v-else variant="primary" :disabled="loading || !allowed" @click="confirm">确定</UiButton>
    </div></template>
  </UiDialogShell>
</template>
<style scoped>
.calibration-completion__error { color: var(--color-danger); }
.calibration-completion__actions { display: flex; justify-content: flex-end; gap: var(--spacing-3); }
</style>
