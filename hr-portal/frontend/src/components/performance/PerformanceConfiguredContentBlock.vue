<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from 'vue'
import type { PerformancePromptValue } from '@/api/performance'
import type { AssessmentContentDraft } from './PerformanceAssessmentContentLayers.vue'
import PerformanceAssessmentConfiguredPreview from './PerformanceAssessmentConfiguredPreview.vue'
import PerformanceAddAnotherButton from './PerformanceAddAnotherButton.vue'
import PerformanceAssessmentPreviewHeader from './PerformanceAssessmentPreviewHeader.vue'
import PerformanceConfiguredCardActionToolbar from './PerformanceConfiguredCardActionToolbar.vue'
import PerformanceContentSelectionFrame from './PerformanceContentSelectionFrame.vue'
import PerformanceDragHandle from './PerformanceDragHandle.vue'
import PerformanceHorizontalDragHandle from './PerformanceHorizontalDragHandle.vue'
import PerformanceExpandButton from './PerformanceExpandButton.vue'
import PerformanceWorkSummaryItemSettings, { type WorkSummaryItemSettings } from './PerformanceWorkSummaryItemSettings.vue'
import PerformanceWorkSummaryRootSettings, { type WorkSummaryRootSettings } from './PerformanceWorkSummaryRootSettings.vue'
import { getItemSettingsVariant, getRootSettingsCapabilities, supportsCalibrationItemSettings, supportsEvaluationItemSettings, supportsEvaluationView, supportsResultViewSettings } from './performanceContentSettingsRules'
import PerformancePromptDisplay from './PerformancePromptDisplay.vue'

const props = withDefaults(defineProps<{
  content: AssessmentContentDraft & { id: string }
  active: boolean
  expanded: boolean
  dragging: boolean
  itemStyle?: CSSProperties
  index: number
  count: number
  toolbarVisible: boolean
  structureEditable?: boolean
  horizontalHandle?: boolean
  rootSettings: WorkSummaryRootSettings
  itemSettings: Record<string, WorkSummaryItemSettings>
  rootSettingsEnabled?: boolean
  itemSettingsEnabled?: boolean
  settingsDisabled?: boolean
  rootSettingsVariant: string
  itemSettingsVariant: string
}>(), { structureEditable: true })

const emit = defineEmits<{
  activate: [contentId: string]
  'update:expanded': [expanded: boolean]
  'update:content': [content: AssessmentContentDraft & { id: string }]
  'update:root-settings': [settings: WorkSummaryRootSettings]
  'update:item-settings': [settings: Record<string, WorkSummaryItemSettings>]
  'move-up': []
  'move-down': []
  edit: []
  delete: []
  'hover-change': [hovered: boolean]
  'settings-visibility': [visible: boolean]
}>()

