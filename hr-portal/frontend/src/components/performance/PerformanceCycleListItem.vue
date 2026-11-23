<template>
  <div class="cycle-item" :class="{ active: selected, 'is-menu-open': open }" role="button" tabindex="0" @click="emit('select')" @keydown.enter.self.prevent="emit('select')" @keydown.space.self.prevent="emit('select')" @mouseleave="scheduleClose">
    <PerformanceInfoPopover :content="name" :aria-label="name" variant="text" gap="var(--spacing-2)" overflow-only width="auto" max-width="var(--performance-popover-width)">{{ name }}</PerformanceInfoPopover>
    <span v-if="canManage" class="cycle-more-anchor" @mouseenter="showMenu" @mouseleave="scheduleClose">
      <PerformanceIconButton ref="trigger" class="cycle-more" icon="MoreOutlined" label="更多操作" variant="contextual" :expanded="open" aria-haspopup="menu" @click.stop="showMenu" @keydown.stop @keydown.down.prevent="focusFirst" @keydown.esc.prevent="close(true)" />
    </span>
    <Teleport to="body">
      <ul v-if="open && canManage" ref="menu" class="cycle-action-menu" role="menu" aria-label="周期操作" :style="menuStyle" @mouseenter="cancelClose" @mouseleave="scheduleClose" @keydown="handleKeydown">
        <li role="none"><div class="cycle-action-menu__item" role="menuitem" tabindex="0" @click="selectAction('edit')" @keydown.enter.prevent="selectAction('edit')" @keydown.space.prevent="selectAction('edit')"><PerformanceIconButton class="cycle-action-menu__icon" icon="EditOutlined" label="编辑" static /><span>编辑</span></div></li>
        <li role="none"><PerformanceDisabledReason class="cycle-action-menu__reason" :disabled="deleteDisabled" reason="周期中已有启动的项目，不支持删除" side="right" gap="var(--spacing-3)" @popover-enter="cancelClose" @popover-leave="scheduleClose"><div class="cycle-action-menu__item" role="menuitem" :tabindex="deleteDisabled ? -1 : 0" :aria-disabled="deleteDisabled" @click="selectAction('remove')" @keydown.enter.prevent="selectAction('remove')" @keydown.space.prevent="selectAction('remove')"><PerformanceIconButton class="cycle-action-menu__icon" icon="DeleteTrashOutlined" label="删除" static :disabled="deleteDisabled" /><span>删除</span></div></PerformanceDisabledReason></li>
      </ul>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PerformanceIconButton from './PerformanceIconButton.vue'
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'
import PerformanceDisabledReason from './PerformanceDisabledReason.vue'

const props = defineProps<{ name: string; selected: boolean; canManage: boolean; deleteDisabled: boolean }>()
const emit = defineEmits<{ select: []; edit: []; remove: [] }>()
const trigger = ref<InstanceType<typeof PerformanceIconButton> | null>(null)
const menu = ref<HTMLElement | null>(null)
const open = ref(false)
const menuStyle = ref<Record<string, string>>({ visibility: 'hidden' })
let closeTimer: ReturnType<typeof setTimeout> | undefined
const button = () => trigger.value?.$el as HTMLButtonElement | undefined
function cancelClose() { clearTimeout(closeTimer) }
function position() {
  const anchor = button()
  const panel = menu.value
  if (!anchor || !panel) return
  const rect = anchor.getBoundingClientRect()
  const size = panel.getBoundingClientRect()
  const styles = getComputedStyle(panel)
  const gap = parseFloat(styles.getPropertyValue('--performance-menu-gap')) || 0
  const margin = parseFloat(styles.getPropertyValue('--performance-popover-viewport-margin')) || 0
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - size.width - margin))
  const top = rect.bottom + gap + size.height <= window.innerHeight - margin ? rect.bottom + gap : Math.max(margin, rect.top - size.height - gap)
  menuStyle.value = { left: `${left}px`, top: `${top}px`, visibility: 'visible' }
}
function showMenu() {
  cancelClose()
  if (!props.canManage) return
  open.value = true
  void nextTick(position)
}
function close(restoreFocus = false) {
  cancelClose()
  open.value = false
  menuStyle.value = { visibility: 'hidden' }
  if (restoreFocus) button()?.focus()
}
function scheduleClose() {
  cancelClose()
  const delay = button() ? parseFloat(getComputedStyle(button()!).getPropertyValue('--performance-cycle-menu-close-delay')) : 0
  closeTimer = setTimeout(() => close(), delay || 0)
}
function focusFirst() {
  showMenu()
  void nextTick(() => menu.value?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus())
}
function selectAction(action: 'edit' | 'remove') {
  if (action === 'remove' && props.deleteDisabled) return
  close()
  if (action === 'edit') emit('edit')
  else emit('remove')
}
function handleKeydown(event: KeyboardEvent) {
  const items = [...menu.value!.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')]
  const index = items.indexOf(document.activeElement as HTMLElement)
  if (event.key === 'Escape') { event.preventDefault(); close(true) }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
  }
}
function outside(event: PointerEvent) {
  if (!button()?.contains(event.target as Node) && !menu.value?.contains(event.target as Node)) close()
}
watch(() => props.canManage, allowed => { if (!allowed) close() })
onMounted(() => {
  document.addEventListener('pointerdown', outside)
  window.addEventListener('resize', position)
  window.addEventListener('scroll', position, true)
})
onBeforeUnmount(() => {
  cancelClose()
  document.removeEventListener('pointerdown', outside)
  window.removeEventListener('resize', position)
  window.removeEventListener('scroll', position, true)
})
</script>

