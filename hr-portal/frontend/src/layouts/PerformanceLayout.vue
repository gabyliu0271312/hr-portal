<template>
  <el-container class="performance-app">
    <div class="performance-header">
      <div class="header-left">
        <button class="launcher" type="button" aria-label="应用启动器" @click="router.push('/home')"><i v-for="index in 9" :key="index"></i></button>
        <PerformanceBrand label="创梦绩效" />
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
        <el-dropdown trigger="click" @command="handleUserCommand">
          <button class="user-trigger" type="button">
            <el-avatar :size="30">{{ userInitial }}</el-avatar>
            <span class="user-name">{{ employeeSwitchSession?.effective_identity.display_name || userStore.user?.display_name }}</span>
            <el-icon><ArrowDown /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="canAdmin && !employeeSwitchSession" command="settings">后台管理</el-dropdown-item>
              <el-dropdown-item v-if="switchCapability?.can_switch" command="switch">切换用户</el-dropdown-item>
              <el-dropdown-item v-if="employeeSwitchSession" command="restore">恢复本人</el-dropdown-item>
              <el-dropdown-item command="switch-records">消息测试记录</el-dropdown-item>
              <el-dropdown-item command="logout" :divided="canAdmin">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div v-if="employeeSwitchSession" class="identity-switch-banner" role="status">
      <span>正在以「{{ employeeSwitchSession.effective_identity.display_name }} · {{ employeeSwitchSession.effective_identity.employee_no }}」身份测试；实际操作者：{{ userStore.user?.display_name }}。业务操作真实生效，原业务接收方始终禁投。</span>
      <el-button size="small" @click="restoreIdentity">恢复本人</el-button>
    </div>
    <el-alert v-if="employeeSwitchNotice" type="warning" :closable="false" :title="employeeSwitchNotice" />
    <PerformanceIdentitySwitchDialog v-model="switchDialog" />
    <PerformanceIdentitySwitchRecords v-model="recordsDialog" />
    <el-container class="performance-body">
      <el-aside v-if="!isWorkbench && !isReview && !isProjectManagement" width="220px" class="performance-aside">
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

      <el-main :class="['performance-main', { 'review-main': isReview || isProjectManagement }]">
        <router-view :key="employeeSwitchEpoch" />
      </el-main>
    </el-container>
    <GlobalAiAssistant v-if="!employeeSwitchSession" />
  </el-container>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { performanceApi, type PerformanceAccessContext } from '@/api/performance'
import { api } from '@/api/client'
import { canManagePerformanceSettings } from '@/utils/performanceSettingsAccess'
import { openPerformanceSettingsInNewTab } from '@/utils/performanceSettingsNavigation'
import GlobalAiAssistant from '@/components/GlobalAiAssistant.vue'
import PerformanceBrand from '@/components/performance/PerformanceBrand.vue'
import PerformanceIdentitySwitchDialog from '@/components/performance/PerformanceIdentitySwitchDialog.vue'
import PerformanceIdentitySwitchRecords from '@/components/performance/PerformanceIdentitySwitchRecords.vue'
import { identitySwitchApi, type SwitchCapability } from '@/api/identitySwitch'
import { employeeSwitchSession, employeeSwitchEpoch, employeeSwitchNotice, clearEmployeeSwitch } from '@/stores/identitySwitch'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'

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

const performanceContext = ref<PerformanceAccessContext | null>(null)
const canAdmin = computed(() =>
  canManagePerformanceSettings(userStore.menus.map((menu) => menu.code), performanceContext.value),
)
const userInitial = computed(() => (employeeSwitchSession.value?.effective_identity.display_name || userStore.user?.display_name)?.trim().slice(0, 1) || '我')
const isWorkbench = computed(() => route.path === '/performance/workbench')
const isReview = computed(() => route.path === '/performance/review')
const isProjectManagement = computed(() => route.path === '/performance/project-management')

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
    path: '/performance/project-management',
    menu: [],
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

async function handleUserCommand(command: 'settings' | 'logout' | 'switch' | 'restore' | 'switch-records') {
  if (command === 'switch') { switchDialog.value = true; return }
  if (command === 'restore') { await restoreIdentity(); return }
  if (command === 'switch-records') { recordsDialog.value = true; return }
  if (command === 'settings') {
    openPerformanceSettingsInNewTab()
    return
  }
  await userStore.logout()
  await router.replace({ name: 'Login' })
}

