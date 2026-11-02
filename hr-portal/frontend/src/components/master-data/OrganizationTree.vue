<template>
  <ul class="organization-tree-nodes" role="group">
    <li v-for="node in nodes" :key="node.id" role="treeitem" :aria-expanded="node.children.length ? isExpanded(node) : undefined">
      <div class="organization-tree-node" :style="{ paddingLeft: `${8 + (node.level - 1) * 16}px` }">
        <button
          v-if="node.children.length"
          class="organization-tree-node__expand"
          type="button"
          :aria-label="`${isExpanded(node) ? '收起' : '展开'}${node.name}`"
          @click.stop="toggleExpanded(node)"
        >
          <svg :class="{ 'is-collapsed': !isExpanded(node) }" width="10" height="10" viewBox="0 0 24 24" fill="none" data-icon="ExpandDownFilled" aria-hidden="true">
            <path d="M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z" fill="currentColor" />
          </svg>
        </button>
        <span v-else class="organization-tree-node__expand organization-tree-node__expand--placeholder" aria-hidden="true"></span>
        <span class="organization-tree-node__label" :title="node.name">{{ node.name }}</span>
        <el-tag v-if="!node.is_active" type="info" size="small" class="organization-tree-node__inactive">停用</el-tag>
      </div>
      <OrganizationTree v-if="node.children.length && isExpanded(node)" :nodes="node.children" :searching="searching" />
    </li>
  </ul>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { TreeNode } from '@/api/data'

const props = withDefaults(defineProps<{ nodes: TreeNode[]; searching?: boolean }>(), { searching: false })

const expanded = ref(new Set<number>())

function expandAll(nodes: TreeNode[]) {
  nodes.forEach(node => {
    if (node.children.length) expanded.value.add(node.id)
    expandAll(node.children)
  })
}
type SearchNode = TreeNode & { __searchMatch?: boolean; __hasSearchDescendant?: boolean }

function isExpanded(node: TreeNode) {
  if (!props.searching) return expanded.value.has(node.id)
  const searchNode = node as SearchNode
  if (expanded.value.has(node.id)) return true
  return Boolean(searchNode.__hasSearchDescendant && !searchNode.__searchMatch)
}
function toggleExpanded(node: TreeNode) {
  const next = new Set(expanded.value)
  if (next.has(node.id)) next.delete(node.id)
  else next.add(node.id)
  expanded.value = next
}

watch([() => props.nodes, () => props.searching], ([nodes, searching]) => {
  if (searching) expanded.value = new Set()
  else expandAll(nodes)
}, { immediate: true, deep: true })
</script>

<style scoped>
.organization-tree-nodes { margin: 0; padding: 0; list-style: none; }
.organization-tree-node { display: flex; align-items: center; gap: 4px; width: 100%; height: var(--performance-select-option-height); padding-right: 8px; box-sizing: border-box; color: #1f2329; font: 400 14px/22px var(--font-sans); }
.organization-tree-node:hover { background: var(--performance-select-option-hover); }
.organization-tree-node__expand { display: grid; place-items: center; width: 24px; height: 24px; flex: 0 0 24px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #646a73; cursor: pointer; }
.organization-tree-node__expand:hover { background: rgba(31,35,41,.08); }
.organization-tree-node__expand svg { transition: transform .2s cubic-bezier(.34,.69,.1,1); }
.organization-tree-node__expand svg.is-collapsed { transform: rotate(-90deg); }
.organization-tree-node__expand--placeholder { pointer-events: none; }
.organization-tree-node__label { overflow: hidden; min-width: 0; flex: 1; padding: 5px 0; color: inherit; font: inherit; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.organization-tree-node__inactive { margin-left: 8px; }
</style>