const isCalibration = computed(() => props.itemSettingsVariant === 'calibration-item')
const rootDisplaySettings = computed(() => props.rootSettingsEnabled ? props.rootSettings : isCalibration.value ? props.content.settings : undefined)
const previewContent = computed(() => ({ ...props.content, settings: { ...props.content.settings, ...(props.rootSettingsEnabled ? props.rootSettings : {}) } }))
const rootCapabilities = computed(() => getRootSettingsCapabilities(props.content, props.rootSettingsVariant))
const isPromptContent = computed(() => props.content.type === 'prompt')
const rootSettingsAvailable = computed(() => Boolean(props.rootSettingsEnabled && !isPromptContent.value))
const owner = ref<'root' | 'item'>('root')
const selectedItemId = ref<string | null>(null)
const selectedPrompt = computed(() => owner.value === 'root' ? (isPromptContent.value ? props.content.prompt : undefined) : props.content.items.find(item => item.id === selectedItemId.value && item.kind === 'prompt')?.prompt)
const promptSettings = computed<WorkSummaryItemSettings>(() => ({ mode: 'fill', required: false, allowView: selectedPrompt.value?.allowView !== false, onlyWhenFilling: selectedPrompt.value?.onlyWhenFilling === true }))
const settingsAvailable = computed(() => Boolean(selectedPrompt.value && !isCalibration.value) || (owner.value === 'root' ? rootSettingsAvailable.value : selectedItemSettingsEnabled.value))
const itemSettingsVariant = computed(() => {
  if (isCalibration.value) {
    const variant = getItemSettingsVariant(props.content, props.content.items.find((candidate) => candidate.id === selectedItemId.value))
    if (variant === 'work-summary') return 'calibration-work-summary'
    if (variant === 'custom-text') return 'calibration-custom-text'
    if (variant === 'custom-tag') return 'calibration-custom-tag'
    if (variant === 'rating') return 'calibration-rating'
    return variant
  }
  if (props.itemSettingsVariant === 'evaluation-item') {
    const item = props.content.items.find((candidate) => candidate.id === selectedItemId.value)
    const variant = getItemSettingsVariant(props.content, item)
    if (variant === 'work-summary') return 'evaluation-work-summary'
    if (variant === 'custom-text' && supportsEvaluationView(props.content, item)) return 'evaluation-custom-text'
    if (variant === 'custom-tag' && supportsEvaluationView(props.content, item)) return 'evaluation-custom-tag'
    if (variant === 'rating') return 'evaluation-rating'
    return variant
  }
  if (props.itemSettingsVariant === 'result-communication-item') {
    const variant = getItemSettingsVariant(props.content, props.content.items.find((candidate) => candidate.id === selectedItemId.value))
    if (variant === 'work-summary') return 'result-communication-work-summary'
    if (variant === 'rating') return 'result-communication-rating'
    if (variant === 'custom-text') return 'result-communication-custom-text'
    if (variant === 'custom-tag') return 'result-communication-custom-tag'
    return 'result-communication-work-summary'
  }
  if (props.itemSettingsVariant === 'result-view-item') {
    const variant = getItemSettingsVariant(props.content, props.content.items.find((candidate) => candidate.id === selectedItemId.value))
    if (variant === 'work-summary') return 'result-view-work-summary'
    if (variant === 'rating') return 'result-view-rating'
    if (variant === 'custom-text') return 'result-view-custom-text'
    if (variant === 'custom-tag') return 'result-view-tag'
    return 'result-view-work-summary'
  }
  return getItemSettingsVariant(props.content, props.content.items.find((item) => item.id === selectedItemId.value))
})
const selectedItemKey = computed(() => props.active && owner.value === 'item' && selectedItemId.value ? `${props.content.id}:${selectedItemId.value}` : null)
const selectedItemSettings = computed(() => selectedItemId.value ? props.itemSettings[selectedItemId.value] || { mode: 'fill', required: true, hideName: false } : { mode: 'fill' as const, required: true, hideName: false })
const itemSettingsAvailable = (item?: { kind?: 'rating' | 'fill' | 'prompt'; questionType?: 'text' | 'tag' }) => Boolean(props.itemSettingsEnabled)
  && item?.kind !== 'prompt'
  && (!isCalibration.value || supportsCalibrationItemSettings(props.content, item))
  && (props.itemSettingsVariant !== 'evaluation-item' || supportsEvaluationItemSettings(props.content, item))
  && (props.itemSettingsVariant !== 'result-view-item' || supportsResultViewSettings(props.content, item))
const selectedItemSettingsEnabled = computed(() => itemSettingsAvailable(props.content.items.find(item => item.id === selectedItemId.value)))
const rendererItemSettings = computed<Record<string, WorkSummaryItemSettings & { readonlySurface?: boolean }>>(() => Object.fromEntries(props.content.items.filter(item => item.kind !== 'prompt' && (isCalibration.value || itemSettingsAvailable(item))).map((item) => {
  const settings: WorkSummaryItemSettings = props.itemSettings[item.id] || { mode: 'fill', required: true, hideName: false }
  if (isCalibration.value) return [item.id, { ...settings, readonlySurface: supportsCalibrationItemSettings(props.content, item) && settings.allowModify === false }]
  return [item.id, props.itemSettingsVariant === 'result-view-item' ? { ...settings, mode: 'view', required: false } : settings]
})))

watch(() => props.active && settingsAvailable.value, visible => emit('settings-visibility', visible), { immediate: true })

watch(() => props.active, (active) => {
  if (!active) selectedItemId.value = null
})

