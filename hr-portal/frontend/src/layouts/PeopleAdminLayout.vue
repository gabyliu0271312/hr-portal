<template>
  <div class="people-admin-app">
    <header class="people-admin-header">
      <AppBrand app-key="people" label="创梦人力后台" theme="dark" class="brand" />
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

    <div class="people-admin-body">
      <aside class="people-admin-aside" aria-label="创梦人力后台导航">
        <div class="aside-title">数据配置</div>
        <nav class="admin-menu">
          <button
            v-for="item in menuItems"
            :key="item.key"
            class="admin-menu-item"
            :class="{ active: isActive(item.path) }"
            :aria-current="isActive(item.path) ? 'page' : undefined"
            type="button"
            @click="router.push(item.path)"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span class="menu-label">{{ item.label }}</span>
          </button>
        </nav>
      </aside>

      <main class="people-admin-main">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Collection, List, Stamp } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import AppBrand from '@/components/app-switcher/AppBrand.vue'

interface PeopleAdminMenuItem {
  key: 'master-data' | 'field-settings' | 'field-categories'
  label: string
  path: string
  icon: unknown
}

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const userInitial = computed(() => userStore.user?.display_name?.trim().slice(0, 1) || '我')

const menuItems: PeopleAdminMenuItem[] = [
  { key: 'master-data', label: '主数据定义', path: '/people/settings/master-data', icon: Collection },
  { key: 'field-settings', label: '字段设置', path: '/people/settings/field-settings', icon: List },
  { key: 'field-categories', label: '字段分类', path: '/people/settings/field-categories', icon: Stamp },
]

function isActive(path: string) {
  return route.path === path
}

async function handleUserCommand(command: 'logout') {
  await userStore.logout()
  await router.replace({ name: 'Login' })
}
</script>

<style scoped>
:global(html:has(.people-admin-app)) { scrollbar-gutter: auto; }
.people-admin-app { height: 100vh; min-height: 0; min-width: 1000px; overflow: hidden; background: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; color: #1f2329; }
.people-admin-header { display: flex; align-items: center; justify-content: space-between; height: 56px; padding: 0 8px; background: #3c4a73; color: rgba(255, 255, 255, .9); box-shadow: 0 2px 4px -4px rgba(31, 35, 41, .02), 0 4px 8px rgba(31, 35, 41, .02), 0 4px 16px 4px rgba(31, 35, 41, .03); }
.brand { padding: 14px 16px; }
.user-trigger { display: grid; place-items: center; width: 24px; height: 24px; margin: 0 16px 0 8px; padding: 0; border: 0; border-radius: 50%; background: transparent; cursor: pointer; }
.user-trigger:focus-visible, .admin-menu-item:focus-visible { outline: 2px solid #3370ff; outline-offset: 2px; }
.people-admin-body { display: flex; height: calc(100vh - 56px); min-height: 0; }
.people-admin-aside { width: 232px; height: 100%; flex: 0 0 232px; padding-top: 16px; overflow-y: auto; background: #fff; box-shadow: 1px 0 0 #edf0f4; }
.aside-title { margin-bottom: 8px; padding: 0 20px; color: #8f959e; font-size: 14px; line-height: 22px; }
.admin-menu { width: 232px; padding: 0; }
.admin-menu-item { box-sizing: border-box; display: flex; align-items: flex-start; gap: 12px; width: 100%; min-height: 41px; margin: 0; padding: 10px 12px 10px 20px; border: 0; border-radius: 0; background: transparent; color: #1f2329; cursor: pointer; font: inherit; font-size: 14px; line-height: 21px; text-align: left; }
.admin-menu-item :deep(.el-icon) { width: 18px; height: 18px; margin-top: 2px; color: #646a73; }
.admin-menu-item:hover { background: rgba(31, 35, 41, .08); color: #3370ff; }
.admin-menu-item.active { background: #e1eaff; color: #3370ff; }
.admin-menu-item.active :deep(.el-icon) { color: #3370ff; }
.people-admin-main { flex: 1; min-width: 0; height: 100%; min-height: 0; padding: 20px; overflow: auto; }
@media (max-width: 960px) { .people-admin-app { min-width: 0; }.people-admin-aside { width: 240px; flex-basis: 240px; }.admin-menu-item { justify-content: flex-start; padding-left: 16px; } }
</style>
