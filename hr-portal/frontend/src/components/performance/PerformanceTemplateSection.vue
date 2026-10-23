<template>
  <div class="performance-template-section" :data-section-id="section.id">
    <header class="template-section-header section-header repeatable-content-header" :class="{ 'template-section-header--readonly': mode === 'readonly' }">
      <PerformanceAssessmentPreviewHeader :name="section.name" :description="section.description" heading-tag="h2" />
    </header>
    <div v-for="(instanceKey, index) in instanceKeys" :key="instanceKey" class="template-section-instance repeatable-content-instance" :data-instance-index="index">
      <PerformanceIconButton v-if="section.allow_multiple && editable && instanceKeys.length > 1" class="template-section-remove repeatable-instance-remove" icon="DeleteTrashOutlined" :label="`删除${section.name}${index + 1}`" @click="$emit('remove', index)" />
      <slot :index="index" />
    </div>
    <PerformanceAddAnotherButton v-if="section.allow_multiple && editable" class="template-section-add" @click="$emit('add')" />
  </div>
</template>
<script setup lang="ts">
import type { PerformanceTemplateSection as TemplateSection } from '@/api/performance'
import PerformanceAssessmentPreviewHeader from './PerformanceAssessmentPreviewHeader.vue'
import PerformanceAddAnotherButton from './PerformanceAddAnotherButton.vue'
import PerformanceIconButton from './PerformanceIconButton.vue'

defineProps<{ section: TemplateSection; instanceKeys: string[]; editable: boolean; mode?: 'edit' | 'readonly' }>()
defineEmits<{ add: []; remove: [index: number] }>()
</script>
<style scoped>
.performance-template-section{margin:0 0 32px}.performance-template-section:last-child{margin-bottom:0}.template-section-header{margin-bottom:16px}.template-section-header :deep(.performance-assessment-preview-header){margin:0}.template-section-instance{position:relative}.template-section-instance+.template-section-instance{margin-top:16px}.template-section-remove{position:absolute;top:-1px;right:0;z-index:2;--performance-icon-button-size:24px}.template-section-add{margin-top:4px}
</style>
