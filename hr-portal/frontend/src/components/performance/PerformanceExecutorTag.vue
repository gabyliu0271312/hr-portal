<template>
  <UiTag class="performance-executor-tag" :data-executor-type="executor.type">{{ executor.label }}</UiTag>
</template>

<script setup lang="ts">
import UiTag from '@/components/ui/UiTag.vue'
import type { PerformanceExecutorOption } from './performanceExecutorOptions'

defineProps<{ executor: PerformanceExecutorOption }>()
</script>