function selectRoot() {
  owner.value = 'root'
  selectedItemId.value = null
  emit('activate', props.content.id)
}

function selectItem(itemId: string) {
  owner.value = 'item'
  selectedItemId.value = itemId
  emit('activate', props.content.id)
}

function updatePromptSettings(settings: WorkSummaryItemSettings) {
  const patch: Partial<PerformancePromptValue> = { allowView: settings.allowView !== false, onlyWhenFilling: settings.onlyWhenFilling === true }
  emit('update:content', owner.value === 'root'
    ? { ...props.content, prompt: { ...selectedPrompt.value!, ...patch } }
    : { ...props.content, items: props.content.items.map(item => item.id === selectedItemId.value ? { ...item, prompt: { ...item.prompt!, ...patch } } : item) })
}

function updateItemSettings(settings: WorkSummaryItemSettings) {
  if (!selectedItemId.value) return
  emit('update:item-settings', { ...props.itemSettings, [selectedItemId.value]: settings })
}

</script>

<template>
  <PerformanceContentSelectionFrame
    tag="article"
    variant="root"
    :selected="active && owner === 'root'"
    class="configured-content-card"
    :class="{ 'rating-content-card': content.type === 'rating', 'is-result-readonly': props.itemSettingsVariant === 'result-view-item', 'is-result-tag': props.itemSettingsVariant === 'result-view-item' && content.type === 'custom' && content.items.some(item => (item.questionType || content.questionType || 'text') === 'tag'), 'is-dragging': dragging, 'hides-description': !isPromptContent && rootDisplaySettings?.hideDescription, 'allows-multiple': !isPromptContent && rootDisplaySettings?.allowMultiple }"
    :data-sortable-index="structureEditable ? index : undefined"
    :style="itemStyle"
    @mouseenter="emit('hover-change', true)"
    @mouseleave="emit('hover-change', false)"
  >
    <PerformanceHorizontalDragHandle v-if="!isCalibration && structureEditable && horizontalHandle" :label="`拖拽${content.name}`" :dragging="dragging" :disabled="settingsDisabled" />
    <PerformanceDragHandle v-else-if="!isCalibration && structureEditable" variant="strip" :label="`Drag ${content.name}`" :dragging="dragging" />
    <PerformanceConfiguredCardActionToolbar
      v-if="structureEditable"
      :visible="toolbarVisible || dragging"
      :index="index"
      :count="count"
      @move-up="emit('move-up')"
      @move-down="emit('move-down')"
      @edit="emit('edit')"
      @delete="emit('delete')"
    />
    <div class="configured-content-card__row" :class="{ 'configured-content-card__row--prompt': isPromptContent }" role="button" :tabindex="isPromptContent || toolbarVisible ? 0 : -1" :aria-label="`Select ${content.name}`" @click="selectRoot" @keydown.enter.prevent="selectRoot" @keydown.space.prevent="selectRoot">
      <div class="configured-content-card__header">
        <template v-if="isPromptContent">
          <PerformancePromptDisplay v-if="content.prompt" :value="content.prompt" />
          <strong v-else>{{ content.name }}</strong>
        </template>
        <PerformanceAssessmentPreviewHeader v-else :name="content.name" :description="rootDisplaySettings?.hideDescription ? '' : content.description" description-class="configured-content-card__description" />
      </div>
      <PerformanceExpandButton v-if="!isPromptContent" :expanded="expanded" :hover-only="true" icon-variant="regular" label="Toggle content" @toggle="emit('update:expanded', !expanded)" @click.stop />
    </div>
    <PerformanceAssessmentConfiguredPreview
      v-if="expanded && !isPromptContent"
      :content="previewContent"
      :interactive="true"
      :selected-item-id="selectedItemKey"
      :item-settings="rendererItemSettings"
      :readonly-empty-answer-text="props.itemSettingsVariant === 'result-view-item' || props.itemSettingsVariant === 'evaluation-item' || props.itemSettingsVariant === 'result-communication-item' || isCalibration ? '这里展示用户填写内容' : ''"
      class="configured-content-card__details"
      @select-item="selectItem"
    />
    <PerformanceAddAnotherButton v-if="!isPromptContent && rootDisplaySettings?.allowMultiple" class="configured-content-card__add-item" />
  </PerformanceContentSelectionFrame>

  <div v-if="active && settingsAvailable" class="configured-content-settings">
    <div v-if="selectedPrompt" class="content-settings-detail content-settings-detail--prompt" aria-label="提示内容设置">
      <PerformanceWorkSummaryItemSettings :model-value="promptSettings" variant="prompt" @update:model-value="updatePromptSettings" />
    </div>
    <div v-else-if="owner === 'root'" class="content-settings-detail content-settings-detail--root" aria-label="Selected content settings">
      <PerformanceWorkSummaryRootSettings :model-value="rootSettings" :allow-multiple-enabled="rootCapabilities.allowMultiple" :allow-unknown-enabled="rootCapabilities.allowUnknown" :allow-view-enabled="rootCapabilities.allowView === true" @update:model-value="emit('update:root-settings', $event)" />
    </div>
    <div v-else class="content-settings-detail content-settings-detail--item" aria-label="Selected content item settings">
      <PerformanceWorkSummaryItemSettings :model-value="selectedItemSettings" :variant="itemSettingsVariant" :disabled="settingsDisabled" @update:model-value="updateItemSettings" />
    </div>
  </div>
