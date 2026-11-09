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
          <svg class="performance-member-more-menu__item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM6.5 18c.5-3 2.5-4.5 5.5-4.5s5 1.5 5.5 4.5c.07.42-.28.75-.71.75H7.21c-.43 0-.78-.33-.71-.75Z" fill="currentColor" /><path d="M19 11.5v4M17 13.5h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
          <span>授权他人处理</span>
        </button>
        <button type="button" class="performance-member-more-menu__item" role="menuitem" @click="select('transfer')">
          <svg class="performance-member-more-menu__item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4.5 3.5 8l3.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /><path d="M4 8h13.5a3 3 0 0 1 0 6H13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /><path d="M11.5 14.5 8 18l3.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <span>转交他人处理</span>
        </button>
        <button type="button" class="performance-member-more-menu__item" role="menuitem" disabled>
          <svg class="performance-member-more-menu__item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
          <span>转移</span>
        </button>
        <button type="button" class="performance-member-more-menu__item performance-member-more-menu__item--danger" role="menuitem" @click="select('delete')">
          <svg class="performance-member-more-menu__item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7m3.5 0-.8 11.2A2 2 0 0 1 15.2 20H8.8a2 2 0 0 1-2-1.8L6 7m3 3.5v6m6-6v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
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
.performance-member-more-menu__item--danger{color:#f54a45}
</style>
