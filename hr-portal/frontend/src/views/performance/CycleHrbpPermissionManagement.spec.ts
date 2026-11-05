import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from '@/stores/user'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { performanceCycleApi } from '@/api/performance'
import CycleHrbpPermissionManagement from './CycleHrbpPermissionManagement.vue'
import PerformanceHrbpPermissionDialog from '@/components/performance/PerformanceHrbpPermissionDialog.vue'
import PerformanceHrbpPermissionTable from '@/components/performance/PerformanceHrbpPermissionTable.vue'

async function mountPage(path = '/performance/settings/cycles/1/hrbp-auth?activeKey=auth-list', permissions: any[] = []) {
  vi.spyOn(performanceCycleApi, 'listHrbpPermissions').mockResolvedValue(permissions)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/performance/settings/cycles', name: 'PerformanceCycles', component: { template: '<div />' } },
      { path: '/performance/settings/cycles/:cycleId/hrbp-auth', name: 'PerformanceCycleHrbpPermissions', component: CycleHrbpPermissionManagement },
    ],
  })
  await router.push(path)
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  useUserStore().menus = [{ code: 'performance.admin', can_create: true, can_update: true, can_delete: true } as any]
  const wrapper = mount(CycleHrbpPermissionManagement, {
    global: {
      plugins: [router, createPinia()],
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
      snapshot_lock_at: null,
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

  it.each([
    ['locked cycle', '2026-11-05T16:30:00Z', '2026-11-06'],
    ['draft cycle with a future lock date', '2027-01-01T16:30:00Z', '2027-01-02'],
  ])('shows the same exact scope copy for a %s in Beijing time', async (_state, lockAt, date) => {
    vi.spyOn(performanceCycleApi, 'listHrbpOptions').mockResolvedValue({
      people: [], organization_tree: [], invisible_people: [], snapshot_lock_at: lockAt,
    })
    const { wrapper } = await mountPage()

    await wrapper.get('.permission-create-button').trigger('click')
    await flushPromises()

    expect(document.querySelector('.hrbp-permission-dialog__description')?.textContent).toBe(`部门内的人员信息以周期组织架构生成时间「${date}」为准`)
    expect(document.body.textContent).not.toContain('待锁定')
    expect(document.body.textContent).not.toContain('实时花名册')
    wrapper.unmount()
  })

  it.each([null, 'invalid-date'])('uses neutral scope copy for an unavailable lock date %s', async lockAt => {
    vi.spyOn(performanceCycleApi, 'listHrbpOptions').mockResolvedValue({
      people: [], organization_tree: [], invisible_people: [], snapshot_lock_at: lockAt,
    })
    const { wrapper } = await mountPage()

    await wrapper.get('.permission-create-button').trigger('click')
    await flushPromises()

    expect(document.querySelector('.hrbp-permission-dialog__description')?.textContent).toBe('部门内的人员信息以本周期人员快照为准')
    expect(document.body.textContent).not.toContain('周期组织架构生成时间')
    expect(document.body.textContent).not.toContain('待锁定')
    wrapper.unmount()
  })

  it('refreshes the date on edit and clears stale dates and edit values when creating again', async () => {
    const options = {
      people: [{ value: 'E001', label: '张三' }],
      organization_tree: [{ value: '集团', label: '集团', level: 1, children: [] }],
      invisible_people: [],
      snapshot_lock_at: '2026-11-05T16:30:00Z',
    }
    let resolveOptions!: (value: typeof options) => void
    const request = vi.spyOn(performanceCycleApi, 'listHrbpOptions')
      .mockResolvedValueOnce(options)
      .mockImplementationOnce(() => new Promise(resolve => { resolveOptions = resolve }))
    const { wrapper } = await mountPage()

    wrapper.findComponent(PerformanceHrbpPermissionTable).vm.$emit('edit', {
      id: 7, hrbp: '张三', hrbpRef: 'E001', scopeValues: ['集团'], invisiblePeopleValues: [],
    })
    await flushPromises()
    const dialog = wrapper.findComponent(PerformanceHrbpPermissionDialog)
    expect(dialog.props('mode')).toBe('edit')
    expect(dialog.props('initialValue')?.hrbp).toBe('E001')
    expect(document.querySelector('.hrbp-permission-dialog__description')?.textContent).toBe('部门内的人员信息以周期组织架构生成时间「2026-11-06」为准')
    dialog.vm.$emit('update:modelValue', false)
    await flushPromises()

    await wrapper.get('.permission-create-button').trigger('click')
    expect(dialog.props('initialValue')).toBeUndefined()
    expect(dialog.props('mode')).toBe('create')
    expect(dialog.props('scopeDescription')).toBe('部门内的人员信息以本周期人员快照为准')
    expect(document.querySelector('[role="status"]')?.textContent).toBe('正在加载周期人员快照...')
    expect(document.body.textContent).not.toContain('2026-11-06')
    resolveOptions({ ...options, snapshot_lock_at: '2027-01-01T16:30:00Z' })
    await flushPromises()
    expect(request).toHaveBeenCalledTimes(2)
    expect(document.querySelector('.hrbp-permission-dialog__description')?.textContent).toBe('部门内的人员信息以周期组织架构生成时间「2027-01-02」为准')
    wrapper.unmount()
  })

  it('keeps neutral scope copy when reloading cycle options fails', async () => {
    vi.spyOn(performanceCycleApi, 'listHrbpOptions').mockRejectedValue(new Error('failed'))
    const { wrapper } = await mountPage()
    await wrapper.get('.permission-create-button').trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(PerformanceHrbpPermissionDialog).props('scopeDescription')).toBe('部门内的人员信息以本周期人员快照为准')
    expect(document.body.textContent).not.toContain('实时花名册')
    wrapper.unmount()
  })

  it('saves invisible snapshot people through the real permission API client', async () => {
    const options = {
      people: [{ value: 'E001', label: '张三' }],
      organization_tree: [{ value: '集团', label: '集团', level: 1, children: [] }],
      invisible_people: [{ value: 'E002', label: '李四（E002）' }],
      snapshot_lock_at: null,
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

  it('opens the captured delete confirmation and deletes through the real API client', async () => {
    const permissions = [{
      id: 7,
      hrbp: { employee_no: 'E001', display_name: '张三' },
      scope: ['集团'],
      invisible_people: [],
    }]
    vi.spyOn(performanceCycleApi, 'listHrbpPermissions').mockResolvedValue(permissions)
    const remove = vi.spyOn(performanceCycleApi, 'removeHrbpPermission').mockResolvedValue()
    const { wrapper } = await mountPage('/performance/settings/cycles/1/hrbp-auth?activeKey=auth-list', permissions)

    wrapper.findComponent(PerformanceHrbpPermissionTable).vm.$emit('remove', { id: 7, hrbp: '张三', scope: '集团', invisiblePeople: '' })
    await flushPromises()

    expect(document.querySelector('.performance-confirm-dialog__title-content')?.textContent).toBe('确定删除吗？')
    expect(document.querySelector('.performance-confirm-dialog__subject')?.textContent).toBe('张三')
    await (document.querySelector('.performance-confirm-dialog__button--danger') as HTMLButtonElement).click()
    await flushPromises()

    expect(remove).toHaveBeenCalledWith(1, 7)
    wrapper.unmount()
  })
  it('returns to the cycle list from the shared page header', async () => {
    const { wrapper, router } = await mountPage()
    await wrapper.get('.full-screen-modal-header-back').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('PerformanceCycles')
  })
})
