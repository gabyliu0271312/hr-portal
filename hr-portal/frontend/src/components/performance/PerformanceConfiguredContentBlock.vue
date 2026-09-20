<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from 'vue'
import type { AssessmentContentDraft } from './PerformanceAssessmentContentLayers.vue'
import PerformanceAssessmentConfiguredPreview from './PerformanceAssessmentConfiguredPreview.vue'
import PerformanceAddAnotherButton from './PerformanceAddAnotherButton.vue'
import PerformanceAssessmentPreviewHeader from './PerformanceAssessmentPreviewHeader.vue'
import PerformanceConfiguredCardActionToolbar from './PerformanceConfiguredCardActionToolbar.vue'
import PerformanceContentSelectionFrame from './PerformanceContentSelectionFrame.vue'
import PerformanceDragHandle from './PerformanceDragHandle.vue'
import PerformanceExpandButton from './PerformanceExpandButton.vue'
import PerformanceWorkSummaryItemSettings, { type WorkSummaryItemSettings } from './PerformanceWorkSummaryItemSettings.vue'
import PerformanceWorkSummaryRootSettings, { type WorkSummaryRootSettings } from './PerformanceWorkSummaryRootSettings.vue'

const props = defineProps<{
  content: AssessmentContentDraft & { id: string }
  active: boolean
  expanded: boolean
  dragging: boolean
  itemStyle?: CSSProperties
  index: number
  count: number
  toolbarVisible: boolean
  rootSettings: WorkSummaryRootSettings
  itemSettings: Record<string, WorkSummaryItemSettings>
  rootSettingsVariant: string
  itemSettingsVariant: string
}>()

const emit = defineEmits<{
  activate: [contentId: string]
  'update:expanded': [expanded: boolean]
  'update:root-settings': [settings: WorkSummaryRootSettings]
  'update:item-settings': [settings: Record<string, WorkSummaryItemSettings>]
  'move-up': []
  'move-down': []
  edit: []
  delete: []
  'hover-change': [hovered: boolean]
}>()

const owner = ref<'root' | 'item'>('root')
const selectedItemId = ref<string | null>(null)
const rulesEnabled = computed(() => props.rootSettingsVariant === 'work-summary-root' && props.itemSettingsVariant === 'work-summary-item')
const selectedItemKey = computed(() => props.active && owner.value === 'item' && selectedItemId.value ? `${props.content.id}:${selectedItemId.value}` : null)
const selectedItemSettings = computed(() => selectedItemId.value ? props.itemSettings[selectedItemId.value] || { mode: 'fill', required: true } : { mode: 'fill' as const, required: true })
const rendererItemSettings = computed(() => rulesEnabled.value ? Object.fromEntries(props.content.items.map((item) => [item.id, props.itemSettings[item.id] || { mode: 'fill', required: true }])) : {})

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
    :class="{ 'is-dragging': dragging, 'hides-description': rulesEnabled && rootSettings.hideDescription, 'allows-multiple': rulesEnabled && rootSettings.allowMultiple }"
    :data-sortable-index="index"
    :style="itemStyle"
    @mouseenter="emit('hover-change', true)"
    @mouseleave="emit('hover-change', false)"
  >
    <PerformanceDragHandle variant="strip" :label="`Drag ${content.name}`" :dragging="dragging" />
    <PerformanceConfiguredCardActionToolbar
      :visible="toolbarVisible || dragging"
      :index="index"
      :count="count"
      @move-up="emit('move-up')"
      @move-down="emit('move-down')"
      @edit="emit('edit')"
      @delete="emit('delete')"
    />
    <div class="configured-content-card__row" role="button" :tabindex="toolbarVisible ? 0 : -1" :aria-label="`Select ${content.name}`" @click="selectRoot">
      <div class="configured-content-card__header">
        <PerformanceAssessmentPreviewHeader :name="content.name" />
        <p v-if="content.description && (!rulesEnabled || !rootSettings.hideDescription)" class="configured-content-card__description">{{ content.description }}</p>
      </div>
      <PerformanceExpandButton :expanded="expanded" icon-variant="regular" label="Toggle content" @toggle="emit('update:expanded', !expanded)" @click.stop />
    </div>
    <PerformanceAssessmentConfiguredPreview
      v-if="expanded"
      :content="content"
      :interactive="true"
      :selected-item-id="selectedItemKey"
      :item-settings="rendererItemSettings"
      class="configured-content-card__details"
      @select-item="selectItem"
    />
    <PerformanceAddAnotherButton v-if="rulesEnabled && rootSettings.allowMultiple" class="configured-content-card__add-item" />
  </PerformanceContentSelectionFrame>

  <div v-if="active && rulesEnabled" class="configured-content-settings">
    <div v-if="owner === 'root'" class="content-settings-detail content-settings-detail--root" aria-label="Selected content settings">
      <PerformanceWorkSummaryRootSettings :model-value="rootSettings" @update:model-value="emit('update:root-settings', $event)" />
    </div>
    <div v-else class="content-settings-detail content-settings-detail--item" aria-label="Selected content item settings">
      <PerformanceWorkSummaryItemSettings :model-value="selectedItemSettings" @update:model-value="updateItemSettings" />
    </div>
  </div>
</template>

<style scoped>
.configured-content-card{position:relative;width:792px;max-width:100%;margin:0;box-sizing:border-box;border:0;border-bottom:1px solid #dee0e3;border-radius:0;color:#1f2329;overflow:visible;background:#fff}.configured-content-card> :deep(.performance-drag-handle.is-strip){position:absolute;top:0;right:0;left:0;z-index:21;width:100%;height:24px;margin:0}.configured-content-card:focus-within{z-index:20;border-bottom-color:#dee0e3}.configured-content-card:hover{z-index:20}.configured-content-card.is-dragging{opacity:.72}.configured-content-card__row{display:grid;grid-template-columns:minmax(0,1fr) 24px;align-items:start;min-height:86px;gap:12px;padding:16px 24px 8px;box-sizing:border-box}.configured-content-card.hides-description .configured-content-card__row{min-height:64px}.configured-content-card__header{min-width:0}.configured-content-card__row :deep(.performance-assessment-preview-header){margin:0;padding-left:10px}.configured-content-card__row :deep(.performance-assessment-preview-header::before){top:3px;width:1px;height:21px}.configured-content-card__row :deep(.performance-assessment-preview-header strong){font-size:16px;line-height:24px}.configured-content-card__description{margin:0;padding-left:10px;color:#646a73;font-size:14px;line-height:22px}.configured-content-card__row> :deep(.performance-expand-button){grid-column:2}.configured-content-card__details{max-width:792px;margin:0 auto;padding:0 0 8.667px;color:#646a73}.configured-content-card.allows-multiple .configured-content-card__details{padding-bottom:0}.configured-content-card__add-item{margin:0 0 20px 24px}.content-settings-detail{position:fixed;top:104px;right:0;z-index:30;width:320px;height:calc(100vh - 104px);padding:24px 20px;box-sizing:border-box;overflow:auto;background:#fff;color:#1f2329}
.configured-content-settings{position:static}
</style>
