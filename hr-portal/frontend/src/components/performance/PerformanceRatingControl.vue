<template>
  <div class="performance-rating-control" :class="[`is-${normalizedMode}`, { 'is-interactive': interactive, 'is-invalid': invalid }]" :aria-label="ariaLabel">
    <template v-if="normalizedMode === 'dropdown'">
      <select v-if="interactive" class="performance-rating-control__select" :value="modelValue || ''" :aria-label="ariaLabel" @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
        <option value="" disabled>{{ placeholder }}</option>
        <option v-for="option in options" :key="option.id" :value="option.id">{{ option.label }}</option>
      </select>
      <div v-else class="rating-select-preview performance-rating-control__dropdown-preview" aria-label="下拉样式预览">
        <span>{{ selectedLabel || placeholder }}</span>
        <DownBoldOutlinedIcon class="performance-rating-control__arrow" :size="12" />
      </div>
    </template>
    <div v-else class="performance-rating-control__labels" role="radiogroup" :aria-label="ariaLabel">
      <template v-for="(option, index) in options" :key="option.id">
        <button type="button" role="radio" :aria-checked="modelValue === option.id" :tabindex="interactive ? 0 : -1" :class="['performance-rating-control__option', 'rating-option', { selected: modelValue === option.id }]" :style="modelValue === option.id ? { '--rating-color': option.color || '#3370ff' } : undefined" :disabled="!interactive" @click="$emit('update:modelValue', option.id)">{{ option.label }}</button>
        <span v-if="index < options.length - 1" class="performance-rating-control__connector rating-connector" aria-hidden="true"></span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DownBoldOutlinedIcon from './DownBoldOutlinedIcon.vue'

export interface PerformanceRatingOption {
  id: string
  label: string
  color?: string
}

const props = withDefaults(defineProps<{
  modelValue?: string
  options: PerformanceRatingOption[]
  displayMode?: '标签样式' | '下拉样式'
  interactive?: boolean
  invalid?: boolean
  placeholder?: string
  ariaLabel?: string
}>(), {
  modelValue: '',
  displayMode: '标签样式',
  interactive: false,
  invalid: false,
  placeholder: '请选择等级',
  ariaLabel: '评级选项',
})
defineEmits<{ 'update:modelValue': [value: string] }>()
const normalizedMode = computed(() => props.displayMode === '下拉样式' ? 'dropdown' : 'labels')
const selectedLabel = computed(() => props.options.find(option => option.id === props.modelValue)?.label || '')
</script>

<style scoped>
.performance-rating-control{width:100%;min-width:0}.performance-rating-control__labels{display:flex;min-height:38px;align-items:center;overflow-x:auto;padding:4px 0}.performance-rating-control__option{min-width:42px;height:32px;flex:0 0 auto;padding:6px 12px;border:1px solid #d0d3d6;border-radius:9999px;background:#fff;color:#646a73;font-family:inherit;font-size:14px;font-weight:600;line-height:18px;white-space:nowrap}.performance-rating-control__option:disabled{cursor:default;opacity:1}.performance-rating-control__option.is-interactive,.is-interactive .performance-rating-control__option{cursor:pointer}.performance-rating-control__option.selected{border-color:var(--rating-color);background:color-mix(in srgb,var(--rating-color) 12%,white);color:var(--rating-color)}.performance-rating-control__connector{width:clamp(12px,6vw,88px);height:1px;flex:1 0 12px;background:#d0d3d6}.performance-rating-control__select,.performance-rating-control__dropdown-preview{width:336px;max-width:100%;height:32px;padding:4px 12px;box-sizing:border-box;border:1px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif}.performance-rating-control__select{appearance:auto;cursor:pointer}.performance-rating-control__dropdown-preview{display:flex;align-items:center;justify-content:space-between;background:#f5f6f7;color:#8f959e}.performance-rating-control__arrow{display:block;width:12px;height:12px;flex:0 0 12px;color:#646a73}.performance-rating-control.is-invalid .performance-rating-control__labels,.performance-rating-control.is-invalid .performance-rating-control__select{border-color:#f54a45}
</style>
