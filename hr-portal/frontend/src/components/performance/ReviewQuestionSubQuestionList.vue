<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PerformanceReviewSubQuestionOption } from '@/api/performance'
import PerformanceDragHandle from './PerformanceDragHandle.vue'
import PerformanceIconButton from './PerformanceIconButton.vue'
import PerformanceSortableList from './PerformanceSortableList.vue'
import ReviewQuestionSubQuestionSelect from './ReviewQuestionSubQuestionSelect.vue'

export type ReviewQuestionSubQuestion = { id: string; question_id: number | string | null }

const props = defineProps<{
  modelValue: ReviewQuestionSubQuestion[]
  calculationRule: string
  options: PerformanceReviewSubQuestionOption[]
  loading?: boolean
  validationMessage?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [value: ReviewQuestionSubQuestion[]]
  'create-sub-question': []
}>()

const pickerOpen = ref(false)
const pickerQuery = ref('')
const rootRef = ref<HTMLElement | null>(null)
const isCondition = computed(() => props.calculationRule === 'condition')
const showWeight = computed(() => props.calculationRule === 'weighted_sum')
const filteredOptions = computed(() => {
  const query = pickerQuery.value.trim().toLowerCase()
  return query ? props.options.filter((option) => `${option.name} ${option.rule_name}`.toLowerCase().includes(query)) : props.options
})
const selectedIds = computed(() => new Set(props.modelValue.map((row) => row.question_id).filter((id): id is number | string => id !== null)))
const selectedOption = (questionId: number | string | null) => props.options.find((option) => String(option.id) === String(questionId)) ?? null

function updateQuestion(index: number, questionId: number | string | null) {
  emit('update:modelValue', props.modelValue.map((row, rowIndex) => rowIndex === index ? { ...row, question_id: questionId } : row))
}

function openPicker() {
  pickerQuery.value = ''
  pickerOpen.value = true
}

function selectOption(option: PerformanceReviewSubQuestionOption) {
  const optionId = String(option.id)
  const selectedRows = props.modelValue.filter((row) => String(row.question_id) === optionId)
  if (selectedRows.length) {
    emit('update:modelValue', props.modelValue.filter((row) => String(row.question_id) !== optionId))
    return
  }
  const emptyIndex = props.modelValue.findIndex((row) => row.question_id === null)
  if (emptyIndex >= 0) updateQuestion(emptyIndex, option.id)
  else emit('update:modelValue', [...props.modelValue, { id: `sub-question-${props.modelValue.length + 1}`, question_id: option.id }])
}

function removeRow(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, rowIndex) => rowIndex !== index))
}

function reorder(from: number, to: number) {
  if (from === to) return
  const next = props.modelValue.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  emit('update:modelValue', next)
}

function scoreBounds(option: PerformanceReviewSubQuestionOption | null): string {
  return option?.score_min !== null && option?.score_min !== undefined && option?.score_max !== null && option?.score_max !== undefined
    ? `${option.score_min} - ${option.score_max}`
    : '--'
}

function handleDocumentClick(event: MouseEvent) {
  if (!pickerOpen.value || !rootRef.value) return
  if (!rootRef.value.contains(event.target as Node)) pickerOpen.value = false
}

