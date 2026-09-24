<template>
  <section class="assessment-method-card" data-source-state-id="SNAPSPEC-PM-T015-DEFAULT-20260923">
    <PerformanceAssessmentMethodHeader
      class="assessment-method-card__header"
      :title="title"
      :description="description"
      :help-href="helpHref"
      :model-value="modelValue"
      :disabled="disabled"
      :instant="instant"
      @update:model-value="$emit('update:modelValue', $event)"
    />
  </section>
</template>

<script setup lang="ts">
import PerformanceAssessmentMethodHeader from './PerformanceAssessmentMethodHeader.vue'

defineProps<{
  title: string
  description?: string
  helpHref: string
  modelValue: boolean
  disabled?: boolean
  instant?: boolean
}>()

defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()
</script>

<style scoped>
.assessment-method-card{box-sizing:border-box;width:100%;margin-bottom:16px;padding:20px;border-radius:8px;background:#fff;box-shadow:rgba(31,35,41,.03) 0 4px 16px 4px,rgba(31,35,41,.02) 0 4px 8px,rgba(31,35,41,.02) 0 2px 4px -4px;color:#1f2329;font-family:var(--font-sans)}
</style>
