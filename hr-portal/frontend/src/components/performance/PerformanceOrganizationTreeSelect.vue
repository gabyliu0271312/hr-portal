<template>
  <PerformanceSelectShell
    v-model="modelValueProxy"
    v-model:query="query"
    :selected-items="selectedItems"
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    :popup-label="popupLabel"
    clear-label="清空已选部门"
    :popup-height="description ? 'auto' : 230"
    :max-visible-tags="maxVisibleTags"
    class="performance-organization-tree-select__trigger"
    :disabled="disabled"
    @open="$emit('open')"
  >
    <template #default>
      <p v-if="description" class="organization-tree__description">{{ description }}</p>
      <div class="organization-tree__list">
        <div class="organization-tree__scroll" role="tree">
          <PerformanceOrganizationTreeNodes :nodes="filteredNodes" :selected="modelValue" :searching="Boolean(query.trim())" :selection-indicator="selectionIndicator" :selected-surface="selectedSurface" :default-expanded="defaultExpanded" :disabled="disabled" @toggle="toggleNode" />
          <div v-if="!filteredNodes.length" class="organization-tree__empty">暂无可选部门</div>
        </div>
      </div>
    </template>
  </PerformanceSelectShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PerformanceHrbpOrganizationNode } from '@/api/performance'
import PerformanceOrganizationTreeNodes from './PerformanceOrganizationTreeNodes.vue'
import PerformanceSelectShell, { type PerformanceSelectItem } from './PerformanceSelectShell.vue'

const props = withDefaults(defineProps<{ modelValue: string[]; nodes: PerformanceHrbpOrganizationNode[]; disabled?: boolean; placeholder?: string; ariaLabel?: string; popupLabel?: string; description?: string; selectionIndicator?: 'checkmark' | 'checkbox'; selectedSurface?: 'plain' | 'filled'; defaultExpanded?: boolean; maxVisibleTags?: number }>(), { disabled: false, placeholder: '输入关键词选择部门', ariaLabel: '权限范围', popupLabel: '权限范围组织架构', description: '', selectionIndicator: 'checkmark', selectedSurface: 'plain', defaultExpanded: true, maxVisibleTags: 0 })
const emit = defineEmits<{ 'update:modelValue': [value: string[]]; open: [] }>()
const query = defineModel<string>('query', { default: '' })
const modelValueProxy = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })

const selectedItems = computed<PerformanceSelectItem[]>(() => {
  const items: PerformanceSelectItem[] = []
  const visit = (nodes: PerformanceHrbpOrganizationNode[]) => nodes.forEach(node => {
    if (props.modelValue.includes(node.value)) items.push({ value: node.value, label: node.label })
    visit(node.children)
  })
  visit(props.nodes)
  return props.modelValue.map(value => items.find(item => item.value === value) || { value, label: value })
})
const filteredNodes = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return props.nodes
  const filter = (nodes: PerformanceHrbpOrganizationNode[]): PerformanceHrbpOrganizationNode[] => nodes.flatMap(node => {
    const directMatch = node.label.toLowerCase().includes(keyword)
    const children = directMatch ? node.children : filter(node.children)
    return directMatch || children.length
      ? [{ ...node, children, __searchMatch: directMatch, __hasSearchDescendant: children.length > 0 && !directMatch } as PerformanceHrbpOrganizationNode]
      : []
  })
  return filter(props.nodes)
})

function toggleNode(value: string) {
  if (props.disabled) return
  const selected = new Set(props.modelValue)
  if (selected.has(value)) selected.delete(value)
  else selected.add(value)
  query.value = ''
  emit('update:modelValue', [...selected])
}
</script>

<style scoped>
.organization-tree__description { margin:0; padding:var(--spacing-2) var(--spacing-3) 0; color:var(--color-text-placeholder); font-size:var(--font-size-md); line-height:var(--input-line-height); }
.organization-tree__list { min-width:0; min-height:0; flex:1; padding:var(--spacing-1) 0; box-sizing:border-box; }
.organization-tree__scroll { max-height:var(--performance-organization-tree-max-height); overflow-x:hidden; overflow-y:auto; }
.organization-tree__empty { padding:var(--spacing-2) var(--spacing-3); color:var(--color-text-placeholder); line-height:var(--input-line-height); }
</style>