onMounted(() => document.addEventListener('click', handleDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', handleDocumentClick))

watch(() => [props.calculationRule, props.options.map((option) => String(option.id)).join(',')] as const, () => {
  const validIds = new Set(props.options.map((option) => option.id))
  const next = props.modelValue.filter((row) => row.question_id === null || validIds.has(row.question_id))
  if (next.length !== props.modelValue.length || next.some((row, index) => row.question_id !== props.modelValue[index]?.question_id)) emit('update:modelValue', next)
})
</script>

<template>
  <div ref="rootRef" class="sub-question-list" :class="{ 'is-sortable': !isCondition, 'is-condition': isCondition, 'has-weight': showWeight }" data-component="review-question-sub-question-list" @keydown.esc="pickerOpen = false">
    <div class="additional-label">子评估题<span class="required-mark">*</span></div>

    <template v-if="!isCondition">
      <div class="sub-question-header sortable-grid" aria-hidden="true">
        <span class="name-column">子评估题</span>
        <span class="rule-column">评估规则</span>
        <span class="bounds-column">评分上下限</span>
        <span v-if="showWeight" class="weight-column">权重</span>
      </div>
      <PerformanceSortableList :items="modelValue" item-key="id" :gap="12" @reorder="reorder">
        <template #default="{ item, index, dragging, itemStyle }">
          <div class="sub-question-row sortable-grid" :class="{ 'is-dragging': dragging }" :data-sortable-index="index" :style="itemStyle">
            <PerformanceDragHandle :label="`拖动第${index + 1}个子评估题`" :dragging="dragging" />
            <ReviewQuestionSubQuestionSelect class="name-column" :model-value="item.question_id" :options="options" :loading="loading" @update:model-value="updateQuestion(index, $event)" />
            <div class="derived-cell rule-column" aria-label="评估规则">{{ selectedOption(item.question_id)?.rule_name ?? '--' }}</div>
            <div class="derived-cell bounds-column" aria-label="评分上下限">{{ scoreBounds(selectedOption(item.question_id)) }}</div>
            <div v-if="showWeight" class="derived-cell weight-column" aria-label="权重">--</div>
            <PerformanceIconButton class="delete-column" icon="DeleteTrashOutlined" :label="`删除第${index + 1}个子评估题`" @click="removeRow(index)" />
          </div>
        </template>
      </PerformanceSortableList>
    </template>

    <template v-else>
      <div class="sub-question-header condition-grid" aria-hidden="true">
        <span>子评估题</span>
        <span>评估规则</span>
      </div>
      <div v-for="(row, index) in modelValue" :key="row.id" class="sub-question-row condition-grid">
        <ReviewQuestionSubQuestionSelect :model-value="row.question_id" :options="options" :loading="loading" @update:model-value="updateQuestion(index, $event)" />
        <div class="derived-cell" aria-label="评估规则">{{ selectedOption(row.question_id)?.rule_name ?? '--' }}</div>
      </div>
    </template>

    <button v-if="!isCondition" class="new-sub-question" type="button" data-action="new-sub-question" :aria-expanded="pickerOpen" @click="openPicker">＋ 新建子评估题</button>
    <div v-if="!isCondition && validationMessage" class="sub-question-validation" role="alert">{{ validationMessage }}</div>

    <div v-if="!isCondition && pickerOpen" class="sub-question-picker" role="dialog" aria-label="子评估题选择" @click.stop>
      <div class="sub-question-picker-search">
        <input v-model="pickerQuery" type="search" placeholder="通过子评估题名称搜索" aria-label="通过子评估题名称搜索" />
      </div>
      <div class="sub-question-picker-options" role="listbox" aria-label="子评估题候选">
        <button v-for="option in filteredOptions" :key="option.id" class="sub-question-picker-option" :class="{ selected: selectedIds.has(option.id) }" type="button" role="option" :aria-selected="selectedIds.has(option.id)" :data-cy="option.id" :data-id="option.id" @click="selectOption(option)">
          <span class="sub-question-picker-option-main">{{ option.name }}</span>
          <span class="sub-question-picker-option-summary">{{ option.score_min ?? '--' }}-{{ option.score_max ?? '--' }}分，{{ option.rule_name }}</span>
          <span v-if="selectedIds.has(option.id)" class="sub-question-picker-option-check" aria-hidden="true">✓</span>
        </button>
        <div v-if="!filteredOptions.length" class="sub-question-picker-empty">暂无可选子评估题</div>
      </div>
      <button class="sub-question-picker-create" type="button" @click="emit('create-sub-question')">＋ 新建子评估题</button>
    </div>
  </div>
</template>

<style scoped>
.sub-question-list { position: relative; width: 758px; max-width: 100%; margin-bottom: 20px; }
.additional-label { height: 22px; margin-bottom: 8px; color: #1f2329; font-size: 14px; font-weight: 600; line-height: 22px; }
.required-mark { margin-left: 4px; color: #f54a45; font-family: SimSun, sans-serif; font-weight: 400; }
.sub-question-header, .sub-question-row { align-items: center; width: 758px; max-width: 100%; }
.sub-question-header { display: grid; height: 22px; color: #646a73; font-size: 14px; line-height: 22px; }
.sub-question-row { min-height: 32px; }
.performance-sortable-list { margin-top: 8px; }
.performance-sortable-list :deep(.sub-question-row + .sub-question-row) { margin-top: 12px; }
.sortable-grid { display: grid; grid-template-columns: 16px 4px minmax(0, 420px) 8px 130px 8px 144px 4px 24px; }
.has-weight .sortable-grid { grid-template-columns: 16px 4px minmax(0, 300px) 8px 130px 8px 144px 8px 80px 4px 24px; }
.sortable-grid > .performance-drag-handle { grid-column: 1; }
.sortable-grid > .name-column { grid-column: 3; }
.sortable-grid > .rule-column { grid-column: 5; }
.sortable-grid > .bounds-column { grid-column: 7; }
.sortable-grid > .weight-column { grid-column: 9; }
.sortable-grid > .delete-column { grid-column: 9; }
.has-weight .sortable-grid > .delete-column { grid-column: 11; }
.condition-grid { display: grid; grid-template-columns: minmax(0, 493px) 8px minmax(0, 257px); }
.condition-grid > :first-child { grid-column: 1; }
.condition-grid > :last-child { grid-column: 3; }
.is-condition .sub-question-header + .sub-question-row { margin-top: 8px; }
.is-condition .sub-question-row + .sub-question-row { margin-top: 12px; }
.derived-cell { display: flex; align-items: center; width: 100%; height: 32px; padding: 4px 11px; overflow: hidden; box-sizing: border-box; border: 1px solid #d0d3d6; border-radius: 6px; background: #f1f2f3; color: #8f959e; font: 400 14px/22px inherit; text-overflow: ellipsis; white-space: nowrap; }
.new-sub-question { display: block; width: 110px; height: 22px; margin: 8px 0 0 -4px; padding: 0; border: 0; background: transparent; color: #1456f0; font: 400 14px/22px inherit; cursor: pointer; }
.new-sub-question:hover { color: #0d3fb8; }
.sub-question-validation { width: 100%; height: 21px; margin-top: 2px; color: #f54a45; font-size: 14px; font-weight: 400; line-height: 21px; }
.sub-question-row.is-dragging { border-radius: 6px; background: #fff; box-shadow: 0 4px 12px rgba(31,35,41,.12); }
.sub-question-picker { position: absolute; left: -4px; bottom: 30px; z-index: 1050; display: flex; flex-direction: column; width: 360px; height: 416px; box-sizing: border-box; overflow: hidden; border: 1px solid #dee0e3; border-radius: 4px; background: #fff; box-shadow: 0 4px 12px rgba(31,35,41,.12); }
.sub-question-picker-search { flex: 0 0 44px; display: flex; align-items: center; padding: 8px 12px; border-bottom: 1px solid #f1f2f3; }
.sub-question-picker-search input { width: 100%; height: 28px; border: 0; outline: none; color: #1f2329; font: 400 14px/22px inherit; }
.sub-question-picker-options { flex: 1 1 auto; overflow: auto; }
.sub-question-picker-option { position: relative; display: flex; flex-direction: column; width: 100%; min-height: 50px; padding: 4px 16px; border: 0; background: #fff; color: #1f2329; text-align: left; cursor: pointer; }
.sub-question-picker-option:hover { background: rgba(31,35,41,.08); }
.sub-question-picker-option.selected { color: #1456f0; }
.sub-question-picker-option-main { max-width: calc(100% - 24px); overflow: hidden; font-size: 14px; line-height: 22px; text-overflow: ellipsis; white-space: nowrap; }
.sub-question-picker-option-summary { color: #8f959e; font-size: 12px; line-height: 20px; }
.sub-question-picker-option-check { position: absolute; top: 14px; right: 16px; color: #3370ff; font-size: 16px; line-height: 22px; }
.sub-question-picker-empty { padding: 16px; color: #8f959e; font-size: 14px; line-height: 22px; }
.sub-question-picker-create { flex: 0 0 42px; height: 42px; padding: 0 16px; border: 0; border-top: 1px solid #f1f2f3; background: #fff; color: #1456f0; text-align: left; font: 400 14px/22px inherit; cursor: pointer; }
</style>
