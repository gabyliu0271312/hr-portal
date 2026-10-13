<template>
  <div class="permission-node" role="treeitem" :aria-level="level" :aria-expanded="hasChildren ? expandedKeys.has(node.key) : undefined">
    <span v-for="index in level - 1" :key="index" class="tree-indent" aria-hidden="true" />
    <button
      v-if="hasChildren"
      class="tree-expand-button"
      :class="{ expanded: expandedKeys.has(node.key) }"
      type="button"
      :aria-label="`${expandedKeys.has(node.key) ? '收起' : '展开'}${node.label}`"
      :aria-expanded="expandedKeys.has(node.key)"
      @click.stop="emit('toggle-expand', node.key)"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" data-icon="ExpandDownFilled"><path d="M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z" /></svg>
    </button>
    <span v-else class="tree-expand-placeholder" aria-hidden="true" />
    <label class="tree-checkbox-label">
      <input
        class="tree-checkbox-input"
        type="checkbox"
        :checked="checked"
        :aria-checked="partial ? 'mixed' : checked"
        @change="emit('toggle-select', node)"
      />
      <span class="tree-checkbox-wallpaper" :class="{ checked, partial }" aria-hidden="true">
        <svg v-if="checked && !partial" viewBox="0 0 12 12"><path d="M9.589 2.903l.808.809a.35.35 0 010 .495L5.18 9.425a.35.35 0 01-.495 0l-2.981-2.98a.35.35 0 010-.496l.808-.808a.35.35 0 01.495 0l1.925 1.925 4.163-4.163a.35.35 0 01.495 0z" /></svg>
        <svg v-else-if="partial" viewBox="0 0 12 12"><path d="M2 5.4c0-.22.18-.4.4-.4h7.2c.22 0 .4.18.4.4v1.2a.4.4 0 01-.4.4H2.4a.4.4 0 01-.4-.4V5.4Z" /></svg>
      </span>
      <span class="tree-label">{{ node.label }}</span>
      <InfoOutlinedIcon v-if="node.info" class="tree-info-icon" :title="node.info" />
    </label>
  </div>
  <div v-if="hasChildren && expandedKeys.has(node.key)" class="permission-children" role="group">
    <FunctionPermissionNode
      v-for="child in node.children"
      :key="child.key"
      :node="child"
      :level="level + 1"
      :expanded-keys="expandedKeys"
      :selected-keys="selectedKeys"
      @toggle-expand="emit('toggle-expand', $event)"
      @toggle-select="emit('toggle-select', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import InfoOutlinedIcon from './InfoOutlinedIcon.vue'
import type { FunctionPermissionTreeNode } from './PerformanceFunctionPermissionTree.vue'

const props = withDefaults(defineProps<{
  node: FunctionPermissionTreeNode
  level?: number
  expandedKeys: Set<string>
  selectedKeys: Set<string>
}>(), { level: 1 })

const emit = defineEmits<{
  'toggle-expand': [key: string]
  'toggle-select': [node: FunctionPermissionTreeNode]
}>()

const hasChildren = computed(() => Boolean(props.node.children?.length))
function leafKeys(node: FunctionPermissionTreeNode): string[] {
  if (!node.children?.length) return [node.key]
  return node.children.flatMap(leafKeys)
}
const nodeLeafKeys = computed(() => leafKeys(props.node))
const selectedLeafCount = computed(() => nodeLeafKeys.value.filter(key => props.selectedKeys.has(key)).length)
const checked = computed(() => selectedLeafCount.value === nodeLeafKeys.value.length)
const partial = computed(() => selectedLeafCount.value > 0 && !checked.value)
</script>

<style scoped>
.permission-node { display: flex; position: relative; min-width: 0; min-height: 30px; align-items: center; margin: 1px 3px; padding: 4px 8px; border-radius: 4px; color: #1f2329; cursor: pointer; font-size: 14px; line-height: 22px; transition: background-color .12s cubic-bezier(.34,.69,.1,1); }
.permission-node:hover { background: rgba(31, 35, 41, .08); }
.tree-indent { width: 24px; height: 1px; flex: 0 0 24px; }
.tree-expand-placeholder { width: 24px; height: 24px; flex: 0 0 24px; }
.tree-expand-button { display: flex; width: 24px; height: 24px; flex: 0 0 24px; align-items: center; justify-content: center; margin-right: 3px; padding: 3px; border: 0; border-radius: 4px; background: transparent; color: #646a73; cursor: pointer; }
.tree-expand-button svg { width: 10px; height: 10px; fill: currentColor; transform: rotate(-90deg); transition: transform .2s cubic-bezier(.34,.69,.1,1); }
.tree-expand-button.expanded svg { transform: rotate(0deg); }
.tree-expand-button:hover, .tree-expand-button:focus-visible { background: rgba(31, 35, 41, .08); outline: 0; }
.tree-checkbox-label { display: inline-flex; min-width: 0; align-items: center; gap: 8px; cursor: pointer; }
.tree-checkbox-input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.tree-checkbox-input:focus-visible + .tree-checkbox-wallpaper { outline: 2px solid #3370ff; outline-offset: 2px; }
.tree-checkbox-wallpaper { display: grid; width: 16px; height: 16px; flex: 0 0 16px; place-items: center; border: 1px solid #bbbfc4; border-radius: 3px; color: #fff; background: #fff; }
.tree-checkbox-wallpaper.checked, .tree-checkbox-wallpaper.partial { border-color: #3370ff; background: #3370ff; }
.tree-checkbox-wallpaper svg { width: 12px; height: 12px; fill: currentColor; }
.tree-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-info-icon { width: 14px; height: 14px; flex: 0 0 14px; margin-left: 2px; color: #646a73; }
.permission-children { display: grid; gap: 2px; }
</style>
