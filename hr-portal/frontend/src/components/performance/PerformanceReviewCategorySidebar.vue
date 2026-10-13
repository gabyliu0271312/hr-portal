<template>
  <aside ref="sidebarRoot" class="review-sidebar" :class="{ 'is-collapsed': sidebarCollapsed, 'has-flyout': activeFlyoutCategory }" aria-label="绩效评估节点导航" @mouseleave="closeFlyout" @focusout="handleFocusOut" @keydown.esc="closeFlyout">
    <div class="sidebar-scroll">
      <div v-if="!sidebarCollapsed" class="cycle-section">
        <el-dropdown trigger="click" @command="emit('select-filter', $event)">
          <button class="cycle-picker" type="button">
            <span>{{ filterLabel }}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z" fill="currentColor" /></svg>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="option in filterOptions" :key="String(option.value)" :command="option.value">
                <span>{{ option.label }}</span>
                <small v-if="option.secondary">{{ option.secondary }}</small>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <div v-if="!sidebarCollapsed" class="sidebar-divider" aria-hidden="true"></div>

      <div v-for="category in categories" :key="category.key" class="review-category">
        <button
          class="category-toggle"
          :class="{ active: category.nodes.some(node => node.node_id === selectedNodeId) }"
          type="button"
          :aria-expanded="sidebarCollapsed ? openFlyoutKey === category.key : !collapsed[category.key]"
          @mouseenter="showFlyout(category.key)"
          @focus="showFlyout(category.key)"
          @click="toggleCategory(category.key)"
        >
          <span class="category-icon" aria-hidden="true">
            <svg v-if="category.key === 'mine'" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 6.5a3 3 0 1 0-6 0 3 3 0 0 0 6 0Zm2 0a5 5 0 1 1-10 0 5 5 0 0 1 10 0ZM4 19v2h16v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4Zm-2 0a6 6 0 0 1 6-6h8a6 6 0 0 1 6 6v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2Z" fill="currentColor" /></svg>
            <svg v-else-if="category.key === 'others'" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M10.5 1.5a5 5 0 1 1-.002 10.002A5 5 0 0 1 10.5 1.5Zm-3 5a3.001 3.001 0 0 0 6 0 3.001 3.001 0 0 0-6 0ZM4.125 18c-.08.32-.125.654-.125 1v1h8.5v2H4c-1.1 0-2-.9-2-2v-1a6 6 0 0 1 6-6h4.5v2H8a4.003 4.003 0 0 0-3.875 3Zm14.382 2.164L19.671 19H15a1 1 0 0 1 0-2h4.586l-1.079-1.079a1 1 0 1 1 1.414-1.414l2.829 2.828a1 1 0 0 1 0 1.415l-2.828 2.828a1 1 0 1 1-1.415-1.414Z" fill="currentColor" /></svg>
            <svg v-else-if="category.key === 'team'" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M8.5 4.5a2.5 2.5 0 1 0 .001 5.001A2.5 2.5 0 0 0 8.5 4.5ZM4 7a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0Zm1.835 7.5c-1.82 0-3.335 1.498-3.335 3.4v1.6h12v-1.6c0-1.901-1.515-3.4-3.335-3.4h-5.33ZM.5 17.9c0-2.982 2.39-5.4 5.335-5.4h5.33c2.945 0 5.335 2.418 5.335 5.4v1.6c0 1.1-.9 2-2 2h-12c-1.1 0-2-.9-2-2v-1.6Zm22 2.6h-4.135v-2H21.5v-.6c0-1.002-.845-1.9-2-1.9h-1.31a5.46 5.46 0 0 0-.985-2H19.5c2.21 0 4 1.746 4 3.9v1.6c.025.535-.49 1.02-1 1Zm-6-11a1.001 1.001 0 1 1 1 1c-.55 0-1-.447-1-1Zm1-3a3.001 3.001 0 0 0 0 6 3.001 3.001 0 0 0 0-6Z" fill="currentColor" /></svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M19.602 3.06a1.5 1.5 0 1 1 2.898.777l-.388 1.449-2.898-.776.388-1.45Zm-.774 2.888 2.898.777-3.897 14.543c-.076.285-.24.54-.468.727l-1.48 1.218a.17.17 0 0 1-.268-.073l-.65-1.798a1.394 1.394 0 0 1-.036-.835l3.901-14.559ZM3 3a1 1 0 1 0 0 2h12a1 1 0 1 0 0-2H3Zm-1 9a1 1 0 0 1 1-1h9a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1Zm1 7a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2H3Z" fill="currentColor" /></svg>
          </span>
          <span class="category-label">{{ category.label }}</span>
          <span v-if="sidebarCollapsed && openFlyoutKey === category.key" class="flyout-notch" aria-hidden="true"><span class="flyout-notch-inner"></span></span>
          <svg class="category-arrow" :class="{ collapsed: collapsed[category.key] }" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7.586 20.486.707.707a1 1 0 0 0 1.414 0l7.778-7.778a2 2 0 0 0 0-2.829L9.707 2.808a1 1 0 0 0-1.414 0l-.707.707a1 1 0 0 0 0 1.414l7.07 7.072-7.07 7.07a1 1 0 0 0 0 1.415Z" fill="currentColor" /></svg>
        </button>
        <div v-show="!sidebarCollapsed && !collapsed[category.key]" class="review-node-list">
          <button
            v-for="node in category.nodes"
            :key="node.node_id"
            class="review-node"
            :class="{ active: node.node_id === selectedNodeId }"
            type="button"
            @click="emit('select-node', node)"
          >
            <span class="node-group">
              <span class="node-label">{{ node.node_name }}</span>
              <em v-if="showNodeStatus" :class="`status-${node.status}`">{{ statusLabel[node.status] }}</em>
            </span>
          </button>
          <p v-if="!category.nodes.length" class="category-empty">暂无事项</p>
        </div>
      </div>
    </div>
    <nav v-if="sidebarCollapsed && activeFlyoutCategory" class="sidebar-flyout" :aria-label="activeFlyoutCategory.label">
      <button
        v-for="node in activeFlyoutCategory.nodes"
        :key="node.node_id"
        type="button"
        class="flyout-node"
        :class="{ active: node.node_id === selectedNodeId }"
        @click="selectFlyoutNode(node)"
      >{{ node.node_name }}</button>
      <p v-if="!activeFlyoutCategory.nodes.length" class="flyout-empty">暂无事项</p>
    </nav>
    <button class="sidebar-collapse" type="button" :aria-label="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'" :aria-expanded="!sidebarCollapsed" @click="toggleSidebar">
      <span class="universe-icon">
        <svg :class="{ flipped: sidebarCollapsed }" width="16" height="16" viewBox="0 0 24 24" fill="none" data-icon="LeftSmallCcmOutlined" aria-hidden="true"><path d="M15.707 4.293a1 1 0 0 1 0 1.414L9.414 12l6.293 6.293a1 1 0 0 1-1.414 1.414l-7-7a1 1 0 0 1 0-1.414l7-7a1 1 0 0 1 1.414 0Z" fill="currentColor" /></svg>
      </span>
    </button>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { PerformanceReviewCategory, PerformanceReviewNode, PerformanceReviewOverview } from '@/api/performance'