const switchDialog = ref(false)
const recordsDialog = ref(false)
const switchCapability = ref<SwitchCapability | null>(null)
const projectContext = usePerformanceProjectContextStore()
let heartbeat: ReturnType<typeof setInterval> | undefined
async function checkSwitchSession() {
  const session = employeeSwitchSession.value
  if (!session) return
  try {
    await api.get('/performance/identity-switch/session', { headers: { 'X-App-Switch-Session': session.session_token } })
  } catch (error: any) {
    if (employeeSwitchSession.value !== session) return
    const status = error?.response?.status
    // 断网、超时、网关或服务端 5xx 是瞬时故障，保留会话等下一轮心跳；只有服务端明确判定会话无效才结束
    if (!status || status >= 500) return
    const detail = error?.response?.data?.detail
    clearEmployeeSwitch(typeof detail === 'string' && detail ? detail : '身份切换已失效，请恢复本人或重新申请授权')
  }
}
async function refreshIdentity() {
  const version = employeeSwitchEpoch.value
  try {
    const context = await performanceApi.getAccessContext()
    if (version === employeeSwitchEpoch.value) performanceContext.value = context
  } catch { if (version === employeeSwitchEpoch.value) performanceContext.value = null }
  try { switchCapability.value = await identitySwitchApi.capability() }
  catch { switchCapability.value = null }
}
async function restoreIdentity() {
  const previous = employeeSwitchSession.value
  clearEmployeeSwitch()
  if (previous) {
    try { await identitySwitchApi.end(previous.session_id) }
    catch { employeeSwitchNotice.value = '本页已恢复本人；服务端会话结束未确认，请勿继续使用旧会话' }
  }
  await router.replace('/performance/workbench')
}
watch(employeeSwitchEpoch, () => {
  projectContext.resetIdentity()
  performanceContext.value = null
  void refreshIdentity()
})
onMounted(() => {
  void refreshIdentity()
  heartbeat = setInterval(() => void checkSwitchSession(), 15000)
})
onUnmounted(() => { if (heartbeat) clearInterval(heartbeat) })

</script>

<style scoped>
.identity-switch-banner { display: flex; gap: 12px; justify-content: space-between; align-items: center; flex-wrap: wrap; padding: 12px 16px; background: var(--color-warning-light); color: var(--color-text-primary); font-size: 13px; }
.performance-app {
  height: 100vh;
  flex-direction: column;
  background: var(--performance-page-surface);
}
.performance-header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  box-sizing: border-box;
  border-bottom: 0;
  background: var(--color-bg-card);
  color: rgba(0, 0, 0, 0.65);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  box-shadow: rgba(31, 35, 41, 0.02) 0 2px 4px -4px, rgba(31, 35, 41, 0.02) 0 4px 8px 0, rgba(31, 35, 41, 0.03) 0 4px 16px 4px;
}
.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 0;
}
.launcher { display: grid; width: 32px; height: 32px; grid-template-columns: repeat(3, 4px); grid-template-rows: repeat(3, 4px); place-content: center; gap: 4px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: #646a73; cursor: pointer; }
.launcher i { display: block; width: 4px; height: 4px; border-radius: 1px; background: currentColor; }
.launcher:hover { background: #f1f2f4; color: var(--color-primary); }
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
.performance-tabs {
  display: flex;
  gap: 0;
  flex: 0 0 auto;
  min-width: 0;
  margin: 0 16px;
}
.tab-button {
  position: relative;
  height: 56px;
  padding: 0 16px;
  border: 0;
  background: transparent;
  color: var(--color-text-regular);
  cursor: pointer;
  font-family: inherit;
  font-size: 16px;
  font-weight: 400;
  line-height: 56px;
  white-space: nowrap;
}
.tab-button:hover,
.tab-button.active {
  color: var(--color-primary);
}
.tab-button.active {
  font-weight: 500;
}
.tab-button.active::after {
  content: '';
  position: absolute;
  top: 53px;
  right: 16px;
  left: 16px;
  width: auto;
  height: 3px;
  border-radius: 0;
  background: var(--color-primary);
}
.user-name {
  color: var(--color-text-secondary);
  font-size: 13px;
}
.user-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font: inherit;
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
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  background: var(--performance-page-surface);
}
.review-main {
  min-height: 0;
  overflow: hidden;
  scrollbar-gutter: auto;
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
