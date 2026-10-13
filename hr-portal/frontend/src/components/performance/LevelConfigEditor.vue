<script setup lang="ts">
import { computed, ref } from 'vue'
import AddOutlinedIcon from './AddOutlinedIcon.vue'
import ColorPicker from './ColorPicker.vue'
import { PERFORMANCE_LEVEL_COLORS } from './performanceColorOptions'
import PerformanceDragHandle from './PerformanceDragHandle.vue'
import PerformanceIconButton from './PerformanceIconButton.vue'
import PerformanceNumberInput from './PerformanceNumberInput.vue'
import PerformanceSortableList from './PerformanceSortableList.vue'
import type { ReviewRuleLevel } from './ReviewRuleForm.vue'

const props = withDefaults(defineProps<{
  levels: ReviewRuleLevel[]
  quantified?: boolean
  structureLocked?: boolean
  quantifiedScoreDisabled?: boolean
  errors?: boolean[]
  quantifiedErrors?: boolean[]
  minimumError?: boolean
}>(), {
  quantified: false,
  structureLocked: false,
  quantifiedScoreDisabled: false,
  errors: () => [],
  quantifiedErrors: () => [],
  minimumError: false,
})

const emit = defineEmits<{
  'update:levels': [levels: ReviewRuleLevel[]]
  add: []
  remove: [index: number]
  reorder: [from: number, to: number]
}>()

const colors = PERFORMANCE_LEVEL_COLORS.map((option) => option.value)
const levelErrors = computed(() => props.errors ?? [])
const stableLevels = computed(() => props.levels.map((level, index) => ({ ...level, id: level.id ?? `review-level-${index + 1}` })))
let generatedLevelId = 0
const levelActionError = ref(false)

function updateLevel(index: number, patch: Partial<ReviewRuleLevel>) {
  emit('update:levels', stableLevels.value.map((level, levelIndex) => levelIndex === index ? { ...level, ...patch } : level))
}

function reorderLevels(from: number, to: number) {
  if (from === to) return
  const levels = stableLevels.value.slice()
  const [level] = levels.splice(from, 1)
  levels.splice(to, 0, level)
  emit('reorder', from, to)
  emit('update:levels', levels)
}

function addLevel() {
  if (props.levels.length >= 10) return
  levelActionError.value = false
  emit('add')
  const level = {
    id: `review-level-new-${++generatedLevelId}`,
    color: colors[props.levels.length % colors.length],
    code: '',
    name: '',
    quantifiedScore: '',
    value: '',
  }
  emit('update:levels', [...stableLevels.value, level])
}

function removeLevel(index: number) {
  if (props.levels.length <= 1) {
    levelActionError.value = true
    return
  }
  const nextLevels = stableLevels.value.filter((_, levelIndex) => levelIndex !== index)
  levelActionError.value = nextLevels.length < 2
  emit('remove', index)
  emit('update:levels', nextLevels)
}
</script>

