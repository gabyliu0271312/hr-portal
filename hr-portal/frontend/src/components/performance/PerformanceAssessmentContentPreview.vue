<template>
  <PerformanceAssessmentPreview class="assessment-content-preview" :type="content.type" :name="content.name" :description="content.description" :show-label="false">
    <PerformanceContentRenderer :content="content" variant="configured-card" />
  </PerformanceAssessmentPreview>
</template>
<script setup lang="ts">
import PerformanceAssessmentPreview from './PerformanceAssessmentPreview.vue'
import PerformanceContentRenderer from './PerformanceContentRenderer.vue'
import type { AssessmentContentDraft } from './PerformanceAssessmentContentLayers.vue'
defineProps<{ content: AssessmentContentDraft & { id: string } }>()
</script>
<style scoped>.assessment-content-preview{color:#1f2329}</style>
