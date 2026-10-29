<script setup lang="ts">
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'

withDefaults(defineProps<{
  disabled?: boolean
  reason?: string
  variant?: 'default' | 'popover'
}>(), {
  disabled: false,
  reason: '',
  variant: 'default',
})
</script>

<template>
  <PerformanceInfoPopover v-if="disabled && reason" :content="reason" width="auto" variant="disabled-action" data-disabled-reason>
    <slot />
  </PerformanceInfoPopover>
  <span v-else class="performance-disabled-reason is-enabled"><slot /></span>
</template>

<style scoped>
.performance-disabled-reason { display: inline-flex; align-items: center; cursor: not-allowed; }
.performance-disabled-reason.is-enabled { cursor: inherit; }
</style>
