<template>
  <div class="performance-rating-control" :class="[`is-${normalizedMode}`, { 'is-interactive': interactive, 'is-invalid': invalid }]" :aria-label="ariaLabel">
    <template v-if="normalizedMode === 'dropdown'">
      <div v-if="interactive" class="performance-rating-control__shared-select"><PerformanceSearchSelect :model-value="modelValue || null" :options="selectableOptions.map(option => ({ value: option.id, label: option.label }))" selection-style="plain" :placeholder="placeholder" :aria-label="ariaLabel" @update:model-value="$emit('update:modelValue', String($event || ''))" /></div>
      <div v-else class="rating-select-preview performance-rating-control__dropdown-preview" aria-label="下拉样式预览" :tabindex="previewHover ? 0 : undefined" @mouseenter="selectedOption && showHover(selectedOption, $event)" @mouseleave="hideHover" @focus="selectedOption && showHover(selectedOption, $event)" @blur="hideHover">
        <span>{{ selectedLabel || placeholder }}</span>
        <DownBoldOutlinedIcon class="performance-rating-control__arrow" :size="12" />
        <Teleport to="body">
          <div v-if="previewHover && selectedOption && hoveredOptionId === selectedOption.id" class="performance-rating-control__popover" role="tooltip" :style="hoverPosition">
            <div class="performance-rating-control__popover-heading"><PerformanceRatingTag class="performance-rating-control__code" :label="selectedOption.code || selectedOption.label" :color="selectedOption.color" /><strong>{{ selectedOption.name || selectedOption.label }}</strong></div>
            <div v-if="selectedOption.description" class="performance-rating-control__description">{{ selectedOption.description }}</div>
          </div>
        </Teleport>
      </div>
    </template>
    <div v-else class="performance-rating-control__labels" role="radiogroup" :aria-label="ariaLabel">
      <template v-for="(option, index) in selectableOptions" :key="option.id">
        <button
          type="button"
          role="radio"
          :aria-checked="modelValue === option.id"
          :tabindex="interactive || previewHover ? 0 : -1"
          :class="['performance-rating-control__option', 'rating-option', { selected: modelValue === option.id, hovered: hoveredOptionId === option.id }]"
          :style="{ '--rating-color': option.color || '#3370ff', '--rating-background': levelBackground(option.color) }"
          :disabled="!interactive && !previewHover"
          :aria-disabled="!interactive ? 'true' : undefined"
          @mouseenter="showHover(option, $event)"
          @mouseleave="hideHover"
          @focus="showHover(option, $event)"
          @blur="hideHover"
          @click="interactive && $emit('update:modelValue', option.id)"
        >
          {{ previewHover ? (option.code || option.label) : option.label }}
          <Teleport to="body">
            <div v-if="hoveredOptionId === option.id && (option.description || option.code || option.name)" class="performance-rating-control__popover" role="tooltip" :style="hoverPosition">
              <div class="performance-rating-control__popover-heading">
                <PerformanceRatingTag class="performance-rating-control__code" :label="option.code || option.label" :color="option.color" />
                <strong>{{ option.name || option.label }}</strong>
              </div>
              <div v-if="option.description" class="performance-rating-control__description">{{ option.description }}</div>
            </div>
          </Teleport>
        </button>
        <span v-if="index < selectableOptions.length - 1" class="performance-rating-control__connector rating-connector" aria-hidden="true"></span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import DownBoldOutlinedIcon from './DownBoldOutlinedIcon.vue'
import PerformanceRatingTag from './PerformanceRatingTag.vue'
import { performanceLevelBackground } from './performanceColorOptions'

export interface PerformanceRatingOption {
  id: string
  label: string
  code?: string
  name?: string
  description?: string
  color?: string
}

