<script setup lang="ts">
/**
 * 通用层级树勾选器 + 每节点"包含下级"开关
 *
 * Props:
 *   modelValue: ScopeSelection[]    勾选的节点 + 包含下级状态
 *   tree:       TreeNode[]          树数据
 *   loading:    boolean
 * Emits:
 *   update:modelValue
 */
import { computed, ref, watch } from 'vue'
import { ElIcon, ElCheckbox, ElSwitch, ElTooltip, ElInput } from 'element-plus'
import { CaretRight, CaretBottom, Search } from '@element-plus/icons-vue'
import type { TreeNode } from '@/api/data'

interface Selection {
  node_id: number | null
  include_descendants: boolean
}

const props = defineProps<{
  modelValue: Selection[]
  tree: TreeNode[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: Selection[]): void
}>()

const expanded = ref<Set<number>>(new Set())
const keyword = ref('')

const selectedMap = computed(() => {
  const m = new Map<number, Selection>()
  for (const s of props.modelValue || []) {
    if (s.node_id !== null && s.node_id !== undefined) m.set(s.node_id, s)
  }
  return m
})

function isSelected(node: TreeNode): boolean {
  return selectedMap.value.has(node.id)
}

function includeDesc(node: TreeNode): boolean {
  return selectedMap.value.get(node.id)?.include_descendants ?? false
}

function toggleSelect(node: TreeNode, val: boolean) {
  const next = [...(props.modelValue || [])].filter((s) => s.node_id !== node.id)
  if (val) next.push({ node_id: node.id, include_descendants: false })
  emit('update:modelValue', next)
}

function toggleInclude(node: TreeNode, val: boolean) {
  const next = (props.modelValue || []).map((s) =>
    s.node_id === node.id ? { ...s, include_descendants: val } : s
  )
  emit('update:modelValue', next)
}

function toggleExpand(id: number) {
  const s = new Set(expanded.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expanded.value = s
}

const filteredTree = computed<TreeNode[]>(() => {
  if (!keyword.value) return props.tree
  const kw = keyword.value.toLowerCase()
  function filterRec(node: TreeNode): TreeNode | null {
    const matched = node.name.toLowerCase().includes(kw) || node.code.toLowerCase().includes(kw)
    const filteredChildren = node.children
      .map(filterRec)
      .filter((c): c is TreeNode => c !== null)
    if (matched || filteredChildren.length) {
      return { ...node, children: filteredChildren }
    }
    return null
  }
  return props.tree.map(filterRec).filter((c): c is TreeNode => c !== null)
})

// 搜索时自动展开命中的祖先
watch(keyword, (v) => {
  if (!v) return
  const ids = new Set<number>()
  function collect(node: TreeNode, ancestors: number[]) {
    const matched =
      node.name.toLowerCase().includes(v.toLowerCase()) ||
      node.code.toLowerCase().includes(v.toLowerCase())
    if (matched) ancestors.forEach((id) => ids.add(id))
    for (const c of node.children) collect(c, [...ancestors, node.id])
  }
  for (const t of props.tree) collect(t, [])
  expanded.value = new Set([...expanded.value, ...ids])
})
</script>

<template>
  <div class="tree-picker" v-loading="loading">
    <el-input
      v-model="keyword"
      placeholder="搜索节点名 / 编码"
      clearable
      size="small"
      style="margin-bottom: 12px"
    >
      <template #prefix>
        <el-icon><Search /></el-icon>
      </template>
    </el-input>

    <div class="tree-body">
      <TreeNodeRow
        v-for="n in filteredTree"
        :key="n.id"
        :node="n"
        :depth="0"
        :expanded="expanded"
        :is-selected="isSelected"
        :include-desc="includeDesc"
        @toggle-select="toggleSelect"
        @toggle-include="toggleInclude"
        @toggle-expand="toggleExpand"
      />
      <div v-if="!filteredTree.length" class="empty">
        无数据 · 请确认对应的树是否已同步
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, h } from 'vue'
import type { PropType } from 'vue'

