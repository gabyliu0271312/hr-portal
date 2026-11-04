<template>
  <UiSortableList
    ref="sortableListRef"
    :items="items"
    item-key="id"
    :gap="8"
    class="repeatable-fill-item-list"
    data-rbd-droppable-id="form-array-list-droppable-default.entries"
    data-rbd-droppable-context-id="0"
    @reorder="(from, to) => emit('reorder', from, to)"
    @drag-start="(index) => emit('drag-start', index)"
    @drag-end="(from, to) => emit('drag-end', from, to)"
    @drag-cancel="(index) => emit('drag-cancel', index)"
  >
    <template #default="{ item, index, dragging, itemStyle }">
      <div
        class="config-box item-card saved-item"
        :class="{ 'is-dragging': dragging, 'has-horizontal-handle': horizontalHandle && controlsVisible }"
        @mouseenter="hoveredItemId = item.id"
        @mouseleave="leaveItem(item.id)"
        :style="itemStyle"
        :data-item-index="index"
        :data-sortable-index="index"
        :data-rbd-draggable-context-id="controlsVisible ? '0' : undefined"
        :data-rbd-draggable-id="controlsVisible ? `form-array-list-draggable-default.entries.${item.id}` : undefined"
      >
        <div
          class="config-box__heading"
          :data-drag-enabled="controlsVisible ? 'true' : undefined"
          :data-rbd-drag-handle-draggable-id="controlsVisible ? `form-array-list-draggable-default.entries.${item.id}` : undefined"
          :data-rbd-drag-handle-context-id="controlsVisible ? '0' : undefined"
          :aria-describedby="controlsVisible ? 'rbd-hidden-text-0-hidden-text-0' : undefined"
        >
          <span class="item-card__title">{{ itemTitle(item) }}</span>
          <PerformanceHorizontalDragHandle v-if="controlsVisible && horizontalHandle" :label="`拖拽${itemTitle(item)} ${index + 1} 调整顺序`" :dragging="dragging" :visible="hoveredItemId === item.id || dragging" @pointerdown="startPointerDrag" />
          <UiDragHandle v-else-if="controlsVisible" :label="`拖拽${itemTitle(item)} ${index + 1} 调整顺序`" :dragging="dragging" @pointerdown="startPointerDrag" />
          <span class="item-card__actions"><button v-if="controlsVisible" type="button" :aria-label="`删除${item.label?.trim() || itemTitle(item)}`" @pointerdown.stop @mousedown.stop @click.stop="emit('remove', index)"><Delete /></button></span>
        </div>

        <template v-if="props.mixed && item.kind === 'prompt'">
          <div class="prompt-item-fields"><PerformancePromptForm v-if="item.prompt" v-model="item.prompt" variant="inline" :invalid="invalid" /></div>
        </template>
        <template v-else-if="props.mixed && item.kind === 'rating'">
          <PerformanceAssessmentSelect class="inside-select" label="评估项" required placeholder="请选择" :options="ratingOptions" :model-value="item.ratingOptionId || item.id" :invalid="invalid && !item.ratingOptionId && !item.label" empty-text="暂无评估项" @update:model-value="selectRating(item, $event)" />
        </template>
        <template v-else>
          <div v-if="showQuestionType" class="fill-item-fields">
            <fieldset class="type-field"><legend>填写题类型<i>*</i></legend><label v-for="option in questionTypeOptions" :key="option.value" class="question-type-option"><input :checked="(item.questionType || 'text') === option.value" type="radio" :name="`custom-question-type-${item.id}`" :value="option.value" @change="setQuestionType(item.id, option.value)" /><span>{{ option.label }}</span></label></fieldset>
            <template v-if="item.questionType === 'tag'">
              <PerformanceAssessmentSelect class="inside-select" label="标签型填写题" required placeholder="请选择" :options="tagOptions" :model-value="item.tagOptionId" empty-text="暂无标签题" @update:model-value="updateTag(item.id, $event)" />
              <div v-if="selectedTag(item)" class="default-all"><strong>默认全部填写</strong><UiSwitch v-model="item.defaultAll" aria-label="默认全部填写" /></div>
            </template>
            <template v-else>
              <PerformanceFormField v-model="item.label" inside label="填写题名称" required placeholder="请输入" :invalid="invalid && !item.label.trim()" />
              <PerformanceFormField v-model="item.hint" inside label="提示" textarea placeholder="请输入填写提示" />
              <div v-if="item.questionType === 'single'" class="single-options">
                <span class="single-options__legend">选项<i>*</i></span>
                <div v-for="(option, index) in item.options || []" :key="option.id" class="single-options__row">
                  <input class="single-options__input" :value="option.label" placeholder="请输入选项内容" :aria-label="`选项 ${index + 1}`" @input="updateOptionLabel(item, index, ($event.target as HTMLInputElement).value)">
                  <button class="single-options__remove" type="button" :aria-label="`删除选项 ${index + 1}`" :disabled="(item.options || []).length <= 2" @click="removeOption(item, index)"><Delete /></button>
                </div>
                <button class="single-options__add" type="button" @click="addOption(item)"><Plus /> 添加选项</button>
              </div>
            </template>
          </div>
          <template v-else>
            <PerformanceFormField v-model="item.label" inside label="填写题名称" required placeholder="请输入" :invalid="invalid && !item.label.trim()" />
            <PerformanceFormField v-model="item.hint" inside label="提示" textarea placeholder="请输入填写提示" />
          </template>
        </template>
      </div>
    </template>
  </UiSortableList>
  <div v-if="controlsVisible" id="rbd-hidden-text-0-hidden-text-0" class="drag-instruction" aria-hidden="true">Press space bar to start a drag. When dragging you can use the arrow keys to move the item around and escape to cancel. Some screen readers may require you to be in focus mode or to pass through key</div>
  <div class="sr-only" aria-live="assertive">{{ dragAnnouncement }}</div>
  <div class="add-area">
    <PerformanceItemAddMenu v-if="mixed" @select="emit('add', $event)" />
    <button v-else class="add-button" type="button" @click="emit('add', 'fill')"><Plus /> 添加</button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import type { PerformancePromptValue } from '@/api/performance'
