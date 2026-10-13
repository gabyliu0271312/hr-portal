<template>
  <div class="performance-comparison-dimension-selector" :class="`is-${axis}`">
    <button class="axis-selector" type="button" :aria-expanded="open" @click="open = !open">
      <span>{{ selectedLabel }}</span>
      <DownOutlinedIcon :class="{ rotated: open }" />
    </button>
    <div v-if="open" class="axis-menu" role="menu">
      <button v-for="option in options" :key="option.value" type="button" role="menuitem" :aria-current="option.value === modelValue ? 'true' : undefined" @click="select(option.value)">{{ option.label }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import DownOutlinedIcon from './DownOutlinedIcon.vue'
import type { PerformanceComparisonOption } from './performanceComparison'

const props = defineProps<{
  axis: 'x' | 'y'
  modelValue: string
  options: PerformanceComparisonOption[]
  labelPrefix?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const open = ref(false)
const selectedLabel = computed(() => `${props.labelPrefix || ''}${props.options.find(option => option.value === props.modelValue)?.label || props.options[0]?.label || ''}`)
function select(value: string) {
  emit('update:modelValue', value)
  open.value = false
}
</script>

<style scoped>
.performance-comparison-dimension-selector { position: relative; z-index: 3; }
.performance-comparison-dimension-selector.is-x { height: 48px; margin-left: 8px; }
.performance-comparison-dimension-selector.is-y { position: absolute; top: 13px; left: 10px; width: 28px; height: 150px; }
.axis-selector { display: inline-flex; align-items: center; gap: 4px; border: 0; border-radius: 4px; background: transparent; color: #1f2329; cursor: pointer; font: inherit; white-space: nowrap; }
.is-x .axis-selector { height: 48px; padding: 2px 4px; }
.is-y .axis-selector { width: 28px; height: 150px; padding: 4px 0; writing-mode: vertical-rl; text-orientation: mixed; justify-content: flex-start; }
.axis-selector svg { width: 14px; height: 14px; color: #646a73; transition: transform .3s; }
.is-y .axis-selector svg { flex: 0 0 14px; margin-top: 4px; }
.axis-selector svg.rotated { transform: rotate(180deg); }
.axis-menu { position: absolute; min-width: 128px; padding: 4px 0; border: 1px solid #dee0e3; border-radius: 6px; background: #fff; box-shadow: 0 6px 24px rgba(31, 35, 41, .16); }
.is-x .axis-menu { top: 40px; left: 0; }
.is-y .axis-menu { top: 39px; left: 0; }
.axis-menu button { display: block; width: 100%; height: 32px; padding: 4px 12px; border: 0; background: #fff; color: #1f2329; font: inherit; text-align: left; cursor: pointer; }
.axis-menu button:hover, .axis-menu button[aria-current="true"] { background: #eff0f1; }
</style>
