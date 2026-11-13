<template>
  <PerformanceConfirmDialog
    v-if="context"
    v-model="confirmOpen"
    appearance="submit"
    confirm-variant="primary"
    message="确定催办吗？"
    :description="targetLoading ? '正在确认催办对象…' : targetError || `确定催办后，会立即向${recipient}发送飞书通知`"
    cancel-text="取消"
    confirm-text="确定"
    :loading="sending"
    :confirm-disabled="!hasTarget"
    @confirm="confirmReminder"
  >
    <template #icon><InfoFilledIcon /></template>
    <template #check>
      <PerformanceCheckbox v-model="skipRecentlyReminded" label="6 小时内已被催办过该环节的人员不再发送通知" :disabled="sending" />
    </template>
    <template #footer-left>
      <button ref="previewAnchor" class="performance-member-reminder-dialog__preview-trigger" type="button" :disabled="!hasTarget || sending" @mouseenter="openPreview" @mouseleave="schedulePreviewClose" @focusin="openPreview" @focusout="schedulePreviewClose" @click="openPreview">预览通知</button>
      <PerformancePopover role="dialog" aria-label="通知预览" name="performance-member-reminder-preview" :visible="previewOpen" :anchor="previewAnchor" :width="380" :gap="10" :viewport-margin="16" @close="closePreview" @mouseenter="keepPreviewOpen" @mouseleave="schedulePreviewClose">
        <label v-if="previewTargets.length > 1" class="performance-member-reminder-dialog__preview-state">通知环节
          <select v-model.number="previewTaskId" aria-label="预览通知环节" @change="reloadPreview"><option v-for="task in previewTargets" :key="task.task_id" :value="task.task_id">{{ task.node_name }}</option></select>
        </label>
        <div v-if="previewLoading" class="performance-member-reminder-dialog__preview-state" role="status">正在加载通知预览…</div>
        <PerformanceReminderPreviewCard v-else-if="previewData" :preview="previewData" />
      </PerformancePopover>
    </template>
  </PerformanceConfirmDialog>
  <PerformanceConfirmDialog v-model="resultOpen" :message="resultMessage" :description="resultDescription" :show-cancel="false" confirm-text="确定" confirm-variant="primary" @confirm="resultOpen = false">
    <template #icon><YesOutlinedIcon v-if="resultSuccess" class="performance-member-reminder-dialog__success-icon" /><InfoFilledIcon v-else /></template>
  </PerformanceConfirmDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { employeeSwitchEpoch } from '@/stores/identitySwitch'
import { projectManagementApi, type PerformanceMemberReminderTask, type PerformanceReminderPreview, type PerformanceReminderResult } from '@/api/performance'
import PerformanceConfirmDialog from './PerformanceConfirmDialog.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformancePopover from './PerformancePopover.vue'
import PerformanceReminderPreviewCard from './PerformanceReminderPreviewCard.vue'
import InfoFilledIcon from './InfoFilledIcon.vue'
import YesOutlinedIcon from './YesOutlinedIcon.vue'
import type { ReminderContext } from './performanceReminder'

