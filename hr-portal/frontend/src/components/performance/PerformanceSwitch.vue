<template>
  <button class="performance-switch" :class="{ on: modelValue, 'no-transition': instant }" type="button" role="switch" :aria-checked="modelValue" :aria-label="ariaLabel" :disabled="disabled" @click="$emit('update:modelValue', !modelValue)">
    <span class="performance-switch__handler" />
  </button>
</template>

<script setup lang="ts">
defineProps<{ modelValue: boolean; disabled?: boolean; ariaLabel?: string; instant?: boolean }>()
defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()
</script>

<style scoped>
.performance-switch{position:relative;display:block;width:var(--performance-switch-width);min-width:var(--performance-switch-width);height:var(--performance-switch-height);padding:1px 6px;box-sizing:border-box;border:0;border-radius:var(--radius-pill);background:var(--performance-switch-off);cursor:pointer;transition:background var(--duration-fast) cubic-bezier(.4,.8,.74,1)}
.performance-switch__handler{position:absolute;top:2px;left:2px;display:block;width:var(--performance-switch-handler-size);height:var(--performance-switch-handler-size);border-radius:var(--radius-pill);background:var(--color-bg-card);transition:left var(--duration-fast) cubic-bezier(.4,.8,.74,1)}
.performance-switch.on{background:var(--color-action-primary-hover)}.performance-switch.on .performance-switch__handler{left:14px}.performance-switch:disabled{background:var(--performance-switch-off);cursor:not-allowed}
.performance-switch.no-transition,.performance-switch.no-transition .performance-switch__handler{transition:none}
</style>
