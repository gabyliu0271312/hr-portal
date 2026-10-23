<template>
  <div ref="rootRef" class="performance-item-add-menu">
    <button
      ref="triggerRef"
      class="performance-item-add-menu__trigger"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="expanded"
      @click="toggle"
    >
      <span aria-hidden="true">+</span> 添加
    </button>
    <Teleport to="body">
      <div v-if="expanded" ref="menuRef" class="performance-item-add-menu__menu" :style="menuStyle" role="menu" @keydown="handleMenuKeydown">
        <button ref="firstItemRef" type="button" role="menuitem" @click="select('fill')">填写项</button>
        <button type="button" role="menuitem" @click="select('prompt')">提示项</button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const emit = defineEmits<{ select: [kind: 'fill' | 'prompt'] }>()
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
  const gap = parseFloat(getComputedStyle(menu).getPropertyValue('--performance-menu-gap')) || 0
  const { width, height } = menu.getBoundingClientRect()
  const left = Math.max(gap, Math.min(anchor.left, window.innerWidth - width - gap))
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
function select(kind: 'fill' | 'prompt') { emit('select', kind); close(true) }
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
.performance-item-add-menu { position: relative; display: inline-block; }
.performance-item-add-menu__trigger { min-width: 0; height: var(--performance-menu-item-height); padding: 0 var(--performance-menu-trigger-padding-inline); border: 0; border-radius: var(--performance-menu-trigger-radius); background: transparent; color: var(--color-text-primary); font: 400 var(--font-size-md)/var(--performance-menu-item-line-height) var(--font-sans); cursor: pointer; }
.performance-item-add-menu__trigger:hover, .performance-item-add-menu__trigger:focus-visible { outline: 0; background: var(--performance-menu-item-hover-background); }
.performance-item-add-menu__menu { position: fixed; z-index: var(--performance-popover-z-index); top: calc(100% + var(--performance-menu-gap)); left: 0; width: var(--performance-menu-width); height: var(--performance-menu-height); padding: var(--performance-menu-padding); box-sizing: border-box; border: var(--performance-popover-border-width) solid var(--performance-popover-border); border-radius: var(--performance-menu-radius); background: var(--performance-popover-background); box-shadow: var(--performance-popover-shadow); }
.performance-item-add-menu__menu button { display: block; width: 100%; height: var(--performance-menu-item-height); padding: 0 var(--performance-menu-item-padding-inline); border: 0; border-radius: var(--performance-menu-item-radius); background: transparent; color: var(--color-text-primary); text-align: left; white-space: nowrap; font: 400 var(--font-size-md)/var(--performance-menu-item-line-height) var(--font-sans); cursor: pointer; }
.performance-item-add-menu__menu button:hover, .performance-item-add-menu__menu button:focus-visible { outline: 0; background: var(--performance-menu-item-hover-background); }
.performance-item-add-menu__menu button + button { margin-top: var(--performance-menu-item-gap); }
</style>
