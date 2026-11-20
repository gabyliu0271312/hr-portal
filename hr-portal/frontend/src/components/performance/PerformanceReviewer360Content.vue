<template>
  <section class="reviewer-360-content" :aria-label="`${pageTitle}预览`">
    <PerformanceTemplateSectionCard :title="pageTitle" :actions="[]" selectable :selected="headingSelected" @select="$emit('select-heading')" />
    <PerformanceContentSelectionFrame variant="root" :selected="rootSelected" class="reviewer-360-content__body" @click="$emit('select-root')">
      <PerformanceReviewer360InviteBody class="reviewer-360-content__content" />
    </PerformanceContentSelectionFrame>
    <div v-if="showActions" class="reviewer-360-content__actions">
      <PerformanceTemplateOperateBar :actions="actions" @action="$emit('action', $event)" />
    </div>
  </section>
</template>

<script setup lang="ts">
import PerformanceReviewer360InviteBody from './PerformanceReviewer360InviteBody.vue'
import PerformanceContentSelectionFrame from './PerformanceContentSelectionFrame.vue'
import PerformanceTemplateOperateBar from './PerformanceTemplateOperateBar.vue'
import PerformanceTemplateSectionCard from './PerformanceTemplateSectionCard.vue'

defineProps<{
  pageTitle: string
  headingSelected: boolean
  rootSelected: boolean
  showActions: boolean
  actions: Array<{ key: string; label: string }>
}>()

defineEmits<{
  'select-heading': []
  'select-root': []
  action: [key: string]
}>()
</script>

<style scoped>
.reviewer-360-content{width:var(--performance-content-width);max-width:100%;color:var(--color-text-primary);font:400 14px/21px var(--font-sans)}
.reviewer-360-content__body{position:relative;background:var(--color-bg-card);border-radius:4px;cursor:pointer}
.reviewer-360-content__content{padding:24px 24px 0;pointer-events:none}
.reviewer-360-content__actions{position:sticky;z-index:20;bottom:8px;border-radius:0 0 4px 4px;overflow:hidden}
</style>
