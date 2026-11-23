<script setup lang="ts">
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'

withDefaults(defineProps<{
  disabled?: boolean
  reason?: string | string[]
  variant?: 'default' | 'popover'
  side?: 'auto' | 'bottom' | 'right'
  gap?: number | string
}>(), {
  disabled: false,
  reason: '',
  variant: 'default',
  side: 'auto',
})
const emit = defineEmits<{ 'popover-enter': []; 'popover-leave': [] }>()
</script>

<template>
  <PerformanceInfoPopover v-if="disabled && reason" :content="reason" :side="side" :gap="gap" width="auto" max-width="var(--performance-popover-width)" variant="disabled-action" data-disabled-reason @popover-enter="emit('popover-enter')" @popover-leave="emit('popover-leave')">
    <slot />
  </PerformanceInfoPopover>
  <span v-else class="performance-disabled-reason is-enabled"><slot /></span>
</template>

<style scoped>
.performance-disabled-reason { display: inline-flex; align-items: center; cursor: not-allowed; }
.performance-disabled-reason.is-enabled { cursor: inherit; }
</style>
