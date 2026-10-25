<template>
  <div class="performance-prompt-display" :class="{ 'is-unavailable': value.allowView === false }" :style="displayStyle">
    <span v-if="value.showIcon === true" class="performance-prompt-display__icon" :style="{ color: safeColor }" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path :d="definition.iconPath" fill="currentColor" />
        <path :d="definition.iconInnerPath" fill="#fff" />
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
import { promptDefinitions, promptTypeForColor } from './PerformancePromptNotice.vue'
import type { PerformancePromptValue } from './PerformancePromptForm.vue'

const props = defineProps<{ value: PerformancePromptValue }>()
const safeColor = computed(() => /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(props.value.color) ? props.value.color : '#3370ff')
const definition = computed(() => promptDefinitions[promptTypeForColor(safeColor.value)])
const displayStyle = computed(() => ({ backgroundColor: definition.value.noticeBackground }))
</script>

<style scoped>
.performance-prompt-display { display: flex; align-items: flex-start; width: 100%; min-width: 0; max-width: 100%; padding: var(--performance-prompt-display-padding-block) var(--performance-prompt-display-padding-inline); box-sizing: border-box; border-radius: var(--radius-sm); color: var(--color-text-primary); }
.performance-prompt-display__icon { display: block; flex: 0 0 16px; width: 16px; height: 16px; margin: 4px var(--spacing-2) 0 0; line-height: 0; }
.performance-prompt-display__icon svg { display: block; width: 16px; height: 16px; }
.performance-prompt-display__text { min-width: 0; }
.performance-prompt-display__title { min-width: 0; margin: 0 0 2px; overflow-wrap: anywhere; font: 600 16px/24px var(--font-sans); }
.performance-prompt-display__content { min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; color: var(--color-text-secondary); font: 400 14px/22px var(--font-sans); }
.performance-prompt-display.is-unavailable { opacity: .5; }
</style>
