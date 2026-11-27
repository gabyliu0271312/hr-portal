<template>
  <ul class="performance-organization-tree-nodes" role="group">
    <li v-for="node in nodes" :key="node.value" role="treeitem" :aria-expanded="node.children.length ? isExpanded(node) : undefined" :aria-selected="selected.includes(node.value)">
      <div class="performance-organization-tree-node" :class="{ 'is-selected': selected.includes(node.value) }" :style="{ paddingLeft: `calc(var(--spacing-2) + ${node.level - 1} * var(--performance-organization-tree-indent))` }">
        <button
          v-if="node.children.length"
          class="performance-organization-tree-node__expand"
          type="button"
          :aria-label="`${isExpanded(node) ? '收起' : '展开'}${node.label}`"
          @click.stop="toggleExpanded(node)"
        >
          <svg :class="{ 'is-collapsed': !isExpanded(node) }" width="10" height="10" viewBox="0 0 24 24" fill="none" data-icon="ExpandDownFilled" aria-hidden="true">
            <path d="M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z" fill="currentColor" />
          </svg>
        </button>
        <span v-else class="performance-organization-tree-node__expand performance-organization-tree-node__expand--placeholder" aria-hidden="true"></span>
        <UiCheckbox v-if="selectionIndicator === 'checkbox'" :model-value="selected.includes(node.value)" :disabled="disabled" :aria-label="`选择${node.label}`" @update:model-value="$emit('toggle', node.value)" />
        <button class="performance-organization-tree-node__label" type="button" :disabled="disabled" @click="$emit('toggle', node.value)">{{ node.label }}</button>
        <button v-if="selectionIndicator === 'checkmark'" class="performance-organization-tree-node__checker" type="button" :disabled="disabled" :aria-label="`${selected.includes(node.value) ? '取消选择' : '选择'}${node.label}`" @click="$emit('toggle', node.value)">
          <PerformanceSymbol v-if="selected.includes(node.value)" name="ListCheckBoldOutlined" />
        </button>
      </div>
      <PerformanceOrganizationTreeNodes v-if="node.children.length && isExpanded(node)" :nodes="node.children" :selected="selected" :searching="searching" :selection-indicator="selectionIndicator" :default-expanded="defaultExpanded" :disabled="disabled" @toggle="$emit('toggle', $event)" />
    </li>
  </ul>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import UiCheckbox from '../ui/UiCheckbox.vue'
import PerformanceSymbol from './PerformanceSymbol.vue'
import type { PerformanceHrbpOrganizationNode } from '@/api/performance'

const props = withDefaults(defineProps<{ nodes: PerformanceHrbpOrganizationNode[]; selected: string[]; searching?: boolean; selectionIndicator?: 'checkmark' | 'checkbox'; defaultExpanded?: boolean; disabled?: boolean }>(), { searching: false, selectionIndicator: 'checkmark', defaultExpanded: true, disabled: false })
defineEmits<{ toggle: [value: string] }>()

const expanded = ref(new Set<string>())

function expandAll(nodes: PerformanceHrbpOrganizationNode[]) {
  nodes.forEach(node => {
    if (node.children.length) expanded.value.add(node.value)
    expandAll(node.children)
  })
}
type SearchNode = PerformanceHrbpOrganizationNode & { __searchMatch?: boolean; __hasSearchDescendant?: boolean }

function isExpanded(node: PerformanceHrbpOrganizationNode) {
  if (!props.searching) return expanded.value.has(node.value)
  const searchNode = node as SearchNode
  if (expanded.value.has(node.value)) return true
  return Boolean(searchNode.__hasSearchDescendant && !searchNode.__searchMatch)
}
function toggleExpanded(node: PerformanceHrbpOrganizationNode) {
  const next = new Set(expanded.value)
  if (next.has(node.value)) next.delete(node.value)
  else next.add(node.value)
  expanded.value = next
}

watch([() => props.nodes, () => props.searching], ([nodes, searching]) => {
  if (searching) expanded.value = new Set()
  else if (props.defaultExpanded) expandAll(nodes)
}, { immediate: true, deep: true })
</script>

<style scoped>
.performance-organization-tree-nodes { margin: 0; padding: 0; list-style: none; }
.performance-organization-tree-node :deep(.ui-checkbox) { margin-right:var(--spacing-2); }
.performance-organization-tree-node :deep(.ui-checkbox__label:empty) { display:none; }
.performance-organization-tree-node { display: flex; align-items: center; width: 100%; height: var(--performance-select-option-height); padding-right: var(--spacing-2); box-sizing: border-box; color: var(--color-text-primary); font: var(--font-weight-normal) var(--font-size-md)/var(--input-line-height) var(--font-sans); }
.performance-organization-tree-node:hover { background: var(--performance-select-option-hover); }
.performance-organization-tree-node.is-selected { background: var(--performance-select-option-selected); }
.performance-organization-tree-node.is-selected .performance-organization-tree-node__label { color: var(--performance-select-check-color); }
.performance-organization-tree-node__expand { display: grid; place-items: center; width: var(--performance-icon-button-size); height: var(--performance-icon-button-size); flex: 0 0 var(--performance-icon-button-size); padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--performance-icon-button-color); cursor: pointer; }
.performance-organization-tree-node__expand:hover { background: var(--performance-icon-button-hover-background); }
.performance-organization-tree-node__expand svg { transition: transform var(--duration-base) var(--ease-standard); }
.performance-organization-tree-node__expand svg.is-collapsed { transform: rotate(-90deg); }
.performance-organization-tree-node__expand--placeholder { pointer-events: none; }
.performance-organization-tree-node__label { overflow: hidden; min-width: 0; height: var(--performance-select-option-height); flex: 1; padding: calc((var(--performance-select-option-height) - var(--input-line-height)) / 2) 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.performance-organization-tree-node__checker { display: grid; place-items: center; width: var(--performance-icon-button-size); height: var(--performance-icon-button-size); flex: 0 0 var(--performance-icon-button-size); padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--performance-select-check-color); cursor: pointer; }
.performance-organization-tree-node__checker:hover { background: var(--performance-icon-button-hover-background); }
</style>
