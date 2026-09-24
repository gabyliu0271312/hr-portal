import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { performanceCycleApi } from '@/api/performance'
import CycleHrbpPermissionManagement from './CycleHrbpPermissionManagement.vue'
import PerformanceHrbpPermissionDialog from '@/components/performance/PerformanceHrbpPermissionDialog.vue'

async function mountPage(path = '/performance/settings/cycles/1/hrbp-auth?activeKey=auth-list') {
  vi.spyOn(performanceCycleApi, 'listHrbpPermissions').mockResolvedValue([])
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/performance/settings/cycles', name: 'PerformanceCycles', component: { template: '<div />' } },
      { path: '/performance/settings/cycles/:cycleId/hrbp-auth', name: 'PerformanceCycleHrbpPermissions', component: CycleHrbpPermissionManagement },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(CycleHrbpPermissionManagement, {
    global: {
      plugins: [router],
      stubs: { PermissionButton: { template: '<button v-bind="$attrs"><slot /></button>' } },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('CycleHrbpPermissionManagement', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })
  it('renders the static shell and switches between captured tabs', async () => {
    const { wrapper, router } = await mountPage()

    expect(wrapper.text()).toContain('HRBP 权限管理')
    expect(wrapper.text()).toContain('HRBP 可管理的绩效数据范围')
    expect(wrapper.find('[aria-label="HRBP 权限表格"]').exists()).toBe(true)

    await wrapper.findAll('.line-tab').find(tab => tab.text() === '变更记录')?.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.activeKey).toBe('history')
    expect(wrapper.find('[aria-label="变更记录"]').exists()).toBe(true)
  })

  it('loads active roster people and organization tree when creating an HRBP permission', async () => {
    const options = {
      people: [{ value: 'E001', label: '张三' }],
      organization_tree: [{ value: '集团', label: '集团', level: 1, children: [] }],
      invisible_people: [{ value: 'E002', label: '李四（E002）' }],
    }
    vi.spyOn(performanceCycleApi, 'listHrbpPermissions').mockResolvedValue([])
    const request = vi.spyOn(performanceCycleApi, 'listHrbpOptions').mockResolvedValue(options)
    const { wrapper } = await mountPage()

    await wrapper.get('.permission-create-button').trigger('click')
    await flushPromises()

    expect(request).toHaveBeenCalledWith(1)
    document.body.querySelector<HTMLButtonElement>('.performance-search-select__trigger')?.click()
    await flushPromises()
    expect(document.body.textContent).toContain('张三')
    expect(document.body.querySelector('.performance-organization-tree-select__trigger')).not.toBeNull()
  })

  it('saves invisible snapshot people through the real permission API client', async () => {
    const options = {
      people: [{ value: 'E001', label: '张三' }],
      organization_tree: [{ value: '集团', label: '集团', level: 1, children: [] }],
      invisible_people: [{ value: 'E002', label: '李四（E002）' }],
    }
    vi.spyOn(performanceCycleApi, 'listHrbpOptions').mockResolvedValue(options)
    const create = vi.spyOn(performanceCycleApi, 'createHrbpPermission').mockResolvedValue({
      id: 9,
      hrbp: { employee_no: 'E001', display_name: '张三' },
      scope: ['集团'],
      invisible_people: [{ employee_no: 'E002', display_name: '李四' }],
    })
    const { wrapper } = await mountPage()

    await wrapper.get('.permission-create-button').trigger('click')
    await flushPromises()
    wrapper.findComponent(PerformanceHrbpPermissionDialog).vm.$emit('submit', {
      hrbp: 'E001', scope: ['集团'], invisiblePeopleEnabled: true, invisiblePeople: ['E002'],
    })
    await flushPromises()

    expect(create).toHaveBeenCalledWith(1, { hrbp: 'E001', scope: ['集团'], invisible_people: ['E002'] })
  })

  it('returns to the cycle list from the shared page header', async () => {
    const { wrapper, router } = await mountPage()
    await wrapper.get('.full-screen-modal-header-back').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('PerformanceCycles')
  })
})
