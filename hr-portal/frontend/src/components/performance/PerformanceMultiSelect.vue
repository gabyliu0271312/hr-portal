<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type Option = { value: string; label: string }
const props = withDefaults(defineProps<{
  modelValue: string[]
  options: Option[]
  placeholder?: string
  disabled?: boolean
}>(), { placeholder: '请选择', disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const label = computed(() => {
  if (!props.modelValue.length) return props.placeholder
  const selected = props.options.filter(option => props.modelValue.includes(option.value))
  if (selected.length <= 2) return selected.map(option => option.label).join('、')
  return `${selected[0]?.label} 等 ${selected.length} 项`
})
function toggle(value: string) {
  const values = new Set(props.modelValue)
  if (values.has(value)) values.delete(value); else values.add(value)
  emit('update:modelValue', [...values])
}
function clear() { emit('update:modelValue', []) }
function onOutside(event: PointerEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('pointerdown', onOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside))
</script>

<template>
  <div ref="root" class="performance-multi-select" :class="{ open, disabled }">
    <button type="button" class="performance-multi-select__trigger" :disabled="disabled" :aria-expanded="open" @click="open = !open">
      <span :class="{ placeholder: !modelValue.length }">{{ label }}</span><span class="arrow">⌄</span>
    </button>
    <div v-if="open" class="performance-multi-select__menu" role="listbox" aria-multiselectable="true">
      <button v-for="option in options" :key="option.value" type="button" class="performance-multi-select__option" role="option" :aria-selected="modelValue.includes(option.value)" @click.stop="toggle(option.value)">
        <span class="checkbox" :class="{ checked: modelValue.includes(option.value) }">{{ modelValue.includes(option.value) ? '✓' : '' }}</span>{{ option.label }}
      </button>
      <p v-if="!options.length" class="empty">暂无可选项</p>
      <button v-if="modelValue.length" type="button" class="clear" @click.stop="clear">清空已选</button>
    </div>
  </div>
</template>

<style scoped>
.performance-multi-select { position: relative; min-width: 0; }
.performance-multi-select__trigger { display: flex; align-items: center; justify-content: space-between; width: 100%; height: 32px; padding: 4px 8px; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: #1f2329; font: inherit; text-align: left; cursor: pointer; }
.performance-multi-select__trigger .placeholder { color: #8f959e; }.arrow { margin-left: 8px; color: #646a73; }
.performance-multi-select__menu { position: absolute; z-index: 30; top: 36px; left: 0; right: 0; max-height: 240px; overflow: auto; padding: 5px 0; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; box-shadow: 0 6px 16px rgba(31,35,41,.16); }
.performance-multi-select__option { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px; padding: 5px 10px; border: 0; background: transparent; color: #1f2329; font: inherit; text-align: left; cursor: pointer; }.performance-multi-select__option:hover { background: #f5f6f7; }
.checkbox { display: grid; place-items: center; width: 16px; height: 16px; border: 1px solid #bbbfc4; border-radius: 3px; color: #fff; font-size: 12px; }.checkbox.checked { border-color: #3370ff; background: #3370ff; }.empty { margin: 8px 10px; color: #8f959e; }.clear { width: calc(100% - 16px); margin: 5px 8px 2px; padding: 5px; border: 0; border-top: 1px solid #e5e6eb; background: #fff; color: #3370ff; font: inherit; cursor: pointer; }
.performance-multi-select.disabled { opacity: .65; }
</style>
