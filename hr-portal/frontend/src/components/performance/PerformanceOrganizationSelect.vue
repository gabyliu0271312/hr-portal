<template>
  <PerformanceOrganizationTreeSelect v-bind="$attrs" :model-value="modelValue" :nodes="nodes" :disabled="disabled" @open="$emit('open')" @update:model-value="$emit('update:modelValue', $event)" />
</template>

<script setup lang="ts">
import type { PerformanceHrbpOrganizationNode } from '@/api/performance'
import PerformanceOrganizationTreeSelect from './PerformanceOrganizationTreeSelect.vue'

defineProps<{ modelValue: string[]; nodes: PerformanceHrbpOrganizationNode[]; disabled?: boolean }>()
defineEmits<{ 'update:modelValue': [value: string[]]; open: [] }>()
</script>
