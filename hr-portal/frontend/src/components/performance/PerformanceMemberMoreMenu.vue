<template>
  <div v-if="member" ref="rootRef" class="performance-member-more-menu">
    <button
      ref="triggerRef"
      type="button"
      class="performance-member-more-menu__trigger"
      aria-label="更多成员操作"
      aria-haspopup="menu"
      :aria-expanded="expanded"
      @click="toggle"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="5.25" r="1.75" fill="currentColor" /><circle cx="12" cy="12" r="1.75" fill="currentColor" /><circle cx="12" cy="18.75" r="1.75" fill="currentColor" /></svg>
    </button>
    <Teleport to="body">
      <div v-if="expanded" ref="menuRef" class="performance-member-more-menu__menu" :style="menuStyle" role="menu" @keydown="handleMenuKeydown">
        <button ref="firstItemRef" type="button" class="performance-member-more-menu__item" role="menuitem" @click="select('authorize')">
          <svg class="performance-member-more-menu__item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" data-icon="TeamAddOutlined"><path d="M15 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm2.5 4.5a2.5 2.5 0 1 0-5.001.001A2.5 2.5 0 0 0 17.5 6.5ZM12.335 12H14.5v2h-2.165C10.515 14 9 15.498 9 17.4V19h5.5v2H9c-1.1 0-2-.9-2-2v-1.6c0-2.982 2.39-5.4 5.335-5.4ZM1 20h4.135v-2H2v-.6c0-1.002.845-1.9 2-1.9h1.31a5.46 5.46 0 0 1 .985-2H4c-2.21 0-4 1.746-4 3.9V19c0 .55.45 1 1 1ZM9 9a3.001 3.001 0 0 0-6 0 3.001 3.001 0 0 0 6 0ZM6 8a1.001 1.001 0 0 1 0 2 1.001 1.001 0 0 1 0-2Zm13.5 13a1 1 0 0 1-1-1v-2h-2a1 1 0 1 1 0-2h2v-2a1 1 0 1 1 2 0v2h2a1 1 0 1 1 0 2h-2v2a1 1 0 0 1-1 1Z" fill="currentColor"/></svg>
          <span>授权他人处理</span>
        </button>
        <button type="button" class="performance-member-more-menu__item" role="menuitem" @click="select('transfer')">
          <svg class="performance-member-more-menu__item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" data-icon="UserSwitchOutlined"><path d="M8.687 4.022a.6.6 0 01.424-.735l.585-.157a3.334 3.334 0 00-4.053.513A.667.667 0 114.7 2.7a4.667 4.667 0 015.482-.825l-.08-.303a.6.6 0 011.158-.31l.345 1.288c.181.675-.22 1.37-.895 1.551l-1.288.345a.6.6 0 01-.735-.424zm-2.02 3.311a2.667 2.667 0 11-5.334 0 2.667 2.667 0 015.334 0zm-4 0a1.333 1.333 0 102.666 0 1.333 1.333 0 00-2.666 0zm.666 3.334a2.667 2.667 0 00-2.666 2.666V14c0 .733.6 1.333 1.333 1.333h4c.733 0 1.333-.6 1.333-1.333v-.667a2.667 2.667 0 00-2.666-2.666H3.333zM2 13.333C2 12.597 2.597 12 3.333 12h1.334C5.403 12 6 12.597 6 13.333V14H2v-.667zm6.667 0a2.667 2.667 0 012.666-2.666h1.334a2.667 2.667 0 012.666 2.666V14c0 .733-.6 1.333-1.333 1.333h-4c-.733 0-1.333-.6-1.333-1.333v-.667zm1.333 0V14h4v-.667c0-.736-.597-1.333-1.333-1.333h-1.334c-.736 0-1.333.597-1.333 1.333zm2-8.666A2.667 2.667 0 1112 10a2.667 2.667 0 010-5.333zm0 4A1.333 1.333 0 1012 6a1.333 1.333 0 000 2.667z" fill="currentColor"/></svg>
          <span>转交他人处理</span>
        </button>
        <button type="button" class="performance-member-more-menu__item" role="menuitem" disabled>
          <svg class="performance-member-more-menu__item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
          <span>转移</span>
        </button>
        <button type="button" class="performance-member-more-menu__item" role="menuitem" @click="select('delete')">
          <svg class="performance-member-more-menu__item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" data-icon="DeleteTrashOutlined"><path d="M8 4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2h5a1 1 0 1 1 0 2h-1v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6H3a1 1 0 0 1 0-2h5ZM6 6v14h12V6H6Zm4 3a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Zm4 0a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Z" fill="currentColor"/></svg>
          <span>删除</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ProjectMemberTaskOption } from '@/api/performance'

