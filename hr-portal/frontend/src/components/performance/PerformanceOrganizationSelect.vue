<template>
  <PerformanceOrganizationTreeSelect v-bind="$attrs" :model-value="modelValue" :nodes="nodes" @update:model-value="$emit('update:modelValue', $event)" />
</template>

<script setup lang="ts">
import type { PerformanceHrbpOrganizationNode } from '@/api/performance'
import PerformanceOrganizationTreeSelect from './PerformanceOrganizationTreeSelect.vue'

defineProps<{ modelValue: string[]; nodes: PerformanceHrbpOrganizationNode[] }>()
defineEmits<{ 'update:modelValue': [value: string[]] }>()
</script>