</template>

<style scoped>
.configured-content-card{position:relative;width:var(--performance-content-width);max-width:100%;margin:0;box-sizing:border-box;border:0;border-bottom:1px solid #dee0e3;border-radius:0;color:#1f2329;overflow:visible;background:#fff}.configured-content-card> :deep(.performance-drag-handle.is-strip),.configured-content-card> :deep(.performance-horizontal-drag-handle){position:absolute;top:0;right:0;left:0;z-index:21;width:100%;height:24px;margin:0}.configured-content-card:focus-within{z-index:20;border-bottom-color:#dee0e3}.configured-content-card:hover{z-index:20}.configured-content-card.is-dragging{opacity:.72}.configured-content-card__row{display:grid;grid-template-columns:minmax(0,1fr) 24px;align-items:start;min-height:0;gap:var(--spacing-2);padding:var(--spacing-4) var(--spacing-6) var(--spacing-2);box-sizing:border-box}.configured-content-card.hides-description .configured-content-card__row{min-height:0}.configured-content-card__header{min-width:0}.configured-content-card__row :deep(.performance-assessment-preview-header){margin:0}.configured-content-card__row> :deep(.performance-expand-button){grid-column:2}.configured-content-card__details{max-width:792px;margin:0 auto;padding:0 0 8.667px;color:#646a73}.configured-content-card :deep(.performance-expand-button.is-hover-only){opacity:1;pointer-events:auto}.configured-content-card.rating-content-card{padding-bottom:8px}.configured-content-card.rating-content-card .configured-content-card__row{min-height:0;height:auto;margin-top:0;padding:var(--spacing-4) var(--spacing-6) var(--spacing-2)}.configured-content-card.rating-content-card .configured-content-card__details{padding:0 0 8px}.configured-content-card.allows-multiple .configured-content-card__details{padding-bottom:0}.configured-content-card__add-item{margin:0 0 20px 24px}.content-settings-detail{position:fixed;top:104px;right:0;z-index:30;width:320px;height:calc(100vh - 104px);padding:24px 20px;box-sizing:border-box;overflow:auto;background:#fff;color:#1f2329}
.configured-content-card.is-result-readonly .configured-content-card__row{min-height:0}.configured-content-card.is-result-readonly.rating-content-card .configured-content-card__row{height:auto;min-height:0;margin-top:0}.configured-content-card.is-result-readonly.rating-content-card .configured-content-card__details{padding-bottom:var(--spacing-2)}.configured-content-card.is-result-readonly.rating-content-card{padding-bottom:0}
.configured-content-card.is-result-tag .configured-content-card__details{padding-bottom:var(--performance-result-view-tag-inset-block)}
.configured-content-card__row--prompt{display:block;padding:var(--performance-readonly-item-padding-block) var(--performance-readonly-item-padding-inline);border:var(--performance-content-item-border-width) solid transparent}
.configured-content-settings{position:static}
</style>
