<template>
  <el-container class="people-app">
    <div class="people-header">
      <div class="header-left">
        <AppSwitcher current="people" />
        <AppBrand app-key="people" label="创梦人力" />
      </div>
      <div class="header-right">
        <el-dropdown trigger="click" @command="handleUserCommand">
          <button class="user-trigger" type="button" aria-label="用户菜单">
            <el-avatar :size="30">{{ userInitial }}</el-avatar>
            <span class="user-name">{{ userStore.user?.display_name }}</span>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="canAdmin" command="settings">后台管理</el-dropdown-item>
              <el-dropdown-item command="logout" :divided="canAdmin">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <el-container class="people-body">
      <el-aside width="220px" class="people-aside">
        <div class="aside-title">创梦人力</div>
        <div class="menu-item" :class="{ active: isActive('/people/overview') }" @click="router.push('/people/overview')">
          主数据概览
        </div>
      </el-aside>

      <el-main class="people-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import AppSwitcher from '@/components/app-switcher/AppSwitcher.vue'
import AppBrand from '@/components/app-switcher/AppBrand.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const userInitial = computed(() => userStore.user?.display_name?.trim().slice(0, 1) || '我')
const canAdmin = computed(() => userStore.menus.some(m => m.code === 'people.admin'))

function isActive(path: string) {
  return route.path === path || route.path.startsWith(`${path}/`)
}

async function handleUserCommand(command: 'settings' | 'logout') {
  if (command === 'settings') {
    window.open('/people/settings', '_blank', 'noopener')
    return
  }
  await userStore.logout()
  await router.replace({ name: 'Login' })
}
</script>

<style scoped>
.people-app { height: 100vh; flex-direction: column; background: var(--color-bg-page); }
.people-header {
  display: flex; align-items: center; justify-content: space-between;
  height: 56px; padding: 0 16px; box-sizing: border-box;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-card); color: rgba(0, 0, 0, 0.65);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 14px; line-height: 21px;
  box-shadow: rgba(31, 35, 41, 0.02) 0 2px 4px -4px, rgba(31, 35, 41, 0.02) 0 4px 8px 0, rgba(31, 35, 41, 0.03) 0 4px 16px 4px;
}
.header-left, .header-right { display: flex; align-items: center; }
.user-trigger { display: inline-flex; align-items: center; gap: 8px; border: 0; background: transparent; color: var(--color-text-secondary); cursor: pointer; font: inherit; }
.user-name { color: var(--color-text-secondary); font-size: 13px; }
.people-body { flex: 1; min-height: 0; }
.people-aside { border-right: 1px solid var(--color-border); background: var(--color-bg-card); padding: 14px 0; overflow-y: auto; }
.aside-title { padding: 0 20px 10px; color: var(--color-text-secondary); font-size: 12px; font-weight: 700; }
.menu-item { padding: 9px 20px; border-left: 2px solid transparent; color: var(--color-text-regular); cursor: pointer; font-size: 14px; }
.menu-item:hover { background: var(--color-bg-hover); color: var(--color-primary); }
.menu-item.active { border-left-color: var(--color-primary); background: var(--color-primary-light); color: var(--color-primary); font-weight: 700; }
.people-main { display: flex; flex: 1; min-width: 0; min-height: 0; padding: 0; overflow-y: auto; background: var(--color-bg-page); }
</style>