export type PerformanceMemberContext = {
  project_id: number
  employee_no: string
  root_review_id?: number
  display_name?: string
  task_id?: number | null
  task_map?: ProjectMemberTaskOption[]
}
const props = defineProps<{ member?: PerformanceMemberContext | null }>()
const emit = defineEmits<{
  authorize: [payload: PerformanceMemberContext]
  transfer: [payload: PerformanceMemberContext]
  delete: [payload: PerformanceMemberContext]
}>()
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const firstItemRef = ref<HTMLButtonElement | null>(null)
const expanded = ref(false)
const menuStyle = ref<Record<string, string>>({})

function positionMenu() {
  const anchor = triggerRef.value?.getBoundingClientRect()
  const menu = menuRef.value
  if (!anchor || !menu) return
  const gap = 4
  const { width, height } = menu.getBoundingClientRect()
  const left = Math.max(gap, Math.min(anchor.right - width, window.innerWidth - width - gap))
  const top = anchor.bottom + gap + height <= window.innerHeight ? anchor.bottom + gap : Math.max(gap, anchor.top - height - gap)
  menuStyle.value = { left: `${left}px`, top: `${top}px` }
}
function open() {
  expanded.value = true
  void nextTick(() => { positionMenu(); firstItemRef.value?.focus() })
}
function close(restoreFocus = false) {
  if (!expanded.value) return
  expanded.value = false
  if (restoreFocus) triggerRef.value?.focus()
}
function toggle() { if (expanded.value) close(); else open() }
function select(action: 'authorize' | 'transfer' | 'delete') {
  if (!props.member) return
  const payload = { ...props.member }
  if (action === 'authorize') emit('authorize', payload)
  else if (action === 'transfer') emit('transfer', payload)
  else emit('delete', payload)
  close(true)
}
function handlePointerDown(event: PointerEvent) {
  if (!rootRef.value?.contains(event.target as Node) && !menuRef.value?.contains(event.target as Node)) close()
}
function handleMenuKeydown(event: KeyboardEvent) {
  const items = Array.from(menuRef.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || [])
  const index = items.indexOf(document.activeElement as HTMLButtonElement)
  if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); close(true); return }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const next = index < 0 ? 0 : (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
    items[next]?.focus()
  }
  if (event.key === 'Home') { event.preventDefault(); items[0]?.focus() }
  if (event.key === 'End') { event.preventDefault(); items.at(-1)?.focus() }
}
function handleViewportChange(event: Event) { if (!(event.target instanceof Node) || !menuRef.value?.contains(event.target)) close() }
onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('resize', handleViewportChange)
  window.addEventListener('scroll', handleViewportChange, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
})
</script>

<style scoped>
.performance-member-more-menu{flex:0 0 auto;display:flex;align-items:center}
.performance-member-more-menu__trigger{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:#1f2329;cursor:pointer}
.performance-member-more-menu__trigger:hover,.performance-member-more-menu__trigger:focus-visible{outline:0;background:rgba(31,35,41,.1)}
.performance-member-more-menu__menu{position:fixed;z-index:var(--performance-popover-z-index);width:139px;padding:4px;box-sizing:border-box;border:1px solid #dee0e3;border-radius:8px;background:#fff;box-shadow:0 8px 24px 8px rgba(31,35,41,.04),0 6px 12px 0 rgba(31,35,41,.04),0 4px 8px -8px rgba(31,35,41,.06)}
.performance-member-more-menu__item{display:flex;align-items:center;width:100%;height:35px;padding:0 12px;border:0;border-radius:6px;background:transparent;color:#1f2329;text-align:left;white-space:nowrap;font:400 14px/22px var(--font-sans);cursor:pointer}
.performance-member-more-menu__item:hover:not(:disabled),.performance-member-more-menu__item:focus-visible{outline:0;background:rgba(31,35,41,.08)}
.performance-member-more-menu__item:disabled{opacity:.45;cursor:not-allowed}
.performance-member-more-menu__item-icon{flex:0 0 16px;width:16px;height:16px;margin-right:8px;color:currentColor}
</style>
