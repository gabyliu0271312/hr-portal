<template>
  <ul class="performance-organization-tree-nodes" role="group">
    <li v-for="node in nodes" :key="node.value" role="treeitem" :aria-expanded="node.children.length ? isExpanded(node) : undefined" :aria-selected="selected.includes(node.value)">
      <div class="performance-organization-tree-node" :class="{ 'is-selected': selected.includes(node.value) }" :style="{ paddingLeft: `${8 + (node.level - 1) * 16}px` }">
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
        <button class="performance-organization-tree-node__label" type="button" @click="$emit('toggle', node.value)">{{ node.label }}</button>
        <button class="performance-organization-tree-node__checker" type="button" :aria-label="`${selected.includes(node.value) ? '取消选择' : '选择'}${node.label}`" @click="$emit('toggle', node.value)">
          <svg v-if="selected.includes(node.value)" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </div>
      <PerformanceOrganizationTreeNodes v-if="node.children.length && isExpanded(node)" :nodes="node.children" :selected="selected" :searching="searching" @toggle="$emit('toggle', $event)" />
    </li>
  </ul>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { PerformanceHrbpOrganizationNode } from '@/api/performance'

const props = withDefaults(defineProps<{ nodes: PerformanceHrbpOrganizationNode[]; selected: string[]; searching?: boolean }>(), { searching: false })
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
  else expandAll(nodes)
}, { immediate: true, deep: true })
</script>

<style scoped>
.performance-organization-tree-nodes { margin: 0; padding: 0; list-style: none; }
.performance-organization-tree-node { display: flex; align-items: center; width: 100%; height: 32px; padding-right: 8px; box-sizing: border-box; color: #1f2329; font: 400 14px/22px var(--font-sans); }
.performance-organization-tree-node:hover, .performance-organization-tree-node.is-selected { background: #f5f6f7; }
.performance-organization-tree-node.is-selected .performance-organization-tree-node__label { color: #336df4; }
.performance-organization-tree-node__expand { display: grid; place-items: center; width: 24px; height: 24px; flex: 0 0 24px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #646a73; cursor: pointer; }
.performance-organization-tree-node__expand:hover { background: rgba(31,35,41,.08); }
.performance-organization-tree-node__expand svg { transition: transform .2s cubic-bezier(.34,.69,.1,1); }
.performance-organization-tree-node__expand svg.is-collapsed { transform: rotate(-90deg); }
.performance-organization-tree-node__expand--placeholder { pointer-events: none; }
.performance-organization-tree-node__label { overflow: hidden; min-width: 0; height: 32px; flex: 1; padding: 5px 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.performance-organization-tree-node__checker { display: grid; place-items: center; width: 24px; height: 24px; flex: 0 0 24px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #1456f0; cursor: pointer; }
.performance-organization-tree-node__checker:hover { background: rgba(31,35,41,.08); }
</style>
