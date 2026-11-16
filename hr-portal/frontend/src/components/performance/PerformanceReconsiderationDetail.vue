<template>
  <section class="reconsideration-detail">
    <div v-if="detail.history.length" class="reconsideration-detail__history-link"><UiButton variant="text" @click="historyOpen = true">变更记录（{{ detail.history.length }}）</UiButton></div>
    <PerformancePromptNotice v-if="!detail.submitted_at" type="info" multiline>
      <strong>复议处理中</strong>
      <div v-for="handler in detail.handlers" :key="`${handler.task_id}:${handler.role_key}:${handler.employee_no}`" class="reconsideration-detail__handler">
        <span>处理人：{{ handler.role_label }} {{ handler.display_name }}</span>
        <PerformanceReminderButton v-if="handler.can_remind" variant="text" @click="emit('remind', handler.task_id)" />
      </div>
      <div v-if="detail.deadline_at">复议处理截止时间：{{ formatDate(detail.deadline_at) }}</div>
    </PerformancePromptNotice>
    <PerformanceReviewCompletionNotice v-else :editable="editable" :task-id="detail.edit_task_id ?? undefined" task-kind="result_reconsideration" :employee-no="employeeNo" :message="completionMessage" variant="evaluation-drawer" @edit="choice => emit('edit', choice)" />
    <section v-if="detail.submitted_at && detail.adjustments.length" class="reconsideration-detail__section" aria-label="结果调整">
      <PerformanceAssessmentPreviewHeader name="结果调整" heading-tag="h3" />
      <PerformanceReconsiderationAdjustments :adjustments="detail.adjustments" :sections="detail.form_schema" />
    </section>
    <section class="reconsideration-detail__section"><h3>复议理由</h3><PerformanceReadonlyAnswer :field="reasonField" :value="detail.reason" /></section>
    <section v-if="detail.submitted_at && detail.form_schema.length" class="reconsideration-detail__section"><h3>绩效结果</h3><PerformanceTemplateRenderer mode="readonly" :sections="detail.form_schema" :answers="detail.answers" /></section>
    <PerformanceDialogShell v-model="historyOpen" title="变更记录" width="800px" dialog-class="reconsideration-history-dialog" overlay-class="reconsideration-history-overlay">
      <details v-for="(item, index) in detail.history" :key="`${item.submitted_at}:${index}`" :open="index === 0" class="reconsideration-detail__history">
        <summary><svg class="reconsideration-detail__history-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18.627 11.22a1 1 0 0 1 0 1.56L8.291 21.084a1 1 0 0 1-1.626-.78V3.696a1 1 0 0 1 1.626-.78l10.335 8.305Z" fill="currentColor" /></svg><span class="reconsideration-detail__history-creator"><PerformanceMemberIdentity :display-name="item.display_name" size="sm" /><i aria-hidden="true"></i><span class="reconsideration-detail__history-node">{{ nodeName }}</span></span><span class="reconsideration-detail__history-time">{{ formatDate(item.submitted_at) }}</span></summary>
        <div class="reconsideration-detail__history-content"><strong>变更内容</strong><PerformanceReconsiderationAdjustments v-if="item.adjustments.length" history :adjustments="item.adjustments" :sections="detail.form_schema" /><p v-else>本次提交未调整绩效结果</p></div>
      </details>
      <template #footer><UiButton variant="primary" @click="historyOpen = false">确定</UiButton></template>
    </PerformanceDialogShell>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { PerformanceReconsiderationDetail, PerformanceTemplateField } from '@/api/performance'