import PerformanceAssessmentSelect from './PerformanceAssessmentSelect.vue'
import UiDragHandle from '../ui/UiDragHandle.vue'
import PerformanceHorizontalDragHandle from './PerformanceHorizontalDragHandle.vue'
import PerformanceFormField from './PerformanceFormField.vue'
import PerformanceItemAddMenu from './PerformanceItemAddMenu.vue'
import PerformancePromptForm from './PerformancePromptForm.vue'
import UiSortableList from '../ui/UiSortableList.vue'
import UiSwitch from '../ui/UiSwitch.vue'

type TagOption = { id: string; label: string; description?: string; defaultFields?: Array<{ label: string; content: string }> }
type RatingOption = { id: string; label: string; description?: string; disabled?: boolean; disabledReason?: string; levels?: string[]; levelOptions?: Array<{ id: string; code?: string; label: string; name?: string; description?: string; color?: string }>; displayMode?: '标签样式' | '下拉样式' }
export type FillItem = { id: string; label: string; hint: string; richText?: string; kind?: 'rating' | 'fill' | 'prompt'; prompt?: PerformancePromptValue; ratingOptionId?: string; ratingDisplayMode?: '标签样式' | '下拉样式'; questionType?: 'text' | 'tag' | 'single'; tagOptionId?: string; defaultAll?: boolean; options?: Array<{ id: string; code?: string; label: string; name?: string; description?: string; placeholder?: string; color?: string }> }

const props = withDefaults(defineProps<{ items: FillItem[]; horizontalHandle?: boolean; invalid?: boolean; showQuestionType?: boolean; tagOptions?: TagOption[]; mixed?: boolean; ratingOptions?: RatingOption[] }>(), { invalid: false, showQuestionType: false, tagOptions: () => [], mixed: false, ratingOptions: () => [] })
const emit = defineEmits<{
  add: [kind?: 'fill' | 'prompt']
  remove: [index: number]
  reorder: [from: number, to: number]
  'drag-start': [index: number]
  'drag-end': [from: number, to: number]
  'drag-cancel': [index: number]
  'update:items': [items: FillItem[]]
}>()

