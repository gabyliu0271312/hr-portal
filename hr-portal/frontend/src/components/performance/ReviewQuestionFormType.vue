<script setup lang="ts">
import { computed } from 'vue'
import { QUESTION_TYPE_OPTIONS } from './reviewQuestionTypes'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'

const props = withDefaults(defineProps<{ modelValue: string; entryMode?: 'regular_question' | 'sub_question' }>(), { entryMode: 'regular_question' })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const options = computed(() => QUESTION_TYPE_OPTIONS
  .filter((option) => props.entryMode === 'regular_question' || option.key !== 'okr')
  .map((option) => ({ value: option.key, label: option.label, showInfo: true })))
</script>

<template>
  <PerformanceRadioGroup
    class="rq-type-radio"
    :model-value="modelValue"
    :options="options"
    name="review-question-type"
    aria-label="评估题类型"
    :gap="28"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

<style scoped>
.rq-type-radio { width: 100%; }
</style>
