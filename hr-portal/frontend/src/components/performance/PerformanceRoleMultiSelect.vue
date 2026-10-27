<template>
  <div class="performance-role-multi-select"><PerformanceSearchSelect :model-value="modelValue" :options="roleOptions" multiple :disabled="disabled" :aria-invalid="ariaInvalid || undefined" aria-label="执行人角色" @update:model-value="emit('update:modelValue', Array.isArray($event) ? $event : [])" /></div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
const props = withDefaults(defineProps<{ modelValue: string[]; options: string[]; disabled?: boolean; ariaInvalid?: boolean }>(), { disabled: false, ariaInvalid: false })
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const roleOptions = computed(() => props.options.map(value => ({ value, label: value })))
</script>

<style scoped>
.performance-role-multi-select { width: 215.333px; max-width: 100%; }
</style>
