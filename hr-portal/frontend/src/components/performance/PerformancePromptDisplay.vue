<template>
  <div class="performance-prompt-display" :style="displayStyle">
    <div v-if="value.title" class="performance-prompt-display__title">{{ value.title }}</div>
    <div class="performance-prompt-display__content">{{ value.content }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PerformancePromptValue } from './PerformancePromptForm.vue'

const props = defineProps<{ value: PerformancePromptValue }>()
const safeColor = computed(() => /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(props.value.color) ? props.value.color : '#3370ff')
const displayStyle = computed(() => ({ '--performance-prompt-color': safeColor.value }))
</script>

<style scoped>
.performance-prompt-display { min-width: 0; max-width: 100%; padding: var(--performance-prompt-display-padding-block) var(--performance-prompt-display-padding-inline); box-sizing: border-box; border-left: var(--performance-prompt-display-accent-width) solid var(--performance-prompt-color); background: var(--performance-prompt-display-background); color: var(--color-text-primary); }
.performance-prompt-display__title { min-width: 0; margin-bottom: var(--performance-prompt-display-title-gap); overflow-wrap: anywhere; font-size: var(--font-size-md); font-weight: 600; line-height: var(--performance-input-line-height); }
.performance-prompt-display__content { min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: var(--performance-input-line-height); }
</style>