const props = defineProps<{ modelValue: boolean; context: ReminderContext | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const context = computed(() => props.context)
const finished = ref(false)
const confirmOpen = computed({ get: () => props.modelValue && !finished.value, set: value => { if (!value) { finished.value = true; closePreview(); emit('update:modelValue', false) } } })
const targets = ref<Array<Pick<PerformanceMemberReminderTask, 'task_id' | 'node_id' | 'node_name' | 'reminder_target'>>>([])
const targetLoading = ref(false)
const targetError = ref('')
const recipient = computed(() => context.value?.targetKind === 'reviewer_360' ? '该员工尚未完成评估的360°评估人' : context.value?.reminderTarget || previewData.value?.reminder_target || [...new Set(targets.value.map(task => task.reminder_target).filter(Boolean))].join('、') || '催办对象')
const hasTarget = computed(() => !targetLoading.value && !targetError.value && targets.value.length > 0)
const previewTargets = computed(() => [...new Map(targets.value.map(task => [task.node_id, task])).values()])
const previewTaskId = ref(0)
const skipRecentlyReminded = ref(false)
const sending = ref(false)
const resultOpen = ref(false)
const resultSuccess = ref(false)
const resultMessage = ref('')
const resultDescription = ref('')
const previewAnchor = ref<HTMLElement | null>(null)
const previewOpen = ref(false)
const previewLoading = ref(false)
const previewData = ref<PerformanceReminderPreview | null>(null)
let previewCloseTimer: ReturnType<typeof setTimeout> | null = null
let previewRequest = 0
let generation = 0
let disposed = false

function clearPreviewTimer() {
  if (previewCloseTimer !== null) clearTimeout(previewCloseTimer)
  previewCloseTimer = null
}
function keepPreviewOpen() { clearPreviewTimer() }
function closePreview() {
  clearPreviewTimer()
  previewRequest++
  previewOpen.value = false
  previewLoading.value = false
  previewData.value = null
}
function schedulePreviewClose() { clearPreviewTimer(); previewCloseTimer = setTimeout(closePreview, 120) }
async function loadTargets(epoch: number) {
  const target = context.value
  if (!target || !props.modelValue) return
  targetLoading.value = true
  targetError.value = ''
  try {
    if (target.targetKind === 'reviewer_360') {
      const result = await projectManagementApi.memberReminderTasks(target.projectId, target.employeeNo || '', {
        source_task_id: target.sourceTaskId, target_kind: 'reviewer_360', node_id: target.nodeId || undefined, task_id: target.targetTaskId,
      })
      if (epoch !== generation || disposed) return
      targets.value = result.can_remind ? result.items.filter(item => item.selectable && item.project_id === target.projectId && item.employee_no === target.employeeNo && (!target.nodeId || item.node_id === target.nodeId) && (!target.targetTaskId || item.task_id === target.targetTaskId)) : []
    } else if (target.nodeId && target.targetTaskId) {
      targets.value = [{ task_id: target.targetTaskId, node_id: target.nodeId, node_name: target.title, reminder_target: target.reminderTarget }]
    }
    previewTaskId.value = targets.value[0]?.task_id || 0
    if (!targets.value.length) targetError.value = '当前没有可催办的未完成任务'
  } catch {
    if (epoch === generation && !disposed) { targetError.value = '催办对象加载失败，请关闭后重试'; targets.value = [] }
  } finally { if (epoch === generation && !disposed) targetLoading.value = false }
}
async function reloadPreview() { closePreview(); await openPreview() }
async function openPreview() {
  clearPreviewTimer()
  if (!confirmOpen.value || !hasTarget.value || sending.value) return
  previewOpen.value = true
  if (previewData.value || previewLoading.value) return
  const target = targets.value.find(item => item.task_id === previewTaskId.value)
  const scope = context.value
  if (!target || !scope) return
  const request = ++previewRequest
  previewLoading.value = true
  try {
    const preview = await projectManagementApi.memberReminderPreview(scope.projectId, scope.employeeNo || '', {
      node_id: target.node_id, task_id: target.task_id, ...(scope.sourceTaskId ? { source_task_id: scope.sourceTaskId } : {}),
    })
    if (request === previewRequest && !disposed) previewData.value = preview
  } catch {
    if (request === previewRequest && !disposed) { closePreview(); ElMessage.info('通知预览暂不可用，请稍后重试') }
  } finally { if (request === previewRequest && !disposed) previewLoading.value = false }
}
function resultFrom(response: PerformanceReminderResult) {
  const delivered = ['success', 'partial_success'].includes(response.delivery_status) ? response.accepted_task_ids.length : 0
  const skipped = response.skipped_task_ids.length
  const failed = response.failed_task_ids?.length || 0
  const preview = response.preview_task_ids?.length || (response.delivery_status === 'preview_only' ? 1 : 0)
  resultSuccess.value = delivered > 0 && !failed && !preview && !skipped
  resultMessage.value = resultSuccess.value ? '催办成功' : delivered ? '催办部分发送成功' : skipped && !failed && !preview ? '本次催办已跳过' : preview ? '催办未发送' : '催办发送失败'
  resultDescription.value = resultSuccess.value ? '' : `已发送 ${delivered} 条，跳过 ${skipped} 条${failed ? `，失败 ${failed} 条` : ''}${preview ? `，未发送 ${preview} 条` : ''}。`
}
async function confirmReminder() {
  const scope = context.value
  if (!confirmOpen.value || sending.value || !hasTarget.value || !scope?.employeeNo) return
  const epoch = generation
  const submitted = [...targets.value]
  sending.value = true
  closePreview()
  try {
    let response: PerformanceReminderResult
    if (scope.targetKind === 'reviewer_360') {
      response = await projectManagementApi.memberRemindBatch(scope.projectId, scope.employeeNo, {
        source_task_id: scope.sourceTaskId, node_id: scope.nodeId || undefined, target_kind: 'reviewer_360',
        task_ids: submitted.map(item => item.task_id), skip_recently_reminded: skipRecentlyReminded.value,
      })
    } else {
      response = await projectManagementApi.memberRemind(scope.projectId, scope.employeeNo, {
        node_id: submitted[0]!.node_id, task_id: submitted[0]!.task_id,
        ...(scope.sourceTaskId ? { source_task_id: scope.sourceTaskId } : {}), skip_recently_reminded: skipRecentlyReminded.value,
      })
    }
    if (disposed || epoch !== generation) return
    resultFrom(response)
  } catch {
    if (disposed || epoch !== generation) return
    resultSuccess.value = false
    resultMessage.value = '催办请求提交失败'
    resultDescription.value = '发送结果未确认，请核对通知记录后再重试。'
  } finally { if (!disposed && epoch === generation) sending.value = false }
  if (disposed || epoch !== generation) return
  finished.value = true
  emit('update:modelValue', false)
  await nextTick()
  if (!disposed && epoch === generation) resultOpen.value = true
}
watch(() => [props.modelValue, props.context], ([visible]) => {
  closePreview()
  skipRecentlyReminded.value = false
  if (!visible && finished.value && !sending.value) return
  generation++
  if (!visible) { sending.value = false; return }
  finished.value = false
  resultOpen.value = false
  sending.value = false
  targets.value = []
  void loadTargets(generation)
}, { immediate: true, deep: true })
watch(employeeSwitchEpoch, () => { generation++; closePreview(); resultOpen.value = false; finished.value = true; emit('update:modelValue', false) })
onBeforeUnmount(() => { disposed = true; generation++; closePreview() })
</script>

<style scoped>
.performance-member-reminder-dialog__preview-trigger { display: inline-flex; align-items: center; min-height: 22px; padding:0; border:0; background:transparent; color: var(--color-primary); cursor: pointer; font:inherit; }
.performance-member-reminder-dialog__preview-trigger:hover, .performance-member-reminder-dialog__preview-trigger:focus-visible { color: var(--color-primary-hover); text-decoration: underline; }
.performance-member-reminder-dialog__preview-trigger:disabled { opacity:.5; cursor:not-allowed; }
.performance-member-reminder-dialog__preview-state { display:block; padding: 12px; color: var(--color-text-secondary); }
.performance-member-reminder-dialog__preview-state select { max-width:100%; font:inherit; }
.performance-member-reminder-dialog__success-icon { color: var(--color-success); }
</style>
