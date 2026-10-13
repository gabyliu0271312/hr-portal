<template>
  <span ref="root" class="cycle-settings-menu-root">
    <button
      ref="trigger"
      class="cycle-settings-button"
      type="button"
      :aria-label="ariaLabel"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? menuId : undefined"
      @click="toggle"
      @keydown.down.prevent="openAndFocusFirst"
      @keydown.esc.prevent="close(true)"
    >
      <span class="cycle-settings-button__icon" aria-hidden="true">
        <span class="cycle-settings-button__glyph">
          <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-icon="SettingOutlined" focusable="false"><path d="m4.328 19.734-.31-.34a10.91 10.91 0 0 1-2.386-4.146l-.135-.436L3.545 12 1.497 9.188l.135-.436a10.91 10.91 0 0 1 2.385-4.147l.311-.339 3.442.377 1.398-3.187.448-.101A10.843 10.843 0 0 1 12 1.09c.809 0 1.607.089 2.384.264l.448.1 1.398 3.188 3.442-.377.31.34a10.91 10.91 0 0 1 2.386 4.146l.135.436L20.455 12l2.048 2.812-.135.436a10.91 10.91 0 0 1-2.385 4.147l-.311.339-3.442-.377-1.398 3.187-.448.101a10.848 10.848 0 0 1-4.768 0l-.448-.1-1.398-3.188-3.442.377Zm3.485-2.21a1.488 1.488 0 0 1 1.525.881l1.12 2.554a9.05 9.05 0 0 0 3.084 0l1.12-2.554a1.488 1.488 0 0 1 1.524-.881l2.755.3c.665-.8 1.19-1.71 1.547-2.69l-1.644-2.258a1.488 1.488 0 0 1 0-1.752l1.644-2.258a9.091 9.091 0 0 0-1.547-2.69l-2.755.3a1.488 1.488 0 0 1-1.524-.881l-1.12-2.554a9.053 9.053 0 0 0-3.084 0l-1.12 2.554a1.488 1.488 0 0 1-1.525.881l-2.754-.3a9.09 9.09 0 0 0-1.548 2.69l1.645 2.258c.38.522.38 1.23 0 1.752l-1.644 2.258c.358.98.882 1.89 1.547 2.69l2.754-.3ZM12 16.545c-2.502 0-4.528-2.036-4.528-4.545 0-2.51 2.026-4.545 4.528-4.545S16.528 9.49 16.528 12 14.502 16.545 12 16.545Zm0-1.818c1.496 0 2.71-1.22 2.71-2.727A2.719 2.719 0 0 0 12 9.273 2.719 2.719 0 0 0 9.29 12 2.719 2.719 0 0 0 12 14.727Z" fill="currentColor" /></svg>
        </span>
      </span>
      <span class="cycle-settings-button__label">{{ buttonLabel }}</span>
    </button>
    <Teleport to="body">
      <ul
        v-if="open"
        :id="menuId"
        ref="menu"
        class="cycle-settings-menu"
        role="menu"
        :aria-label="`${buttonLabel}菜单`"
        :style="menuStyle"
        @keydown="handleMenuKeydown"
      >
        <li v-for="item in items" :key="item.key" class="cycle-settings-menu__entry" role="none">
          <button class="cycle-settings-menu__item" type="button" role="menuitem" @click="select(item.key)">
            <span class="cycle-settings-menu__content">
              <span class="cycle-settings-menu__title">{{ item.title }}</span>
              <span class="cycle-settings-menu__description">{{ item.description }}</span>
            </span>
          </button>
        </li>
      </ul>
    </Teleport>
  </span>
</template>

<script lang="ts">
let nextCycleSettingsMenuId = 0
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

type SettingsMenuItem = {
  key: string
  title: string
  description: string
}

withDefaults(defineProps<{
  buttonLabel?: string
  ariaLabel?: string
  items?: SettingsMenuItem[]
}>(), {
  buttonLabel: '设置',
  ariaLabel: '设置周期',
  items: () => [
    { key: 'hrbp-permission', title: 'HRBP 权限管理', description: '可管理该周期内角色成员的数据权限' },
    { key: 'people-group', title: '人员组管理', description: '可管理周期内的人员组' },
    { key: 'aggregate-dimension', title: '自定义聚合维度', description: '可自定义该周期内的人员聚合维度' },
    { key: 'report', title: '报表配置', description: '可配置该周期内的报表内容' },
    { key: 'review-relation', title: '评估关系管理', description: '可管理该周期内各成员之间的评估关系' },
  ],
})

const emit = defineEmits<{
  select: [key: string]
}>()

const menuId = `cycle-settings-menu-${++nextCycleSettingsMenuId}`
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const open = ref(false)
const menuStyle = ref<Record<string, string>>({ visibility: 'hidden' })

function updatePosition() {
  if (!open.value || !trigger.value) return
  const rect = trigger.value.getBoundingClientRect()
  const width = 316
  const height = 268
  const gap = 4
  const margin = 16
  const left = Math.min(Math.max(margin, rect.right - width), Math.max(margin, window.innerWidth - width - margin))
  const below = rect.bottom + gap
  const top = below + height <= window.innerHeight - margin ? below : Math.max(margin, rect.top - height - gap)
  menuStyle.value = { left: `${left}px`, top: `${top}px`, visibility: 'visible' }
}

