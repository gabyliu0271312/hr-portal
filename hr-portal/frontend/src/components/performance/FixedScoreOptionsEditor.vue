<script setup lang="ts">
import { computed } from 'vue'
import PerformanceDragHandle from './PerformanceDragHandle.vue'
import PerformanceIconButton from './PerformanceIconButton.vue'
import PerformanceSortableList from './PerformanceSortableList.vue'
import PerformanceTextField from './PerformanceTextField.vue'
import { fixedScoreErrorMessage, getFixedScoreError, type FixedScoreError } from './fixedScoreValidation'

export interface FixedScoreOption {
  id: string
  value: string
}

const props = withDefaults(defineProps<{
  options: FixedScoreOption[]
  errors?: Array<FixedScoreError | undefined>
  requiredErrors?: boolean[]
  disabled?: boolean
}>(), {
  errors: () => [],
  requiredErrors: () => [],
  disabled: false,
})

const emit = defineEmits<{
  'update:options': [options: FixedScoreOption[]]
  add: []
  remove: [index: number]
  reorder: [from: number, to: number]
}>()

const canAddOption = computed(() => props.options.length < 20)
let optionId = 0

function errorAt(index: number): FixedScoreError | undefined {
  if (props.requiredErrors[index]) return 'required'
  return props.errors[index] ?? (() => {
    const error = getFixedScoreError(props.options[index].value, props.options, index)
    return error === 'required' ? undefined : error
  })()
}

function updateOption(index: number, value: string) {
  emit('update:options', props.options.map((option, optionIndex) => optionIndex === index ? { ...option, value } : option))
}

function addOption() {
  if (!canAddOption.value) return
  emit('add')
  emit('update:options', [...props.options, { id: `fixed-score-new-${++optionId}`, value: '' }])
}

function removeOption(index: number) {
  if (props.options.length <= 2) return
  emit('remove', index)
  emit('update:options', props.options.filter((_, optionIndex) => optionIndex !== index))
}

function reorderOptions(from: number, to: number) {
  if (from === to) return
  const next = props.options.slice()
  const [moved] = next.splice(from, 1)
  if (!moved) return
  next.splice(to, 0, moved)
  emit('reorder', from, to)
  emit('update:options', next)
}
</script>

<template>
  <div class="fixed-score-options-editor" aria-label="固定分值选项">
    <PerformanceSortableList :items="options" item-key="id" :disabled="disabled" :gap="8" class="fixed-score-options-list" @reorder="reorderOptions">
      <template #default="{ item: option, index, dragging, itemStyle }">
        <div class="fixed-score-option-row" :class="{ 'is-dragging': dragging }" :style="itemStyle" :data-sortable-index="index">
          <PerformanceDragHandle :label="`拖拽第${index + 1}个固定分值`" :dragging="dragging" :disabled="disabled" />
          <div class="fixed-score-option-field">
            <PerformanceTextField
              :model-value="option.value"
              variant="fixed-score"
              width="360px"
              placeholder="请输入分值"
              :invalid="Boolean(errorAt(index))"
              :disabled="disabled"
              @update:model-value="updateOption(index, $event)"
            />
            <span v-if="errorAt(index)" class="fixed-score-option-error">{{ fixedScoreErrorMessage(errorAt(index)) }}</span>
          </div>
          <PerformanceIconButton v-if="!disabled && options.length > 2" icon="DeleteTrashOutlined" :label="`删除第${index + 1}个固定分值`" @click="removeOption(index)" />
        </div>
      </template>
    </PerformanceSortableList>
    <button v-if="!disabled" class="add-fixed-score-button" :class="{ 'is-disabled': !canAddOption }" type="button" :disabled="!canAddOption" @click="addOption">＋ 添加分值</button>
  </div>
</template>

<style scoped>
.fixed-score-options-editor { width: 100%; }
.fixed-score-options-list { width: 100%; }
.fixed-score-option-row { display: grid; grid-template-columns: 16px 360px 24px; column-gap: 4px; align-items: start; min-height: 32px; margin-bottom: 8px; }
.fixed-score-option-row.is-dragging { opacity: .72; }
.fixed-score-option-field { min-width: 0; }
.fixed-score-option-error { display: block; margin-top: 4px; color: #f54a45; font-size: 12px; line-height: 18px; }
.add-fixed-score-button { display: inline-flex; align-items: center; height: 22px; padding: 0; border: 0; background: transparent; color: #3370ff; font-size: 14px; line-height: 22px; cursor: pointer; }
.add-fixed-score-button.is-disabled { color: #8f959e; cursor: not-allowed; }
</style>