export interface SidebarFilterOption {
  value: number | string
  label: string
  secondary?: string
}

const props = withDefaults(defineProps<{
  categories: PerformanceReviewCategory[]
  projects: PerformanceReviewOverview['projects']
  activeProject: PerformanceReviewOverview['active_project']
  selectedNodeId: string
  loading?: boolean
  filterOptions?: SidebarFilterOption[]
  activeFilterValue?: number | string
  filterPlaceholder?: string
  showNodeStatus?: boolean
}>(), {
  filterOptions: undefined,
  activeFilterValue: undefined,
  filterPlaceholder: '暂无绩效周期',
  showNodeStatus: true,
})

const emit = defineEmits<{
  'select-project': [projectId: number | string]
  'select-filter': [value: number | string]
  'select-node': [node: PerformanceReviewNode]
}>()

const filterLabel = computed(() => {
  if (props.filterOptions) {
    if (props.loading) return '加载中…'
    const active = props.filterOptions.find(option => String(option.value) === String(props.activeFilterValue))
    return active?.label || props.filterPlaceholder
  }
  return props.activeProject?.cycle_name || (props.loading ? '加载中…' : '暂无绩效周期')
})

const filterOptions = computed<SidebarFilterOption[]>(() => {
  if (props.filterOptions) return props.filterOptions
  return props.projects.map(project => ({
    value: project.project_id,
    label: project.cycle_name,
    secondary: project.project_name,
  }))
})

