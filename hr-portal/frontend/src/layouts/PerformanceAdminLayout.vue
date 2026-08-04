<template>
  <div class="performance-admin-app">
    <header class="performance-admin-header">
      <div class="brand" aria-label="创梦绩效设置">
        <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="brand-divider" aria-hidden="true"></span>
        <span class="brand-name">创梦绩效设置</span>
      </div>
      <el-dropdown trigger="click" @command="handleUserCommand">
        <button class="user-trigger" type="button" aria-label="用户菜单">
          <el-avatar :size="28">{{ userInitial }}</el-avatar>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="logout">退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </header>

    <div class="performance-admin-body">
      <aside class="performance-admin-aside" aria-label="应用设置导航">
        <div class="aside-title">应用设置</div>
        <nav class="admin-menu">
          <button
            v-for="item in menuItems"
            :key="item.key"
            class="admin-menu-item"
            :class="{ active: activeSection === item.key }"
            :aria-current="activeSection === item.key ? 'page' : undefined"
            type="button"
            @click="activeSection = item.key"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span class="menu-label">{{ item.label }}</span>
          </button>
        </nav>
      </aside>

      <main class="performance-admin-main">
        <router-view :section="activeSection" />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import {
  DEFAULT_PERFORMANCE_ADMIN_SECTION,
  PERFORMANCE_ADMIN_MENU_ITEMS,
  type PerformanceAdminSection,
} from '@/utils/performanceAdminNavigation'

const router = useRouter()
const userStore = useUserStore()
const menuItems = PERFORMANCE_ADMIN_MENU_ITEMS
const activeSection = ref<PerformanceAdminSection>(DEFAULT_PERFORMANCE_ADMIN_SECTION)
const userInitial = computed(() => userStore.user?.display_name?.trim().slice(0, 1) || '我')

async function handleUserCommand(command: 'logout') {
  await userStore.logout()
  await router.replace({ name: 'Login' })
}
</script>

<style scoped>
.performance-admin-app { min-height: 100vh; background: #f5f6f8; }
.performance-admin-header { display: flex; align-items: center; justify-content: space-between; height: 48px; padding: 0 20px 0 16px; background: #334a7d; color: #fff; }
.brand { display: inline-flex; align-items: center; gap: 12px; font-size: 18px; font-weight: 600; }
.brand-mark { display: inline-flex; align-items: end; gap: 3px; width: 34px; height: 28px; }
.brand-mark i { display: block; width: 7px; border-radius: 4px 4px 2px 2px; background: #fff; }
.brand-mark i:nth-child(1) { height: 16px; }.brand-mark i:nth-child(2) { height: 25px; }.brand-mark i:nth-child(3) { height: 20px; }
.brand-divider { width: 1px; height: 22px; background: rgba(255, 255, 255, .42); }.brand-name { white-space: nowrap; }
.user-trigger { display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; cursor: pointer; }.user-trigger:focus-visible, .admin-menu-item:focus-visible { outline: 2px solid #3d6df2; outline-offset: 2px; }
.performance-admin-body { display: flex; min-height: calc(100vh - 48px); }.performance-admin-aside { width: 230px; flex: 0 0 230px; padding-top: 18px; background: #fff; box-shadow: 1px 0 0 #edf0f4; }.aside-title { padding: 0 16px 12px; color: #5f718d; font-size: 14px; }.admin-menu { padding: 0 8px; }.admin-menu-item { display: flex; align-items: center; gap: 12px; width: 100%; height: 40px; margin: 1px 0; padding: 0 11px; border: 0; border-radius: 2px; background: transparent; color: #222c3c; cursor: pointer; font: inherit; font-size: 15px; text-align: left; }.admin-menu-item:hover { background: #f3f6fb; color: #3d6df2; }.admin-menu-item.active { background: #dce7ff; color: #3d6df2; }.performance-admin-main { flex: 1; min-width: 0; padding: 22px 20px; }
@media (max-width: 960px) { .performance-admin-aside { width: 64px; flex-basis: 64px; }.aside-title, .menu-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }.admin-menu-item { justify-content: center; padding: 0; } }
</style>
