<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PerformanceRadioOption } from './PerformanceRadioGroup.vue'
import ReviewQuestionMethodSelector from './ReviewQuestionMethodSelector.vue'

const props = defineProps<{
  variant: 'score_range' | 'score_fixed' | 'score_mapping'
  config: Record<string, unknown>
  modelValue?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const fullOptions: PerformanceRadioOption[] = [
  { value: 'direct', label: '直接评分', showInfo: true },
  { value: 'sub_items', label: '按子评估项评分', showInfo: true },
  { value: 'total_score', label: '作为总分项计算评分', showInfo: true },
]

function normalizeMethod(value: unknown): string {
  const text = String(value ?? '')
  if (text === 'sub_items' || text.includes('子评估项')) return 'sub_items'
  if (text === 'total_score' || text.includes('总分项')) return 'total_score'
  return 'direct'
}

const options = computed(() => props.variant === 'score_fixed' ? fullOptions.slice(0, 1) : fullOptions)
const selectedMethod = ref(props.modelValue || (props.variant === 'score_fixed' ? 'direct' : normalizeMethod(props.config.evaluationMethod ?? props.config.evaluation_method)))

watch(() => [props.variant, props.config, props.modelValue] as const, () => {
  selectedMethod.value = props.modelValue || (props.variant === 'score_fixed' ? 'direct' : normalizeMethod(props.config.evaluationMethod ?? props.config.evaluation_method))
}, { deep: true })

watch(selectedMethod, (value) => emit('update:modelValue', value))
</script>

<template>
  <section class="question-card scoring-method-card" :class="{ 'has-additional': !!$slots.default }" :data-variant="variant" aria-label="评估方式">
    <h2>评估方式</h2>
    <ReviewQuestionMethodSelector
      v-model="selectedMethod"
      label="评分方式"
      :options="options"
      :name="`scoring-method-${variant}`"
    />
    <slot />
  </section>
</template>

<style scoped>
.question-card { display: flow-root; width: 800px; max-width: 100%; height: 134px; margin-bottom: 16px; padding: 20px 20px 0 21px; box-sizing: border-box; border-radius: 8px; background: #fff; box-shadow: rgba(31,35,41,0.02) 0 1px 2px -2px, rgba(31,35,41,0.02) 0 2px 4px 0, rgba(31,35,41,0.02) 0 2px 8px 2px; }
.question-card.has-additional { height: auto; padding-bottom: 20px; }
.question-card h2 { margin: 0 0 16px; color: #1f2329; font-size: 16px; font-weight: 600; line-height: 24px; }
</style>
