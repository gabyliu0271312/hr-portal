import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { projectManagementApi } from '@/api/performance'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'
import ProjectAuthorizationRecords from './ProjectAuthorizationRecords.vue'
import ProjectCalibrationAuthorization from './ProjectCalibrationAuthorization.vue'
import ProjectManagementReminder from './ProjectManagementReminder.vue'

vi.mock('@/api/performance', async () => {
  const actual = await vi.importActual<typeof import('@/api/performance')>('@/api/performance')
  return { ...actual, projectManagementApi: { ...actual.projectManagementApi, authorizationRecords: vi.fn(), calibrationAuthorization: vi.fn(), overview: vi.fn() } }
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(projectManagementApi.authorizationRecords).mockResolvedValue({ authorization_records: [], transfer_records: [] } as any)
  vi.mocked(projectManagementApi.calibrationAuthorization).mockResolvedValue({ cycle_id: 9, cycle_name: '测试周期', items: [] })
  vi.mocked(projectManagementApi.overview).mockResolvedValue({ completion_nodes: [] } as any)
})

async function setup(component: any) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const context = usePerformanceProjectContextStore()
  context.setNavigation({ cycles: [], active_cycle: { cycle_id: 9, cycle_name: '测试周期', cycle_start_at: '', cycle_end_at: '' }, can_manage: true, can_review: true, review_projects: [] })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component }, { path: '/performance/project-management', name: 'PerformanceProjectManagement', component: { template: '<div />' } }] })
  await router.push('/?cycle_id=9&management_role=hrbp&project_id=29&node_key=self-review')
  await router.isReady()
  const wrapper = mount(component, { global: { plugins: [pinia, router], stubs: { UiPageHeader: true, PerformanceTaskHeader: true, PerformanceReminderPanel: true, PerformanceManagementTable: true, PerformanceSearchSelect: true, PerformanceTaskDelegationDialog: true, PerformanceConfirmDialog: true } } })
  await flushPromises()
  return { wrapper, router }
}

describe('management child page context', () => {
  it.each([
    [ProjectAuthorizationRecords, 'UiPageHeader'],
    [ProjectCalibrationAuthorization, 'UiPageHeader'],
    [ProjectManagementReminder, 'PerformanceTaskHeader'],
  ])('returns from a child page to the same management role and project', async (component, header) => {
    const { wrapper, router } = await setup(component)
    wrapper.getComponent({ name: header }).vm.$emit('back')
    await flushPromises()
    expect(router.currentRoute.value).toMatchObject({ name: 'PerformanceProjectManagement', query: { cycle_id: '9', management_role: 'hrbp', project_id: '29' } })
    wrapper.unmount()
  })

  it('reloads records when changing roles in the same cycle', async () => {
    const { wrapper, router } = await setup(ProjectAuthorizationRecords)
    expect(projectManagementApi.authorizationRecords).toHaveBeenCalledTimes(1)
    await router.replace({ query: { ...router.currentRoute.value.query, management_role: 'project_admin' } })
    await flushPromises()
    expect(projectManagementApi.authorizationRecords).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('clears the previous project when the calibration cycle changes', async () => {
    const { wrapper, router } = await setup(ProjectCalibrationAuthorization)
    wrapper.getComponent({ name: 'PerformanceSearchSelect' }).vm.$emit('update:modelValue', '10')
    await flushPromises()
    expect(router.currentRoute.value.query).toMatchObject({ cycle_id: '10', management_role: 'hrbp' })
    expect(router.currentRoute.value.query.project_id).toBeUndefined()
    expect(projectManagementApi.calibrationAuthorization).toHaveBeenLastCalledWith(10)
    wrapper.unmount()
  })
})
