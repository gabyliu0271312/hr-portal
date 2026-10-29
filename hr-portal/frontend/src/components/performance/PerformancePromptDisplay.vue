<template>
  <div class="performance-prompt-display" :class="{ 'is-unavailable': value.allowView === false }" :style="displayStyle">
    <button v-if="value.allowView === false" class="performance-prompt-display__hidden-icon" type="button" aria-label="不允许查看" tabindex="-1"><PerformanceVisibleLockIcon /></button>
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
import PerformanceVisibleLockIcon from './PerformanceVisibleLockIcon.vue'
import { promptDefinitions, promptTypeForColor } from './PerformancePromptNotice.vue'
import type { PerformancePromptValue } from './PerformancePromptForm.vue'

const props = defineProps<{ value: PerformancePromptValue }>()
const safeColor = computed(() => /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(props.value.color) ? props.value.color : '#3370ff')
const definition = computed(() => promptDefinitions[promptTypeForColor(safeColor.value)])
const displayStyle = computed(() => ({ backgroundColor: definition.value.noticeBackground }))
</script>

<style scoped>
.performance-prompt-display { position: relative; display: flex; align-items: flex-start; width: 100%; min-width: 0; max-width: 100%; padding: var(--performance-prompt-display-padding-block) var(--performance-prompt-display-padding-inline); box-sizing: border-box; border-radius: var(--radius-sm); color: var(--color-text-primary); }
.performance-prompt-display__icon { display: block; flex: 0 0 16px; width: 16px; height: 16px; margin: 4px var(--spacing-2) 0 0; line-height: 0; }
.performance-prompt-display__icon svg { display: block; width: 16px; height: 16px; }
.performance-prompt-display__text { min-width: 0; }
.performance-prompt-display__title { min-width: 0; margin: 0 0 2px; overflow-wrap: anywhere; font: 600 16px/24px var(--font-sans); }
.performance-prompt-display__content { min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; color: var(--color-text-secondary); font: 400 14px/22px var(--font-sans); }
.performance-prompt-display.is-unavailable { padding-right: calc(var(--spacing-2) + var(--performance-icon-button-size) + var(--spacing-2)); background: var(--performance-content-hidden-background); color: var(--performance-content-hidden-text); opacity: var(--performance-content-hidden-opacity); }
.performance-prompt-display.is-unavailable .performance-prompt-display__content { color: var(--performance-content-hidden-text); }
.performance-prompt-display__hidden-icon { position: absolute; top: var(--spacing-1); right: var(--spacing-2); z-index: 2; display: grid; place-items: center; width: var(--performance-icon-button-size); height: var(--performance-icon-button-size); padding: var(--spacing-1); border: 0; background: transparent; color: var(--performance-content-unavailable-icon); pointer-events: none; }
.performance-prompt-display__hidden-icon svg { display: block; width: var(--performance-icon-size); height: var(--performance-icon-size); overflow: hidden; }
</style>
