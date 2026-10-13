<template>
  <Teleport to="body">
    <div v-if="open" class="review-rule-preview-layer" @keydown.esc.prevent="emit('close')">
      <section
        class="review-rule-preview-modal"
        :class="`is-${reviewType}`"
        :style="reviewType === 'mapping' ? { '--mapping-preview-body-height': `${mappingBodyHeight}px` } : undefined"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-rule-preview-title"
      >
        <header class="review-rule-preview-header">
          <h2 id="review-rule-preview-title">预览</h2>
        </header>
        <PreviewCloseButton @close="emit('close')" />
        <main class="review-rule-preview-body">
          <RatingRulePreview v-if="reviewType === 'rating'" :levels="formValue.levels" :quantified="formValue.gradeParticipatesInCalculation" />
          <ScoreRulePreview v-else-if="reviewType === 'score'" :method="formValue.score.method" :minimum="formValue.score.min" :maximum="formValue.score.max" :precision="precisionDigits(formValue.score.precision)" :fixed-options="formValue.score.fixedOptions" />
          <ScoreMappingRulePreview v-else v-model="previewValue" :minimum="formValue.mapping.min" :maximum="formValue.mapping.max" :precision="precisionDigits(formValue.mapping.precision)" :intervals="formValue.mapping.intervals" @update:model-value="updatePreviewValue" />
        </main>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ReviewRulePreviewPayload } from './ReviewRuleForm.vue'
import PreviewCloseButton from './PreviewCloseButton.vue'
import RatingRulePreview from './RatingRulePreview.vue'
import ScoreRulePreview from './ScoreRulePreview.vue'
import ScoreMappingRulePreview from './ScoreMappingRulePreview.vue'

const props = defineProps<{
  open: boolean
  reviewType: 'rating' | 'score' | 'mapping'
  formValue: ReviewRulePreviewPayload
}>()
const emit = defineEmits<{
  close: []
  'update:previewValue': [value: string]
}>()

const previewValue = ref('')
const mappingBodyHeight = computed(() => 262.667 + Math.max(0, props.formValue.mapping.intervals.length - 2) * 70.667)

watch(() => props.open, (open) => {
  if (open) previewValue.value = ''
})

function updatePreviewValue(value: string) {
  previewValue.value = value
  emit('update:previewValue', value)
}

function precisionDigits(value: string) {
  return value === '保留 1 位小数' ? 1 : value === '保留 2 位小数' ? 2 : 0
}
</script>

<style scoped>
.review-rule-preview-layer { position: fixed; inset: 0; z-index: var(--performance-confirm-z-index); display: flex; align-items: center; justify-content: center; padding: var(--spacing-4); box-sizing: border-box; background: var(--performance-dialog-overlay); }
.review-rule-preview-modal { position: relative; display: flex; flex-direction: column; width: 600px; box-sizing: border-box; border-radius: var(--performance-dialog-radius); overflow: visible; background: var(--color-bg-card); color: var(--color-text-primary); font: 400 var(--font-size-md)/22px var(--font-sans); box-shadow: var(--performance-dialog-shadow); }
.review-rule-preview-modal.is-rating,.review-rule-preview-modal.is-score { height: 158px; }.review-rule-preview-modal.is-mapping { height: calc(var(--mapping-preview-body-height, 262.667px) + 96px); }
.review-rule-preview-header { position: relative; flex: 0 0 var(--performance-dialog-header-height); height: var(--performance-dialog-header-height); padding: var(--spacing-6) var(--performance-dialog-header-padding-right) var(--spacing-6) var(--performance-dialog-padding); box-sizing: border-box; }
.review-rule-preview-header h2 { width: 520px; height: 24px; margin: 0; font-size: var(--font-size-lg); font-weight: 600; line-height: 24px; }
.review-rule-preview-body { min-height: 0; padding: 0 var(--performance-dialog-padding); box-sizing: border-box; }
.review-rule-preview-modal.is-rating .review-rule-preview-body,.review-rule-preview-modal.is-score .review-rule-preview-body { flex: 0 0 62px; height: 62px; }.review-rule-preview-modal.is-mapping .review-rule-preview-body { flex: 0 0 var(--mapping-preview-body-height, 262.667px); height: var(--mapping-preview-body-height, 262.667px); }
</style>
