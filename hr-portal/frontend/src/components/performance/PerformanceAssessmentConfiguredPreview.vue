<template>
  <PerformanceContentRenderer
    :content="content"
    variant="configured-card"
    :interactive="interactive"
    :selected-item-id="selectedItemId"
    :selection-prefix="content.id"
    :item-settings="itemSettings"
    @select-item="$emit('select-item', $event)"
  />
</template>
<script setup lang="ts">
import type { AssessmentContentDraft } from './PerformanceAssessmentContentLayers.vue'
import PerformanceContentRenderer from './PerformanceContentRenderer.vue'
withDefaults(defineProps<{
  content: AssessmentContentDraft & { id: string }
  interactive?: boolean
  selectedItemId?: string | null
  itemSettings?: Record<string, { mode: 'fill' | 'hidden'; required: boolean }>
}>(), { interactive: false, selectedItemId: null, itemSettings: () => ({}) })
defineEmits<{ 'select-item': [itemId: string] }>()
</script>
<style scoped>
</style>
