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
    <PerformanceDialogShell v-model="historyOpen" title="变更记录" width="720px">
      <details v-for="(item, index) in detail.history" :key="`${item.submitted_at}:${index}`" :open="index === 0" class="reconsideration-detail__history">
        <summary>{{ item.display_name }}　{{ nodeName }}　{{ formatDate(item.submitted_at) }}</summary>
        <div v-for="(adjustment, fieldIndex) in item.adjustments" :key="`${adjustment.field_id}:${adjustment.instance_index ?? fieldIndex}`" class="reconsideration-detail__adjustment">
          <h4>{{ adjustment.section_name }} · {{ adjustment.field_label }}{{ adjustment.instance_index != null ? ` ${adjustment.instance_index + 1}` : '' }}</h4>
          <div class="reconsideration-detail__comparison">
            <div><span class="reconsideration-detail__label">变更前</span><PerformanceReadonlyAnswer :field="fieldFor(adjustment)" :value="adjustment.before" empty-answer-text="—" /></div>
            <span aria-hidden="true">→</span>
            <div><span class="reconsideration-detail__label">变更后</span><PerformanceReadonlyAnswer :field="fieldFor(adjustment)" :value="adjustment.after" empty-answer-text="—" /></div>
          </div>
        </div>
        <p v-if="!item.adjustments.length">本次提交未调整绩效结果</p>
      </details>
      <template #footer><UiButton variant="primary" @click="historyOpen = false">确定</UiButton></template>
    </PerformanceDialogShell>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { PerformanceReconsiderationAdjustment, PerformanceReconsiderationDetail, PerformanceTemplateField } from '@/api/performance'
import UiButton from '../ui/UiButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
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
function fieldFor(adjustment: PerformanceReconsiderationAdjustment): PerformanceTemplateField {
  return { id: adjustment.field_id, type: adjustment.field_type as PerformanceTemplateField['type'], label: adjustment.field_label, options: adjustment.options }
}
function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)}（GMT+8）`
}
</script>
<style scoped>
.reconsideration-detail{min-width:0}.reconsideration-detail__history-link{display:flex;justify-content:flex-end;margin-top:-8px;margin-bottom:8px}.reconsideration-detail__handler{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:8px}.reconsideration-detail__section{margin-top:24px}.reconsideration-detail__section[aria-label="结果调整"]{margin-top:16px;margin-bottom:32px}.reconsideration-detail__section[aria-label="结果调整"]>:deep(.performance-assessment-preview-header)::before{top:4px;height:16px}.reconsideration-detail__section>h3{margin:0 0 16px;font-size:16px;line-height:24px;font-weight:600}.reconsideration-detail h4{margin:0 0 8px;font-size:14px;line-height:22px;font-weight:500}.reconsideration-detail__adjustment{margin-block:16px}.reconsideration-detail__comparison{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:12px;align-items:start}.reconsideration-detail__comparison>div{min-width:0}.reconsideration-detail__label{display:block;margin-bottom:6px;color:var(--color-text-secondary);font-size:12px}.reconsideration-detail__history{padding-block:12px;border-bottom:1px solid var(--color-border)}.reconsideration-detail__history summary{cursor:pointer;line-height:24px;overflow-wrap:anywhere}@media(max-width:600px){.reconsideration-detail__comparison{grid-template-columns:minmax(0,1fr)}.reconsideration-detail__comparison>span{display:none}}
</style>
