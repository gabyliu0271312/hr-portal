<template>
  <el-container class="performance-app">
    <div class="performance-header">
      <div class="header-left">
        <button class="portal-link" type="button" @click="router.push('/home')">HR Portal</button>
        <span class="divider"></span>
        <span class="app-name">绩效管理</span>
        <nav class="performance-tabs">
          <button
            v-for="tab in visibleTabs"
            :key="tab.path"
            class="tab-button"
            :class="{ active: isActive(tab.path) }"
            type="button"
            @click="router.push(tab.path)"
          >
            {{ tab.label }}
          </button>
        </nav>
      </div>
      <div class="header-right">
        <span class="user-name">{{ userStore.user?.display_name }}</span>
      </div>
    </div>

    <el-container class="performance-body">
      <el-aside width="220px" class="performance-aside">
        <div class="aside-title">{{ activeTab?.label || '绩效管理' }}</div>
        <div
          v-for="item in activeMenu"
          :key="item.key"
          class="menu-item"
          :class="{ active: item.path === route.path }"
          @click="router.push(item.path)"
        >
          {{ item.label }}
        </div>
      </el-aside>

      <el-main class="performance-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

interface PerformanceMenuItem {
  key: string
  label: string
  path: string
}

interface PerformanceTab {
  label: string
  path: string
  menu: PerformanceMenuItem[]
  adminOnly?: boolean
}

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const canAdmin = computed(() => userStore.menus.some((m) => m.code === 'performance.admin'))

const tabs = computed<PerformanceTab[]>(() => [
  {
    label: '工作台',
    path: '/performance/workbench',
    menu: [
      { key: 'todo', label: '我的待办', path: '/performance/workbench' },
      { key: 'mine', label: '我的绩效', path: '/performance/workbench' },
      { key: 'team', label: '团队进度', path: '/performance/workbench' },
      { key: 'appeals', label: '申诉处理', path: '/performance/workbench' },
    ],
  },
  {
    label: '绩效评估',
    path: '/performance/review',
    menu: [
      { key: 'current', label: '当前周期', path: '/performance/review' },
      { key: 'summary', label: '工作内容总结', path: '/performance/review' },
      { key: 'self', label: '员工自评', path: '/performance/review' },
      { key: 'manager', label: '上级评价', path: '/performance/review' },
      { key: 'project', label: '项目评价', path: '/performance/review' },
      { key: 'calibration', label: '校准管理', path: '/performance/review' },
      { key: 'results', label: '结果查看', path: '/performance/review' },
      { key: 'appeal-feedback', label: '申诉反馈', path: '/performance/review' },
    ],
  },
  {
    label: '项目管理',
    path: '/performance/projects',
    menu: [
      { key: 'list', label: '项目列表', path: '/performance/projects' },
      { key: 'members', label: '项目成员', path: '/performance/projects' },
      { key: 'weights', label: '项目权重', path: '/performance/projects' },
      { key: 'reviews', label: '项目评价', path: '/performance/projects' },
      { key: 'progress', label: '项目进度', path: '/performance/projects' },
    ],
  },
  {
    label: '后台设置',
    path: '/performance/settings',
    adminOnly: true,
    menu: [
      { key: 'cycles', label: '周期设置', path: '/performance/settings' },
      { key: 'workflow', label: '流程模板', path: '/performance/settings' },
      { key: 'templates', label: '评价模板', path: '/performance/settings' },
      { key: 'grades', label: '绩效等级', path: '/performance/settings' },
      { key: 'distribution', label: '强制分布', path: '/performance/settings' },
      { key: 'project-rules', label: '项目规则', path: '/performance/settings' },
      { key: 'appeal-rules', label: '申诉规则', path: '/performance/settings' },
      { key: 'people-sync', label: '人员同步', path: '/performance/settings' },
      { key: 'permissions', label: '权限配置', path: '/performance/settings' },
    ],
  },
])

const visibleTabs = computed(() => tabs.value.filter((tab) => !tab.adminOnly || canAdmin.value))
const activeTab = computed(() =>
  visibleTabs.value.find((tab) => route.path === tab.path || route.path.startsWith(`${tab.path}/`))
    || visibleTabs.value[0]
)
const activeMenu = computed(() => activeTab.value?.menu ?? [])

function isActive(path: string) {
  return route.path === path || route.path.startsWith(`${path}/`)
}
</script>

<style scoped>
.performance-app {
  height: 100vh;
  flex-direction: column;
  background: var(--color-bg-page);
}
.performance-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 24px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-card);
}
.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 14px;
}
.portal-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 13px;
}
.portal-link:hover {
  color: var(--color-primary);
}
.divider {
  width: 1px;
  height: 18px;
  background: var(--color-border);
}
.app-name {
  color: var(--color-text-primary);
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
}
.performance-tabs {
  display: flex;
  gap: 4px;
  margin-left: 12px;
}
.tab-button {
  position: relative;
  height: 56px;
  padding: 0 14px;
  border: 0;
  background: transparent;
  color: var(--color-text-regular);
  cursor: pointer;
  font-size: 14px;
}
.tab-button:hover,
.tab-button.active {
  color: var(--color-primary);
}
.tab-button.active {
  font-weight: 700;
}
.tab-button.active::after {
  content: '';
  position: absolute;
  right: 14px;
  bottom: 0;
  left: 14px;
  height: 2px;
  border-radius: 1px;
  background: var(--color-primary);
}
.user-name {
  color: var(--color-text-secondary);
  font-size: 13px;
}
.performance-body {
  flex: 1;
  min-height: 0;
}
.performance-aside {
  border-right: 1px solid var(--color-border);
  background: var(--color-bg-card);
  padding: 14px 0;
  overflow-y: auto;
}
.aside-title {
  padding: 0 20px 10px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}
.menu-item {
  padding: 9px 20px;
  border-left: 2px solid transparent;
  color: var(--color-text-regular);
  cursor: pointer;
  font-size: 14px;
}
.menu-item:hover {
  background: var(--color-bg-hover);
  color: var(--color-primary);
}
.menu-item.active {
  border-left-color: var(--color-primary);
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-weight: 700;
}
.performance-main {
  padding: 0;
  overflow-y: auto;
  background: var(--color-bg-page);
}
@media (max-width: 900px) {
  .performance-header {
    padding: 0 14px;
  }
  .performance-tabs {
    overflow-x: auto;
    max-width: calc(100vw - 230px);
  }
  .performance-aside {
    width: 180px !important;
  }
}
</style>
