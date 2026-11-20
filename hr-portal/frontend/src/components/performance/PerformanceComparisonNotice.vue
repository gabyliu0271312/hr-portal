<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PerformanceComparisonResult } from '@/api/performance'
import { performanceComparisonGroups, performanceComparisonText } from '@/composables/usePerformanceComparison'
import PerformancePromptNotice from './PerformancePromptNotice.vue'
import PerformanceComparisonDetailDialog from './PerformanceComparisonDetailDialog.vue'
import UiButton from '../ui/UiButton.vue'

const props = withDefaults(defineProps<{
  comparison?: PerformanceComparisonResult | null
  taskId?: string | number | null
  references?: Array<{ task_id?: string | number | null; node_name: string }>
  readonly?: boolean
}>(), { references: () => [], readonly: false })
const groups = computed(() => performanceComparisonGroups(props.comparison).map(group => {
  const notices = [...new Set(group.matches.map(match => performanceComparisonText(match, props.taskId ?? undefined, props.references)))]
    .map(text => ({ text, matches: group.matches.filter(match => performanceComparisonText(match, props.taskId ?? undefined, props.references) === text) }))
  const showNotice = group.active !== false && !group.historical && group.show_notice_in_review && notices.length > 0
  return { ...group, notices, showNotice }
}).filter(group => group.showNotice || props.readonly && group.reason))
const selected = ref<{ ruleId: string; text: string; anchor: HTMLElement } | null>(null)
function toggleDetail(ruleId: string, text: string, event: MouseEvent) {
  selected.value = selected.value?.anchor === event.currentTarget ? null : { ruleId, text, anchor: event.currentTarget as HTMLElement }
}
const detail = computed(() => {
  if (!props.readonly) return null
  const group = groups.value.find(group => group.rule_id === selected.value?.ruleId && group.showNotice)
  return group?.notices.find(notice => notice.text === selected.value?.text) || null
})
watch(() => [props.comparison, props.taskId, props.readonly, props.references], () => { selected.value = null })
</script>

<template>
  <div v-if="groups.length" class="performance-comparison-notice">
    <template v-for="(group, index) in groups" :key="group.rule_id">
      <PerformancePromptNotice v-for="notice in group.showNotice ? group.notices : []" :key="notice.text" :class="{ 'performance-comparison-notice__readonly': readonly }" type="warning" multiline>
        <template v-if="readonly" #icon><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M23 12c0 6.075-4.925 11-11 11S1 18.075 1 12 5.925 1 12 1s11 4.925 11 11ZM12 7a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Zm0 8a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" fill="currentColor" /></svg></template>
        <div class="performance-comparison-notice__row"><span>{{ notice.text }}{{ readonly ? '' : '，请注意充分进行沟通后评估。' }}</span><UiButton v-if="readonly" class="performance-comparison-notice__action" variant="text" aria-haspopup="dialog" :aria-expanded="selected?.ruleId === group.rule_id && selected?.text === notice.text" @click="toggleDetail(group.rule_id, notice.text, $event)">查看详情</UiButton></div>
      </PerformancePromptNotice>
      <template v-if="readonly && group.reason">
        <div class="performance-comparison-notice__label">{{ groups.length > 1 ? `差异理由 ${index + 1}` : '差异理由' }}</div>
        <p v-if="!group.showNotice && groups.length > 1 && group.notices.length" class="performance-comparison-notice__reason">{{ group.notices.map(notice => notice.text).join('；') }}</p>
        <p class="performance-comparison-notice__reason">{{ group.reason }}</p>
      </template>
    </template>
  </div>
  <PerformanceComparisonDetailDialog v-if="detail && selected" :key="`${selected.ruleId}:${selected.text}`" :anchor="selected.anchor" :matches="detail.matches" @close="selected = null" />
</template>

<style scoped>
.performance-comparison-notice{display:flex;flex-direction:column;gap:var(--spacing-2);margin-bottom:var(--spacing-4);color:var(--color-text-primary);font:var(--font-weight-normal) var(--font-size-md)/var(--performance-input-line-height) var(--font-sans)}
.performance-comparison-notice__row{display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-4)}
.performance-comparison-notice__row>span{min-width:0;overflow-wrap:anywhere}
.performance-comparison-notice__readonly :deep(.prompt-notice__text){flex:1;min-width:0;display:block;margin-bottom:0;padding-right:var(--performance-comparison-notice-action-inset)}
.performance-comparison-notice__action{flex:none;min-width:0;height:auto;border:0;padding:var(--performance-comparison-notice-action-padding-y) var(--performance-comparison-notice-action-padding-x);line-height:var(--performance-comparison-notice-action-line-height)}
.performance-comparison-notice__label{font-weight:var(--performance-item-title-font-weight)}
.performance-comparison-notice__reason{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
</style>
