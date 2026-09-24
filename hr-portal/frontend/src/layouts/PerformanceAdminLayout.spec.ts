import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, afterEach, vi } from 'vitest'
import PerformanceAdminLayout from './PerformanceAdminLayout.vue'
import performanceAdminLayoutSource from './PerformanceAdminLayout.vue?raw'
import performanceAdminExpandableMenuSource from '@/components/performance/PerformanceAdminExpandableMenu.vue?raw'
import { performanceAssessmentMethodSettingsApi } from '@/api/performance'
import { performanceMetricAssessmentEnabled } from '@/utils/performanceAdminNavigation'

function mountLayout(metricEnabled = false) {
  performanceMetricAssessmentEnabled.value = metricEnabled
  vi.spyOn(performanceAssessmentMethodSettingsApi, 'get').mockResolvedValue({ metric_assessment_enabled: metricEnabled })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/performance/settings/cycles', name: 'PerformanceCycles', component: { template: '<div />' } },
      { path: '/performance/settings/templates', name: 'PerformanceTemplates', component: { template: '<div />' } },
      { path: '/performance/settings/metric-management/library', name: 'PerformanceMetricLibrary', component: { template: '<div />' } },
      { path: '/performance/settings/metric-management/templates', name: 'PerformanceMetricTemplates', component: { template: '<div />' } },
      { path: '/performance/settings/permissions/roles', name: 'PerformancePermissionRoles', component: { template: '<div />' } },
      { path: '/performance/settings/system/assessment-method', name: 'PerformanceSystemAssessmentMethod', component: { template: '<div />' } },
    ],
  })

  return mount(PerformanceAdminLayout, {
    global: {
      plugins: [createPinia(), router],
      stubs: {
        'el-avatar': { template: '<span><slot /></span>' },
        'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
        'el-dropdown-menu': { template: '<div><slot /></div>' },
        'el-dropdown-item': { template: '<button><slot /></button>' },
        'router-view': { props: ['section'], template: '<div :data-section="section" />' },
      },
    },
  })
}

describe('PerformanceAdminLayout', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
  it('reclaims the stable root scrollbar gutter for the full-viewport admin shell', () => {
    expect(performanceAdminLayoutSource).toContain(':global(html:has(.performance-admin-app)) { scrollbar-gutter: auto; }')
  })

  it('keeps the captured cycles icon at its full 18px render size', () => {
    expect(performanceAdminLayoutSource).toContain(".admin-menu-item :deep(.el-icon svg[data-icon='CyclesProjectsOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='SeatsOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='TemplatesOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='MetricManagementOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='EvaluationQuestionsOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='PermissionsOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='SystemSettingsOutlined']) { width: 18px; height: 18px; }")
  })

  it('keeps expandable-menu SVGs at their full 18px render size', () => {
    expect(performanceAdminExpandableMenuSource).toContain(".admin-menu-item :deep(.el-icon svg[data-icon='EvaluationQuestionsOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='MetricManagementOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='PermissionsOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='SystemSettingsOutlined']) { width: 18px; height: 18px; }")
  })

  it('keeps the evaluation parent expanded without a second active background', () => {
    expect(performanceAdminLayoutSource).toContain("if (section === 'evaluation-questions') evaluationExpanded.value = !evaluationExpanded.value")
    expect(performanceAdminLayoutSource).not.toContain("if (!['ReviewQuestionManagement', 'TaggedFillQuestionManagement'].includes(String(route.name)))")
  })

  it('shows metric management after seats when metric assessment is enabled', async () => {
    const wrapper = mountLayout(true)
    const metricParent = wrapper.findAll('[role="button"]').find((item) => item.text().includes('指标管理'))

    expect(metricParent).toBeDefined()
    expect(wrapper.text().indexOf('席位管理')).toBeLessThan(wrapper.text().indexOf('指标管理'))

    await metricParent!.trigger('click')
    const submenu = wrapper.get('[aria-label="指标管理子菜单"]')
    expect(submenu.text()).toContain('指标库')
    expect(submenu.text()).toContain('指标模板')
  })

  it('hides metric management when metric assessment is disabled', () => {
    const wrapper = mountLayout(false)

    expect(wrapper.text()).not.toContain('指标管理')
  })

  it('renders the confirmed standalone shell and switches placeholder sections', async () => {
    const wrapper = mountLayout()

    expect(wrapper.text()).toContain('创梦绩效设置')
    expect(wrapper.get('[aria-current="page"]').text()).toContain('席位管理')
    expect(wrapper.text()).not.toContain('通用设置')
    expect(wrapper.text()).not.toContain('飞书管理后台')

    const templates = wrapper.findAll('button').find((button) => button.text().includes('绩效模板'))
    await templates?.trigger('click')

    expect(wrapper.get('[aria-current="page"]').text()).toContain('绩效模板')
    expect(wrapper.findAll('[data-section="templates"]')).toHaveLength(1)
  })

  it('shares the expandable menu behavior and navigates permission placeholders', async () => {
    const wrapper = mountLayout()
    const router = wrapper.vm.$router
    await router.isReady()

    const permissionParent = wrapper.findAll('[role="button"]').find((item) => item.text().includes('权限管理'))
    expect(permissionParent).toBeDefined()
    await permissionParent!.trigger('click')

    const submenu = wrapper.get('[aria-label="权限管理子菜单"]')
    expect(submenu.text()).toContain('角色配置')
    expect(submenu.text()).toContain('授权配置')
    expect(submenu.text()).toContain('其他权限设置')
    expect(submenu.text()).toContain('被评估人信息可见性设置')

    await submenu.findAll('button').find((button) => button.text() === '角色配置')!.trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(router.currentRoute.value.name).toBe('PerformancePermissionRoles')
    expect(submenu.get('[aria-current="page"]').text()).toBe('角色配置')
  })

  it('shares the expandable menu behavior for system placeholders', async () => {
    const wrapper = mountLayout()
    const router = wrapper.vm.$router
    await router.isReady()

    const systemParent = wrapper.findAll('[role="button"]').find((item) => item.text().includes('系统设置'))
    expect(systemParent).toBeDefined()
    await systemParent!.trigger('click')

    const submenu = wrapper.get('[aria-label="系统设置子菜单"]')
    expect(submenu.text()).toContain('考核方式设置')
    expect(submenu.text()).toContain('通知设置')
    expect(submenu.text()).toContain('工作台设置')
    expect(submenu.text()).toContain('字眼设置')
    expect(submenu.text()).toContain('其他设置')

    await submenu.findAll('button').find((button) => button.text() === '考核方式设置')!.trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(router.currentRoute.value.name).toBe('PerformanceSystemAssessmentMethod')
    expect(submenu.get('[aria-current="page"]').text()).toBe('考核方式设置')
  })

  it('navigates the template menu to its canonical route', async () => {
    const wrapper = mountLayout()
    const router = wrapper.vm.$router
    await router.isReady()

    const templates = wrapper.findAll('button').find((button) => button.text().includes('绩效模板'))
    await templates?.trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('PerformanceTemplates')
  })

  it('navigates the cycle menu to its canonical route', async () => {
    const wrapper = mountLayout()
    const router = wrapper.vm.$router
    await router.isReady()

    const cycles = wrapper.findAll('button').find((button) => button.text().includes('周期与项目'))
    await cycles?.trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('PerformanceCycles')
  })
})