import UiButton from '../ui/UiButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceMemberIdentity from './PerformanceMemberIdentity.vue'
import PerformancePromptNotice from './PerformancePromptNotice.vue'
import PerformanceReadonlyAnswer from './PerformanceReadonlyAnswer.vue'
import PerformanceReminderButton from './PerformanceReminderButton.vue'
import PerformanceReviewCompletionNotice from './PerformanceReviewCompletionNotice.vue'
import PerformanceTemplateRenderer from './PerformanceTemplateRenderer.vue'
import PerformanceAssessmentPreviewHeader from './PerformanceAssessmentPreviewHeader.vue'
import PerformanceReconsiderationAdjustments from './PerformanceReconsiderationAdjustments.vue'
const props = defineProps<{ detail: PerformanceReconsiderationDetail; employeeNo: string; nodeName: string }>()
const emit = defineEmits<{ edit: [choice?: 'use' | 'discard']; remind: [taskId: number] }>()
const historyOpen = ref(false)
const clock = ref(Date.now())
const timer = window.setInterval(() => { clock.value = Date.now() }, 1000)
onBeforeUnmount(() => window.clearInterval(timer))
const expired = computed(() => Boolean(props.detail.deadline_at && Date.parse(props.detail.deadline_at) < clock.value))
const editable = computed(() => props.detail.can_edit && !expired.value && props.detail.edit_task_id != null)
const completionMessage = computed(() => {
  const detail = props.detail
  const prefix = `以下内容由 ${detail.submitted_by || '处理人'} 在 ${formatDate(detail.submitted_at)} 提交`
  if (!detail.deadline_at) return prefix
  if (expired.value) return `${prefix}，该环节已在 ${formatDate(detail.deadline_at)} 截止`
  return editable.value ? `${prefix}，你可在 ${formatDate(detail.deadline_at)} 前继续编辑` : prefix
})
const reasonField: PerformanceTemplateField = { id: 'reconsideration-reason', type: 'rich_text', label: '复议理由' }
function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)}（GMT+8）`
}
</script>
<style scoped>
.reconsideration-detail{min-width:0}.reconsideration-detail__history-link{display:flex;justify-content:flex-end;margin-top:-8px;margin-bottom:8px}.reconsideration-detail__handler{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:8px}.reconsideration-detail__section{margin-top:24px}.reconsideration-detail__section[aria-label="结果调整"]{margin-top:16px;margin-bottom:32px}.reconsideration-detail__section[aria-label="结果调整"]>:deep(.performance-assessment-preview-header)::before{top:4px;height:16px}.reconsideration-detail__section>h3{margin:0 0 16px;font-size:16px;line-height:24px;font-weight:600}.reconsideration-detail__history+.reconsideration-detail__history{margin-top:12px}.reconsideration-detail__history summary{position:relative;min-height:48px;padding-left:18px;list-style:none;cursor:pointer;font-size:14px;line-height:22px;outline-offset:2px}.reconsideration-detail__history summary::-webkit-details-marker{display:none}.reconsideration-detail__history-chevron{position:absolute;top:8px;left:0;color:var(--perf-n-600,#646a73)}.reconsideration-detail__history[open] .reconsideration-detail__history-chevron{transform:rotate(90deg)}.reconsideration-detail__history-creator{display:flex;min-height:26px;align-items:center;min-width:0;font-weight:400}.reconsideration-detail__history-creator :deep(.member-name){max-width:160px;color:var(--color-text-primary);font-size:14px;font-weight:400;line-height:22px}.reconsideration-detail__history-creator i{height:13px;border-left:1px solid rgba(31,35,41,.15);margin:0 8px}.reconsideration-detail__history-node{min-width:0;overflow-wrap:anywhere;color:var(--perf-n-600,#646a73);line-height:24px}.reconsideration-detail__history-time{display:block;color:var(--perf-n-600,#646a73);font-weight:400}.reconsideration-detail__history-content{margin-left:18px;padding-top:12px;padding-bottom:8px}.reconsideration-detail__history-content>strong{display:block;font-size:14px;font-weight:500;line-height:22px}.reconsideration-detail__history-content>.reconsideration-adjustments{margin-top:8px}.reconsideration-detail__history-content>p{margin:8px 0 0;color:var(--color-text-secondary)}
:global(.reconsideration-history-dialog){min-height:214px;border-radius:8px}:global(.reconsideration-history-dialog .performance-dialog__header){min-height:72px;padding:24px 56px 24px 24px}:global(.reconsideration-history-dialog .performance-dialog__header h2){font-size:16px;font-weight:600;line-height:24px}:global(.reconsideration-history-dialog .performance-dialog__close){top:24px;right:24px;width:28px;height:28px;margin:-2px -4px;padding:4px}:global(.reconsideration-history-dialog .performance-dialog__close svg){width:20px;height:20px}:global(.reconsideration-history-dialog .performance-dialog__body){min-height:62px;padding:0 24px;margin-bottom:24px}:global(.reconsideration-history-dialog .performance-dialog__footer){display:flex;justify-content:flex-end;padding:0 24px 24px}:global(.reconsideration-history-dialog .performance-dialog__footer button){min-width:80px;height:32px}:global(.reconsideration-history-overlay){background:rgba(0,0,0,.55)}
</style>
