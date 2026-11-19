<template>
  <ElPopover :visible="open" role="menu" trigger="click" placement="bottom-start" :width="240" :show-arrow="false" popper-class="report-comparison-popover" :popper-style="{ padding: '0', maxWidth: 'calc(100vw - 24px)' }" @hide="activeDimension = undefined">
    <template #reference><button ref="trigger" type="button" class="comparison-button" :class="{ 'is-limit': atLimit }" aria-haspopup="menu" :aria-disabled="atLimit" :aria-expanded="open" @mouseenter="limitHint = atLimit" @mouseleave="limitHint = false" @focus="limitHint = atLimit" @blur="limitHint = false" @click="toggleMenu" @keydown.down.prevent="openMenu"><AddOutlinedIcon />添加对比<span v-if="selected.length > 1">{{ selected.length }}/10</span></button></template>
    <div ref="menu" class="comparison-menu" role="menu" aria-label="添加对比" @keydown="navigateMenu">
      <div class="comparison-menu-title">我的团队数据</div>
      <button type="button" role="menuitemcheckbox" :aria-checked="selected.includes('summary')" @focus="activeDimension = undefined" @mouseenter="activeDimension = undefined" @click="emit('toggle', 'summary')">汇总<span v-if="selected.includes('summary')" class="comparison-check" aria-hidden="true">✓</span></button>
      <ElPopover v-for="dimension in dimensions" role="tree" :key="dimension.value" :visible="open && activeDimension === dimension.value" trigger="hover" :teleported="false" placement="right-start" :fallback-placements="['left-start', 'bottom-start', 'top-start']" :width="226" :show-arrow="false" :offset="0" :popper-style="{ padding: '8px 0', maxWidth: 'calc(100vw - 24px)' }">
        <template #reference><button type="button" role="menuitem" :data-dimension="dimension.value" aria-haspopup="tree" :aria-expanded="activeDimension === dimension.value" @mouseenter="activate(dimension.value)" @focus="activate(dimension.value)" @click="activate(dimension.value)" @keydown.right.prevent="focusSearch(dimension.value)">{{ dimension.label }}<span class="comparison-chevron" aria-hidden="true">›</span></button></template>
        <div class="comparison-submenu" @keydown.left.self.prevent="returnToDimension(dimension.value)">
          <input :ref="element => { if (element) searchInputs[dimension.value] = element as HTMLInputElement }" v-model="searches[dimension.value]" class="comparison-search" :aria-label="`搜索${dimension.label}`" :placeholder="`搜索${dimension.label}`" @input="filterTree(dimension.value)" @keydown.down.prevent="focusTree(dimension.value)" />
          <ElTree :ref="element => { if (element) trees[dimension.value] = element as InstanceType<typeof ElTree> }" :data="nodes[dimension.value] || []" node-key="id" empty-text="暂无可选分组" :props="{ children: 'children', label: 'label' }" :expand-on-click-node="false" :filter-node-method="filterNode" :aria-label="`${dimension.label}对比分组`" @keydown.capture="navigateTree($event, dimension.value)" @node-click="node => emit('toggle', `${dimension.value}:${node.id}`)">
            <template #default="{ data }"><span class="comparison-tree-label">{{ data.label }}</span><span v-if="selected.includes(`${dimension.value}:${data.id}`)" class="comparison-check" aria-hidden="true">✓</span></template>
          </ElTree>
        </div>
      </ElPopover>
    </div>
  </ElPopover>
  <PerformancePopover :visible="atLimit && limitHint" :anchor="trigger || null" :width="268" name="comparison-limit-hint" @close="limitHint = false"><strong>最多添加 10 组对比</strong><p>请先清除已有对比再添加新对比</p></PerformancePopover>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElPopover, ElTree } from 'element-plus'
