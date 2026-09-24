<template>
  <div class="performance-admin-app">
    <header class="performance-admin-header">
      <PerformanceBrand label="创梦绩效设置" theme="dark" class="brand" />
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
          <div v-for="item in menuItems" :key="item.key" class="menu-entry">
            <PerformanceAdminExpandableMenu
              v-if="item.key === 'evaluation-questions'"
              :label="item.label"
              :icon="item.icon"
              :expanded="evaluationExpanded"
              :active-key="String(route.name || '')"
              :items="PERFORMANCE_ADMIN_SUBMENU_ITEMS['evaluation-questions']"
              @activate="navigateSection(item.key)"
              @toggle="toggleSubmenu(item.key)"
              @select="goAdminSubmenu"
            />
            <PerformanceAdminExpandableMenu
              v-else-if="item.key === 'permissions'"
              :label="item.label"
              :icon="item.icon"
              :expanded="permissionsExpanded"
              :active-key="String(route.name || '')"
              :items="PERFORMANCE_ADMIN_SUBMENU_ITEMS.permissions"
              @activate="navigateSection(item.key)"
              @toggle="toggleSubmenu(item.key)"
              @select="goAdminSubmenu"
            />
            <PerformanceAdminExpandableMenu
              v-else-if="item.key === 'metric-management'"
              :label="item.label"
              :icon="item.icon"
              :expanded="metricManagementExpanded"
              :active-key="String(route.name || '')"
              :items="PERFORMANCE_ADMIN_SUBMENU_ITEMS['metric-management']"
              @activate="navigateSection(item.key)"
              @toggle="toggleSubmenu(item.key)"
              @select="goAdminSubmenu"
            />
            <PerformanceAdminExpandableMenu
              v-else-if="item.key === 'system'"
              :label="item.label"
              :icon="item.icon"
              :expanded="systemExpanded"
              :active-key="String(route.name || '')"
              :items="PERFORMANCE_ADMIN_SUBMENU_ITEMS.system"
              @activate="navigateSection(item.key)"
              @toggle="toggleSubmenu(item.key)"
              @select="goAdminSubmenu"
            />
            <button
              v-else
              class="admin-menu-item"
              :class="{ active: activeSection === item.key }"
              :aria-current="activeSection === item.key ? 'page' : undefined"
              type="button"
              @click="navigateSection(item.key)"
            >
              <el-icon><component :is="item.icon" /></el-icon>
              <span class="menu-label">{{ item.label }}</span>
            </button>
          </div>
        </nav>
      </aside>

      <main class="performance-admin-main">
        <router-view :section="activeSection" />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { performanceAssessmentMethodSettingsApi } from '@/api/performance'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import PerformanceAdminExpandableMenu from '@/components/performance/PerformanceAdminExpandableMenu.vue'
import PerformanceBrand from '@/components/performance/PerformanceBrand.vue'
import {
  DEFAULT_PERFORMANCE_ADMIN_SECTION,
  getPerformanceAdminMenuItems,
  PERFORMANCE_ADMIN_SUBMENU_ITEMS,
  performanceMetricAssessmentEnabled,
  type PerformanceAdminSection,
} from '@/utils/performanceAdminNavigation'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const menuItems = computed(() => getPerformanceAdminMenuItems(performanceMetricAssessmentEnabled.value))
const activeSection = ref<PerformanceAdminSection>(DEFAULT_PERFORMANCE_ADMIN_SECTION)
const evaluationExpanded = ref(false)
const permissionsExpanded = ref(false)
const metricManagementExpanded = ref(false)
const systemExpanded = ref(false)
const userInitial = computed(() => userStore.user?.display_name?.trim().slice(0, 1) || '我')

onMounted(async () => {
  try {
    performanceMetricAssessmentEnabled.value = (await performanceAssessmentMethodSettingsApi.get()).metric_assessment_enabled
  } catch {
    performanceMetricAssessmentEnabled.value = false
  }
})

watch(() => route.name, (name) => {
  if (name === 'PerformanceCycles' || name === 'PerformanceCycleCreate' || name === 'PerformanceCycleEdit') activeSection.value = 'cycles-projects'
  if (name === 'PerformanceTemplates') activeSection.value = 'templates'
  if (name === 'ReviewQuestionManagement' || name === 'ReviewQuestionCreate' || name === 'ReviewQuestionEdit' || name === 'ReviewRuleCreate' || name === 'ReviewRuleEdit' || name === 'TaggedFillQuestionManagement' || name === 'TaggedFillQuestionCreate' || name === 'TaggedFillQuestionEdit') {
    activeSection.value = 'evaluation-questions'
    evaluationExpanded.value = true
  }
  if (name === 'PerformancePermissionRoleCreate' || PERFORMANCE_ADMIN_SUBMENU_ITEMS.permissions.some((item) => item.key === name)) {
    activeSection.value = 'permissions'
    permissionsExpanded.value = true
  }
  if (name === 'PerformanceMetricLibrary' || name === 'PerformanceMetricTemplates') {
    activeSection.value = 'metric-management'
    metricManagementExpanded.value = true
  }
  if (PERFORMANCE_ADMIN_SUBMENU_ITEMS.system.some((item) => item.key === name)) {
    activeSection.value = 'system'
    systemExpanded.value = true
  }
}, { immediate: true })