const sortableListRef = ref<InstanceType<typeof UiSortableList> | null>(null)
const dragAnnouncement = ref('')
const hoveredItemId = ref<string | null>(null)
function leaveItem(itemId: string) { if (hoveredItemId.value === itemId) hoveredItemId.value = null }
const controlsVisible = computed(() => props.items.length >= 2)
const questionTypeOptions = [{ value: 'text', label: '文本型填写题' }, { value: 'tag', label: '标签型填写题' }, { value: 'single', label: '单选组' }]
function itemTitle(item: FillItem) { return item.kind === 'prompt' ? '提示' : item.kind === 'rating' ? '评估项' : '填写项' }
function startPointerDrag(event: PointerEvent) { sortableListRef.value?.startPointerDrag(event) }
function setQuestionType(id: string, questionType: string) {
  const type = questionType === 'tag' ? 'tag' : questionType === 'single' ? 'single' : 'text'
  emit('update:items', props.items.map(item => item.id === id ? {
    ...item, questionType: type, tagOptionId: '', defaultAll: false,
    /* 单选组默认给两个空选项，保证配置面板一打开就能填 */
    options: type === 'single' ? [{ id: `${item.id}-option-1`, label: '' }, { id: `${item.id}-option-2`, label: '' }] : undefined,
  } : item))
}
function updateItemOptions(item: FillItem, options: Array<{ id: string; label: string }>) {
  emit('update:items', props.items.map(candidate => candidate.id === item.id ? { ...candidate, options } : candidate))
}
function updateOptionLabel(item: FillItem, index: number, label: string) {
  const options = (item.options || []).map((option, optionIndex) => optionIndex === index ? { ...option, label } : option)
  updateItemOptions(item, options)
}
function addOption(item: FillItem) {
  const options = [...(item.options || []), { id: `${item.id}-option-${(item.options || []).length + 1}`, label: '' }]
  updateItemOptions(item, options)
}
function removeOption(item: FillItem, index: number) {
  updateItemOptions(item, (item.options || []).filter((_, optionIndex) => optionIndex !== index))
}
function selectedTag(item: FillItem) { return props.tagOptions.find(option => option.id === item.tagOptionId) }
function updateTag(id: string, tagOptionId: string) { const tag = props.tagOptions.find(option => option.id === tagOptionId); const options = tag?.defaultFields?.map((field, index) => ({ id: `${tag.id}-${index}`, label: field.label, placeholder: field.content })); emit('update:items', props.items.map(item => item.id === id ? { ...item, label: tag?.label || '', hint: tag?.description || '', tagOptionId, defaultAll: false, options } : item)) }
function selectRating(item: FillItem, value: string) { const option = props.ratingOptions.find(candidate => candidate.id === value); emit('update:items', props.items.map(candidate => candidate.id === item.id ? { ...candidate, kind: 'rating', ratingOptionId: value, options: option?.levelOptions || option?.levels?.map((label, index) => ({ id: `${value}-${index}`, label })), ratingDisplayMode: option?.displayMode, label: option?.label || '', hint: '' } : candidate)) }
</script>

<style scoped>
.has-horizontal-handle{position:relative}
.has-horizontal-handle:focus-within .performance-horizontal-drag-handle{opacity:1;pointer-events:auto}
.has-horizontal-handle .performance-horizontal-drag-handle{position:absolute;top:0;left:0}
.has-horizontal-handle .config-box__heading{padding-top:24px}
.repeatable-fill-item-list { display: flex; flex-direction: column; }
.config-box { border: 1px solid #dee0e3; border-radius: 6px; }
.saved-item { overflow: hidden; }
.config-box__heading { display: flex; align-items: center; min-height: 42px; padding: 10px 12px 10px 20px; box-sizing: border-box; background: #f8f9fa; color: #646a73; }
.item-card__title { flex: 1; font-size: 12px; font-weight: 400; line-height: 18px; }
.item-card__actions { display: flex; align-items: center; }
.item-card__actions button { display: grid; place-items: center; width: 24px; height: 24px; padding: 4px; border: 0; background: transparent; color: #646a73; cursor: pointer; }
.item-card__actions button:hover, .item-card__actions button:focus-visible { background: var(--performance-menu-item-hover-background); outline: 0; }
.item-card__actions svg { width: 12px; }
.fill-item-fields, .prompt-item-fields { padding: var(--spacing-5); }
.fill-item-fields .type-field { margin: 0 0 20px; padding: 0; border: 0; }
.fill-item-fields .type-field legend { margin-bottom: 8px; font-weight: 600; }
.fill-item-fields .type-field i { margin-left: 2px; color: #f54a45; font-style: normal; }
.question-type-option { display: inline-flex; align-items: center; height: 22px; margin-right: 24px; color: #1f2329; line-height: 22px; cursor: pointer; }
.question-type-option input { width: 16px; height: 16px; margin: 0 8px 0 0; accent-color: var(--color-primary); }
.single-options { display: flex; flex-direction: column; gap: 8px; }
.single-options__legend { color: #1f2329; font-size: 14px; line-height: 22px; }
.single-options__legend i { margin-left: 2px; color: #f54a45; font-style: normal; }
.single-options__row { display: flex; align-items: center; gap: 8px; }
.single-options__input { flex: 1; min-width: 0; height: 32px; padding: 0 12px; box-sizing: border-box; border: 1px solid #d0d3d6; border-radius: 6px; font-family: inherit; font-size: 14px; line-height: 22px; color: #1f2329; }
.single-options__input:focus { border-color: #1456f0; outline: none; }
.single-options__remove { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: #646a73; cursor: pointer; }
.single-options__remove:disabled { color: #bbbfc4; cursor: not-allowed; }
.single-options__add { display: inline-flex; align-items: center; gap: 4px; align-self: flex-start; height: 32px; padding: 0 12px; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; font-family: inherit; font-size: 14px; color: #1f2329; cursor: pointer; }
.fill-item-fields .inside-select, .saved-item > .inside-select { margin: 18px 20px; }
.fill-item-fields .default-all { margin: 16px 0 0; }
.drag-instruction, .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.add-area { margin-top: 8px; }
.add-button { display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%; height: 46px; border: 0; background: #f5f6f7; color: #245bdb; font: inherit; cursor: pointer; }
.add-button:hover, .add-button:focus-visible { background: #eff0f1; outline: 0; }
.add-button svg { width: 14px; }
</style>
