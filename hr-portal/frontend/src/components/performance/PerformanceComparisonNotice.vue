<script setup lang="ts">
import { computed } from 'vue'
import type { PerformanceComparisonResult } from '@/api/performance'
import { performanceComparisonText } from '@/composables/usePerformanceComparison'
import PerformancePromptNotice from './PerformancePromptNotice.vue'

const props = withDefaults(defineProps<{
  comparison?: PerformanceComparisonResult | null
  taskId?: string | number | null
  references?: Array<{ task_id?: string | number | null; node_name: string }>
  readonly?: boolean
}>(), { references: () => [], readonly: false })
const notices = computed(() => [...new Set(props.comparison?.matches.map(match => performanceComparisonText(match, props.taskId ?? undefined, props.references)) || [])])
</script>

<template>
  <div v-if="readonly ? comparison?.reason : comparison?.active !== false && comparison?.show_notice_in_review && notices.length" class="performance-comparison-notice">
    <template v-if="readonly">
      <div class="performance-comparison-notice__label">差异理由</div>
      <p class="performance-comparison-notice__reason">{{ comparison?.reason }}</p>
    </template>
    <PerformancePromptNotice v-for="notice in readonly ? [] : notices" :key="notice" type="warning" multiline>{{ notice }}，请注意充分进行沟通后评估。</PerformancePromptNotice>
  </div>
</template>

<style scoped>
.performance-comparison-notice{display:flex;flex-direction:column;gap:var(--spacing-2);margin-bottom:var(--spacing-4);color:var(--color-text-primary);font:var(--font-weight-normal) var(--font-size-md)/var(--performance-input-line-height) var(--font-sans)}
.performance-comparison-notice__label{font-weight:var(--performance-item-title-font-weight)}
.performance-comparison-notice__reason{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
</style>