const collapsed = ref<Record<string, boolean>>({})
const sidebarCollapsed = ref(false)
const sidebarRoot = ref<HTMLElement | null>(null)
const openFlyoutKey = ref<string | null>(null)
const activeFlyoutCategory = computed(() => props.categories.find(category => category.key === openFlyoutKey.value) || null)

function closeFlyout() {
  openFlyoutKey.value = null
}

function showFlyout(key: string) {
  if (sidebarCollapsed.value) openFlyoutKey.value = key
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  closeFlyout()
}

function toggleCategory(key: string) {
  if (sidebarCollapsed.value) {
    showFlyout(key)
    return
  }
  collapsed.value[key] = !collapsed.value[key]
}

function selectFlyoutNode(node: PerformanceReviewNode) {
  emit('select-node', node)
  closeFlyout()
}

function handleFocusOut(event: FocusEvent) {
  if (!sidebarRoot.value?.contains(event.relatedTarget as Node | null)) closeFlyout()
}

function handleOutsidePointer(event: PointerEvent) {
  if (!sidebarRoot.value?.contains(event.target as Node | null)) closeFlyout()
}

onMounted(() => document.addEventListener('pointerdown', handleOutsidePointer))
onUnmounted(() => document.removeEventListener('pointerdown', handleOutsidePointer))

const statusLabel: Record<PerformanceReviewNode['status'], string> = {
  pending: '待完成',
  not_started: '未开始',
  overdue: '已逾期',
  completed: '已完成',
}
</script>