const props = withDefaults(defineProps<{
  modelValue?: string
  options: PerformanceRatingOption[]
  allowUnknown?: boolean
  displayMode?: '标签样式' | '下拉样式'
  interactive?: boolean
  previewHover?: boolean
  invalid?: boolean
  placeholder?: string
  ariaLabel?: string
}>(), {
  modelValue: '',
  displayMode: '标签样式',
  interactive: false,
  previewHover: false,
  invalid: false,
  placeholder: '请选择等级',
  ariaLabel: '评级选项',
})
defineEmits<{ 'update:modelValue': [value: string] }>()
const normalizedMode = computed(() => props.displayMode === '下拉样式' ? 'dropdown' : 'labels')
const selectableOptions = computed(() => props.allowUnknown === true ? [...props.options.filter(option => option.id !== '__unknown__'), { id: '__unknown__', label: '不了解' }] : props.options)
const hoveredOptionId = ref<string | null>(null)
const hoverPosition = ref({ top: '0px', left: '0px' })
const levelBackground = (color?: string) => performanceLevelBackground(color)
function showHover(option: PerformanceRatingOption, event: MouseEvent | FocusEvent) {
  if (!props.interactive && !props.previewHover) return
  hoveredOptionId.value = option.id
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  hoverPosition.value = { top: `${Math.max(16, Math.min(window.innerHeight - 150, rect.bottom + 8))}px`, left: `${Math.max(16, Math.min(window.innerWidth - 436, rect.left))}px` }
}
function hideHover() { hoveredOptionId.value = null }
const selectedOption = computed(() => selectableOptions.value.find(option => option.id === props.modelValue))
const selectedLabel = computed(() => {
  const selected = selectedOption.value
  return selected ? (props.previewHover ? selected.code || selected.label : selected.label) : ''
})
</script>

<style scoped>
.performance-rating-control{width:100%;min-width:0}.performance-rating-control__labels{display:flex;min-height:38px;align-items:center;overflow-x:auto;padding:4px 0}.performance-rating-control__option{position:relative;min-width:42px;height:32px;flex:0 0 auto;padding:6px 12px;border:1px solid #d0d3d6;border-radius:9999px;background:#fff;color:#646a73;font-family:inherit;font-size:14px;font-weight:600;line-height:18px;white-space:nowrap}.performance-rating-control__option:disabled{cursor:default;opacity:1}.performance-rating-control__option.is-interactive,.is-interactive .performance-rating-control__option{cursor:pointer}.performance-rating-control__option.selected{border-color:var(--rating-color);background:color-mix(in srgb,var(--rating-color) 12%,white);color:var(--rating-color)}.performance-rating-control__option.hovered,.performance-rating-control__option:hover,.performance-rating-control__option:focus-visible{border-color:var(--rating-color);background:var(--rating-background);color:var(--color-text-primary)}.performance-rating-control__connector{width:clamp(12px,6vw,88px);height:1px;flex:1 0 12px;background:#d0d3d6}.performance-rating-control__select,.performance-rating-control__dropdown-preview{width:336px;max-width:100%;height:32px;padding:4px 12px;box-sizing:border-box;border:1px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif}.performance-rating-control__select{appearance:auto;cursor:pointer}.performance-rating-control__dropdown-preview{display:flex;align-items:center;justify-content:space-between;background:#f5f6f7;color:#8f959e}.performance-rating-control__arrow{display:block;width:12px;height:12px;flex:0 0 12px;color:#646a73}.performance-rating-control__shared-select{width:336px;max-width:100%}.performance-rating-control.is-invalid .performance-rating-control__labels,.performance-rating-control.is-invalid .performance-rating-control__select{border-color:#f54a45}.performance-rating-control.is-invalid :deep(.performance-select-shell__selector){border-color:var(--performance-field-border-invalid)}.performance-rating-control__popover{position:fixed;z-index:var(--performance-popover-z-index);box-sizing:border-box;width:420px;max-width:calc(100vw - 32px);padding:12px 16px;border:1px solid #dee0e3;border-radius:8px;background:#fff;box-shadow:rgba(31,35,41,.04) 0 8px 24px 8px,rgba(31,35,41,.04) 0 6px 12px 0,rgba(31,35,41,.06) 0 4px 8px -8px;color:#1f2329;text-align:left;pointer-events:none}.performance-rating-control__popover-heading{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.performance-rating-control__code{min-width:42px;max-width:132px;height:22px;padding:0 8px;color:#621c18}.performance-rating-control__popover-heading strong{color:var(--color-text-primary);font-size:14px;line-height:22px}.performance-rating-control__description{margin-top:4px;color:#646a73;font-size:14px;line-height:22px}
</style>
