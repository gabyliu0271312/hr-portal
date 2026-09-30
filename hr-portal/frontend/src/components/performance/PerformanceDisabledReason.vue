<script setup lang="ts">
import { ElTooltip } from 'element-plus'
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
  <PerformanceInfoPopover v-if="disabled && reason && variant === 'popover'" :content="reason" width="auto" variant="disabled-action" data-disabled-reason>
    <slot />
  </PerformanceInfoPopover>
  <el-tooltip v-else-if="disabled && reason" :content="reason" placement="top">
    <span class="performance-disabled-reason" data-disabled-reason><slot /></span>
  </el-tooltip>
  <span v-else class="performance-disabled-reason is-enabled"><slot /></span>
</template>

<style scoped>
.performance-disabled-reason { display: inline-flex; align-items: center; cursor: not-allowed; }
.performance-disabled-reason.is-enabled { cursor: inherit; }
</style>
