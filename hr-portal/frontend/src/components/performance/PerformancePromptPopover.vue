<template>
  <PerformancePopover :visible="visible" :anchor="anchor" name="prompt-popover" arrow-class="prompt-popover__arrow" @close="$emit('close')"><PerformancePromptNotice :type="type" /></PerformancePopover>
</template>
<script setup lang="ts">
import PerformancePopover from './PerformancePopover.vue'
import PerformancePromptNotice, { type PromptColorKey } from './PerformancePromptNotice.vue'
defineProps<{ visible: boolean; type: PromptColorKey; anchor: HTMLElement | DOMRect | null }>()
defineEmits<{ close: [] }>()
</script>
