<template>
  <div ref="root" class="app-switcher">
    <button
      ref="trigger"
      type="button"
      class="app-switcher__trigger"
      :aria-label="`切换应用，当前 ${current?.name ?? ''}`"
      :aria-haspopup="'dialog'"
      :aria-expanded="open ? 'true' : 'false'"
      @click="toggle"
    >
      <i v-for="index in 9" :key="index"></i>
    </button>

    <Teleport to="body">
      <transition name="app-switcher">
        <div
          v-if="open"
          ref="panel"
          class="app-switcher__panel"
          role="dialog"
          :aria-label="'选择应用'"
          @keydown.esc="close"
        >
          <div class="app-switcher__title">应用</div>
          <div class="app-switcher__list">
            <button
              v-for="app in availableApps"
              :key="app.key"
              type="button"
              class="app-switcher__item"
              :class="{ 'app-switcher__item--active': app.key === current?.key }"
              :aria-current="app.key === current?.key ? 'page' : undefined"
              @click="openApp(app)"
            >
              <AppIcon :app-key="app.key" class="app-switcher__item-icon" />
              <span class="app-switcher__item-name">{{ app.name }}</span>
              <span v-if="app.key === current?.key" class="app-switcher__item-check">当前</span>
            </button>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { APP_CATALOG, type AppMeta } from '@/constants/appCatalog'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ current: string }>()

const router = useRouter()
const userStore = useUserStore()
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const open = ref(false)

/** 当前用户有权访问的应用；portal 恒可进入，其余按入口/后台权限码过滤 */
const availableApps = computed<AppMeta[]>(() => {
  const codes = new Set(userStore.menus.map((m) => m.code))
  return APP_CATALOG.filter((app) => {
    if (app.key === 'portal') return true
    if (app.menuCode && codes.has(app.menuCode)) return true
    if (app.adminCode && codes.has(app.adminCode)) return true
    return false
  })
})

const current = computed<AppMeta | null>(() => APP_CATALOG.find((a) => a.key === props.current) ?? null)

function toggle() {
  if (open.value) { close(); return }
  // 单应用时点击无反应：不打开弹窗、不跳转
  if (availableApps.value.length <= 1) return
  open.value = true
}

function close() {
  open.value = false
  void trigger.value?.focus?.()
}

async function openApp(app: AppMeta) {
  open.value = false
  if (app.key === current.value?.key) return
  await router.push(app.entryPath)
}

function onOutsideClick(event: MouseEvent) {
  if (!open.value) return
  const target = event.target as Node
  if (panel.value?.contains(target) || trigger.value?.contains(target)) return
  close()
}

onMounted(() => document.addEventListener('mousedown', onOutsideClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onOutsideClick))
</script>

<style scoped>
.app-switcher { display: inline-flex; }
.app-switcher__trigger { display: grid; width: 32px; height: 32px; grid-template-columns: repeat(3, 4px); grid-template-rows: repeat(3, 4px); place-content: center; gap: 4px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: #646a73; cursor: pointer; }
.app-switcher__trigger i { display: block; width: 4px; height: 4px; border-radius: 1px; background: currentColor; }
.app-switcher__trigger:hover { background: #f1f2f4; color: var(--color-primary); }
.app-switcher__trigger:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }

.app-switcher__panel { position: fixed; z-index: 3000; width: 320px; max-width: calc(100vw - 24px); padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-lg, 8px); background: var(--color-bg-card); box-shadow: var(--shadow-popover, 0 8px 20px rgba(31, 35, 41, 0.10)); }
.app-switcher__title { padding: 4px 8px 10px; color: var(--color-text-secondary); font-size: 13px; }
.app-switcher__list { display: flex; flex-direction: column; gap: 4px; }
.app-switcher__item { display: flex; align-items: center; gap: 12px; padding: 10px 8px; border: 0; border-radius: var(--radius-md, 6px); background: transparent; color: var(--color-text-primary); cursor: pointer; font-size: 14px; text-align: left; }
.app-switcher__item:hover { background: var(--color-bg-hover); color: var(--color-primary); }
.app-switcher__item--active { background: var(--color-primary-light); color: var(--color-primary); }
.app-switcher__item-icon { width: 28px; height: 28px; flex: 0 0 auto; }
.app-switcher__item-name { flex: 1 1 auto; min-width: 0; }
.app-switcher__item-check { color: var(--color-primary); font-size: 12px; }

.app-switcher-enter-active, .app-switcher-leave-active { transition: opacity 140ms ease, transform 140ms ease; }
.app-switcher-enter-from, .app-switcher-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
