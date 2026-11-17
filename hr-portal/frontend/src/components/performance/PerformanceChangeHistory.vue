<template>
  <div v-if="history.length" class="reconsideration-detail__history-link"><UiButton variant="text" @click="historyOpen = true">变更记录（{{ history.length }}）</UiButton></div>
  <PerformanceDialogShell v-model="historyOpen" title="变更记录" width="800px" dialog-class="reconsideration-history-dialog" overlay-class="reconsideration-history-overlay">
    <details v-for="(item, index) in history" :key="item.id ?? `${item.submitted_at}:${index}`" :open="index === 0" class="reconsideration-detail__history">
      <summary><svg class="reconsideration-detail__history-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18.627 11.22a1 1 0 0 1 0 1.56L8.291 21.084a1 1 0 0 1-1.626-.78V3.696a1 1 0 0 1 1.626-.78l10.335 8.305Z" fill="currentColor" /></svg><span class="reconsideration-detail__history-creator"><PerformanceMemberIdentity :display-name="item.display_name" size="sm" /><i aria-hidden="true"></i><span class="reconsideration-detail__history-node">{{ item.node_name || nodeName }}</span></span><span class="reconsideration-detail__history-time">{{ formatDate(item.submitted_at) }}</span></summary>
      <div class="reconsideration-detail__history-content"><strong>变更内容</strong><PerformanceReconsiderationAdjustments v-if="item.adjustments.length" history :adjustments="item.adjustments" :sections="sections" /><p v-else>本次提交未调整绩效结果</p></div>
    </details>
    <template #footer><UiButton variant="primary" @click="historyOpen = false">确定</UiButton></template>
  </PerformanceDialogShell>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import type { PerformanceReferenceTab, PerformanceTemplateSection } from '@/api/performance'
import { employeeSwitchEpoch } from '@/stores/identitySwitch'
import UiButton from '../ui/UiButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceMemberIdentity from './PerformanceMemberIdentity.vue'
import PerformanceReconsiderationAdjustments from './PerformanceReconsiderationAdjustments.vue'
const props = defineProps<{ history: NonNullable<PerformanceReferenceTab['result_history']>; sections: PerformanceTemplateSection[]; nodeName: string; employeeNo: string }>()
const historyOpen = ref(false)
watch(() => [props.history, props.nodeName, props.employeeNo, employeeSwitchEpoch.value], () => { historyOpen.value = false }, { flush: 'sync' })
function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)}（GMT+8）`
}
</script>
<style scoped>
.reconsideration-detail__history-link{display:flex;justify-content:flex-end;margin-top:-8px;margin-bottom:8px}.reconsideration-detail__history+.reconsideration-detail__history{margin-top:12px}.reconsideration-detail__history summary{position:relative;min-height:48px;padding-left:18px;list-style:none;cursor:pointer;font-size:14px;line-height:22px;outline-offset:2px}.reconsideration-detail__history summary::-webkit-details-marker{display:none}.reconsideration-detail__history-chevron{position:absolute;top:8px;left:0;color:var(--perf-n-600,#646a73)}.reconsideration-detail__history[open] .reconsideration-detail__history-chevron{transform:rotate(90deg)}.reconsideration-detail__history-creator{display:flex;min-height:26px;align-items:center;min-width:0;font-weight:400}.reconsideration-detail__history-creator :deep(.member-name){max-width:160px;color:var(--color-text-primary);font-size:14px;font-weight:400;line-height:22px}.reconsideration-detail__history-creator i{height:13px;border-left:1px solid rgba(31,35,41,.15);margin:0 8px}.reconsideration-detail__history-node{min-width:0;overflow-wrap:anywhere;color:var(--perf-n-600,#646a73);line-height:24px}.reconsideration-detail__history-time{display:block;color:var(--perf-n-600,#646a73);font-weight:400}.reconsideration-detail__history-content{margin-left:18px;padding-top:12px;padding-bottom:8px}.reconsideration-detail__history-content>strong{display:block;font-size:14px;font-weight:500;line-height:22px}.reconsideration-detail__history-content>.reconsideration-adjustments{margin-top:8px}.reconsideration-detail__history-content>p{margin:8px 0 0;color:var(--color-text-secondary)}
:global(.reconsideration-history-dialog){min-height:214px;border-radius:8px}:global(.reconsideration-history-dialog .performance-dialog__header){min-height:72px;padding:24px 56px 24px 24px}:global(.reconsideration-history-dialog .performance-dialog__header h2){font-size:16px;font-weight:600;line-height:24px}:global(.reconsideration-history-dialog .performance-dialog__close){top:24px;right:24px;width:28px;height:28px;margin:-2px -4px;padding:4px}:global(.reconsideration-history-dialog .performance-dialog__close svg){width:20px;height:20px}:global(.reconsideration-history-dialog .performance-dialog__body){min-height:62px;padding:0 24px;margin-bottom:24px}:global(.reconsideration-history-dialog .performance-dialog__footer){display:flex;justify-content:flex-end;padding:0 24px 24px}:global(.reconsideration-history-dialog .performance-dialog__footer button){min-width:80px;height:32px}:global(.reconsideration-history-overlay){background:rgba(0,0,0,.55)}
</style>
