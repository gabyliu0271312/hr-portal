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
            @click="navigateSection(item.key)"
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
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import {
  DEFAULT_PERFORMANCE_ADMIN_SECTION,
  PERFORMANCE_ADMIN_MENU_ITEMS,
  type PerformanceAdminSection,
} from '@/utils/performanceAdminNavigation'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const menuItems = PERFORMANCE_ADMIN_MENU_ITEMS
const activeSection = ref<PerformanceAdminSection>(DEFAULT_PERFORMANCE_ADMIN_SECTION)
const userInitial = computed(() => userStore.user?.display_name?.trim().slice(0, 1) || '我')

watch(() => route.name, (name) => {
  if (name === 'PerformanceCycles' || name === 'PerformanceCycleCreate' || name === 'PerformanceCycleEdit') activeSection.value = 'cycles-projects'
  if (name === 'PerformanceTemplates') activeSection.value = 'templates'
})

function navigateSection(section: PerformanceAdminSection) {
  activeSection.value = section
  if (section === 'cycles-projects') void router.push({ name: 'PerformanceCycles' })
  if (section === 'templates') void router.push({ name: 'PerformanceTemplates' })
}

async function handleUserCommand(command: 'logout') {
  await userStore.logout()
  await router.replace({ name: 'Login' })
}
</script>

<style scoped>
.performance-admin-app { min-height: 100vh; min-width: 1000px; background: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; color: #1f2329; }
.performance-admin-header { display: flex; align-items: center; justify-content: space-between; height: 56px; padding: 0 8px; background: #3c4a73; color: rgba(255, 255, 255, .9); box-shadow: 0 2px 4px -4px rgba(31, 35, 41, .02), 0 4px 8px rgba(31, 35, 41, .02), 0 4px 16px 4px rgba(31, 35, 41, .03); }
.brand { display: inline-flex; align-items: center; padding: 14px 16px; gap: 0; font-size: 20px; font-weight: 600; line-height: 28px; }
.brand-mark { display: inline-flex; align-items: end; gap: 3px; width: 28px; height: 28px; }
.brand-mark i { display: block; width: 6px; border-radius: 50% 50% 2px 2px; background: #fff; }
.brand-mark i:nth-child(1) { height: 16px; }.brand-mark i:nth-child(2) { height: 25px; }.brand-mark i:nth-child(3) { height: 20px; }
.brand-divider { width: 1px; height: 18px; margin: 0 12px; background: #bbbfc4; }.brand-name { white-space: nowrap; }
.user-trigger { display: grid; place-items: center; width: 24px; height: 24px; margin: 0 16px 0 8px; padding: 0; border: 0; border-radius: 50%; background: transparent; cursor: pointer; }.user-trigger:focus-visible, .admin-menu-item:focus-visible { outline: 2px solid #3370ff; outline-offset: 2px; }
.performance-admin-body { display: flex; min-height: calc(100vh - 56px); }.performance-admin-aside { width: 240px; flex: 0 0 240px; padding-top: 16px; background: #fff; box-shadow: 1px 0 0 #edf0f4; }.aside-title { margin-bottom: 8px; padding: 0 20px; color: #8f959e; font-size: 14px; line-height: 22px; }.admin-menu { padding: 0; }.admin-menu-item { display: flex; align-items: flex-start; gap: 12px; width: 100%; min-height: 41px; margin: 0; padding: 10px 12px 10px 16px; border: 0; border-radius: 0; background: transparent; color: #1f2329; cursor: pointer; font: inherit; font-size: 14px; line-height: 21px; text-align: left; }.admin-menu-item :deep(.el-icon) { width: 18px; height: 18px; margin-top: 2px; color: #646a73; }.admin-menu-item:hover { background: rgba(31, 35, 41, .08); color: #3370ff; }.admin-menu-item.active { background: #e1eaff; color: #3370ff; }.admin-menu-item.active :deep(.el-icon) { color: #3370ff; }.performance-admin-main { flex: 1; min-width: 0; min-height: calc(100vh - 56px); padding: 20px; overflow: auto; }
@media (max-width: 960px) { .performance-admin-app { min-width: 0; }.performance-admin-aside { width: 240px; flex-basis: 240px; }.admin-menu-item { justify-content: flex-start; padding-left: 16px; } }
</style>
