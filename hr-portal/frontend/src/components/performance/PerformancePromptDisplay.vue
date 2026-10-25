<template>
  <div class="performance-prompt-display" :style="displayStyle">
    <span v-if="value.showIcon" class="performance-prompt-display__icon" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path :d="iconPath" fill="#fff" />
        <path :d="iconInnerPath" :fill="safeColor" />
      </svg>
    </span>
    <div class="performance-prompt-display__text">
      <div v-if="value.title" class="performance-prompt-display__title">{{ value.title }}</div>
      <div class="performance-prompt-display__content">{{ value.content }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PerformancePromptValue } from './PerformancePromptForm.vue'

const props = defineProps<{ value: PerformancePromptValue }>()
const safeColor = computed(() => /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(props.value.color) ? props.value.color : '#3370ff')
const iconDefinition = computed(() => {
  const definitions = {
    '#3b82f6': {
      path: 'M12 23c6.075 0 11-4.925 11-11S18.075 1 12 1 1 5.925 1 12s4.925 11 11 11Z',
      innerPath: 'M13 7.5a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-2 4v4h-.5a1 1 0 1 0 0 2h3a1 1 0 1 0 0-2H13c0-.667 0-1.333.002-2 0-1.001.002-2.002 0-3.004a.998.998 0 0 0-.998-.996H11a1 1 0 1 0 0 2Z',
    },
    '#f97316': {
      path: 'M12 23c6.075 0 11-4.925 11-11S18.075 1 12 1 1 5.925 1 12s4.925 11 11 11Z',
      innerPath: 'M13 7.5a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-2 4v4h-.5a1 1 0 1 0 0 2h3a1 1 0 1 0 0-2H13c0-.667 0-1.333.002-2 0-1.001.002-2.002 0-3.004a.998.998 0 0 0-.998-.996H11a1 1 0 1 0 0 2Z',
    },
    '#ef4444': {
      path: 'M12 23C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Z',
      innerPath: 'M7.465 8.879 10.585 12l-3.12 3.121a1 1 0 1 0 1.414 1.414L12 13.415l3.121 3.12a1 1 0 1 0 1.415-1.414L13.414 12l3.122-3.121a1 1 0 0 0-1.415-1.415l-3.12 3.122-3.122-3.122A1 1 0 0 0 7.465 8.88Z',
    },
    '#10b981': {
      path: 'M11.996 22.98c-6.067 0-10.983-4.918-10.983-10.984S5.93 1.013 11.996 1.013c6.066 0 10.983 4.917 10.983 10.983 0 6.066-4.917 10.984-10.983 10.984Z',
      innerPath: 'M17.537 10.746a1.38 1.38 0 0 0-.005-1.95 1.378 1.378 0 0 0-1.95-.005l-4.89 4.89-2.285-2.285a1.375 1.375 0 0 0-1.942.012 1.373 1.373 0 0 0-.013 1.942c1.178 1.175 2.356 2.348 3.53 3.528.392.394 1.03.394 1.422 0 2.037-2.051 4.087-4.09 6.133-6.132Z',
    },
  } as const
  return definitions[safeColor.value.toLowerCase() as keyof typeof definitions] || definitions['#3b82f6']
})
const iconPath = computed(() => iconDefinition.value.path)
const iconInnerPath = computed(() => iconDefinition.value.innerPath)
const displayStyle = computed(() => ({ '--performance-prompt-background': safeColor.value }))
</script>

<style scoped>
.performance-prompt-display { display: flex; align-items: flex-start; width: var(--performance-content-width); max-width: 100%; padding: var(--performance-prompt-display-padding-block) var(--performance-prompt-display-padding-inline); box-sizing: border-box; border-radius: var(--radius-sm); background: var(--performance-prompt-background); color: #fff; }
.performance-prompt-display__icon { display: block; flex: 0 0 16px; width: 16px; height: 16px; margin: 4px var(--spacing-2) 0 0; line-height: 0; }
.performance-prompt-display__icon svg { display: block; width: 16px; height: 16px; }
.performance-prompt-display__text { min-width: 0; }
.performance-prompt-display__title { min-width: 0; margin: 0 0 2px; overflow-wrap: anywhere; font: 600 16px/24px var(--font-sans); }
.performance-prompt-display__content { min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; color: rgba(255, 255, 255, .9); font: 400 14px/22px var(--font-sans); }
</style>