function navigateSection(section: PerformanceAdminSection) {
  activeSection.value = section
  if (section === 'cycles-projects') void router.push({ name: 'PerformanceCycles' })
  if (section === 'templates') void router.push({ name: 'PerformanceTemplates' })
  if (section === 'evaluation-questions') evaluationExpanded.value = !evaluationExpanded.value
  if (section === 'permissions') permissionsExpanded.value = !permissionsExpanded.value
  if (section === 'metric-management') metricManagementExpanded.value = !metricManagementExpanded.value
  if (section === 'system') systemExpanded.value = !systemExpanded.value
}

function toggleSubmenu(section: PerformanceAdminSection) {
  if (section === 'evaluation-questions') evaluationExpanded.value = !evaluationExpanded.value
  if (section === 'permissions') permissionsExpanded.value = !permissionsExpanded.value
  if (section === 'metric-management') metricManagementExpanded.value = !metricManagementExpanded.value
  if (section === 'system') systemExpanded.value = !systemExpanded.value
}

function goAdminSubmenu(routeName: string) {
  void router.push({ name: routeName })
}

async function handleUserCommand(command: 'logout') {
  await userStore.logout()
  await router.replace({ name: 'Login' })
}
</script>

<style scoped>
:global(html:has(.performance-admin-app)) { scrollbar-gutter: auto; }
.performance-admin-app { height: 100vh; min-height: 0; min-width: 1000px; overflow: hidden; background: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; color: #1f2329; }
.performance-admin-header { display: flex; align-items: center; justify-content: space-between; height: 56px; padding: 0 8px; background: #3c4a73; color: rgba(255, 255, 255, .9); box-shadow: 0 2px 4px -4px rgba(31, 35, 41, .02), 0 4px 8px rgba(31, 35, 41, .02), 0 4px 16px 4px rgba(31, 35, 41, .03); }
.brand { padding: 14px 16px; }
.user-trigger { display: grid; place-items: center; width: 24px; height: 24px; margin: 0 16px 0 8px; padding: 0; border: 0; border-radius: 50%; background: transparent; cursor: pointer; }.user-trigger:focus-visible, .admin-menu-item:focus-visible { outline: 2px solid #3370ff; outline-offset: 2px; }
.performance-admin-body { display: flex; height: calc(100vh - 56px); min-height: 0; }.performance-admin-aside { width: var(--performance-admin-sidebar-width); height: 100%; flex: 0 0 var(--performance-admin-sidebar-width); padding-top: 16px; overflow-y: auto; background: #fff; box-shadow: 1px 0 0 #edf0f4; }.aside-title { margin-bottom: 8px; padding: 0 20px; color: #8f959e; font-size: 14px; line-height: 22px; }.admin-menu { width: 232px; padding: 0; }.admin-menu-item { box-sizing: border-box; display: flex; align-items: flex-start; gap: 12px; width: 100%; min-height: 41px; margin: 0; padding: 10px 12px 10px 20px; border: 0; border-radius: 0; background: transparent; color: #1f2329; cursor: pointer; font: inherit; font-size: 14px; line-height: 21px; text-align: left; }.admin-menu-item :deep(.el-icon) { width: 18px; height: 18px; margin-top: 2px; color: #646a73; }.admin-menu-item :deep(.el-icon svg[data-icon='CyclesProjectsOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='SeatsOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='TemplatesOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='MetricManagementOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='EvaluationQuestionsOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='PermissionsOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='SystemSettingsOutlined']) { width: 18px; height: 18px; }.admin-menu-item:hover { background: rgba(31, 35, 41, .08); color: #3370ff; }.admin-menu-item.active { background: #e1eaff; color: #3370ff; }.admin-menu-item.active :deep(.el-icon) { color: #3370ff; }.performance-admin-main { flex: 1; min-width: 0; height: 100%; min-height: 0; padding: var(--performance-admin-content-inset); overflow: auto; scrollbar-width: none; }
.performance-admin-main::-webkit-scrollbar { display: none; }
.performance-admin-main { overflow: overlay; }
@media (max-width: 960px) { .performance-admin-app { min-width: 0; }.performance-admin-aside { width: 240px; flex-basis: 240px; }.admin-menu-item { justify-content: flex-start; padding-left: 16px; } }
</style>