import AddOutlinedIcon from './AddOutlinedIcon.vue'
import PerformancePopover from './PerformancePopover.vue'
import { reportTotal, type ReportDepartment } from './projectStatisticsReport'
type Dimension = 'team' | 'sequence' | 'department'
const props = defineProps<{ groups: Partial<Record<Dimension, ReportDepartment[]>>; selected: string[] }>()
const emit = defineEmits<{ request: [dimension: Dimension]; toggle: [key: string] }>()
const dimensions = [{ value: 'team', label: '团队' }, { value: 'sequence', label: '序列' }, { value: 'department', label: '部门' }] as const
const open = ref(false)
const atLimit = computed(() => props.selected.length >= 10)
const limitHint = ref(false)
watch(atLimit, () => { open.value = false; limitHint.value = false })
function toggleMenu() { if (!atLimit.value) open.value = !open.value }
const activeDimension = ref<Dimension>()
const trigger = ref<HTMLButtonElement>()
const menu = ref<HTMLElement>()
const searches = ref<Partial<Record<Dimension, string>>>({})
const searchInputs: Partial<Record<Dimension, HTMLInputElement>> = {}
const trees: Partial<Record<Dimension, InstanceType<typeof ElTree>>> = {}
const toNodes = (rows: ReportDepartment[]): any[] => rows.map(row => ({ id: row.id, name: row.name, label: `${row.name} (${reportTotal(row.counts)})`, children: toNodes(row.children || []) }))
const nodes = computed(() => Object.fromEntries(dimensions.map(({ value }) => [value, toNodes(props.groups[value] || [])])))
function activate(dimension: Dimension) {
  if (activeDimension.value === dimension) return
  activeDimension.value = dimension
  emit('request', dimension)
}
function filterNode(value: string, data: Record<string, any>) { return !value || data.name.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()) }
function filterTree(dimension: Dimension) { trees[dimension]?.filter(searches.value[dimension] || '') }
async function openMenu() { if (atLimit.value) return; open.value = true; await nextTick(); menu.value?.querySelector<HTMLButtonElement>('button')?.focus() }
async function focusSearch(dimension: Dimension) { activate(dimension); await nextTick(); searchInputs[dimension]?.focus() }
function focusTree(dimension: Dimension) { trees[dimension]?.$el.querySelector('[role="treeitem"]')?.focus() }
function navigateTree(event: KeyboardEvent, dimension: Dimension) {
  const target = event.target as HTMLElement
  if (target.getAttribute('role') !== 'treeitem') return
  const node = trees[dimension]?.getNode(target.dataset.key!)
  if (!node || !['Enter', ' ', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'Enter' || event.key === ' ') emit('toggle', `${dimension}:${node.key}`)
  else if (event.key === 'ArrowRight' && !node.isLeaf) node.expand()
  else if (event.key === 'ArrowLeft' && node.expanded) node.collapse()
  else if (event.key === 'ArrowLeft') returnToDimension(dimension)
}
watch(nodes, async () => { await nextTick(); dimensions.forEach(({ value }) => { if (searches.value[value]) filterTree(value) }) })
function returnToDimension(dimension: Dimension) { menu.value?.querySelector<HTMLButtonElement>(`[data-dimension="${dimension}"]`)?.focus(); activeDimension.value = undefined }
function navigateMenu(event: KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const buttons = Array.from(menu.value?.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]') || [])
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length]?.focus()
}
function escape(event: KeyboardEvent) { if (event.key === 'Escape' && open.value) { open.value = false; activeDimension.value = undefined; trigger.value?.focus() } }
function outside(event: MouseEvent) { if (!menu.value?.contains(event.target as Node) && !trigger.value?.contains(event.target as Node)) open.value = false }
onMounted(() => { document.addEventListener('keydown', escape); document.addEventListener('mousedown', outside) })
onBeforeUnmount(() => { document.removeEventListener('keydown', escape); document.removeEventListener('mousedown', outside) })
</script>

<style scoped>
.comparison-button { display: inline-flex; align-items: center; gap: 4px; height: 28px; border: 1px solid #3370ff; border-radius: 6px; background: #fff; color: var(--color-primary); padding: 0 8px; font: inherit; line-height: 20px; cursor: pointer; }
.comparison-button:hover { background: #e0e9ff; }.comparison-button :deep(svg) { width: 14px; height: 14px; }
.comparison-button.is-limit { color: #bbbfc4; border-color: #dee0e3; cursor: not-allowed; }
.comparison-button.is-limit:hover { background: #fff; }
.comparison-limit-hint strong { font-size: 14px; font-weight: 600; }
.comparison-limit-hint p { margin: 8px 0 0; color: #8f959e; }
.comparison-menu-title { box-sizing: border-box; height: 32px; padding: 6px 12px; color: #8f959e; font-size: 12px; line-height: 20px; }
.comparison-menu > button, .comparison-menu :deep(.el-tooltip__trigger) { display: flex; align-items: center; width: 100%; height: 32px; border: 0; padding: 0 12px; background: #fff; color: #1f2329; font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
.comparison-menu button:hover, .comparison-menu button:focus-visible { background: #f5f6f7; outline: none; }
.comparison-check, .comparison-chevron { margin-left: auto; padding-left: 8px; color: #3370ff; }.comparison-chevron { color: #646a73; font-size: 20px; }
.comparison-search { display: block; box-sizing: border-box; width: calc(100% - 16px); height: 32px; margin: 0 8px 8px; padding: 0 8px; border: 1px solid #dee0e3; border-radius: 6px; color: #1f2329; font: inherit; font-size: 14px; }.comparison-search:focus { border-color: #3370ff; outline: none; }
.comparison-submenu :deep(.el-tree) { max-height: min(240px, calc(100vh - 100px)); overflow: auto; color: #1f2329; font-size: 14px; }
.comparison-submenu :deep(.el-tree-node__content) { height: 32px; padding-right: 12px; }.comparison-tree-label { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.comparison-no-data { padding: 12px; text-align: center; color: #8f959e; font-size: 14px; }
</style>