<template>
  <div class="level-config-editor" :class="{ quantified }" :data-quantified="quantified" aria-label="等级编辑器">
    <PerformanceSortableList :items="stableLevels" item-key="id" :disabled="structureLocked" :gap="8" @reorder="reorderLevels">
      <template #default="{ item: level, index, dragging, itemStyle }">
        <div class="level-row" :class="{ 'is-dragging': dragging, quantified }" :style="itemStyle" :data-sortable-index="index" :data-level-id="level.id">
          <PerformanceDragHandle :label="`拖拽第${index + 1}个等级`" :dragging="dragging" :disabled="structureLocked" />
          <div class="level-content-grid" :class="{ quantified }">
            <ColorPicker :model-value="level.color" :label="`选择第${index + 1}个等级颜色`" @update:model-value="(color) => updateLevel(index, { color })" />
            <div class="level-code-control">
              <input v-model="level.code" class="native-input" :class="{ error: levelErrors[index] }" placeholder="请输入「中文」等级代号" maxlength="12" @input="updateLevel(index, { code: level.code })" />
              <span v-if="levelErrors[index]" class="error-text">等级代号为必填</span>
            </div>
            <input v-model="level.name" class="native-input level-name-input" placeholder="请输入等级名称" maxlength="40" @input="updateLevel(index, { name: level.name })" />
            <div v-if="quantified" class="quantified-score-control">
              <PerformanceNumberInput
                :model-value="level.quantifiedScore"
                placeholder="请输入数字"
                :aria-label="`第${index + 1}个等级量化分`"
                width="112px"
                size="compact"
                :step="0.1"
                :precision="1"
                :min="0"
                :disabled="quantifiedScoreDisabled"
                required
                :invalid="quantifiedErrors[index]"
                @update:model-value="(quantifiedScore) => updateLevel(index, { quantifiedScore })"
              />
              <span v-if="quantifiedErrors[index]" class="error-text">量化分为必填</span>
            </div>
            <PerformanceNumberInput
              :model-value="level.value"
              placeholder="请输入数字"
              :aria-label="`第${index + 1}个等级量化值`"
              :width="quantified ? '112px' : '135px'"
              size="compact"
              :step="0.1"
              :precision="1"
              :min="0"
              @update:model-value="(value) => updateLevel(index, { value })"
            />
          </div>
          <PerformanceIconButton v-if="!structureLocked" icon="DeleteTrashOutlined" :label="`删除第${index + 1}个等级`" :disabled="levels.length <= 1" @click="removeLevel(index)" />
        </div>
      </template>
    </PerformanceSortableList>
    <button v-if="!structureLocked" class="add-level-button" type="button" :disabled="levels.length >= 10" @click="addLevel"><AddOutlinedIcon />添加等级</button>
    <div v-if="levelActionError || minimumError" class="mt-1 text-R-500 whitespace-pre-line">无法删除，需保留至少两个非隐藏型等级</div>
  </div>
</template>

<style scoped>
.level-config-editor { width: 100%; }
.level-row { display: flex; align-items: flex-start; width: 100%; min-height: 32px; margin-bottom: 12px; }
.level-row.quantified { min-height: 32px; }
.level-row.is-dragging { display: flex; }
.level-content-grid { display: grid; min-width: 0; flex: 1 1 auto; grid-template-columns: 24px minmax(0, 1fr) minmax(0, 1fr) 135px; gap: 8px; align-items: start; }
.level-content-grid.quantified { grid-template-columns: 24px minmax(0, 1fr) minmax(0, 1fr) 112px 112px; }
.level-code-control, .quantified-score-control { min-width: 0; }
.native-input { width: 100%; height: 32px; padding: 4px 11px; box-sizing: border-box; border: 1px solid #d0d3d6; border-radius: 6px; outline: none; color: #1f2329; font: 400 14px/22px inherit; }
.native-input:focus { border-color: #1456f0; }
.native-input.error { border-color: #f54a45; }
.error-text { display: block; margin-top: 4px; color: #f54a45; font-size: 12px; line-height: 18px; }
.mt-1.text-R-500 { min-width: 0; min-height: 0; margin-top: 2px; box-sizing: border-box; color: #f54a45; font: 400 14px/21px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; white-space: pre-line; }
.level-row :deep(.performance-number-input) { align-self: flex-start; }
.level-row :deep(.performance-number-input input) { align-self: center; height: 22px; }
.level-row > :deep(.performance-drag-handle) { margin-right: 4px; }
.level-row > :deep(.performance-icon-button) { flex: 0 0 24px; width: 24px; height: 24px; margin-top: 4px; }
.add-level-button { display: inline-flex; align-items: center; height: 22px; padding: 0; border: 0; background: transparent; color: #3370ff; font-size: 14px; line-height: 22px; cursor: pointer; }
.add-level-button:disabled { color: #8f959e; cursor: not-allowed; }
.add-level-button :deep(svg) { width: 14px; height: 14px; margin-right: 4px; }
</style>
