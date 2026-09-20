<template>
  <PerformanceTemplateSection :section="section" :instance-keys="instanceKeys" :editable="editable" @add="$emit('add')" @remove="$emit('remove', $event)"><template #default="slotProps"><slot v-bind="slotProps" /></template></PerformanceTemplateSection>
</template>
<script setup lang="ts">
import type { PerformanceTemplateSection as TemplateSection } from '@/api/performance'
import PerformanceTemplateSection from './PerformanceTemplateSection.vue'

defineProps<{ section: TemplateSection; instanceKeys: string[]; editable: boolean }>()
defineEmits<{ add: []; remove: [index: number] }>()
</script>
