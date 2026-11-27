<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PerformanceMemberFilterField } from '@/api/performance'
import PerformanceSelectShell from './PerformanceSelectShell.vue'

type FieldNode = { value: string; label: string; children?: FieldNode[] }
const props = defineProps<{ modelValue: string; fields: PerformanceMemberFilterField[]; ariaLabel: string }>()
const emit = defineEmits<{ 'update:modelValue': [key: string] }>()
const shell = ref<InstanceType<typeof PerformanceSelectShell> | null>(null)
const root = ref<HTMLElement | null>(null)
const path = ref<string[]>([])
const query = ref('')
const columnWidth = ref(240)
const branchWidth = ref(232)
const tree = computed(() => {
  const roots: FieldNode[] = []
  for (const field of props.fields) {
    let siblings = roots
    for (const [index, label] of (field.group || []).entries()) {
      const value = `group:${field.group!.slice(0, index + 1).join('/')}`
      let node = siblings.find(item => item.value === value)
      if (!node) { node = { value, label, children: [] }; siblings.push(node) }
      siblings = node.children!
    }
    siblings.push({ value: field.key, label: field.label })
  }
  return roots
})
const columns = computed<FieldNode[][]>(() => {
  if (query.value.trim()) {
    const keyword = query.value.trim().toLowerCase()
    return [props.fields.filter(field => [...(field.group || []), field.label].join('/').toLowerCase().includes(keyword)).map(field => ({ value: field.key, label: [...(field.group || []), field.label].join('/') }))]
  }
  const result = [tree.value]
  for (const value of path.value) {
    const node = result[result.length - 1].find(item => item.value === value)
    if (!node?.children) break
    result.push(node.children)
  }
  return result
})
const selected = computed(() => {
  const field = props.fields.find(item => item.key === props.modelValue)
  return field ? [{ value: field.key, label: [...(field.group || []), field.label].join('/') }] : []
})
function open() {
  if (root.value) {
    const css = getComputedStyle(root.value)
    columnWidth.value = parseFloat(css.getPropertyValue('--performance-member-filter-field-width')) || 240
    branchWidth.value = parseFloat(css.getPropertyValue('--performance-member-filter-branch-width')) || 232
  }
  path.value = []
  shell.value?.openMenu()
}
function choose(node: FieldNode, depth: number) {
  if (node.children) { path.value = [...path.value.slice(0, depth), node.value]; return }
  emit('update:modelValue', node.value)
  shell.value?.close()
}
defineExpose({ open })
</script>

<template>
  <div ref="root" class="member-filter-field">
    <PerformanceSelectShell ref="shell" v-model:query="query" :model-value="modelValue ? [modelValue] : []" :selected-items="selected" :aria-label="ariaLabel" :popup-label="`${ariaLabel}选项`" selection-style="plain" placeholder="请选择" :popup-width="columnWidth + (columns.length - 1) * branchWidth" @open="path = []">
      <template #default>
        <div class="member-filter-field__columns" data-member-filter-layer>
          <div v-for="(nodes, depth) in columns" :key="depth" class="member-filter-field__column" role="listbox" :aria-label="depth ? '下级筛选字段' : '筛选字段'">
            <button v-for="node in nodes" :key="node.value" class="member-filter-field__option" type="button" role="option" :aria-selected="modelValue === node.value" :aria-expanded="node.children ? path[depth] === node.value : undefined" @mouseenter="node.children && choose(node, depth)" @click="choose(node, depth)">
              <span>{{ node.label }}</span><span v-if="node.children" aria-hidden="true">›</span><span v-else-if="node.value === modelValue" aria-hidden="true">✓</span>
            </button>
            <div v-if="!nodes.length" class="member-filter-field__empty">没有找到相关结果</div>
          </div>
        </div>
      </template>
    </PerformanceSelectShell>
  </div>
</template>

<style scoped>
.member-filter-field{min-width:0}
.member-filter-field__columns{display:flex;max-width:100%;min-width:0;overflow:hidden}
.member-filter-field__column{box-sizing:border-box;min-width:0;flex:1 1 var(--performance-member-filter-branch-width);max-height:var(--performance-select-popup-max-height);overflow:auto;padding:var(--spacing-1) 0}
.member-filter-field__column:first-child{flex-basis:var(--performance-member-filter-field-width)}
.member-filter-field__column+.member-filter-field__column{border-left:var(--performance-popover-border-width) solid var(--performance-popover-border)}
.member-filter-field__option{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:var(--performance-select-option-height);padding:var(--spacing-1) var(--spacing-3);border:0;background:transparent;color:var(--color-text-primary);font:inherit;text-align:left;cursor:pointer;gap:var(--spacing-2)}
.member-filter-field__option:hover,.member-filter-field__option[aria-expanded="true"]{background:var(--performance-select-option-hover)}
.member-filter-field__option[aria-selected="true"]{color:var(--color-primary)}
.member-filter-field__empty{padding:var(--spacing-3);color:var(--color-text-placeholder)}
</style>