<style scoped>
.cycle-item { display: flex; align-items: center; justify-content: space-between; width: var(--performance-cycle-item-width); height: var(--performance-cycle-item-height); box-sizing: border-box; padding: var(--performance-cycle-item-padding); border-radius: var(--performance-cycle-item-radius); color: var(--color-text-primary); font: var(--font-weight-normal) var(--font-size-md)/var(--performance-button-line-height) var(--font-sans); cursor: pointer; }
.cycle-item:hover { background: var(--performance-cycle-item-hover-background); }
.cycle-item.active { background: var(--performance-cycle-item-selected-background); color: var(--color-primary); font-weight: var(--performance-calibration-scope-title-font-weight); }
.cycle-action-menu__reason { display: flex; width: 100%; }
.cycle-action-menu__reason :deep(.performance-info-popover__anchor) { width: 100%; color: inherit !important; }
.cycle-more-anchor { display: flex; flex: none; margin-left: var(--performance-cycle-more-gap); }
.cycle-more { opacity: 0; }
.cycle-item:hover .cycle-more, .cycle-item:focus-within .cycle-more, .is-menu-open .cycle-more { opacity: 1; }
.cycle-action-menu { position: fixed; z-index: var(--performance-popover-z-index); width: var(--performance-cycle-menu-width); box-sizing: border-box; font-family: var(--font-sans); margin: 0; padding: var(--performance-cycle-menu-padding); border: var(--performance-popover-border-width) solid var(--performance-popover-border); border-radius: var(--performance-menu-radius); background: var(--performance-popover-background); box-shadow: var(--performance-popover-shadow); list-style: none; }
.cycle-action-menu li { margin: var(--performance-cycle-menu-item-margin); padding: 0; }
.cycle-action-menu__item { display: flex; align-items: center; gap: var(--performance-cycle-menu-icon-gap); width: 100%; min-height: var(--performance-menu-item-height); box-sizing: border-box; padding: var(--performance-cycle-menu-item-padding); border: 0; border-radius: var(--performance-menu-item-radius); background: transparent; color: var(--color-text-primary); font: var(--font-weight-normal) var(--font-size-md)/var(--performance-menu-item-line-height) var(--font-sans); cursor: pointer; }
.cycle-action-menu__item:hover, .cycle-action-menu__item:focus-visible, .cycle-action-menu__item:active { outline: 0; background: var(--performance-menu-item-hover-background); }
.cycle-action-menu__item[aria-disabled='true'] { color: var(--performance-button-link-disabled-color); cursor: not-allowed; }
.cycle-action-menu__icon { pointer-events: none; flex: none; width: var(--performance-cycle-more-icon-size); height: var(--performance-cycle-more-icon-size); padding: 0; color: inherit; }
</style>
