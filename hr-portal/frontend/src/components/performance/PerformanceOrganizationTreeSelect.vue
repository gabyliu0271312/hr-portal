<template>
  <PerformanceSelectShell
    v-model="modelValueProxy"
    v-model:query="query"
    :selected-items="selectedItems"
    placeholder="输入关键词选择部门"
    aria-label="权限范围"
    popup-label="权限范围组织架构"
    clear-label="清空已选部门"
    :popup-height="230"
    class="performance-organization-tree-select__trigger"
  >
    <template #default>
      <div class="organization-tree__list">
        <div class="organization-tree__scroll" role="tree">
          <PerformanceOrganizationTreeNodes :nodes="filteredNodes" :selected="modelValue" :searching="Boolean(query.trim())" @toggle="toggleNode" />
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

const props = defineProps<{ modelValue: string[]; nodes: PerformanceHrbpOrganizationNode[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const query = defineModel<string>('query', { default: '' })
const modelValueProxy = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })

const selectedItems = computed<PerformanceSelectItem[]>(() => {
  const items: PerformanceSelectItem[] = []
  const visit = (nodes: PerformanceHrbpOrganizationNode[]) => nodes.forEach(node => {
    if (props.modelValue.includes(node.value)) items.push({ value: node.value, label: node.label })
    visit(node.children)
  })
  visit(props.nodes)
  return items
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
  const selected = new Set(props.modelValue)
  if (selected.has(value)) selected.delete(value)
  else selected.add(value)
  query.value = ''
  emit('update:modelValue', [...selected])
}
</script>

<style scoped>
.organization-tree__list { min-width: 0; min-height: 0; flex: 1; padding: 3px 0; box-sizing: border-box; }
.organization-tree__scroll { max-height: 224px; overflow-x: hidden; overflow-y: auto; }
.organization-tree__empty { padding: 8px 12px; color: #8f959e; line-height: 22px; }
</style>