export const TreeNodeRow = defineComponent({
  name: 'TreeNodeRow',
  props: {
    node: { type: Object as PropType<TreeNode>, required: true },
    depth: { type: Number, required: true },
    expanded: { type: Object as PropType<Set<number>>, required: true },
    isSelected: { type: Function as PropType<(n: TreeNode) => boolean>, required: true },
    includeDesc: { type: Function as PropType<(n: TreeNode) => boolean>, required: true },
  },
  emits: ['toggle-select', 'toggle-include', 'toggle-expand'],
  setup(props, { emit }) {
    return (): any => {
      const isOpen = props.expanded.has(props.node.id)
      const hasChildren = (props.node.children?.length ?? 0) > 0
      const selected = props.isSelected(props.node)

      return h('div', { class: 'tree-row-wrap' }, [
        h(
          'div',
          {
            class: 'tree-row',
            style: { paddingLeft: `${props.depth * 18}px` },
          },
          [
            h(
              'span',
              {
                class: 'tree-toggle',
                onClick: () => hasChildren && emit('toggle-expand', props.node.id),
                style: { visibility: hasChildren ? 'visible' : 'hidden' },
              },
              [h(ElIcon, {}, () => h(isOpen ? CaretBottom : CaretRight))]
            ),
            h(ElCheckbox, {
              modelValue: selected,
              'onUpdate:modelValue': (v: string | number | boolean) =>
                emit('toggle-select', props.node, !!v),
              size: 'small',
            }),
            h(
              'span',
              {
                class: ['tree-label', !props.node.is_active ? 'tree-label--inactive' : ''],
                onClick: () => emit('toggle-select', props.node, !selected),
              },
              [
                props.node.name,
                h(
                  'span',
                  { class: 'tree-code' },
                  ` (${props.node.code})${!props.node.is_active ? ' · 已失效' : ''}`
                ),
              ]
            ),
            selected
              ? h(
                  ElTooltip,
                  { content: '勾选后此节点的所有子级数据也会被纳入', placement: 'top' },
                  () =>
                    h(ElSwitch, {
                      modelValue: props.includeDesc(props.node),
                      'onUpdate:modelValue': (v: string | number | boolean) =>
                        emit('toggle-include', props.node, !!v),
                      size: 'small',
                      'active-text': '含下级',
                      inlinePrompt: true,
                      style: 'margin-left: 12px',
                    })
                )
              : null,
          ]
        ),
        isOpen && hasChildren
          ? props.node.children.map((c) =>
              h(TreeNodeRow, {
                key: c.id,
                node: c,
                depth: props.depth + 1,
                expanded: props.expanded,
                isSelected: props.isSelected,
                includeDesc: props.includeDesc,
                onToggleSelect: (n: TreeNode, v: boolean) => emit('toggle-select', n, v),
                onToggleInclude: (n: TreeNode, v: boolean) => emit('toggle-include', n, v),
                onToggleExpand: (id: number) => emit('toggle-expand', id),
              })
            )
          : null,
      ])
    }
  },
})
</script>

<style scoped>
.tree-picker {
  border: 1px solid var(--color-border-light);
  border-radius: 4px;
  background: var(--color-bg-page);
  padding: 8px;
  min-height: 280px;
}
.tree-body {
  max-height: 480px;
  overflow-y: auto;
}
.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px;
  font-size: 13px;
}
.tree-row:hover {
  background: var(--color-bg-elevated, #fff);
}
.tree-toggle {
  cursor: pointer;
  color: var(--color-text-secondary);
  width: 16px;
  display: inline-flex;
  align-items: center;
}
.tree-label {
  cursor: pointer;
  flex: 1;
  line-height: 1.5;
}
.tree-label--inactive {
  color: var(--color-text-placeholder);
  font-style: italic;
}
.tree-code {
  color: var(--color-text-placeholder);
  font-family: monospace;
  font-size: 11px;
  margin-left: 4px;
}
.empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-placeholder);
  font-size: 13px;
}
</style>
