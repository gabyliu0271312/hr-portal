<template>
  <PerformanceSortableList
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
        :class="{ 'is-dragging': dragging }"
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
          <span class="item-card__title">填写项</span>
          <PerformanceDragHandle v-if="controlsVisible" :label="`拖拽填写项 ${index + 1} 调整顺序`" :dragging="dragging" @pointerdown="startPointerDrag" />
          <span class="item-card__actions"><button v-if="controlsVisible" type="button" :aria-label="`删除${item.label.trim() || '空白填写项'}`" @pointerdown.stop @mousedown.stop @click.stop="emit('remove', index)"><Delete /></button></span>
        </div>
        <div v-if="showQuestionType" class="fill-item-fields">
          <fieldset class="type-field"><legend>填写题类型<i>*</i></legend><label v-for="option in questionTypeOptions" :key="option.value" class="question-type-option"><input :checked="(item.questionType || 'text') === option.value" type="radio" :name="`custom-question-type-${item.id}`" :value="option.value" @change="setQuestionType(item.id, option.value)" /><span>{{ option.label }}</span></label></fieldset>
          <template v-if="item.questionType === 'tag'">
            <PerformanceAssessmentSelect class="inside-select" label="标签型填写题" required placeholder="请选择" :options="tagOptions" :model-value="item.tagOptionId" empty-text="暂无标签题" @update:model-value="updateTag(item.id, $event)" />
            <div v-if="selectedTag(item)" class="default-all"><strong>默认全部填写</strong><PerformanceSwitch v-model="item.defaultAll" aria-label="默认全部填写" /></div>
          </template>
          <template v-else>
            <PerformanceFormField v-model="item.label" inside label="填写题名称" required placeholder="请输入" :invalid="invalid && !item.label.trim()" />
            <PerformanceFormField v-model="item.hint" inside label="提示" textarea placeholder="请输入填写提示" />
          </template>
        </div>
        <template v-else>
          <PerformanceFormField v-model="item.label" inside label="填写题名称" required placeholder="请输入" :invalid="invalid && !item.label.trim()" />
          <PerformanceFormField v-model="item.hint" inside label="提示" textarea placeholder="请输入填写提示" />
        </template>
      </div>
    </template>
  </PerformanceSortableList>
  <div v-if="controlsVisible" id="rbd-hidden-text-0-hidden-text-0" class="drag-instruction" aria-hidden="true">Press space bar to start a drag. When dragging you can use the arrow keys to move the item around and escape to cancel. Some screen readers may require you to be in focus mode or to use your pass through key</div>
  <div class="sr-only" aria-live="assertive">{{ dragAnnouncement }}</div>
  <div class="add-area"><button class="add-button" type="button" @click="emit('add')"><Plus /> 添加</button></div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import PerformanceAssessmentSelect from './PerformanceAssessmentSelect.vue'
import PerformanceDragHandle from './PerformanceDragHandle.vue'
import PerformanceFormField from './PerformanceFormField.vue'
import PerformanceSortableList from './PerformanceSortableList.vue'
import PerformanceSwitch from './PerformanceSwitch.vue'

type TagOption = { id: string; label: string; description?: string; defaultFields?: Array<{ label: string; content: string }> }
type FillItem = { id: string; label: string; hint: string; richText?: string; questionType?: 'text' | 'tag'; tagOptionId?: string; defaultAll?: boolean; options?: Array<{ id: string; label: string; placeholder?: string; color?: string }> }

const props = withDefaults(defineProps<{ items: FillItem[]; invalid?: boolean; showQuestionType?: boolean; tagOptions?: TagOption[] }>(), { invalid: false, showQuestionType: false, tagOptions: () => [] })
const emit = defineEmits<{
  add: []
  remove: [index: number]
  reorder: [from: number, to: number]
  'drag-start': [index: number]
  'drag-end': [from: number, to: number]
  'drag-cancel': [index: number]
  'update:items': [items: FillItem[]]
}>()

const sortableListRef = ref<InstanceType<typeof PerformanceSortableList> | null>(null)
const dragAnnouncement = ref('')
const controlsVisible = computed(() => props.items.length >= 2)
const questionTypeOptions = [{ value: 'text', label: '文本型填写题' }, { value: 'tag', label: '标签型填写题' }]

function startPointerDrag(event: PointerEvent) {
  sortableListRef.value?.startPointerDrag(event)
}

function setQuestionType(id: string, questionType: string) {
  const type = questionType === 'tag' ? 'tag' : 'text'
  emit('update:items', props.items.map(item => item.id === id ? { ...item, questionType: type, tagOptionId: '', defaultAll: false, options: undefined } : item))
}

function selectedTag(item: FillItem) {
  return props.tagOptions.find(option => option.id === item.tagOptionId)
}

function updateTag(id: string, tagOptionId: string) {
  const tag = props.tagOptions.find(option => option.id === tagOptionId)
  const options = tag?.defaultFields?.map((field, index) => ({ id: `${tag.id}-${index}`, label: field.label, placeholder: field.content }))
  emit('update:items', props.items.map(item => item.id === id ? { ...item, tagOptionId, defaultAll: false, options } : item))
}
</script>

<style scoped>
.repeatable-fill-item-list { display: flex; flex-direction: column; }
.config-box { border: 1px solid #dee0e3; border-radius: 6px; }
.saved-item { overflow: hidden; }
.config-box__heading { display: flex; align-items: center; min-height: 42px; padding: 10px 12px 10px 20px; box-sizing: border-box; background: #f8f9fa; color: #646a73; }
.item-card__title { flex: 1; font-size: 12px; font-weight: 400; line-height: 18px; }
.item-card__actions { display: flex; align-items: center; }
.item-card__actions button { display: grid; place-items: center; width: 24px; height: 24px; padding: 4px; border: 0; background: transparent; color: #646a73; cursor: pointer; }
.item-card__actions button:hover, .item-card__actions button:focus-visible { background: rgba(31, 35, 41, .2); outline: 0; }
.item-card__actions svg { width: 12px; height: 12px; }
.fill-item-fields { padding: 20px; }
.fill-item-fields .type-field { margin: 0 0 20px; padding: 0; border: 0; }
.fill-item-fields .type-field legend { margin-bottom: 8px; font-weight: 600; }
.fill-item-fields .type-field i { margin-left: 2px; color: #f54a45; font-style: normal; }
.question-type-option { display: inline-flex; align-items: center; height: 22px; margin-right: 24px; color: #1f2329; line-height: 22px; cursor: pointer; }
.question-type-option input { width: 16px; height: 16px; margin: 0 8px 0 0; accent-color: #1456f0; }
.fill-item-fields .inside-select { margin: 0; }
.fill-item-fields .default-all { margin: 16px 0 0; }
.drag-instruction, .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.add-area { margin-top: 8px; }
.add-button { display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%; height: 46px; border: 0; background: #f5f6f7; color: #245bdb; font: inherit; cursor: pointer; }
.add-button:hover, .add-button:focus-visible { background: #eff0f1; outline: 0; }
.add-button svg { width: 14px; }
</style>
