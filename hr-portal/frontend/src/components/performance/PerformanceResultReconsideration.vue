<template>
  <div v-if="loading" class="reconsideration-state" role="status">正在加载复议状态…</div>
  <div v-else-if="loadError" class="reconsideration-state" role="alert">{{ loadError }} <UiButton variant="link" @click="emit('retry')">重试</UiButton></div>
  <section v-else-if="status?.submitted_at && !status.withdrawn_at" class="reconsideration-banner" aria-label="复议状态">
    <span class="reconsideration-banner__icon" aria-hidden="true">●</span>
    <div class="reconsideration-banner__main"><div class="reconsideration-banner__heading"><strong>复议中</strong><div class="reconsideration-banner__actions"><UiButton class="reconsideration-banner__action" :disabled="!status.can_edit || expired || saving" @click="open(true)"><svg class="reconsideration-banner__action-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" data-icon="EditOutlined" aria-hidden="true"><path d="m17.57 7.244-.006-.006.37-.37a1 1 0 0 0 .001-1.412l-3.434-3.453-.002-.002a1 1 0 0 0-1.414 0l-.705.706.01.01L2 13.186V17a1 1 0 0 0 1 1h3.814L17.57 7.244Zm-3.273.389-2.015-2.015 1.487-1.515 2.023 2.034-1.495 1.496Zm-3.415-.587 2.002 2.002-6.913 6.92h-.004l-1.934-1.935v-.003l6.849-6.984ZM3 20a1 1 0 1 0 0 2h18a1 1 0 1 0 0-2H3Z" fill="currentColor" /></svg>编辑</UiButton><UiButton class="reconsideration-banner__action" :disabled="!status.can_withdraw || saving" @click="openWithdraw"><svg class="reconsideration-banner__action-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" data-icon="RedoOutlined" aria-hidden="true"><path d="M15.293 2.293a1 1 0 0 0 0 1.414L18.586 7H9.5a7.5 7.5 0 0 0 0 15H13a1 1 0 1 0 0-2H9.5a5.5 5.5 0 1 1 0-11h9.086l-3.293 3.293a1 1 0 0 0 1.414 1.414l5-5a1 1 0 0 0 0-1.414l-5-5a1 1 0 0 0-1.414 0Z" fill="currentColor" /></svg>撤回</UiButton></div></div><p>复议已提交，{{ status.handler_label || '配置的处理人' }}将收到待办并跟进，请耐心等待结果。</p></div>
  </section>
  <PerformanceDialogShell v-model="editorOpen" :title="editing ? '编辑复议' : '发起复议'" width="var(--performance-dialog-md-width)" :loading="saving" dialog-class="performance-dialog--auto-header" @close="error = ''">
    <template #description><template v-if="editing">保存后将更新复议理由，原有处理待办保持不变</template><template v-else>确定发起复议后，{{ status?.handler_label || '配置的处理人' }}会收到通知并负责跟进</template></template>
    <div class="reconsideration-form"><PerformancePromptNotice type="info" multiline>{{ status?.prompt }}</PerformancePromptNotice><PerformanceRichTextEditor v-model="reason" variant="task-entry" :readonly="saving" :placeholder="status?.instruction || '请输入复议理由'" /><p v-if="error" class="reconsideration-error" role="alert">{{ error }}</p><p v-else-if="expired" class="reconsideration-error" role="alert">复议截止时间已过，无法保存。</p></div>
    <template #footer><div class="reconsideration-footer"><UiButton :disabled="saving" @click="editorOpen = false">取消</UiButton><UiButton variant="primary" :loading="saving" :disabled="!hasReason || expired" @click="save">确定</UiButton></div></template>
  </PerformanceDialogShell>
  <PerformanceConfirmDialog v-model="withdrawOpen" message="是否确定撤回？" confirm-text="确定" cancel-text="取消" confirm-variant="primary" :loading="saving" :error-message="error" @confirm="withdraw" />
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { projectManagementApi, type PerformanceReconsiderationStatus } from '@/api/performance'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformancePromptNotice from './PerformancePromptNotice.vue'
import PerformanceRichTextEditor from './PerformanceRichTextEditor.vue'
import PerformanceConfirmDialog from './PerformanceConfirmDialog.vue'
import UiButton from '../ui/UiButton.vue'
const props = defineProps<{ projectId: number; status: PerformanceReconsiderationStatus | null; expired: boolean; loading: boolean; loadError: string }>()
const emit = defineEmits<{ updated: [status: PerformanceReconsiderationStatus]; retry: []; busy: [value: boolean] }>()
const editorOpen = ref(false)
const withdrawOpen = ref(false)
const reason = ref('')
const editing = ref(false)
const saving = ref(false)
const error = ref('')
let alive = true
let version: number | null = null
onBeforeUnmount(() => { alive = false })
const hasReason = computed(() => {
  const template = document.createElement('template')
  template.innerHTML = reason.value
  return Boolean(template.content.textContent?.replace(/[\s​-‍﻿]/g, ''))
})
function openWithdraw() { version = props.status?.version ?? null; withdrawOpen.value = true; error.value = '' }
function open(edit = false) {
  if (!props.status || props.expired || saving.value || !(edit ? props.status.can_edit : props.status.can_submit)) return
  editing.value = edit
  reason.value = edit ? props.status.reason || '' : ''
  version = props.status.version
  error.value = ''
  editorOpen.value = true
}
function failureMessage(cause: any) {
  const code = cause?.response?.data?.detail
  if (code === 'VERSION_CONFLICT') return '复议状态已更新，请核对最新状态后重新打开编辑或撤回。当前输入已保留。'
  if (code === 'RECONSIDERATION_WINDOW_CLOSED') return '复议截止时间已过，无法发起或编辑；已提交的复议仍可撤回。'
  if (code === 'RECONSIDERATION_ALREADY_SUBMITTED') return '已存在复议，请刷新后编辑或撤回。'
  if (cause?.response?.status === 422) return '请填写有效的复议理由，正文最多 1500 字。'
  return '操作失败，请稍后重试。'
}
async function perform(action: () => Promise<PerformanceReconsiderationStatus>, message: string) {
  if (saving.value) return
  saving.value = true
  emit('busy', true)
  error.value = ''
  try {
    const value = await action()
    if (!alive) return
    emit('updated', value)
    editorOpen.value = false
    withdrawOpen.value = false
    ElMessage.success(message)
  } catch (cause) {
    if (!alive) return
    error.value = failureMessage(cause)
    try { const value = await projectManagementApi.resultReconsideration(props.projectId); if (alive) emit('updated', value) } catch { /* 保留当前输入和错误，允许重试。 */ }
  } finally { if (alive) { saving.value = false; emit('busy', false) } }
}
async function save() {
  if (!hasReason.value || props.expired || !props.status) return
  await perform(() => editing.value
    ? projectManagementApi.editResultReconsideration(props.projectId, reason.value, version!)
    : projectManagementApi.submitResultReconsideration(props.projectId, reason.value, version), editing.value ? '复议已更新' : '复议已提交')
}
async function withdraw() {
  if (!props.status?.can_withdraw || version == null) return
  await perform(() => projectManagementApi.withdrawResultReconsideration(props.projectId, version!), '复议已撤回')
}
defineExpose({ open })
</script>
<style scoped>
.reconsideration-state{margin-bottom:var(--spacing-4);color:var(--color-text-secondary)}.reconsideration-banner{display:flex;gap:var(--spacing-2);padding:10px 16px;margin-bottom:var(--spacing-6);border-radius:var(--radius-md);background:var(--performance-tag-blue-background);font:400 14px/22px var(--font-sans);color:var(--color-text-primary)}.reconsideration-banner__icon{flex:none;color:var(--color-primary);font-size:16px;line-height:22px}.reconsideration-banner__main{flex:1;min-width:0}.reconsideration-banner__heading{display:flex;justify-content:space-between;gap:16px;margin-bottom:4px}.reconsideration-banner__heading strong{font-weight:600}.reconsideration-banner__main p{margin:0;overflow-wrap:anywhere}.reconsideration-banner__actions{display:flex;gap:8px;flex:none}.reconsideration-banner__action{height:24px;padding:0 18px;font-size:12px;border:0;color:var(--color-primary-active);background:var(--color-bg-card)}.reconsideration-banner__action-icon{width:12px;height:12px;flex:none;margin-right:4px}.reconsideration-banner__action:disabled{color:var(--color-text-placeholder);opacity:1}.reconsideration-form{display:grid;gap:12px;min-width:0}.reconsideration-error{margin:0;color:var(--color-danger)}.reconsideration-footer{display:flex;justify-content:flex-end;gap:12px}@media(max-width:600px){.reconsideration-banner__heading{flex-wrap:wrap}.reconsideration-banner__actions{margin-left:auto}}
</style>
