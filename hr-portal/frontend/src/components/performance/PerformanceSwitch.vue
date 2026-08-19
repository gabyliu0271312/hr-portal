<template>
  <button class="performance-switch" :class="{ on: modelValue }" type="button" role="switch" :aria-checked="modelValue" :aria-label="ariaLabel" :disabled="disabled" @click="$emit('update:modelValue', !modelValue)">
    <span class="performance-switch__handler" />
  </button>
</template>

<script setup lang="ts">
defineProps<{ modelValue: boolean; disabled?: boolean; ariaLabel?: string }>()
defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()
</script>

<style scoped>
.performance-switch{position:relative;display:block;width:28px;min-width:28px;height:16px;padding:1px 6px;box-sizing:border-box;border:0;border-radius:999999px;background:#dee0e3;cursor:pointer;transition:background .12s cubic-bezier(.4,.8,.74,1)}
.performance-switch__handler{position:absolute;top:2px;left:2px;display:block;width:12px;height:12px;border-radius:999999px;background:#fff;transition:left .12s cubic-bezier(.4,.8,.74,1)}
.performance-switch.on{background:#1456f0}.performance-switch.on .performance-switch__handler{left:14px}.performance-switch:disabled{background:#dee0e3;cursor:not-allowed}
</style>