function toggle() {
  open.value = !open.value
  menuStyle.value = { visibility: 'hidden' }
  if (open.value) void nextTick(updatePosition)
}

function close(restoreFocus = false) {
  open.value = false
  menuStyle.value = { visibility: 'hidden' }
  if (restoreFocus) void nextTick(() => trigger.value?.focus())
}

function focusItem(index: number) {
  const itemButtons = menu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
  if (!itemButtons?.length) return
  itemButtons[(index + itemButtons.length) % itemButtons.length].focus()
}

function openAndFocusFirst() {
  open.value = true
  menuStyle.value = { visibility: 'hidden' }
  void nextTick(() => {
    updatePosition()
    focusItem(0)
  })
}

function handleMenuKeydown(event: KeyboardEvent) {
  const itemButtons = Array.from(menu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || [])
  const index = itemButtons.indexOf(document.activeElement as HTMLButtonElement)
  if (event.key === 'Escape') {
    event.preventDefault()
    close(true)
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    focusItem(index + 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    focusItem(index - 1)
  } else if (event.key === 'Home') {
    event.preventDefault()
    focusItem(0)
  } else if (event.key === 'End') {
    event.preventDefault()
    focusItem(itemButtons.length - 1)
  }
}

function select(key: string) {
  emit('select', key)
  close(true)
}

function handleOutsidePointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Node) || root.value?.contains(target) || menu.value?.contains(target)) return
  close()
}

function handleViewportChange() {
  if (open.value) updatePosition()
}

onMounted(() => {
  document.addEventListener('pointerdown', handleOutsidePointerDown)
  window.addEventListener('resize', handleViewportChange)
  window.addEventListener('scroll', handleViewportChange, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsidePointerDown)
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
})
</script>

<style scoped>
.cycle-settings-menu-root { display: inline-block; line-height: 0; }
.cycle-settings-button { display: flex; position: relative; inset: 0; width: 80px; min-width: 80px; height: 32px; align-items: center; justify-content: center; box-sizing: border-box; padding: 4px 16px; border: 1px solid #d0d3d6; border-radius: 6px; background: transparent; color: #1f2329; font-family: LarkHackSafariFont, LarkEmojiFont, LarkChineseQuote, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Tahoma, "PingFang SC", "Microsoft Yahei", Arial, "Hiragino Sans GB", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"; font-size: 14px; font-weight: 400; line-height: 22px; text-align: center; white-space: nowrap; cursor: pointer; transition: color .1s ease-in, background-color .1s ease-in, border-color .1s ease-in, width .2s ease-in; }
.cycle-settings-button:hover { background: #f0f1f2; }
.cycle-settings-button:focus-visible { outline: 2px solid rgba(51, 112, 255, .35); outline-offset: 2px; }
.cycle-settings-button__icon { display: block; margin-right: 4px; line-height: 0; }
.cycle-settings-button__glyph { display: inline-block; min-width: 0; min-height: 0; line-height: 0; }
.cycle-settings-button__glyph svg { display: inline-block; overflow: hidden; width: 14px; height: 14px; min-width: 0; min-height: 0; line-height: 14px; }
.cycle-settings-menu { position: fixed; z-index: 1050; display: flex; width: 316px; height: 268px; overflow: auto; flex-direction: column; margin: 0; padding: 2px 0; box-sizing: border-box; border: 1px solid #dee0e3; border-radius: 6px; background: #fff; box-shadow: rgba(31, 35, 41, .04) 0 8px 24px 8px, rgba(31, 35, 41, .04) 0 6px 12px 0, rgba(31, 35, 41, .06) 0 4px 8px -8px; color: #1f2329; font-family: LarkHackSafariFont, LarkEmojiFont, LarkChineseQuote, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Tahoma, "PingFang SC", "Microsoft Yahei", Arial, "Hiragino Sans GB", sans-serif; list-style: none; }
.cycle-settings-menu__entry { width: calc(100% - 6px); height: 50px; flex: 0 0 50px; margin: 1px 3px; padding: 0; list-style: none; }
.cycle-settings-menu__item { display: flex; width: 100%; height: 100%; align-items: baseline; padding: 4px 8px; box-sizing: border-box; border: 0; border-radius: 4px; background: transparent; color: #1f2329; font-family: inherit; font-size: 14px; font-weight: 400; line-height: 22px; text-align: left; cursor: pointer; }
.cycle-settings-menu__item:hover, .cycle-settings-menu__item:focus-visible, .cycle-settings-menu__item:active { outline: 0; background: rgba(31, 35, 41, .08); }
.cycle-settings-menu__content { display: flow-root; overflow: hidden; width: 100%; min-width: 0; }
.cycle-settings-menu__title, .cycle-settings-menu__description { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cycle-settings-menu__title { color: #1f2329; font-size: 14px; font-weight: 400; line-height: 22px; }
.cycle-settings-menu__description { color: #646a73; font-size: 12px; font-weight: 400; line-height: 20px; }
</style>
