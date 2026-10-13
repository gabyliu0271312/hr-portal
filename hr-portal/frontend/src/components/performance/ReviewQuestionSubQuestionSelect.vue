<script setup lang="ts">
import { computed } from 'vue'
import type { PerformanceReviewSubQuestionOption } from '@/api/performance'

const props = defineProps<{
  modelValue: number | string | null
  options: PerformanceReviewSubQuestionOption[]
  loading?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: number | string | null] }>()

const selectedOption = computed(() => props.options.find((option) => String(option.id) === String(props.modelValue)) ?? null)
</script>

<template>
  <el-select
    class="review-sub-question-select"
    :model-value="modelValue"
    placeholder="请选择"
    :loading="loading"
    :disabled="loading"
    popper-class="review-sub-question-select-popper"
    style="width: 100%"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="selectedOption" #label>
      <span class="selected-question-name">{{ selectedOption.name }}</span>
    </template>
    <el-option v-for="option in options" :key="option.id" :label="option.name" :value="option.id">
      <div class="sub-question-option-content">
        <span>{{ option.name }}</span>
        <span class="sub-question-option-type">{{ option.review_type }}</span>
      </div>
    </el-option>
  </el-select>
</template>

<style scoped>
.review-sub-question-select { width: 100%; }
.selected-question-name { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 28px; }
.sub-question-option-content { display: flex; flex-direction: column; min-width: 0; min-height: 40px; }
.sub-question-option-type { color: #646a73; font-size: 12px; line-height: 20px; }
:global(.review-sub-question-select-popper .el-select-dropdown__item) { height: 50px; padding: 4px 20px; box-sizing: border-box; line-height: 22px; white-space: normal; }
</style>