<style scoped>
.review-sidebar { position: relative; z-index: 40; width: 260px; height: 100%; min-height: 0; flex: 0 0 260px; box-sizing: border-box; background: #fff; color: #1f2329; box-shadow: 1px 0 0 #edf0f4; }
.sidebar-scroll { height: 100%; box-sizing: border-box; overflow-y: auto; padding: 14px 0 24px 8px; }
.review-sidebar.is-collapsed { width: 72px; flex-basis: 72px; box-shadow: 4px 0 6px rgba(31, 35, 41, 0.03); }
.is-collapsed .sidebar-scroll { overflow: visible; padding: 8px; }
.is-collapsed .category-toggle { position: relative; width: 56px; height: auto; flex-direction: column; align-items: center; margin: 2px 0; padding: 4px; border-radius: 4px; text-align: center; }
.is-collapsed .category-toggle.active { background: rgba(51, 112, 255, 0.12); color: #3370ff; font-weight: 500; }
.is-collapsed .category-icon { height: 21px; align-items: center; flex: 0 0 21px; margin: 0; color: inherit; }
.is-collapsed .category-icon svg { width: 14px; height: 14px; }
.is-collapsed .category-label { width: 48px; overflow: visible; font-size: 12px; line-height: 18px; text-overflow: clip; white-space: normal; word-break: break-all; }
.is-collapsed .category-arrow { display: none; }
.flyout-notch { position: absolute; top: 50%; right: -8px; z-index: 1000; width: 0; height: 0; border: 6px solid transparent; border-right-color: rgba(31, 35, 41, 0.15); transform: translateY(-50%); pointer-events: none; }
.flyout-notch-inner { position: absolute; top: -5px; left: -3px; width: 0; height: 0; border: 5px solid transparent; border-right-color: #fff; }
.sidebar-flyout { position: absolute; top: 0; left: 72px; z-index: 5; width: 188px; height: 100%; box-sizing: border-box; overflow-y: auto; padding: 10px 8px 8px; border-left: 1px solid rgba(31, 35, 41, 0.15); background: #fff; box-shadow: 4px 0 6px rgba(31, 35, 41, 0.03); }
.flyout-node { display: block; width: 100%; min-height: 36px; margin: 2px 0; padding: 8px; border: 0; border-radius: 4px; background: transparent; color: #1f2329; cursor: pointer; font-size: 12px; line-height: 20px; text-align: left; word-break: break-word; }
.flyout-node:hover:not(.active) { background: rgba(31, 35, 41, 0.08); }
.flyout-node.active { background: #e1eaff; color: #3370ff; font-weight: 500; }
.flyout-empty { margin: 8px; color: #8f959e; font-size: 12px; }
.is-collapsed.has-flyout .sidebar-collapse { right: -204px; z-index: 6; }
.cycle-section { padding: 0 16px 8px; }
.cycle-picker { display: flex; width: 100%; align-items: center; justify-content: flex-start; gap: 8px; height: 30px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: #1f2329; cursor: pointer; font-size: 14px; font-weight: 600; line-height: 26px; text-align: left; }
.cycle-picker:hover { background: rgba(31, 35, 41, 0.06); }
.cycle-picker svg { color: #646a73; }
.sidebar-divider { height: 1px; margin: 0 8px 4px; background: rgba(31, 35, 41, 0.15); }
.review-category { min-width: 0; }
.category-toggle { display: flex; width: calc(100% - 16px); height: 38px; align-items: center; margin: 1px 8px; padding: 0 16px; border: 0; border-radius: 6px; background: transparent; color: #646a73; cursor: pointer; font-size: 14px; font-weight: 400; line-height: 22px; text-align: left; transition: color .1s linear, background .1s linear; }
.category-toggle:hover { background: rgba(31, 35, 41, 0.08); }
.category-icon { display: flex; flex: 0 0 16px; margin-right: 8px; color: #646a73; }
.category-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.category-arrow { flex: 0 0 14px; margin-left: auto; color: #8f959e; transform: rotate(90deg); transition: transform .4s cubic-bezier(.34,.69,.1,1); }
.category-arrow.collapsed { transform: rotate(0deg); }
.review-node-list { display: flex; flex-direction: column; min-width: 0; }
.review-node { display: flex; width: calc(100% - 16px); min-height: 38px; align-items: stretch; margin: 1px 8px; padding: 0 8px 0 40px; border: 0; border-radius: 6px; background: transparent; color: #1f2329; cursor: pointer; font-size: 14px; font-weight: 400; line-height: 22px; text-align: left; transition: color .1s linear, background .1s linear; }
.node-group { display: flex; width: 100%; min-width: 0; min-height: 38px; align-items: baseline; justify-content: space-between; gap: 8px; padding: 8px 0; border-radius: 4px; box-sizing: border-box; font: inherit; }
.review-node:hover:not(.active) { background: rgba(31, 35, 41, 0.1); }
.review-node.active { background: rgba(20, 86, 240, 0.15); color: #1456f0; font-weight: 500; }
.node-label { min-width: 0; margin-right: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: inherit; }
.review-node em { display: flex; max-width: 100%; flex: 0 0 auto; align-items: center; overflow: hidden; padding: 0 6px; border-radius: 4px; color: #1f2329; font-size: 12px; font-style: normal; font-weight: 400; line-height: 22px; white-space: nowrap; }
.review-node em.status-pending { background: #feead2; color: #6b3900; }
.review-node em.status-overdue { background: #ffe8e8; color: #d14343; }
.review-node em.status-not_started { background: rgba(31, 35, 41, 0.1); color: #1f2329; }
.review-node em.status-completed { background: #e4f7eb; color: #16803c; }
.category-empty { margin: 4px 8px 8px 48px; color: #8f959e; font-size: 12px; }
.sidebar-collapse { position: absolute; top: 50%; right: -16px; z-index: 4; display: grid; width: 16px; height: 40px; place-items: center; padding: 0; border: 0; border-radius: 0 6px 6px 0; background: #fff; color: #3370ff; box-shadow: 4px 0 6px rgba(31, 35, 41, 0.03); cursor: pointer; transform: translateY(-50%); }
.universe-icon { display: inline-block; line-height: 0; }
.universe-icon svg { display: inline-block; width: 16px; height: 16px; overflow: hidden; transition: transform .2s ease; }
.universe-icon svg.flipped { transform: rotate(180deg); }
.is-collapsed .sidebar-collapse { color: #1f2329; }
.sidebar-collapse:hover { color: #3370ff; }
:deep(.el-dropdown-menu__item) { display: flex; min-width: 220px; justify-content: space-between; gap: 18px; }
:deep(.el-dropdown-menu__item small) { color: #8f959e; }
@media (max-width: 720px) { .review-sidebar { width: 100%; height: auto; flex-basis: auto; } .sidebar-scroll { padding: 14px 8px 16px; } .review-node-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); } .review-node { width: auto; padding-left: 16px; } }
</style>
