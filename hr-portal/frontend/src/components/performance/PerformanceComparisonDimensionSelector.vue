<template>
  <div class="performance-comparison-dimension-selector" :class="`is-${axis}`">
    <ElDropdown trigger="click" placement="bottom-start" @command="select">
      <button class="axis-selector" type="button" :aria-label="selectedLabel">
        <span>{{ selectedLabel }}</span><DownOutlinedIcon />
      </button>
      <template #dropdown>
        <ElDropdownMenu><ElDropdownItem v-for="option in options" :key="option.value" :command="option.value" :class="{ 'is-selected': option.value === modelValue }">{{ option.label }}</ElDropdownItem></ElDropdownMenu>
      </template>
    </ElDropdown>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElDropdown, ElDropdownItem, ElDropdownMenu } from 'element-plus'
import DownOutlinedIcon from './DownOutlinedIcon.vue'
import type { PerformanceComparisonOption } from './performanceComparison'
const props = defineProps<{ axis: 'x' | 'y'; modelValue: string; options: PerformanceComparisonOption[]; labelPrefix?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const selectedLabel = computed(() => `${props.labelPrefix || ''}${props.options.find(option => option.value === props.modelValue)?.label || props.options[0]?.label || ''}`)
function select(value: string) { emit('update:modelValue', value) }
</script>

<style scoped>
.performance-comparison-dimension-selector { position: relative; z-index: 3; }
.performance-comparison-dimension-selector.is-x { height: 48px; margin-left: 8px; }
.performance-comparison-dimension-selector.is-y { position: absolute; top: 13px; left: 10px; width: 28px; }
.axis-selector { display: inline-flex; align-items: center; gap: 4px; border: 0; border-radius: 4px; background: transparent; color: var(--color-text-primary, #1f2329); cursor: pointer; font: inherit; font-size: 14px; white-space: nowrap; }
.is-x .axis-selector { height: 48px; padding: 2px 4px; }
.is-y .axis-selector { width: 28px; padding: 4px 0; writing-mode: vertical-rl; text-orientation: mixed; justify-content: flex-start; }
.axis-selector svg { width: 14px; height: 14px; color: #646a73; }
.is-y .axis-selector svg { flex: 0 0 14px; margin-top: 4px; }
.is-selected { color: var(--color-primary); }
</style>
