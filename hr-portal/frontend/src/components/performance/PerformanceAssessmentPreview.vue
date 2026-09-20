<template><section class="performance-assessment-preview" :data-preview-type="type"><span v-if="showLabel" class="preview-label">预览</span><PerformanceAssessmentPreviewHeader :name="name" :description="description" /><slot /></section></template>
<script setup lang="ts">
import PerformanceAssessmentPreviewHeader from './PerformanceAssessmentPreviewHeader.vue'
withDefaults(defineProps<{ type: string; name?: string; description?: string; showLabel?: boolean }>(), { name: '', description: '', showLabel: true })
</script>
<style scoped>.performance-assessment-preview{min-width:0;overflow:auto;padding:10px 24px 12px;box-sizing:border-box}.preview-label{display:inline-block;margin-left:-18px;padding:0 4px;background:#eff0f1;font-weight:600}</style>
